import dotenv from "dotenv";
import mongoose from "mongoose";

import { connectDB } from "./config/db.js";
import Product from "./models/Product.js";
import User from "./models/User.js";
import bcrypt from "bcryptjs";
import { catalogProducts } from "./data/mockCatalog.js";

dotenv.config();

async function seedDatabase() {
  try {
    await connectDB();

    if (mongoose.connection.readyState !== 1) {
      console.error(
        "Database seed skipped: MongoDB is not connected. Please ensure MongoDB is running or provide a valid MONGODB_URI in backend/.env"
      );
      process.exit(1);
    }

    await Product.deleteMany({});
    await Product.insertMany(catalogProducts);
    console.log(`${catalogProducts.length} products inserted successfully`);

    // Seed admin user
    const adminEmail = "admin@weathercart.com";
    const existing = await User.findOne({ email: adminEmail });
    if (!existing) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await User.create({
        name: "System Admin",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        isActive: true,
      });
      console.log(`Admin user created: ${adminEmail} (password: admin123)`);
    }

    process.exit(0);
  } catch (error) {
    console.error("Database seed failed:");
    console.error(error.message);

    process.exit(1);
  }
}

seedDatabase();
