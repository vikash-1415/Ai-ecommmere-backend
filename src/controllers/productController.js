import mongoose from "mongoose";
import Product from "../models/Product.js";
import { catalogProducts } from "../data/mockCatalog.js";

// Utility to escape regex special characters
export function escapeRegex(text = "") {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

// In-memory fallback product catalog (mutable for updates/deletes in dev mode)
let fallbackProducts = [...catalogProducts];

/* Calculate search relevance score for a product */
function calculateRelevance(product, query) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const name = (product.name || "").toLowerCase();
  const brand = (product.brand || "").toLowerCase();
  const category = (product.category || "").toLowerCase();
  const desc = (product.description || "").toLowerCase();
  const weatherTags = (product.weatherTags || []).map((t) => t.toLowerCase());

  let score = 0;
  if (name === q) score += 100;
  else if (name.startsWith(q)) score += 80;
  else if (name.includes(q)) score += 60;

  if (brand.includes(q)) score += 50;
  if (category.includes(q)) score += 40;
  if (weatherTags.some((t) => t.includes(q))) score += 35;
  if (desc.includes(q)) score += 20;

  if (product.rating) score += product.rating * 2;
  return score;
}

export async function getProducts(req, res) {
  try {
    const {
      q,
      search,
      category,
      brand,
      weather,
      minPrice,
      maxPrice,
      rating: minRating,
      inStock,
      isFeatured,
      sort = "relevance",
      page = 1,
      limit = 12,
    } = req.query;

    const searchQuery = (q || search || "").trim().slice(0, 100);
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const isDbConnected = mongoose.connection.readyState === 1;

    if (isDbConnected) {
      // Ensure seed data exists if DB is empty
      const count = await Product.countDocuments();
      if (count === 0) {
        await Product.insertMany(catalogProducts);
      }

      const filter = { isActive: true };

      if (category && category !== "All") {
        filter.category = category;
      }

      if (brand && brand !== "All") {
        filter.brand = brand;
      }

      if (weather && weather !== "All") {
        const escapedWeather = escapeRegex(weather);
        filter.$or = [
          { weather: { $regex: new RegExp(`^${escapedWeather}$`, "i") } },
          { weatherTags: { $in: [weather.toLowerCase(), weather] } },
        ];
      }

      if (searchQuery) {
        const regex = new RegExp(escapeRegex(searchQuery), "i");
        filter.$or = [
          { name: regex },
          { brand: regex },
          { category: regex },
          { description: regex },
          { weatherTags: { $in: [regex] } },
        ];
      }

      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = Number(minPrice);
        if (maxPrice) filter.price.$lte = Number(maxPrice);
      }

      if (minRating && minRating !== "All") {
        filter.rating = { $gte: Number(minRating) };
      }

      if (inStock === "true" || inStock === true) {
        filter.stock = { $gt: 0 };
      }

      if (isFeatured === "true" || isFeatured === true) {
        filter.isFeatured = true;
      }

      const sortMap = {
        "price-low": { price: 1 },
        "price-high": { price: -1 },
        rating: { rating: -1 },
        newest: { createdAt: -1 },
        popular: { reviews: -1 },
        discount: { oldPrice: -1 },
        relevance: { rating: -1 },
      };

      const selectedSort = sortMap[sort] || sortMap.relevance;
      const total = await Product.countDocuments(filter);
      const totalPages = Math.ceil(total / limitNum) || 1;
      const skip = (pageNum - 1) * limitNum;

      const products = await Product.find(filter)
        .sort(selectedSort)
        .skip(skip)
        .limit(limitNum)
        .lean();

      return res.json({
        success: true,
        count: products.length,
        total,
        page: pageNum,
        totalPages,
        limit: limitNum,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
        sort,
        filters: {
          q: searchQuery,
          category: category || "All",
          brand: brand || "All",
          weather: weather || "All",
          minPrice: minPrice || "",
          maxPrice: maxPrice || "",
          rating: minRating || "All",
          inStock: inStock === "true",
        },
        products,
      });
    }

    // In-memory fallback
    let results = fallbackProducts.filter((p) => p.isActive !== false);

    if (category && category !== "All") {
      results = results.filter((p) => p.category === category);
    }

    if (brand && brand !== "All") {
      results = results.filter(
        (p) => (p.brand || "").toLowerCase() === brand.toLowerCase()
      );
    }

    if (weather && weather !== "All") {
      const wLower = weather.toLowerCase();
      results = results.filter(
        (p) =>
          (p.weather || "").toLowerCase() === wLower ||
          (p.weatherTags || []).some((t) => t.toLowerCase() === wLower)
      );
    }

    if (searchQuery) {
      const qLower = searchQuery.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(qLower) ||
          (p.brand && p.brand.toLowerCase().includes(qLower)) ||
          p.category.toLowerCase().includes(qLower) ||
          (p.description && p.description.toLowerCase().includes(qLower)) ||
          (p.weatherTags &&
            p.weatherTags.some((t) => t.toLowerCase().includes(qLower)))
      );
    }

    if (minPrice) {
      results = results.filter((p) => p.price >= Number(minPrice));
    }
    if (maxPrice) {
      results = results.filter((p) => p.price <= Number(maxPrice));
    }

    if (minRating && minRating !== "All") {
      results = results.filter((p) => p.rating >= Number(minRating));
    }

    if (inStock === "true" || inStock === true) {
      results = results.filter((p) => (p.stock || 0) > 0);
    }

    if (isFeatured === "true" || isFeatured === true) {
      results = results.filter((p) => p.isFeatured === true);
    }

    // Sort in-memory
    if (sort === "price-low") {
      results.sort((a, b) => a.price - b.price);
    } else if (sort === "price-high") {
      results.sort((a, b) => b.price - a.price);
    } else if (sort === "rating") {
      results.sort((a, b) => b.rating - a.rating);
    } else if (sort === "popular") {
      results.sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
    } else if (sort === "discount") {
      results.sort((a, b) => {
        const discA = ((a.oldPrice - a.price) / (a.oldPrice || 1)) * 100;
        const discB = ((b.oldPrice - b.price) / (b.oldPrice || 1)) * 100;
        return discB - discA;
      });
    } else {
      // Relevance scoring
      if (searchQuery) {
        results.sort(
          (a, b) =>
            calculateRelevance(b, searchQuery) -
            calculateRelevance(a, searchQuery)
        );
      } else {
        results.sort((a, b) => (b.match || 90) - (a.match || 90));
      }
    }

    const total = results.length;
    const totalPages = Math.ceil(total / limitNum) || 1;
    const skip = (pageNum - 1) * limitNum;
    const paginatedProducts = results.slice(skip, skip + limitNum);

    res.json({
      success: true,
      count: paginatedProducts.length,
      total,
      page: pageNum,
      totalPages,
      limit: limitNum,
      hasNext: pageNum < totalPages,
      hasPrevious: pageNum > 1,
      sort,
      filters: {
        q: searchQuery,
        category: category || "All",
        brand: brand || "All",
        weather: weather || "All",
        minPrice: minPrice || "",
        maxPrice: maxPrice || "",
        rating: minRating || "All",
        inStock: inStock === "true",
      },
      products: paginatedProducts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      error: error.message,
    });
  }
}

/* STEP 17.4: Autocomplete Suggestions API */
export async function getSuggestions(req, res) {
  try {
    const q = String(req.query.q || "")
      .trim()
      .slice(0, 80);

    if (!q) {
      return res.json({
        success: true,
        suggestions: [],
      });
    }

    const qLower = q.toLowerCase();
    const suggestions = [];
    const isDbConnected = mongoose.connection.readyState === 1;

    let productPool = fallbackProducts;
    if (isDbConnected) {
      productPool = await Product.find({ isActive: true })
        .select(
          "name brand category weather weatherTags price image rating _id id"
        )
        .lean();
    }

    // 1. Direct product matches (max 4)
    const matchingProducts = productPool
      .filter((p) => {
        const name = (p.name || "").toLowerCase();
        const brand = (p.brand || "").toLowerCase();
        const desc = (p.description || "").toLowerCase();
        return (
          name.includes(qLower) || brand.includes(qLower) || desc.includes(qLower)
        );
      })
      .slice(0, 4);

    for (const p of matchingProducts) {
      suggestions.push({
        type: "product",
        id: p._id || p.id,
        label: p.name,
        brand: p.brand || "WeatherCart",
        category: p.category,
        price: p.price,
        image: p.image,
      });
    }

    // 2. Categories match
    const distinctCategories = [
      ...new Set(productPool.map((p) => p.category).filter(Boolean)),
    ];
    for (const cat of distinctCategories) {
      if (cat.toLowerCase().includes(qLower)) {
        suggestions.push({
          type: "category",
          label: cat,
          slug: cat.toLowerCase(),
        });
      }
    }

    // 3. Brands match
    const distinctBrands = [
      ...new Set(productPool.map((p) => p.brand).filter(Boolean)),
    ];
    for (const b of distinctBrands) {
      if (b.toLowerCase().includes(qLower)) {
        suggestions.push({
          type: "brand",
          label: b,
          slug: b.toLowerCase(),
        });
      }
    }

    // 4. Weather tag match
    const distinctWeather = ["Rain", "Sunny", "Cold", "Cloudy", "Humid"];
    for (const w of distinctWeather) {
      if (w.toLowerCase().includes(qLower)) {
        suggestions.push({
          type: "weather",
          label: `${w} Wear`,
          weather: w,
        });
      }
    }

    res.json({
      success: true,
      query: q,
      suggestions: suggestions.slice(0, 10),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to generate suggestions",
      error: error.message,
    });
  }
}

/* STEP 18.18: Dynamic Filter Options API */
export async function getFilterOptions(req, res) {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    let productPool = fallbackProducts;

    if (isDbConnected) {
      productPool = await Product.find({ isActive: true })
        .select("category brand weatherTags price rating")
        .lean();
    }

    const categories = [
      "All",
      ...new Set(productPool.map((p) => p.category).filter(Boolean)),
    ];
    const brands = [
      "All",
      ...new Set(productPool.map((p) => p.brand).filter(Boolean)),
    ];
    const weatherList = ["All", "Rain", "Sunny", "Cold", "Cloudy", "Humid"];

    const prices = productPool.map((p) => p.price).filter(Number.isFinite);
    const minPrice = prices.length ? Math.min(...prices) : 300;
    const maxPrice = prices.length ? Math.max(...prices) : 5000;

    res.json({
      success: true,
      categories,
      brands,
      weather: weatherList,
      price: {
        min: minPrice,
        max: maxPrice,
      },
      ratings: [4.5, 4, 3.5, 3],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch filter options",
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

    const index = fallbackProducts.findIndex(
      (p) =>
        String(p._id) === String(req.params.id) ||
        String(p.id) === String(req.params.id)
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

    const target = fallbackProducts.find(
      (p) =>
        String(p._id) === String(req.params.id) ||
        String(p.id) === String(req.params.id)
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
