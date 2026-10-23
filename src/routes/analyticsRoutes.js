import express from "express";
import { trackAnalyticsEvent, getAnalyticsDashboard, getAdminStats } from "../controllers/analyticsController.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public / Guest / User Event ingestion
router.post("/event", trackAnalyticsEvent);

// Admin dashboard analytics metrics
router.get("/dashboard", getAnalyticsDashboard);

// Real admin stats (revenue, users, monthly breakdown)
router.get("/admin-stats", protect, adminOnly, getAdminStats);

export default router;
