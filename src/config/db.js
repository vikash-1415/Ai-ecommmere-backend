import mongoose from "mongoose";

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 2500,
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:");
    console.error(error.message);
    console.log(
      "Notice: Ensure local MongoDB is running on port 27017 or provide a MongoDB Atlas URI in backend/.env"
    );
  }
}
