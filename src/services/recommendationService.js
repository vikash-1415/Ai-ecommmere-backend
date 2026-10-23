export const RECOMMENDATION_ALGORITHM_VERSION = "step25-v1";

const recommendationCache = new Map();
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 500;

export function normalizeWeather(weather = {}) {
  const temperature = Number(weather.temperature);
  const humidity = Number(weather.humidity);
  const condition = String(weather.condition || "").toLowerCase();
  const tags = new Set();

  if (/rain|drizzle|thunder/.test(condition)) tags.add("rain");
  if (condition.includes("cloud")) tags.add("cloudy");
  if (/clear|sun/.test(condition)) {
    tags.add("sunny");
    tags.add("clear");
  }
  if (/snow|cold/.test(condition)) tags.add("cold");
  if (temperature >= 32) tags.add("hot");
  else if (temperature >= 24) tags.add("warm");
  else if (temperature >= 15) tags.add("mild");
  else tags.add("cold");
  if (temperature < 15) tags.add("winter");
  if (humidity >= 75) tags.add("humid");

  return { temperature, humidity, condition, tags: [...tags] };
}

function asPlainObject(product) {
  return typeof product?.toObject === "function" ? product.toObject() : product;
}

function scoreBreakdown(product, weather, behavior = null) {
  const weatherTags = new Set((weather?.tags || []).map((tag) => String(tag).toLowerCase()));
  const productTags = (product.weatherTags || []).map((tag) => String(tag).toLowerCase());
  const weatherMatches = productTags.filter((tag) => weatherTags.has(tag));
  const categoryPreference = behavior?.preferredCategories?.find(
    (item) => item.category === product.category
  );
  const viewed = behavior?.viewedProducts?.find(
    (item) => item.product?.toString() === product._id?.toString()
  );
  const purchased = behavior?.purchasedProducts?.some(
    (id) => id?.toString() === product._id?.toString()
  );
  const wishlisted = behavior?.wishlistProducts?.some(
    (id) => id?.toString() === product._id?.toString()
  );

  const components = {
    weather: Math.min(weatherMatches.length * 20, 40),
    categoryPreference: Math.min(Number(categoryPreference?.score || 0) * 2.5, 25),
    behavior: Math.min(Number(viewed?.count || 0) * 1.5, 7.5) + (purchased ? 7.5 : 0),
    wishlist: wishlisted ? 10 : 0,
    quality: Math.min(Math.max(Number(product.rating || 0), 0), 5),
    featured: product.isFeatured ? 3 : 0,
    availability: Number(product.stock || 0) > 0 ? 2 : 0,
  };
  const score = Math.round(
    Object.values(components).reduce((total, value) => total + value, 0)
  );

  return { score, components, weatherMatches, wishlisted, purchased, categoryPreference };
}

export function calculateScore(product, weather) {
  return scoreBreakdown(asPlainObject(product), weather).score;
}

export function calculatePersonalizedScore(product, weather, behavior) {
  return scoreBreakdown(asPlainObject(product), weather, behavior).score;
}

export function getRecommendationReason(product, weather, behavior) {
  const details = scoreBreakdown(asPlainObject(product), weather, behavior);
  const factors = [];

  if (details.weatherMatches.length) {
    factors.push(`Matches ${details.weatherMatches.join(", ")} weather`);
  }
  if (details.categoryPreference) {
    factors.push(`Popular in your ${product.category} interests`);
  }
  if (details.wishlisted) factors.push("From your wishlist");
  if (details.purchased) factors.push("Related to a previous purchase");
  if (Number(product.rating || 0) >= 4) factors.push("Highly rated");
  if (factors.length === 0) factors.push("A highly rated in-stock product");

  const type = details.weatherMatches.length
    ? "weather"
    : details.wishlisted
      ? "wishlist"
      : details.categoryPreference
        ? "preference"
        : Number(product.rating || 0) >= 4.5
          ? "popular"
          : "general";

  return {
    type,
    text: factors[0],
    factors,
    scoreBreakdown: details.components,
  };
}

export function scoreProduct(product, weather, behavior = null) {
  const plainProduct = asPlainObject(product);
  const details = scoreBreakdown(plainProduct, weather, behavior);
  return {
    product: plainProduct,
    score: details.score,
    match: Math.min(details.score, 100),
    reason: getRecommendationReason(plainProduct, weather, behavior),
  };
}

export function rankRecommendations(products, weather, behavior = null, limit = 8) {
  const candidates = products
    .map(asPlainObject)
    .filter((product) => product.isActive !== false && Number(product.stock || 0) > 0)
    .map((product) => scoreProduct(product, weather, behavior))
    .sort((a, b) => b.score - a.score);

  const ranked = [];
  const categoryCounts = new Map();
  const brandCounts = new Map();

  while (candidates.length && ranked.length < limit) {
    const index = candidates.findIndex(({ product }) =>
      (categoryCounts.get(product.category) || 0) < 2 &&
      (brandCounts.get(product.brand || "") || 0) < 2
    );
    const [item] = candidates.splice(index < 0 ? 0 : index, 1);
    ranked.push(item);
    categoryCounts.set(item.product.category, (categoryCounts.get(item.product.category) || 0) + 1);
    brandCounts.set(item.product.brand || "", (brandCounts.get(item.product.brand || "") || 0) + 1);
  }

  return ranked;
}

export function findSimilarProducts(product, products, limit = 4) {
  const current = asPlainObject(product);
  const currentTags = new Set((current.weatherTags || []).map((tag) => String(tag).toLowerCase()));

  return products
    .map(asPlainObject)
    .filter((candidate) =>
      candidate.isActive !== false &&
      Number(candidate.stock || 0) > 0 &&
      candidate._id?.toString() !== current._id?.toString()
    )
    .map((candidate) => {
      const tagMatches = (candidate.weatherTags || []).filter((tag) =>
        currentTags.has(String(tag).toLowerCase())
      ).length;
      const sameCategory = candidate.category === current.category;
      const priceRatio = Math.min(
        Number(candidate.price || 0),
        Number(current.price || 0)
      ) / Math.max(Number(candidate.price || 0), Number(current.price || 0), 1);
      return {
        product: candidate,
        score: (sameCategory ? 50 : 0) + tagMatches * 15 + Math.round(priceRatio * 20),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ product: candidate, score }) => ({
      product: candidate,
      score,
      reason: {
        type: "similar",
        text: "Similar category, weather suitability, or price",
        factors: [
          ...(candidate.category === current.category ? ["Same category"] : []),
          ...(candidate.weatherTags || []).filter((tag) => currentTags.has(String(tag).toLowerCase()))
            .map((tag) => `Also suited to ${tag} weather`),
        ],
      },
    }));
}

export function getCachedRecommendations(key) {
  const entry = recommendationCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    recommendationCache.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheRecommendations(key, value) {
  const now = Date.now();
  for (const [cacheKey, entry] of recommendationCache) {
    if (entry.expiresAt <= now) recommendationCache.delete(cacheKey);
  }
  if (!recommendationCache.has(key) && recommendationCache.size >= MAX_CACHE_ENTRIES) {
    recommendationCache.delete(recommendationCache.keys().next().value);
  }
  recommendationCache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
}

export function clearRecommendationCache() {
  recommendationCache.clear();
}
