import mongoose from "mongoose";

import Order from "../models/Order.js";
import Product from "../models/Product.js";
import { generateOrderNumber } from "../utils/orderNumber.js";

// In-memory fallback orders store for offline local dev
const mockOrders = [];

export async function createOrder(req, res) {
  try {
    const {
      items,
      shippingAddress,
      paymentMethod = "cod",
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order items are required",
      });
    }

    if (!shippingAddress) {
      return res.status(400).json({
        success: false,
        message: "Shipping address is required",
      });
    }

    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      const productIds = items.map((item) => item.productId);

      const validIds = productIds.every((id) => mongoose.isValidObjectId(id));

      if (!validIds) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      const products = await Product.find({
        _id: { $in: productIds },
        isActive: true,
      });

      if (products.length !== new Set(productIds).size) {
        return res.status(400).json({
          success: false,
          message: "One or more products are unavailable",
        });
      }

      const productMap = new Map(
        products.map((product) => [product._id.toString(), product])
      );

      let subtotal = 0;
      const orderItems = [];

      for (const item of items) {
        const product = productMap.get(item.productId);
        const quantity = Number(item.quantity);

        if (!Number.isInteger(quantity) || quantity < 1) {
          return res.status(400).json({
            success: false,
            message: "Invalid product quantity",
          });
        }

        if (product.stock < quantity) {
          return res.status(400).json({
            success: false,
            message: `${product.name} has insufficient stock`,
          });
        }

        subtotal += product.price * quantity;

        orderItems.push({
          product: product._id,
          name: product.name,
          image: product.image,
          price: product.price,
          quantity,
        });
      }

      const shippingFee = subtotal >= 999 ? 0 : 79;
      const discount = 0;
      const total = subtotal + shippingFee - discount;

      const order = await Order.create({
        orderNumber: generateOrderNumber(),
        user: req.user.userId,
        items: orderItems,
        shippingAddress,
        subtotal,
        shippingFee,
        discount,
        total,
        paymentMethod,
        paymentStatus: paymentMethod === "cod" ? "pending" : "pending",
        status: "pending",
      });

      for (const item of items) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: -Number(item.quantity) },
        });
      }

      const populatedOrder = await Order.findById(order._id).populate(
        "user",
        "name email"
      );

      return res.status(201).json({
        success: true,
        message: "Order placed successfully",
        order: populatedOrder,
      });
    }

    // Fallback in-memory order handling
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const quantity = Number(item.quantity) || 1;
      const price = Number(item.price) || 999;
      const name = item.name || "Weather Product";
      const image = item.image || "";

      subtotal += price * quantity;
      orderItems.push({
        product: item.productId || "p_" + Date.now(),
        name,
        image,
        price,
        quantity,
      });
    }

    const shippingFee = subtotal >= 999 ? 0 : 79;
    const discount = 0;
    const total = subtotal + shippingFee - discount;

    const mockOrder = {
      _id: "ord_" + Date.now(),
      orderNumber: generateOrderNumber(),
      user: {
        _id: req.user.userId,
        name: req.user.name || "Customer",
        email: req.user.email || "customer@example.com",
      },
      items: orderItems,
      shippingAddress,
      subtotal,
      shippingFee,
      discount,
      total,
      paymentMethod,
      paymentStatus: "pending",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockOrders.unshift(mockOrder);

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order: mockOrder,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: error.message,
    });
  }
}

export async function getMyOrders(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      const orders = await Order.find({
        user: req.user.userId,
      }).sort({ createdAt: -1 });

      return res.json({
        success: true,
        orders,
      });
    }

    // Fallback in-memory
    const userOrders = mockOrders.filter(
      (o) =>
        String(o.user?._id || o.user) === String(req.user.userId)
    );

    res.json({
      success: true,
      orders: userOrders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
      error: error.message,
    });
  }
}

export async function getMyOrder(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected && mongoose.isValidObjectId(req.params.id)) {
      const order = await Order.findOne({
        _id: req.params.id,
        user: req.user.userId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.json({
        success: true,
        order,
      });
    }

    // Fallback or ID match
    const order = mockOrders.find(
      (o) =>
        (String(o._id) === String(req.params.id) ||
          String(o.orderNumber) === String(req.params.id)) &&
        String(o.user?._id || o.user) === String(req.user.userId)
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch order",
      error: error.message,
    });
  }
}

export async function cancelOrder(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected && mongoose.isValidObjectId(req.params.id)) {
      const order = await Order.findOne({
        _id: req.params.id,
        user: req.user.userId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (!["pending", "confirmed"].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: "This order cannot be cancelled",
        });
      }

      order.status = "cancelled";
      await order.save();

      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity },
        });
      }

      return res.json({
        success: true,
        message: "Order cancelled successfully",
        order,
      });
    }

    // Fallback in-memory
    const order = mockOrders.find(
      (o) =>
        (String(o._id) === String(req.params.id) ||
          String(o.orderNumber) === String(req.params.id)) &&
        String(o.user?._id || o.user) === String(req.user.userId)
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!["pending", "confirmed"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "This order cannot be cancelled",
      });
    }

    order.status = "cancelled";
    order.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: "Order cancelled successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to cancel order",
      error: error.message,
    });
  }
}

export async function getAllOrders(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      const orders = await Order.find()
        .populate("user", "name email")
        .sort({ createdAt: -1 });

      return res.json({
        success: true,
        orders,
      });
    }

    res.json({
      success: true,
      orders: mockOrders,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
      error: error.message,
    });
  }
}

export async function updateOrderStatus(req, res) {
  try {
    const { status } = req.body;

    const allowedStatuses = [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
      });
    }

    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected && mongoose.isValidObjectId(req.params.id)) {
      const order = await Order.findByIdAndUpdate(
        req.params.id,
        {
          status,
          ...(status === "delivered" ? { paymentStatus: "paid" } : {}),
        },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      return res.json({
        success: true,
        message: "Order status updated",
        order,
      });
    }

    // Fallback in-memory
    const order = mockOrders.find(
      (o) =>
        String(o._id) === String(req.params.id) ||
        String(o.orderNumber) === String(req.params.id)
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.status = status;
    if (status === "delivered") {
      order.paymentStatus = "paid";
    }
    order.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: "Order status updated",
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update order",
      error: error.message,
    });
  }
}
