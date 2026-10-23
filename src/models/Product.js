import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      required: true,
      index: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    oldPrice: {
      type: Number,
      min: 0,
    },

    image: {
      type: String,
      required: true,
    },

    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    reviews: {
      type: Number,
      default: 0,
    },

    weatherTags: [
      {
        type: String,
      },
    ],

    suitableFor: [
      {
        type: String,
      },
    ],

    brand: {
      type: String,
      default: "NorthPeak",
      index: true,
      trim: true,
    },

    weather: {
      type: String,
      default: "Rain",
    },

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    isFeatured: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

productSchema.index({ name: 1 });
productSchema.index({ category: 1, price: 1 });
productSchema.index({ brand: 1, price: 1 });
productSchema.index({ weatherTags: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ createdAt: -1 });

export default mongoose.model(
  "Product",
  productSchema
);
