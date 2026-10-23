import express from "express";
import {
  getProductReviews,
  createReview,
  voteReviewHelpful,
} from "../controllers/reviewController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* Public review endpoints */
router.get("/product/:productId", getProductReviews);
router.post("/:reviewId/helpful", voteReviewHelpful);

/* Protected creation */
router.post("/product/:productId", protect, createReview);

export default router;
