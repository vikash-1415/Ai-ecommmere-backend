import express from "express";

import {
  createOrder,
  validateCoupon,
  verifyPayment,
  getMyOrders,
  getMyOrder,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
} from "../controllers/orderController.js";

import {
  protect,
  adminOnly,
} from "../middleware/authMiddleware.js";
import { requireVerifiedEmail } from "../middleware/requireVerifiedEmail.js";

const router = express.Router();

/* Public / Pre-checkout Coupon Validation */
router.post("/validate-coupon", validateCoupon);

/* Protected routes below */
router.use(protect);

/* Customer Order Routes */
router.post("/", requireVerifiedEmail, createOrder);
router.post("/verify-payment", verifyPayment);
router.get("/my-orders", getMyOrders);

/* Admin Order Routes (declared before /:id) */
router.get("/admin/all", adminOnly, getAllOrders);
router.patch("/admin/:id/status", adminOnly, updateOrderStatus);

/* Single Order & Cancellation */
router.get("/:id", getMyOrder);
router.patch("/:id/cancel", cancelOrder);
router.put("/:id/status", adminOnly, updateOrderStatus);

export default router;
