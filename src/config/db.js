import mongoose from "mongoose";

let isConnecting = false;

export async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not defined in environment variables!");
    return false;
  }

  if (isConnecting) {
    for (let i = 0; i < 20; i++) {
      if (mongoose.connection.readyState === 1) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  try {
    isConnecting = true;
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("MongoDB connected successfully");
    return true;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    return false;
  } finally {
    isConnecting = false;
  }
}
