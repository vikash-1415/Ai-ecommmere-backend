import mongoose from "mongoose";
import Product from "../models/Product.js";

const fallbackProducts = [
  {
    _id: "1",
    id: 1,
    name: "Premium Rain Jacket",
    category: "Fashion",
    price: 1499,
    oldPrice: 1999,
    rating: 4.8,
    reviews: 124,
    weather: "Rain",
    weatherTags: ["Rain", "Cloudy"],
    match: 96,
    image:
      "https://images.unsplash.com/photo-1544923246-77307dd654cb?auto=format&fit=crop&w=800&q=80",
    description:
      "Ultra-breathable waterproof membrane jacket designed for monsoon climates.",
    isActive: true,
  },
  {
    _id: "2",
    id: 2,
    name: "Classic UV Sunglasses",
    category: "Accessories",
    price: 899,
    oldPrice: 1299,
    rating: 4.7,
    reviews: 89,
    weather: "Sunny",
    weatherTags: ["Sunny", "Clear"],
    match: 93,
    image:
      "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80",
    description:
      "UV400 anti-glare polarized lenses with durable lightweight frames.",
    isActive: true,
  },
  {
    _id: "3",
    id: 3,
    name: "Waterproof Travel Shoes",
    category: "Footwear",
    price: 1899,
    oldPrice: 2499,
    rating: 4.6,
    reviews: 76,
    weather: "Rain",
    weatherTags: ["Rain"],
    match: 91,
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80",
    description:
      "Lightweight walking shoes with anti-slip rubber grip for wet roads.",
    isActive: true,
  },
  {
    _id: "4",
    id: 4,
    name: "Premium Cotton T-Shirt",
    category: "Fashion",
    price: 699,
    oldPrice: 999,
    rating: 4.5,
    reviews: 210,
    weather: "Sunny",
    weatherTags: ["Sunny"],
    match: 88,
    image:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80",
    description: "100% natural organic cotton with active airflow weave.",
    isActive: true,
  },
];

export async function getProducts(req, res) {
  try {
    const {
      category,
      search,
      weather,
      minPrice,
      maxPrice,
      sort,
      rating: minRating,
      page = 1,
      limit = 50,
    } = req.query;

    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      const count = await Product.countDocuments();
      if (count === 0) {
        await Product.insertMany(fallbackProducts);
      }

      const filter = {
        isActive: true,
      };

      if (category && category !== "All") {
        filter.category = category;
      }

      if (weather && weather !== "All") {
        filter.$or = [
          { weather: weather },
          { weatherTags: { $in: [weather] } },
        ];
      }

      if (search) {
        filter.$or = [
          {
            name: {
              $regex: search,
              $options: "i",
            },
          },
          {
            description: {
              $regex: search,
              $options: "i",
            },
          },
        ];
      }

      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = Number(minPrice);
        if (maxPrice) filter.price.$lte = Number(maxPrice);
      }

      if (minRating) {
        filter.rating = { $gte: Number(minRating) };
      }

      let query = Product.find(filter);

      const sortMap = {
        "price-low":  { price: 1 },
        "price-high": { price: -1 },
        "rating":     { rating: -1 },
        "newest":     { createdAt: -1 },
        "popular":    { reviews: -1 },
      };
      if (sortMap[sort]) query = query.sort(sortMap[sort]);

      const pageNum  = Math.max(1, Number(page));
      const limitNum = Math.min(100, Math.max(1, Number(limit)));
      const skip     = (pageNum - 1) * limitNum;
      const total    = await Product.countDocuments(filter);

      const products = await query.skip(skip).limit(limitNum);

      return res.json({
        success: true,
        count: products.length,
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        products,
      });
    }

    // Fallback in-memory filter if MongoDB is offline
    let results = fallbackProducts.filter((p) => p.isActive !== false);

    if (category && category !== "All") {
      results = results.filter((p) => p.category === category);
    }

    if (weather && weather !== "All") {
      results = results.filter(
        (p) => p.weather === weather || p.weatherTags?.includes(weather)
      );
    }

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    if (minPrice) {
      results = results.filter((p) => p.price >= Number(minPrice));
    }
    if (maxPrice) {
      results = results.filter((p) => p.price <= Number(maxPrice));
    }

    if (sort === "price-low") {
      results.sort((a, b) => a.price - b.price);
    } else if (sort === "price-high") {
      results.sort((a, b) => b.price - a.price);
    } else if (sort === "rating") {
      results.sort((a, b) => b.rating - a.rating);
    }

    res.json({
      success: true,
      count: results.length,
      products: results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      error: error.message,
    });
  }
}

export async function getProductById(req, res) {
  try {
    const { id } = req.params;
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      let product = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        product = await Product.findOne({
          _id: id,
          isActive: true,
        });
      }

      if (!product) {
        product = await Product.findOne({
          $or: [{ id: Number(id) }, { _id: id }],
          isActive: true,
        });
      }

      if (product) {
        return res.json({
          success: true,
          product,
        });
      }
    }

    // Fallback match
    const fallback = fallbackProducts.find(
      (p) => String(p.id) === String(id) || String(p._id) === String(id)
    );

    if (fallback) {
      return res.json({
        success: true,
        product: fallback,
      });
    }

    res.status(404).json({
      success: false,
      message: "Product not found",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch product",
      error: error.message,
    });
  }
}

export async function createProduct(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (isDbConnected) {
      const product = await Product.create(req.body);
      return res.status(201).json({
        success: true,
        message: "Product created successfully",
        product,
      });
    }

    // Fallback in-memory support
    const newProduct = {
      _id: "p_" + Date.now(),
      id: fallbackProducts.length + 1,
      ...req.body,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      createdAt: new Date().toISOString(),
    };
    fallbackProducts.unshift(newProduct);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateProduct(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (isDbConnected && mongoose.Types.ObjectId.isValid(req.params.id)) {
      const product = await Product.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      return res.json({
        success: true,
        message: "Product updated successfully",
        product,
      });
    }

    // Fallback / alternate ID update
    const index = fallbackProducts.findIndex(
      (p) => String(p._id) === String(req.params.id) || String(p.id) === String(req.params.id)
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    fallbackProducts[index] = {
      ...fallbackProducts[index],
      ...req.body,
    };

    res.json({
      success: true,
      message: "Product updated successfully",
      product: fallbackProducts[index],
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteProduct(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    if (isDbConnected && mongoose.Types.ObjectId.isValid(req.params.id)) {
      const product = await Product.findByIdAndUpdate(
        req.params.id,
        {
          isActive: false,
        },
        {
          new: true,
        }
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      return res.json({
        success: true,
        message: "Product disabled successfully",
      });
    }

    // Fallback soft delete
    const target = fallbackProducts.find(
      (p) => String(p._id) === String(req.params.id) || String(p.id) === String(req.params.id)
    );

    if (!target) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    target.isActive = false;

    res.json({
      success: true,
      message: "Product disabled successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete product",
      error: error.message,
    });
  }
}

