import express from "express";
import { trackAnalyticsEvent, getAnalyticsDashboard } from "../controllers/analyticsController.js";

const router = express.Router();

// Public / Guest / User Event ingestion
router.post("/event", trackAnalyticsEvent);

// Admin dashboard analytics metrics
router.get("/dashboard", getAnalyticsDashboard);

export default router;
