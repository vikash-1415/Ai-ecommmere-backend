import express from "express";
import {
  trackProductView,
  trackWishlist,
  trackCartAdd,
  trackRecommendationClick,
  getMyBehavior,
} from "../controllers/behaviorController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All behavior routes require authentication
router.use(protect);

router.post("/view", trackProductView);
router.post("/wishlist", trackWishlist);
router.post("/cart", trackCartAdd);
router.post("/recommendation-click", trackRecommendationClick);
router.get("/me", getMyBehavior);

export default router;
