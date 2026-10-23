import express from "express";
import {
  getRecommendations,
  getPersonalizedRecommendations,
  getSimilarProducts,
  getFrequentlyBoughtTogether,
  getRecommendationAnalytics,
} from "../controllers/recommendationController.js";
import { adminOnly, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public — weather-based recommendations (no auth required)
router.get("/", getRecommendations);

// Protected — personalized recommendations (requires login)
router.get("/personalized", protect, getPersonalizedRecommendations);
router.get("/:id/similar", getSimilarProducts);
router.get("/:id/frequently-bought-together", getFrequentlyBoughtTogether);
router.get("/analytics", protect, adminOnly, getRecommendationAnalytics);

export default router;
