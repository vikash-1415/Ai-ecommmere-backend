const mockBehaviorStore = new Map();

export function getMockBehavior(userId) {
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
