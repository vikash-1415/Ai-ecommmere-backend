import express from "express";

import {
  getProducts,
  getSuggestions,
  getFilterOptions,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";

import {
  protect,
  adminOnly,
} from "../middleware/authMiddleware.js";

const router = express.Router();

/* Public search and filter endpoints (must be before /:id) */
router.get("/suggestions", getSuggestions);
router.get("/filter-options", getFilterOptions);

/* Product catalog */
router.get("/", getProducts);
router.get("/:id", getProductById);

/* Admin */
router.post("/", protect, adminOnly, createProduct);
router.put("/:id", protect, adminOnly, updateProduct);
router.delete("/:id", protect, adminOnly, deleteProduct);

export default router;
