// ─────────────────────────────────────────────────────────
//  Weather Normalization
// ─────────────────────────────────────────────────────────

export function normalizeWeather(weather) {
  const temperature = Number(weather.temperature);
  const humidity = Number(weather.humidity);
  const condition = String(weather.condition || "").toLowerCase();

  const tags = new Set();

  if (
    condition.includes("rain") ||
    condition.includes("drizzle") ||
    condition.includes("thunder")
  ) {
    tags.add("rain");
  }

  if (condition.includes("cloud")) {
    tags.add("cloudy");
  }

  if (condition.includes("clear") || condition.includes("sun")) {
    tags.add("sunny");
    tags.add("clear");
  }

  if (temperature >= 32) {
    tags.add("hot");
  }

  if (temperature >= 24 && temperature < 32) {
    tags.add("warm");
  }

  if (temperature >= 15 && temperature < 24) {
    tags.add("mild");
  }

  if (temperature < 15) {
    tags.add("cold");
    tags.add("winter");
  }

  if (humidity >= 75) {
    tags.add("humid");
  }

  return {
    temperature,
    humidity,
    condition,
    tags: [...tags],
  };
}

// ─────────────────────────────────────────────────────────
//  Basic Score (public recommendations, no behavior data)
// ─────────────────────────────────────────────────────────

export function calculateScore(product, weather) {
  const weatherTags = new Set(
    (weather.tags || []).map((t) => t.toLowerCase())
  );
  const productTags = (product.weatherTags || []).map((t) => t.toLowerCase());

  let score = 0;

  for (const tag of productTags) {
    if (weatherTags.has(tag)) {
      score += 20;
    }
  }

  if (product.isFeatured) score += 5;
  if (product.stock > 0) score += 3;

  score += Math.min(Number(product.rating || 0) * 2, 10);

  return Math.round(score);
}

// ─────────────────────────────────────────────────────────
//  Personalized Score (logged-in user, uses behavior data)
// ─────────────────────────────────────────────────────────

/**
 * Scoring breakdown:
 *  Weather match      →  +20 per matching tag (max ~40-60)
 *  Category preference→  +2 × score, capped at 20
 *  View history       →  +3 × count, capped at 15
 *  Wishlisted         →  +15 flat
 *  Product rating     →  +2 × rating, capped at 10
 *  Featured boost     →  +5
 *  In stock           →  +3
 */
export function calculatePersonalizedScore(product, weather, behavior) {
  let score = 0;

  // 1. Weather matching
  const weatherTags = new Set((weather.tags || []).map((t) => t.toLowerCase()));
  for (const tag of product.weatherTags || []) {
    if (weatherTags.has(tag.toLowerCase())) {
      score += 20;
    }
  }

  // 2. Category preference
  const categoryPreference = behavior?.preferredCategories?.find(
    (item) => item.category === product.category
  );
  if (categoryPreference) {
    score += Math.min(categoryPreference.score * 2, 20);
  }

  // 3. Previously viewed
  const viewed = behavior?.viewedProducts?.find(
    (item) => item.product?.toString() === product._id?.toString()
  );
  if (viewed) {
    score += Math.min(viewed.count * 3, 15);
  }

  // 4. Wishlisted
  const wishlisted = behavior?.wishlistProducts?.some(
    (id) => id?.toString() === product._id?.toString()
  );
  if (wishlisted) {
    score += 15;
  }

  // 5. Product quality signal
  score += Math.min(Number(product.rating || 0) * 2, 10);

  // 6. Featured boost
  if (product.isFeatured) score += 5;

  // 7. Stock availability
  if (product.stock > 0) score += 3;

  return Math.round(score);
}

// ─────────────────────────────────────────────────────────
//  Recommendation Reason Generator
// ─────────────────────────────────────────────────────────

/**
 * Returns a human-readable reason + icon type for the recommendation.
 * Priority: weather → category preference → high rating → general
 */
export function getRecommendationReason(product, weather, behavior) {
  const weatherTags = new Set((weather.tags || []).map((t) => t.toLowerCase()));

  const weatherMatch = (product.weatherTags || []).some((tag) =>
    weatherTags.has(tag.toLowerCase())
  );

  const categoryMatch = behavior?.preferredCategories?.some(
    (item) =>
      item.category === product.category && item.score >= 3
  );

  const viewedRecently = behavior?.viewedProducts?.some(
    (item) =>
      item.product?.toString() === product._id?.toString() && item.count >= 2
  );

  const wishlisted = behavior?.wishlistProducts?.some(
    (id) => id?.toString() === product._id?.toString()
  );

  if (weatherMatch) {
    return {
      type: "weather",
      icon: "🌤️",
      text: "Recommended for your current weather",
    };
  }

  if (wishlisted) {
    return {
      type: "wishlist",
      icon: "❤️",
      text: "In your wishlist — relevant today",
    };
  }

  if (viewedRecently) {
    return {
      type: "viewed",
      icon: "👀",
      text: "Based on your recent browsing",
    };
  }

  if (categoryMatch) {
    return {
      type: "preference",
      icon: "✨",
      text: "Based on your shopping interests",
    };
  }

  if (Number(product.rating || 0) >= 4.5) {
    return {
      type: "popular",
      icon: "🔥",
      text: "Highly rated by shoppers",
    };
  }

  return {
    type: "general",
    icon: "⭐",
    text: "You may like this product",
  };
}
