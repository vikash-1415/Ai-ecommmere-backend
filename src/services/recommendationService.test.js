import test from "node:test";
import assert from "node:assert/strict";
import {
  findSimilarProducts,
  getRecommendationReason,
  getCachedRecommendations,
  normalizeWeather,
  rankRecommendations,
  cacheRecommendations,
  clearRecommendationCache,
  scoreProduct,
} from "./recommendationService.js";

const weather = normalizeWeather({
  temperature: 34,
  humidity: 82,
  condition: "Rain",
});

const products = [
  {
    _id: "rain-jacket",
    name: "Rain jacket",
    category: "Fashion",
    brand: "NorthPeak",
    weatherTags: ["rain", "humid"],
    rating: 4.8,
    stock: 5,
    isActive: true,
  },
  {
    _id: "rain-pants",
    name: "Rain pants",
    category: "Fashion",
    brand: "NorthPeak",
    weatherTags: ["rain"],
    rating: 4.5,
    stock: 4,
    isActive: true,
  },
  {
    _id: "rain-boots",
    name: "Rain boots",
    category: "Footwear",
    brand: "Trail",
    weatherTags: ["rain"],
    rating: 4.2,
    stock: 8,
    isActive: true,
  },
  {
    _id: "inactive",
    category: "Other",
    brand: "Other",
    weatherTags: ["rain"],
    rating: 5,
    stock: 4,
    isActive: false,
  },
  {
    _id: "out-of-stock",
    category: "Other",
    brand: "Other",
    weatherTags: ["rain"],
    rating: 5,
    stock: 0,
    isActive: true,
  },
];

test("normalizes current weather into recommendation tags", () => {
  assert.deepEqual(weather.tags, ["rain", "hot", "humid"]);
});

test("hard-filters inactive and unavailable products and diversifies categories", () => {
  const ranked = rankRecommendations(products, weather, null, 5);
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].product._id, "rain-jacket");
  assert.equal(ranked[2].product._id, "rain-boots");
});

test("returns a score breakdown and matching explanation", () => {
  const scored = scoreProduct(products[0], weather);
  assert.equal(scored.score, 47);
  assert.deepEqual(scored.reason.factors, [
    "Matches rain, humid weather",
    "Highly rated",
  ]);
  assert.equal(getRecommendationReason(products[0], weather).type, "weather");
});

test("personal signals increase scores and appear in the explanation", () => {
  const behavior = {
    preferredCategories: [{ category: "Footwear", score: 4 }],
    viewedProducts: [{ product: "rain-boots", count: 2 }],
    wishlistProducts: ["rain-boots"],
    purchasedProducts: [],
  };
  const baseline = scoreProduct(products[2], weather);
  const personalized = scoreProduct(products[2], weather, behavior);

  assert.ok(personalized.score > baseline.score);
  assert.ok(personalized.reason.factors.includes("From your wishlist"));
  assert.ok(personalized.reason.scoreBreakdown.categoryPreference > 0);
});

test("finds similar in-stock products and excludes the current product", () => {
  const similar = findSimilarProducts(products[0], products, 4);
  assert.deepEqual(similar.map(({ product }) => product._id), ["rain-pants", "rain-boots"]);
});

test("recommendation cache stores and clears values", () => {
  clearRecommendationCache();
  cacheRecommendations("test-key", [{ score: 10 }]);
  assert.deepEqual(getCachedRecommendations("test-key"), [{ score: 10 }]);
  clearRecommendationCache();
  assert.equal(getCachedRecommendations("test-key"), null);
});
