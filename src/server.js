import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import { connectDB } from "./config/db.js";
import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_PORT,
} from "./config/constants.js";
import productRoutes from "./routes/productRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import weatherRoutes from "./routes/weatherRoutes.js";
import recommendationRoutes from "./routes/recommendationRoutes.js";
import behaviorRoutes from "./routes/behaviorRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || DEFAULT_PORT;
const allowedOrigins = new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...(process.env.CLIENT_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      // Allow all Vercel deployments (*.vercel.app)
      if (/^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }

      // Allow localhost on any port
      if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin "${origin}" is not allowed by CORS`));
    },
    credentials: true,
  })
);

// In-memory rate limiting map (IP -> { count, resetAt })
const ipRateLimits = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 180; // 180 req/min per IP

// 1. Production Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// 2. IP Rate Limiting Middleware
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || "global";
  const now = Date.now();
  const clientLimit = ipRateLimits.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };

  if (now > clientLimit.resetAt) {
    clientLimit.count = 1;
    clientLimit.resetAt = now + RATE_LIMIT_WINDOW;
  } else {
    clientLimit.count += 1;
  }
  ipRateLimits.set(ip, clientLimit);

  if (clientLimit.count > MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please slow down and try again shortly.",
    });
  }
  next();
});

app.use(express.json({ limit: "2mb" }));

// Ensure database is connected for all API requests (handles cold-starts in serverless)
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api") && mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch {
      // Handled in individual controllers
    }
  }
  next();
});

app.get("/api/health", (req, res) => {
  const readyState = mongoose.connection.readyState;
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  res.json({
    success: true,
    message: "WeatherCart API is running",
    database: {
      status: states[readyState] || "unknown",
      connected: readyState === 1,
      hasUriConfigured: Boolean(process.env.MONGODB_URI),
    },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/behavior", behaviorRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/cart", cartRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// Safe global error handler - never leaks database internals or stack traces
app.use((err, req, res, next) => {
  console.error("Unhandled API error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "An unexpected internal server error occurred",
  });
});

async function startServer() {
  await connectDB();

  if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
