import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import UserBehavior from "../models/UserBehavior.js";
import UserBehaviorEvent from "../models/UserBehaviorEvent.js";
import { catalogProducts } from "../data/mockCatalog.js";
import {
  RECOMMENDATION_ALGORITHM_VERSION,
  cacheRecommendations,
  findSimilarProducts,
  getCachedRecommendations,
  normalizeWeather,
  rankRecommendations,
} from "../services/recommendationService.js";
import { getMockBehavior } from "../services/mockBehaviorStore.js";

const fallbackCatalog = catalogProducts;

async function getActiveProducts() {
  if (mongoose.connection.readyState === 1) {
    try {
      const products = await Product.find({ isActive: true }).lean();
      if (products.length) return products;
    } catch (error) {
      console.error("Recommendation catalog lookup failed; using fallback catalog:", error);
    }
  }
  return fallbackCatalog;
}

function getWeatherFromQuery(query, defaults = false) {
  const temperature = Number(defaults ? query.temperature ?? 27 : query.temperature);
  const humidity = Number(defaults ? query.humidity ?? 65 : query.humidity);
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) return null;
  return normalizeWeather({
    temperature,
    humidity,
    condition: query.condition || (defaults ? "Clear" : ""),
  });
}

async function getBehavior(userId) {
  if (mongoose.connection.readyState !== 1) return getMockBehavior(userId);
  try {
    return await UserBehavior.findOne({ user: userId }).lean();
  } catch (error) {
    console.error("Recommendation profile lookup failed; using non-personalized ranking:", error);
    return null;
  }
}

async function recordImpressions(recommendations, userId, weather) {
  if (mongoose.connection.readyState !== 1 || recommendations.length === 0) return;
  try {
    await UserBehaviorEvent.insertMany(
      recommendations.map(({ product }) => ({
        user: mongoose.isValidObjectId(userId) ? userId : null,
        eventType: "recommendation_impression",
        product: mongoose.isValidObjectId(product._id) ? product._id : null,
        category: product.category || "",
        algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
        metadata: { weatherTags: weather.tags },
      })),
      { ordered: false }
    );
  } catch (error) {
    console.error("Recommendation impression analytics could not be recorded:", error);
  }
}

async function buildRecommendations(req, res, personalized) {
  const weather = getWeatherFromQuery(req.query, !personalized);
  if (!weather) {
    return res.status(400).json({
      success: false,
      message: "Valid weather data is required",
    });
  }

  const behavior = personalized ? await getBehavior(req.user.userId) : null;
  const cacheKey = JSON.stringify({
    algorithm: RECOMMENDATION_ALGORITHM_VERSION,
    user: personalized ? req.user.userId : "public",
    weather: [weather.temperature, weather.humidity, weather.condition],
    profileUpdatedAt: behavior?.updatedAt || null,
  });
  let recommendations = getCachedRecommendations(cacheKey);

  if (!recommendations) {
    const products = await getActiveProducts();
    recommendations = rankRecommendations(products, weather, behavior, 8);
    if (!recommendations.length) {
      recommendations = rankRecommendations(fallbackCatalog, weather, behavior, 8);
    }
    cacheRecommendations(cacheKey, recommendations);
  }

  await recordImpressions(recommendations, personalized ? req.user.userId : null, weather);
  const hasBehaviorSignals = Boolean(
    behavior &&
    (
      behavior.preferredCategories?.length ||
      behavior.viewedProducts?.length ||
      behavior.wishlistProducts?.length ||
      behavior.purchasedProducts?.length
    )
  );
  return res.json({
    success: true,
    weather,
    personalized: Boolean(personalized && hasBehaviorSignals),
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
    recommendations,
  });
}

export async function getRecommendations(req, res) {
  try {
    return await buildRecommendations(req, res, false);
  } catch (error) {
    console.error("Recommendations error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate recommendations",
    });
  }
}

export async function getPersonalizedRecommendations(req, res) {
  try {
    return await buildRecommendations(req, res, true);
  } catch (error) {
    console.error("Personalized recommendations error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate personalized recommendations",
    });
  }
}

async function findProduct(id) {
  if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
    try {
      const product = await Product.findById(id).lean();
      if (product) return product;
    } catch (error) {
      console.error("Recommendation product lookup failed; checking fallback catalog:", error);
    }
  }
  return fallbackCatalog.find((product) =>
    product._id?.toString() === id || String(product.id) === id
  ) || null;
}

export async function getSimilarProducts(req, res) {
  try {
    const product = await findProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const results = findSimilarProducts(product, await getActiveProducts());
    return res.json({
      success: true,
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
      recommendations: results,
    });
  } catch (error) {
    console.error("Similar products error:", error);
    return res.status(500).json({ success: false, message: "Failed to find similar products" });
  }
}

export async function getFrequentlyBoughtTogether(req, res) {
  try {
    const product = await findProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    let recommendations = [];
    if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(product._id)) {
      try {
        const orders = await Order.find({
          status: { $ne: "cancelled" },
          "items.product": product._id,
        }).select("items.product").lean();
        const counts = new Map();
        for (const order of orders) {
          const orderProductIds = new Set(order.items.map((item) => item.product?.toString()));
          if (!orderProductIds.has(product._id.toString())) continue;
          for (const id of orderProductIds) {
            if (id !== product._id.toString()) counts.set(id, (counts.get(id) || 0) + 1);
          }
        }

        const sortedIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        if (sortedIds.length) {
          const products = await Product.find({
            _id: { $in: sortedIds.map(([id]) => id) },
            isActive: true,
            stock: { $gt: 0 },
          }).lean();
          const rank = new Map(sortedIds.map(([id, count]) => [id, count]));
          recommendations = products
            .sort((a, b) => rank.get(b._id.toString()) - rank.get(a._id.toString()))
            .map((item) => ({
              product: item,
              score: rank.get(item._id.toString()),
              reason: {
                type: "frequently-bought-together",
                text: "Often purchased in the same order",
                factors: [`Bought together in ${rank.get(item._id.toString())} orders`],
              },
            }));
        }
      } catch (error) {
        console.error("Purchase history recommendations failed; using related-product fallback:", error);
      }
    }

    if (!recommendations.length) {
      recommendations = findSimilarProducts(product, await getActiveProducts())
        .slice(0, 4)
        .map((item) => ({
          ...item,
          reason: {
            type: "bundle-fallback",
            text: "Complementary picks while purchase history builds",
            factors: item.reason.factors,
          },
        }));
    }

    return res.json({
      success: true,
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
      fallback: !mongoose.connection.readyState || recommendations.some(
        (item) => item.reason.type === "bundle-fallback"
      ),
      recommendations,
    });
  } catch (error) {
    console.error("Frequently bought together error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate bundle recommendations",
    });
  }
}

export async function getRecommendationAnalytics(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Recommendation analytics require a database connection",
      });
    }
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const summary = await UserBehaviorEvent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { eventType: "$eventType", algorithmVersion: "$algorithmVersion" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.eventType": 1 } },
    ]);
    return res.json({
      success: true,
      periodDays: 30,
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
      summary: summary.map(({ _id, count }) => ({
        eventType: _id.eventType,
        algorithmVersion: _id.algorithmVersion || null,
        count,
      })),
    });
  } catch (error) {
    console.error("Recommendation analytics error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load recommendation analytics",
    });
  }
}
