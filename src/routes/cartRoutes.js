import express from "express";

import { getMyCart, saveMyCart } from "../controllers/cartController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getMyCart);
router.put("/", saveMyCart);

export default router;
