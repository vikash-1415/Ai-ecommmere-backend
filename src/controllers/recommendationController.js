import mongoose from "mongoose";

import Product from "../models/Product.js";
import UserBehavior from "../models/UserBehavior.js";
import {
  normalizeWeather,
  calculateScore,
  calculatePersonalizedScore,
  getRecommendationReason,
} from "../services/recommendationService.js";

// ─────────────────────────────────────────────
// Fallback catalog (MongoDB offline)
// ─────────────────────────────────────────────
const fallbackCatalog = [
  {
    _id: "1",
    id: 1,
    name: "Premium Rain Jacket",
    category: "Fashion",
    price: 1499,
    oldPrice: 1999,
    image:
      "https://images.unsplash.com/photo-1544923246-77307dd654cb?auto=format&fit=crop&w=900&q=80",
    rating: 4.8,
    reviews: 124,
    weatherTags: ["rain", "cloudy", "humid"],
    suitableFor: ["monsoon", "travel", "outdoor"],
    stock: 45,
    isFeatured: true,
    isActive: true,
  },
  {
    _id: "2",
    id: 2,
    name: "Waterproof Travel Backpack",
    category: "Bags",
    price: 1199,
    oldPrice: 1699,
    image:
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
    rating: 4.7,
    reviews: 89,
    weatherTags: ["rain", "cloudy"],
    suitableFor: ["travel", "college", "office"],
    stock: 60,
    isFeatured: true,
    isActive: true,
  },
  {
    _id: "3",
    id: 3,
    name: "Lightweight Summer T-Shirt",
    category: "Fashion",
    price: 599,
    oldPrice: 899,
    image:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
    rating: 4.6,
    reviews: 210,
    weatherTags: ["sunny", "hot", "clear"],
    suitableFor: ["summer", "casual"],
    stock: 100,
    isFeatured: true,
    isActive: true,
  },
  {
    _id: "4",
    id: 4,
    name: "Insulated Travel Mug",
    category: "Lifestyle",
    price: 799,
    oldPrice: 1099,
    image:
      "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=80",
    rating: 4.9,
    reviews: 154,
    weatherTags: ["cold", "rain", "winter"],
    suitableFor: ["office", "travel"],
    stock: 75,
    isFeatured: true,
    isActive: true,
  },
  {
    _id: "5",
    id: 5,
    name: "UV Protection Sunglasses",
    category: "Accessories",
    price: 899,
    oldPrice: 1299,
    image:
      "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=80",
    rating: 4.5,
    reviews: 76,
    weatherTags: ["sunny", "hot"],
    suitableFor: ["travel", "summer", "outdoor"],
    stock: 40,
    isFeatured: false,
    isActive: true,
  },
  {
    _id: "6",
    id: 6,
    name: "Breathable Running Shoes",
    category: "Footwear",
    price: 1299,
    oldPrice: 1799,
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
    rating: 4.6,
    reviews: 203,
    weatherTags: ["clear", "sunny", "warm"],
    suitableFor: ["fitness", "outdoor", "casual"],
    stock: 55,
    isFeatured: true,
    isActive: true,
  },
];

// ─────────────────────────────────────────────
// Helper: get products (DB or fallback)
// ─────────────────────────────────────────────
async function getActiveProducts() {
  const isDbConnected = mongoose.connection.readyState === 1;

  if (isDbConnected) {
    const products = await Product.find({ isActive: true });
    if (products && products.length > 0) return products;
  }

  return fallbackCatalog;
}

// ─────────────────────────────────────────────
// GET /api/recommendations  (public)
// ─────────────────────────────────────────────
export async function getRecommendations(req, res) {
  try {
    const temperature = Number(req.query.temperature ?? 27);
    const humidity = Number(req.query.humidity ?? 65);
    const condition = req.query.condition || "Clear";

    if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) {
      return res.status(400).json({
        success: false,
        message: "Valid weather data is required",
      });
    }

    const normalizedWeather = normalizeWeather({ temperature, humidity, condition });
    const products = await getActiveProducts();

    const recommendations = products
      .map((product) => {
        const pObj = product.toObject ? product.toObject() : product;
        const score = calculateScore(pObj, normalizedWeather);
        const reason = getRecommendationReason(pObj, normalizedWeather, null);
        return { product: pObj, score, reason, match: Math.min(Math.round((score / 50) * 100), 99) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    res.json({
      success: true,
      weather: normalizedWeather,
      recommendations: recommendations.map(({ product, score, match, reason }) => ({
        product,
        score,
        match,
        reason,
      })),
    });
  } catch (error) {
    console.error("Recommendations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate recommendations",
      error: error.message,
    });
  }
}

// ─────────────────────────────────────────────
// GET /api/recommendations/personalized  (protected)
// ─────────────────────────────────────────────
export async function getPersonalizedRecommendations(req, res) {
  try {
    const temperature = Number(req.query.temperature);
    const humidity = Number(req.query.humidity);
    const condition = req.query.condition || "";

    if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) {
      return res.status(400).json({
        success: false,
        message: "Valid weather data is required",
      });
    }

    const normalizedWeather = normalizeWeather({ temperature, humidity, condition });

    // Fetch behavior — optional; scoring degrades gracefully if null
    let behavior = null;
    try {
      if (mongoose.connection.readyState === 1) {
        behavior = await UserBehavior.findOne({ user: req.user.userId });
      }
    } catch {
      // DB offline — continue with weather-only scoring
    }

    const products = await getActiveProducts();

    const recommendations = products
      .map((product) => {
        const pObj = product.toObject ? product.toObject() : product;
        const score = calculatePersonalizedScore(pObj, normalizedWeather, behavior);
        const reason = getRecommendationReason(pObj, normalizedWeather, behavior);
        return { product: pObj, score, reason };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((item, idx) => ({
        ...item,
        // Rank-based match percentage so top product always looks relevant
        match: Math.max(99 - idx * 4, 60),
      }));

    res.json({
      success: true,
      weather: normalizedWeather,
      personalized: true,
      recommendations,
    });
  } catch (error) {
    console.error("Personalized recommendations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate personalized recommendations",
    });
  }
}
