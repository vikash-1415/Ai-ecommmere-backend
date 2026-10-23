import mongoose from "mongoose";

import Order from "../models/Order.js";
import Product from "../models/Product.js";
import UserBehavior from "../models/UserBehavior.js";
import UserBehaviorEvent from "../models/UserBehaviorEvent.js";
import {
  clearRecommendationCache,
  RECOMMENDATION_ALGORITHM_VERSION,
} from "../services/recommendationService.js";
import { getMockBehavior } from "../services/mockBehaviorStore.js";
import { catalogProducts } from "../data/mockCatalog.js";
import { generateOrderNumber } from "../utils/orderNumber.js";

// In-memory fallback orders store for offline local dev
const mockOrders = [];

export const AVAILABLE_COUPONS = [
  {
    code: "WEATHER10",
    discountPercent: 10,
    minOrder: 499,
    description: "10% OFF on all WeatherCart orders",
    badge: "10% OFF",
  },
  {
    code: "MONSOON20",
    discountPercent: 20,
    minOrder: 999,
    description: "20% OFF on Monsoon Essentials",
    badge: "20% OFF",
  },
  {
    code: "FIRST100",
    flatDiscount: 100,
    minOrder: 500,
    description: "Flat ₹100 OFF on orders above ₹500",
    badge: "FLAT ₹100",
  },
  {
    code: "SUPER500",
    flatDiscount: 500,
    minOrder: 2000,
    description: "Flat ₹500 OFF on orders above ₹2000",
    badge: "FLAT ₹500",
  },
];

export async function validateCoupon(req, res) {
  try {
    const { code, subtotal = 0 } = req.body;
    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Please enter a coupon code",
      });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const coupon = AVAILABLE_COUPONS.find((c) => c.code === cleanCode);

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: "Invalid coupon code",
      });
    }

    const numSubtotal = Number(subtotal);
    if (numSubtotal < coupon.minOrder) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount for ${cleanCode} is ₹${coupon.minOrder}`,
      });
    }

    let discount = 0;
    if (coupon.discountPercent) {
      discount = Math.round((numSubtotal * coupon.discountPercent) / 100);
    } else if (coupon.flatDiscount) {
      discount = coupon.flatDiscount;
    }

    // Cap discount at subtotal
    discount = Math.min(discount, numSubtotal);

    res.json({
      success: true,
      valid: true,
      message: `Coupon ${cleanCode} applied successfully!`,
      discount,
      coupon: {
        code: cleanCode,
        discount,
        description: coupon.description,
        badge: coupon.badge,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Coupon verification failed",
      error: error.message,
    });
  }
}

export async function createOrder(req, res) {
  try {
    const {
      items,
      shippingAddress,
      paymentMethod = "cod",
      couponCode = "",
      shippingMethod = "standard",
      transactionId = "",
      paymentDetails = {},
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

    // Calculate subtotal from incoming items
    let calculatedSubtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const price = Number(item.price) || 0;
      calculatedSubtotal += price * quantity;

      const is24Hex = (val) => /^[0-9a-fA-F]{24}$/.test(String(val || ""));
      let resolvedProductId;
      if (is24Hex(item.productId)) {
        resolvedProductId = new mongoose.Types.ObjectId(String(item.productId));
      } else if (is24Hex(item.product)) {
        resolvedProductId = new mongoose.Types.ObjectId(String(item.product));
      } else {
        const match = catalogProducts.find(
          (p) => String(p.id) === String(item.productId || item.product || item.id) ||
                 p._id?.toString() === String(item.productId || item.product || item.id)
        );
        if (match && is24Hex(match._id)) {
          resolvedProductId = new mongoose.Types.ObjectId(String(match._id));
        } else {
          resolvedProductId = new mongoose.Types.ObjectId();
        }
      }

      orderItems.push({
        product: resolvedProductId,
        name: item.name || "Product",
        image: item.image || "",
        price,
        quantity,
      });
    }

    // Shipping fee
    let shippingFee = calculatedSubtotal >= 999 ? 0 : 79;
    if (shippingMethod === "express") {
      shippingFee += 99;
    }

    // Coupon discount calculation
    let discount = 0;
    let validCouponCode = "";
    if (couponCode) {
      const cleanCode = String(couponCode).trim().toUpperCase();
      const matched = AVAILABLE_COUPONS.find((c) => c.code === cleanCode);
      if (matched && calculatedSubtotal >= matched.minOrder) {
        validCouponCode = cleanCode;
        if (matched.discountPercent) {
          discount = Math.round((calculatedSubtotal * matched.discountPercent) / 100);
        } else if (matched.flatDiscount) {
          discount = matched.flatDiscount;
        }
        discount = Math.min(discount, calculatedSubtotal);
      }
    }

    const total = Math.max(0, calculatedSubtotal + shippingFee - discount);
    const isOnlinePaid = paymentMethod === "online" && Boolean(transactionId);
    const paymentStatus = isOnlinePaid ? "paid" : "pending";
    const orderStatus = isOnlinePaid ? "confirmed" : "pending";

    const normalizedAddress = {
      fullName: shippingAddress.fullName || shippingAddress.name || "Customer",
      phone: shippingAddress.phone || "9876543210",
      addressLine: shippingAddress.addressLine || shippingAddress.street || shippingAddress.address || "123 Street",
      city: shippingAddress.city || "Ahmedabad",
      state: shippingAddress.state || "Gujarat",
      pincode: shippingAddress.pincode || shippingAddress.postalCode || shippingAddress.zip || "380054",
    };

    if (isDbConnected) {
      const order = await Order.create({
        orderNumber: generateOrderNumber(),
        user: mongoose.isValidObjectId(req.user?.userId)
          ? req.user.userId
          : new mongoose.Types.ObjectId(),
        items: orderItems,
        shippingAddress: normalizedAddress,
        subtotal: calculatedSubtotal,
        shippingFee,
        discount,
        couponCode: validCouponCode,
        transactionId: transactionId || (isOnlinePaid ? `TXN_${Date.now()}` : ""),
        paymentDetails,
        total,
        paymentMethod,
        paymentStatus,
        status: orderStatus,
      });

      // Deduct inventory
      for (const item of orderItems) {
        if (item.product) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { stock: -Number(item.quantity || 1) },
          });
        }
      }

      try {
        const validProductIds = orderItems.map((item) => item.product).filter(Boolean);
        if (validProductIds.length) {
          const products = await Product.find({ _id: { $in: validProductIds } })
            .select("_id category")
            .lean();
          let behavior = await UserBehavior.findOne({ user: req.user.userId });
          if (!behavior) behavior = await UserBehavior.create({ user: req.user.userId });

          for (const product of products) {
            if (!behavior.purchasedProducts.some((id) => id.toString() === product._id.toString())) {
              behavior.purchasedProducts.push(product._id);
            }
            if (product.category) {
              const preference = behavior.preferredCategories.find(
                (item) => item.category === product.category
              );
              if (preference) preference.score += 5;
              else behavior.preferredCategories.push({ category: product.category, score: 5 });
            }
          }

          await behavior.save();
          await UserBehaviorEvent.insertMany(
            products.map((product) => ({
              user: req.user.userId,
              eventType: "purchase",
              product: product._id,
              category: product.category || "",
              metadata: { orderId: order._id.toString() },
            }))
          );
          clearRecommendationCache();
        }
      } catch (error) {
        console.error("Order recommendation activity could not be recorded:", error);
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
      subtotal: calculatedSubtotal,
      shippingFee,
      discount,
      couponCode: validCouponCode,
      transactionId: transactionId || (isOnlinePaid ? `TXN_${Date.now()}` : ""),
      paymentDetails,
      total,
      paymentMethod,
      paymentStatus,
      status: orderStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const behavior = getMockBehavior(req.user.userId);
    for (const item of items) {
      const productId = String(item.productId || "");
      const product = catalogProducts.find(
        (entry) => entry._id?.toString() === productId || String(entry.id) === productId
      );
      if (mongoose.isValidObjectId(productId) &&
        !behavior.purchasedProducts.some((id) => id?.toString() === productId)) {
        behavior.purchasedProducts.push(productId);
      }
      if (product?.category) {
        const preference = behavior.preferredCategories.find(
          (entry) => entry.category === product.category
        );
        if (preference) preference.score += 5;
        else behavior.preferredCategories.push({ category: product.category, score: 5 });
      }
    }
    behavior.events ||= [];
    behavior.events.push({
      eventType: "purchase",
      createdAt: new Date().toISOString(),
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
      productIds: items.map((item) => String(item.productId || "")),
    });
    clearRecommendationCache();

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

/* Online payment verification endpoint */
export async function verifyPayment(req, res) {
  try {
    const { orderId, transactionId, paymentDetails } = req.body;
    if (!orderId || !transactionId) {
      return res.status(400).json({
        success: false,
        message: "Order ID and Transaction ID are required",
      });
    }

    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      let order = null;
      if (mongoose.isValidObjectId(orderId)) {
        order = await Order.findById(orderId);
      }
      if (!order) {
        order = await Order.findOne({ orderNumber: orderId });
      }

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      order.paymentStatus = "paid";
      order.status = "confirmed";
      order.transactionId = transactionId;
      if (paymentDetails) order.paymentDetails = paymentDetails;
      await order.save();

      return res.json({
        success: true,
        message: "Payment verified successfully",
        order,
      });
    }

    // In-memory fallback
    const target = mockOrders.find(
      (o) =>
        String(o._id) === String(orderId) ||
        String(o.orderNumber) === String(orderId)
    );

    if (!target) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    target.paymentStatus = "paid";
    target.status = "confirmed";
    target.transactionId = transactionId;
    if (paymentDetails) target.paymentDetails = paymentDetails;
    target.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: "Payment verified successfully",
      order: target,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to verify payment",
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
