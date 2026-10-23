import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import User from "../models/User.js";

// In-memory fallback users for offline local development
const mockUsers = [
  {
    _id: "admin_101",
    name: "System Admin",
    email: "admin@weathercart.com",
    password: "", 
    role: "admin",
    isActive: true,
  },
  {
    _id: "admin_102",
    name: "Admin User",
    email: "admin@example.com",
    password: "", 
    role: "admin",
    isActive: true,
  },
];

// Initialize default admin password
(async () => {
  try {
    const hashed = await bcrypt.hash("admin123", 10);
    mockUsers[0].password = hashed;
    mockUsers[1].password = hashed;
  } catch (e) {}
})();

function createToken(user) {
  const secret = process.env.JWT_SECRET || "weathercart-super-secret-key-2026";
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
    },
    secret,
    {
      expiresIn: "7d",
    }
  );
}

export async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 6 characters",
      });
    }

    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      const existingUser = await User.findOne({
        email: email.toLowerCase(),
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Email is already registered",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await User.create({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: "customer",
      });

      const token = createToken(user);

      return res.status(201).json({
        success: true,
        message: "Account created successfully",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    // Fallback in-memory
    const existing = mockUsers.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      _id: "user_" + Date.now(),
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: "customer",
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    mockUsers.push(newUser);

    const token = createToken(newUser);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      const user = await User.findOne({
        email: email.toLowerCase(),
      }).select("+password");

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

      const token = createToken(user);

      return res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    // Fallback in-memory
    const user = mockUsers.find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );

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

    const token = createToken(user);

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
}

export async function getMe(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected && mongoose.Types.ObjectId.isValid(req.user.userId)) {
      const user = await User.findById(req.user.userId);

      if (!user || !user.isActive) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.json({
        success: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    // Fallback in-memory
    const user = mockUsers.find((u) => String(u._id) === String(req.user.userId));

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch user",
    });
  }
}
