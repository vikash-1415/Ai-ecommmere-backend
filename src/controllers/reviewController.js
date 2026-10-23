import mongoose from "mongoose";
import Review from "../models/Review.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { catalogProducts } from "../data/mockCatalog.js";

// Rich fallback reviews store for dev & offline testing
let mockReviews = [
  {
    _id: "rev_101",
    product: "660a1001e4b0111111111001",
    productId: 1,
    userName: "Rahul Sharma",
    rating: 5,
    title: "100% Waterproof! Saved me in Mumbai Rains",
    body: "Tested during continuous downpours in Mumbai. The membrane is genuinely breathable so you don't feel sweaty inside. The hood coverage is fantastic and fits over a helmet too.",
    isVerifiedPurchase: true,
    helpfulCount: 38,
    helpfulUsers: [],
    status: "approved",
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    _id: "rev_102",
    product: "660a1001e4b0111111111001",
    productId: 1,
    userName: "Ananya Patel",
    rating: 5,
    title: "Ultralight and extremely stylish",
    body: "The taped seams and waterproof zippers make a huge difference. Fits true to size, packs down into its own pocket. Highly recommended for travelers and monsoon commuters.",
    isVerifiedPurchase: true,
    helpfulCount: 24,
    helpfulUsers: [],
    status: "approved",
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    _id: "rev_103",
    product: "660a1001e4b0111111111001",
    productId: 1,
    userName: "Karan Verma",
    rating: 4,
    title: "Great jacket, slightly snug at wrists",
    body: "Water beads right off the fabric even under heavy faucet tests. Only minor thing is the elastic cuffs are snug, but that actually stops rainwater from blowing up your sleeves.",
    isVerifiedPurchase: true,
    helpfulCount: 15,
    helpfulUsers: [],
    status: "approved",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    _id: "rev_104",
    product: "660a1003e4b0111111111003",
    productId: 3,
    userName: "Pooja Hegde",
    rating: 5,
    title: "Zero slipping on wet roads!",
    body: "The grip on wet marble and wet asphalt is unmatched. Kept my socks completely dry during a 5km morning walk in rain.",
    isVerifiedPurchase: true,
    helpfulCount: 29,
    helpfulUsers: [],
    status: "approved",
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
];

/* Helper to calculate distribution and average */
function buildReviewStats(reviewsList) {
  const total = reviewsList.length;
  if (total === 0) {
    return {
      average: 4.8,
      total: 0,
      distribution: { 5: 80, 4: 15, 3: 4, 2: 1, 1: 0 },
      counts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    };
  }

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  reviewsList.forEach((r) => {
    const star = Math.min(5, Math.max(1, Math.round(r.rating || 5)));
    counts[star] = (counts[star] || 0) + 1;
    sum += Number(r.rating || 5);
  });

  const average = Number((sum / total).toFixed(1));
  const distribution = {
    5: Math.round((counts[5] / total) * 100),
    4: Math.round((counts[4] / total) * 100),
    3: Math.round((counts[3] / total) * 100),
    2: Math.round((counts[2] / total) * 100),
    1: Math.round((counts[1] / total) * 100),
  };

  return { average, total, counts, distribution };
}

/* GET /api/products/:productId/reviews */
export async function getProductReviews(req, res) {
  try {
    const { productId } = req.params;
    const { sort = "helpful", rating } = req.query;
    const isDbConnected = mongoose.connection.readyState === 1;

    let reviews = [];

    if (isDbConnected && mongoose.isValidObjectId(productId)) {
      const filter = { product: productId, status: "approved" };
      if (rating && rating !== "All") {
        filter.rating = Number(rating);
      }

      let query = Review.find(filter);

      if (sort === "helpful") query = query.sort({ helpfulCount: -1, createdAt: -1 });
      else if (sort === "highest") query = query.sort({ rating: -1, createdAt: -1 });
      else if (sort === "lowest") query = query.sort({ rating: 1, createdAt: -1 });
      else query = query.sort({ createdAt: -1 });

      reviews = await query.lean();

      const allProductReviews = await Review.find({ product: productId, status: "approved" }).lean();
      const stats = buildReviewStats(allProductReviews);

      return res.json({
        success: true,
        stats,
        reviews,
      });
    }

    // In-memory fallback
    const targetKey = String(productId);
    let matched = mockReviews.filter(
      (r) =>
        String(r.product) === targetKey ||
        String(r.productId) === targetKey ||
        targetKey === "1"
    );

    const stats = buildReviewStats(matched);

    if (rating && rating !== "All") {
      matched = matched.filter((r) => Math.round(r.rating) === Number(rating));
    }

    if (sort === "helpful") {
      matched.sort((a, b) => (b.helpfulCount || 0) - (a.helpfulCount || 0));
    } else if (sort === "highest") {
      matched.sort((a, b) => b.rating - a.rating);
    } else if (sort === "lowest") {
      matched.sort((a, b) => a.rating - b.rating);
    } else {
      matched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    res.json({
      success: true,
      stats,
      reviews: matched,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
}

/* POST /api/products/:productId/reviews */
export async function createReview(req, res) {
  try {
    const { productId } = req.params;
    const { rating, title, body, comment, images = [] } = req.body;
    const reviewBody = (body || comment || "").trim();

    if (!rating || Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({
        success: false,
        message: "Star rating between 1 and 5 is required",
      });
    }

    if (!reviewBody || reviewBody.length < 5) {
      return res.status(400).json({
        success: false,
        message: "Please write at least a few words describing your experience",
      });
    }

    const userName = req.user?.name || "Customer";
    const userId = req.user?.userId;
    const isDbConnected = mongoose.connection.readyState === 1;
    const is24Hex = (val) => /^[0-9a-fA-F]{24}$/.test(String(val || ""));
    let resolvedProductOid;
    if (is24Hex(productId)) {
      resolvedProductOid = new mongoose.Types.ObjectId(String(productId));
    } else {
      const match = catalogProducts.find(
        (p) => String(p.id) === String(productId) || p._id?.toString() === String(productId)
      );
      if (match && is24Hex(match._id)) {
        resolvedProductOid = new mongoose.Types.ObjectId(String(match._id));
      } else {
        resolvedProductOid = new mongoose.Types.ObjectId();
      }
    }

    // Check if user has purchased the item for verified badge
    let isVerifiedPurchase = true;
    if (isDbConnected && userId && is24Hex(userId)) {
      try {
        const order = await Order.findOne({
          user: new mongoose.Types.ObjectId(String(userId)),
          "items.product": resolvedProductOid,
          status: { $in: ["confirmed", "shipped", "delivered"] },
        });
        isVerifiedPurchase = Boolean(order);
      } catch (e) {
        isVerifiedPurchase = false;
      }
    }

    if (isDbConnected) {
      const review = await Review.create({
        product: resolvedProductOid,
        user: is24Hex(userId) ? new mongoose.Types.ObjectId(String(userId)) : new mongoose.Types.ObjectId(),
        userName,
        rating: Number(rating),
        title: title || "",
        body: reviewBody,
        images,
        isVerifiedPurchase,
        status: "approved",
      });

      // Update product rating aggregate
      const allApproved = await Review.find({ product: resolvedProductOid, status: "approved" });
      const avg = allApproved.reduce((sum, r) => sum + r.rating, 0) / allApproved.length;
      await Product.findByIdAndUpdate(resolvedProductOid, {
        rating: Number(avg.toFixed(1)),
        reviews: allApproved.length,
      });

      return res.status(201).json({
        success: true,
        message: "Review submitted successfully!",
        review,
      });
    }

    // Fallback in-memory
    const newRev = {
      _id: "rev_" + Date.now(),
      product: productId,
      productId: Number(productId) || 1,
      userName,
      rating: Number(rating),
      title: title || "",
      body: reviewBody,
      images,
      isVerifiedPurchase: true,
      helpfulCount: 0,
      helpfulUsers: [],
      status: "approved",
      createdAt: new Date().toISOString(),
    };

    mockReviews.unshift(newRev);

    res.status(201).json({
      success: true,
      message: "Review submitted successfully!",
      review: newRev,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to submit review",
      error: error.message,
    });
  }
}

/* POST /api/reviews/:reviewId/helpful */
export async function voteReviewHelpful(req, res) {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.userId || req.ip || "guest_voter";
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected && mongoose.isValidObjectId(reviewId)) {
      const review = await Review.findById(reviewId);
      if (!review) {
        return res.status(404).json({ success: false, message: "Review not found" });
      }

      if (review.helpfulUsers.includes(userId)) {
        return res.status(400).json({ success: false, message: "You already upvoted this review" });
      }

      review.helpfulCount += 1;
      review.helpfulUsers.push(userId);
      await review.save();

      return res.json({
        success: true,
        helpfulCount: review.helpfulCount,
      });
    }

    // In-memory fallback
    const target = mockReviews.find((r) => String(r._id) === String(reviewId));
    if (!target) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    if (!target.helpfulUsers) target.helpfulUsers = [];
    if (target.helpfulUsers.includes(userId)) {
      return res.status(400).json({ success: false, message: "You already upvoted this review" });
    }

    target.helpfulCount = (target.helpfulCount || 0) + 1;
    target.helpfulUsers.push(userId);

    res.json({
      success: true,
      helpfulCount: target.helpfulCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to vote review",
      error: error.message,
    });
  }
}
