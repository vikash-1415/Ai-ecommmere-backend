import express from "express";
import {
  getRecommendations,
  getPersonalizedRecommendations,
} from "../controllers/recommendationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public — weather-based recommendations (no auth required)
router.get("/", getRecommendations);

// Protected — personalized recommendations (requires login)
router.get("/personalized", protect, getPersonalizedRecommendations);

export default router;
