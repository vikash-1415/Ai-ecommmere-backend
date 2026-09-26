import mongoose from "mongoose";
import UserBehavior from "../models/UserBehavior.js";
import Product from "../models/Product.js";

// ─────────────────────────────────────────────
// In-memory mock store (MongoDB offline fallback)
// ─────────────────────────────────────────────
const mockBehaviorStore = new Map();

function getMockBehavior(userId) {
  if (!mockBehaviorStore.has(userId)) {
    mockBehaviorStore.set(userId, {
      user: userId,
      viewedProducts: [],
      wishlistProducts: [],
      purchasedProducts: [],
      preferredCategories: [],
      weatherPreferences: [],
    });
  }
  return mockBehaviorStore.get(userId);
}

// ─────────────────────────────────────────────
// Helper: get or create behavior document
// ─────────────────────────────────────────────
async function getOrCreateBehavior(userId) {
  const isDbConnected = mongoose.connection.readyState === 1;

  if (!isDbConnected) {
    return { doc: getMockBehavior(userId), mock: true };
  }

  let behavior = await UserBehavior.findOne({ user: userId });
  if (!behavior) {
    behavior = await UserBehavior.create({ user: userId });
  }
  return { doc: behavior, mock: false };
}

// ─────────────────────────────────────────────
// POST /api/behavior/view
// ─────────────────────────────────────────────
export async function trackProductView(req, res) {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const isDbConnected = mongoose.connection.readyState === 1;
    let product = null;

    if (isDbConnected) {
      product = await Product.findById(productId).select("category weatherTags");
    }

    // Gracefully skip if product not found in DB (might be mock/static id)
    const category = product?.category || null;

    const { doc: behavior, mock } = await getOrCreateBehavior(req.user.userId);

    // Update viewed products
    const existing = behavior.viewedProducts.find(
      (item) => item.product?.toString() === productId
    );

    if (existing) {
      existing.count += 1;
      existing.lastViewedAt = new Date();
    } else {
      behavior.viewedProducts.push({
        product: productId,
        count: 1,
        lastViewedAt: new Date(),
      });
    }

    // Update category preference (+1 for view)
    if (category) {
      const catPref = behavior.preferredCategories.find(
        (item) => item.category === category
      );
      if (catPref) {
        catPref.score += 1;
      } else {
        behavior.preferredCategories.push({ category, score: 1 });
      }
    }

    if (!mock) {
      await behavior.save();
    }

    res.json({ success: true, message: "View tracked" });
  } catch (error) {
    console.error("trackProductView error:", error);
    res.status(500).json({ success: false, message: "Failed to track activity" });
  }
}

// ─────────────────────────────────────────────
// POST /api/behavior/wishlist
// ─────────────────────────────────────────────
export async function trackWishlist(req, res) {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const isDbConnected = mongoose.connection.readyState === 1;
    let product = null;

    if (isDbConnected) {
      product = await Product.findById(productId).select("category");
    }

    const category = product?.category || null;

    const { doc: behavior, mock } = await getOrCreateBehavior(req.user.userId);

    // Add to wishlist if not already there
    const alreadyExists = behavior.wishlistProducts.some(
      (id) => id?.toString() === productId
    );
    if (!alreadyExists) {
      behavior.wishlistProducts.push(productId);
    }

    // Update category preference (+3 for wishlist — stronger signal)
    if (category) {
      const catPref = behavior.preferredCategories.find(
        (item) => item.category === category
      );
      if (catPref) {
        catPref.score += 3;
      } else {
        behavior.preferredCategories.push({ category, score: 3 });
      }
    }

    if (!mock) {
      await behavior.save();
    }

    res.json({ success: true, message: "Wishlist tracked" });
  } catch (error) {
    console.error("trackWishlist error:", error);
    res.status(500).json({ success: false, message: "Failed to track wishlist" });
  }
}

// ─────────────────────────────────────────────
// GET /api/behavior/me  (optional: for debug)
// ─────────────────────────────────────────────
export async function getMyBehavior(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;

    let behavior = null;

    if (isDbConnected) {
      behavior = await UserBehavior.findOne({ user: req.user.userId });
    } else {
      behavior = getMockBehavior(req.user.userId);
    }

    res.json({
      success: true,
      behavior: behavior || {},
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to get behavior data" });
  }
}
