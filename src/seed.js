import dotenv from "dotenv";
import mongoose from "mongoose";

import { connectDB } from "./config/db.js";
import Product from "./models/Product.js";
import { products } from "./data/products.js";

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

    await Product.insertMany(products);

    console.log(
      `${products.length} products inserted successfully`
    );

    process.exit(0);
  } catch (error) {
    console.error("Database seed failed:");
    console.error(error.message);

    process.exit(1);
  }
}

seedDatabase();
