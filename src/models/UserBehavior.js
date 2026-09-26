import mongoose from "mongoose";

const behaviorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    viewedProducts: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        count: {
          type: Number,
          default: 1,
        },
        lastViewedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    wishlistProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],

    purchasedProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],

    preferredCategories: [
      {
        category: String,
        score: {
          type: Number,
          default: 0,
        },
      },
    ],

    weatherPreferences: [
      {
        weather: String,
        score: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("UserBehavior", behaviorSchema);
