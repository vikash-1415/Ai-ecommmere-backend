import mongoose from "mongoose";
import Product from "../models/Product.js";
import UserBehavior from "../models/UserBehavior.js";
import UserBehaviorEvent from "../models/UserBehaviorEvent.js";
import { catalogProducts } from "../data/mockCatalog.js";
import { clearRecommendationCache } from "../services/recommendationService.js";
import { getMockBehavior } from "../services/mockBehaviorStore.js";

async function getOrCreateBehavior(userId) {
  if (mongoose.connection.readyState !== 1) {
    return { doc: getMockBehavior(userId), mock: true };
  }
  let behavior = await UserBehavior.findOne({ user: userId });
  if (!behavior) behavior = await UserBehavior.create({ user: userId });
  return { doc: behavior, mock: false };
}

async function resolveProduct(productId) {
  const fallback = catalogProducts.find(
    (item) => item._id?.toString() === productId || String(item.id) === productId
  );
  if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(productId)) {
    return (await Product.findById(productId).select("category").lean()) || fallback || null;
  }
  return fallback || null;
}

async function trackEvent(req, res, eventType, categoryWeight, metadata = {}) {
  const productId = String(req.body.productId || "");
  if (!productId) {
    return res.status(400).json({ success: false, message: "productId is required" });
  }

  const product = await resolveProduct(productId);
  const category = product?.category || "";
  const validProductId = mongoose.isValidObjectId(productId);
  const { doc: behavior, mock } = await getOrCreateBehavior(req.user.userId);

  if (eventType === "product_view" && validProductId) {
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
  }

  if (eventType === "wishlist_add" && validProductId) {
    const alreadyExists = behavior.wishlistProducts.some(
      (id) => id?.toString() === productId
    );
    if (!alreadyExists) behavior.wishlistProducts.push(productId);
  }

  if (category && categoryWeight) {
    const preference = behavior.preferredCategories.find(
      (item) => item.category === category
    );
    if (preference) preference.score += categoryWeight;
    else behavior.preferredCategories.push({ category, score: categoryWeight });
  }

  if (!mock) {
    await behavior.save();
    await UserBehaviorEvent.create({
      user: req.user.userId,
      eventType,
      product: validProductId ? productId : null,
      category,
      algorithmVersion: metadata.algorithmVersion || "",
      metadata,
    });
  }

  clearRecommendationCache();
  return res.json({ success: true, message: "Activity tracked" });
}

export async function trackProductView(req, res) {
  try {
    return await trackEvent(req, res, "product_view", 1);
  } catch (error) {
    console.error("trackProductView error:", error);
    return res.status(500).json({ success: false, message: "Failed to track activity" });
  }
}

export async function trackWishlist(req, res) {
  try {
    return await trackEvent(req, res, "wishlist_add", 3);
  } catch (error) {
    console.error("trackWishlist error:", error);
    return res.status(500).json({ success: false, message: "Failed to track wishlist" });
  }
}

export async function trackCartAdd(req, res) {
  try {
    return await trackEvent(req, res, "cart_add", 2);
  } catch (error) {
    console.error("trackCartAdd error:", error);
    return res.status(500).json({ success: false, message: "Failed to track cart activity" });
  }
}

export async function trackRecommendationClick(req, res) {
  try {
    return await trackEvent(
      req,
      res,
      "recommendation_click",
      2,
      { algorithmVersion: String(req.body.algorithmVersion || "") }
    );
  } catch (error) {
    console.error("trackRecommendationClick error:", error);
    return res.status(500).json({ success: false, message: "Failed to track recommendation activity" });
  }
}

export async function getMyBehavior(req, res) {
  try {
    const behavior = mongoose.connection.readyState === 1
      ? await UserBehavior.findOne({ user: req.user.userId })
      : getMockBehavior(req.user.userId);
    return res.json({ success: true, behavior: behavior || {} });
  } catch (error) {
    console.error("getMyBehavior error:", error);
    return res.status(500).json({ success: false, message: "Failed to get behavior data" });
  }
}
