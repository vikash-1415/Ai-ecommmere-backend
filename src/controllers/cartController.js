import User from "../models/User.js";

function serializeCart(items = []) {
  return items.map((item) => ({
    productId: item.productId,
    id: item.productId,
    _id: item.productId,
    name: item.name,
    image: item.image,
    price: item.price,
    quantity: item.quantity,
  }));
}

export async function getMyCart(req, res) {
  try {
    const user = await User.findById(req.user.userId).select("cart");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      items: serializeCart(user.cart),
    });
  } catch (error) {
    console.error("Cart fetch failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cart",
    });
  }
}

export async function saveMyCart(req, res) {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Cart items must be an array containing no more than 100 products",
    });
  }

  const cart = [];
  for (const item of items) {
    const productId = String(item.productId || item._id || item.id || "").trim();
    const name = String(item.name || "").trim();
    const price = Number(item.price);
    const quantity = Number(item.quantity);

    if (
      !productId ||
      productId.length > 100 ||
      !name ||
      name.length > 200 ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return res.status(400).json({
        success: false,
        message: "Cart contains an invalid product or quantity",
      });
    }

    cart.push({
      productId,
      name,
      image: String(item.image || "").slice(0, 2048),
      price,
      quantity,
    });
  }

  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.cart = cart;
    await user.save();

    return res.json({
      success: true,
      items: serializeCart(user.cart),
    });
  } catch (error) {
    console.error("Cart save failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to save cart",
    });
  }
}
