import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import User from "../models/User.js";
import { connectDB } from "../config/db.js";
import {
  createVerificationToken,
  hashVerificationToken,
  isEmailVerificationEnabled,
  sendVerificationEmail,
} from "../services/emailService.js";

const VERIFICATION_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_RESEND_INTERVAL_MS = 60 * 1000;

function createToken(user) {
  const secret = process.env.JWT_SECRET || "weathercart-super-secret-key-2026";
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
    },
    secret,
    { expiresIn: "7d" }
  );
}

function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: Boolean(user.emailVerified),
    emailVerificationRequired: isEmailVerificationEnabled(),
  };
}

async function issueVerificationEmail(user) {
  const { token, tokenHash } = createVerificationToken();
  user.emailVerificationTokenHash = tokenHash;
  user.emailVerificationExpiresAt = new Date(
    Date.now() + VERIFICATION_TOKEN_LIFETIME_MS
  );
  await user.save();
  await sendVerificationEmail(user, token);
  user.emailVerificationLastSentAt = new Date();
  await user.save();
}

function databaseUnavailable(res) {
  return res.status(503).json({
    success: false,
    message: "Account services are unavailable until the database connects.",
  });
}

async function ensureDbConnected(res) {
  if (mongoose.connection.readyState === 1) return true;
  await connectDB();
  if (mongoose.connection.readyState === 1) return true;
  databaseUnavailable(res);
  return false;
}

export async function register(req, res) {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters",
      });
    }

    if (!(await ensureDbConnected(res))) {
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        code: existingUser.emailVerified ? undefined : "EMAIL_NOT_VERIFIED",
        message: existingUser.emailVerified
          ? "Email is already registered"
          : "Email is registered but not verified. Request a new verification email.",
      });
    }

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      role: "customer",
      emailVerified: false,
    });

    if (isEmailVerificationEnabled()) {
      try {
        await issueVerificationEmail(user);
      } catch (error) {
        console.error("Verification email could not be sent:", error.message);
        // Account was created successfully — return 201 so frontend can redirect to verify-email
        return res.status(201).json({
          success: true,
          code: "VERIFICATION_EMAIL_FAILED",
          emailSendFailed: true,
          verificationRequired: true,
          email: user.email,
          message:
            "Account created! Verification email could not be sent automatically. Please request a new one from the verify page.",
          user: serializeUser(user),
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: isEmailVerificationEnabled()
        ? "Account created. Check your email to verify your account before signing in."
        : "Account created successfully.",
      verificationRequired: isEmailVerificationEnabled(),
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Register error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
}

export async function login(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (!(await ensureDbConnected(res))) {
      return;
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (
      isEmailVerificationEnabled() &&
      user.role !== "admin" &&
      !user.emailVerified
    ) {
      return res.status(403).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your email before signing in.",
      });
    }

    return res.json({
      success: true,
      message: "Login successful",
      token: createToken(user),
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
}

export async function verifyEmail(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const token = String(req.body.token || "");
    if (!email || !token) {
      return res.status(400).json({
        success: false,
        message: "Email and verification token are required",
      });
    }

    if (!(await ensureDbConnected(res))) {
      return;
    }

    const user = await User.findOne({
      email,
      emailVerificationTokenHash: hashVerificationToken(token),
      emailVerificationExpiresAt: { $gt: new Date() },
    }).select(
      "+emailVerificationTokenHash +emailVerificationExpiresAt"
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "This verification link is invalid or has expired.",
      });
    }

    user.emailVerified = true;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    user.emailVerificationLastSentAt = undefined;
    await user.save();

    return res.json({
      success: true,
      message: "Email verified. You can now sign in.",
    });
  } catch (error) {
    console.error("Email verification failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Email verification failed",
    });
  }
}

export async function resendVerificationEmail(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!isEmailVerificationEnabled()) {
      return res.status(503).json({
        success: false,
        message: "Email verification is not configured on this server.",
      });
    }

    if (!(await ensureDbConnected(res))) {
      return;
    }

    const user = await User.findOne({ email }).select(
      "+emailVerificationLastSentAt"
    );
    const message =
      "If the account needs verification, a new email will be sent shortly.";

    if (!user || user.emailVerified) {
      return res.json({ success: true, message });
    }

    if (
      user.emailVerificationLastSentAt &&
      Date.now() - user.emailVerificationLastSentAt.getTime() <
        VERIFICATION_RESEND_INTERVAL_MS
    ) {
      return res.json({ success: true, message });
    }

    try {
      await issueVerificationEmail(user);
    } catch (error) {
      console.error("Verification email resend failed:", error.message);
      return res.status(503).json({
        success: false,
        message: "Verification email could not be sent. Try again later.",
      });
    }

    return res.json({ success: true, message });
  } catch (error) {
    console.error("Verification email resend failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Could not request a verification email",
    });
  }
}

export async function getMe(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.user.userId)) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Current user lookup failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });
  }
}
