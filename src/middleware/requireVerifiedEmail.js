import User from "../models/User.js";
import { isEmailVerificationEnabled } from "../services/emailService.js";

export async function requireVerifiedEmail(req, res, next) {
  if (!isEmailVerificationEnabled()) {
    return next();
  }

  try {
    const user = await User.findById(req.user.userId).select(
      "emailVerified role"
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role !== "admin" && !user.emailVerified) {
      return res.status(403).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your email before placing an order.",
      });
    }

    return next();
  } catch (error) {
    console.error("Email verification check failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to verify account status",
    });
  }
}
