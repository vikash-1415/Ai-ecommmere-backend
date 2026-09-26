import express from "express";

import {
  createOrder,
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

const router = express.Router();

// All order operations require valid authentication
router.use(protect);

/* Customer Order Routes */
router.post("/", createOrder);
router.get("/my-orders", getMyOrders);

/* Admin Order Routes (declared before /:id) */
router.get("/admin/all", adminOnly, getAllOrders);
router.patch("/admin/:id/status", adminOnly, updateOrderStatus);

/* Single Order & Cancellation */
router.get("/:id", getMyOrder);
router.patch("/:id/cancel", cancelOrder);
router.put("/:id/status", adminOnly, updateOrderStatus);

export default router;
