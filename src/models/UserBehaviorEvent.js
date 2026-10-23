import mongoose from "mongoose";

const behaviorEventSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      enum: [
        "product_view",
        "wishlist_add",
        "cart_add",
        "purchase",
        "recommendation_impression",
        "recommendation_click",
      ],
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    category: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    algorithmVersion: { type: String, default: "" },
  },
  { timestamps: true }
);

behaviorEventSchema.index({ eventType: 1, createdAt: -1 });

export default mongoose.model("UserBehaviorEvent", behaviorEventSchema);
