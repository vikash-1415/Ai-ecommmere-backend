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
      throw new Error(
        "MongoDB is not connected. Set a valid MONGODB_URI in backend/.env."
      );
    }

    const adminEmail = "admin@weathercart.com";
    const existing = await User.findOne({ email: adminEmail });

    if (!existing && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)) {
      throw new Error(
        "Set ADMIN_PASSWORD to a value with at least 12 characters in backend/.env before seeding the admin user."
      );
    }

    const result = await Product.bulkWrite(
      catalogProducts.map((product) => ({
        updateOne: {
          filter: { name: product.name },
          update: { $setOnInsert: product },
          upsert: true,
        },
      }))
    );
    console.log(
      `Product catalog seeded: ${result.upsertedCount} inserted, ${catalogProducts.length - result.upsertedCount} already present`
    );

    if (!existing) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
      await User.create({
        name: "System Admin",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        isActive: true,
      });
      console.log(`Admin user created: ${adminEmail}`);
    } else {
      console.log(`Admin user already exists: ${adminEmail}`);
    }
  } catch (error) {
    console.error("Database seed failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (error) {
        console.error("Failed to disconnect from MongoDB:");
        console.error(error.message);
        process.exitCode = 1;
      }
    }
  }
}

seedDatabase();
