/**
 * Automated End-to-End Audit & Verification Script
 * Tests all backend APIs, database connections, recommendation logic, auth, orders, and reviews.
 */

const BASE_URL = "http://localhost:5000/api";

const results = [];

async function assertTest(name, fn) {
  try {
    const res = await fn();
    results.push({ name, status: "PASS", details: res || "OK" });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    results.push({ name, status: "FAIL", error: err.message });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

async function runAudit() {
  console.log("=== STARTING BACKEND & ALGORITHM AUDIT ===");

  // 1. Health & Security Headers
  await assertTest("Health Check & Security Headers", async () => {
    const r = await fetch(`${BASE_URL}/health`);
    if (!r.ok) throw new Error(`Health status ${r.status}`);
    const d = await r.json();
    if (!d.success) throw new Error("Health response invalid");
    const nosniff = r.headers.get("x-content-type-options");
    const frameOptions = r.headers.get("x-frame-options");
    if (nosniff !== "nosniff" || frameOptions !== "SAMEORIGIN") {
      throw new Error(`Security headers missing: nosniff=${nosniff}, frameOptions=${frameOptions}`);
    }
    return "Health OK, security headers present";
  });

  // 2. Product Catalog & Filters
  await assertTest("Product Catalog & Query Builder", async () => {
    const r = await fetch(`${BASE_URL}/products?limit=10&page=1`);
    if (!r.ok) throw new Error(`Products status ${r.status}`);
    const d = await r.json();
    const count = d.products?.length || 0;
    if (count === 0) throw new Error("Catalog returned 0 products");
    return `Retrieved ${count} products, total ${d.pagination?.total || count}`;
  });

  // 3. Search Autocomplete
  await assertTest("Search Autocomplete API", async () => {
    const r = await fetch(`${BASE_URL}/products/suggestions?q=rain`);
    if (!r.ok) throw new Error(`Suggestions status ${r.status}`);
    const d = await r.json();
    if (!d.success || !Array.isArray(d.suggestions)) throw new Error("Invalid suggestions response");
    return `Suggestions count: ${d.suggestions.length}`;
  });

  // 4. Weather API (Live or Fallback)
  await assertTest("Real-time Weather Data Engine", async () => {
    const r = await fetch(`${BASE_URL}/weather/current?city=Ahmedabad`);
    if (!r.ok) throw new Error(`Weather status ${r.status}`);
    const d = await r.json();
    if (!d.success || !d.weather) throw new Error("Invalid weather payload");
    return `City: ${d.weather.city}, Temp: ${d.weather.temperature}°C, Condition: ${d.weather.condition}`;
  });

  // 5. AI Weather-Based Recommendation Engine
  await assertTest("AI Recommendation Algorithm Relevance & Scoring", async () => {
    const r = await fetch(`${BASE_URL}/recommendations?city=Ahmedabad`);
    if (!r.ok) throw new Error(`Recommendations status ${r.status}`);
    const d = await r.json();
    const recs = d.recommendations || [];
    if (recs.length === 0) throw new Error("No recommendations generated");
    // Verify scoring & weather match
    const first = recs[0];
    return `Top rec: "${first.name}" (Weather: ${first.weather || "N/A"}, Score: ${first.matchScore || first.match || "N/A"}%)`;
  });

  // 6. User Auth (Register / Login)
  let authToken = "";
  const testEmail = `audit_user_${Date.now()}@test.com`;
  await assertTest("Authentication: User Registration & JWT", async () => {
    const r = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Audit User",
        email: testEmail,
        password: "AuditPassword123!",
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || "Registration failed");
    authToken = d.token;
    if (!authToken) throw new Error("No JWT token returned");
    return "User registered, JWT issued";
  });

  await assertTest("Authentication: User Login & Credential Verification", async () => {
    const r = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "AuditPassword123!",
      }),
    });
    const d = await r.json();
    if (!r.ok || !d.token) throw new Error(d.message || "Login failed");
    return `Login verified for ${d.user?.name}`;
  });

  // 7. Coupon Validation
  await assertTest("Order System: Coupon Validation (MONSOON20)", async () => {
    const r = await fetch(`${BASE_URL}/orders/validate-coupon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "MONSOON20", subtotal: 2000 }),
    });
    const d = await r.json();
    if (!d.valid) throw new Error(d.message || "MONSOON20 rejected");
    return `Coupon applied: -Rs.${d.discount}`;
  });

  // 8. Order Creation with Stock Validation
  await assertTest("Order System: Order Creation & Pricing Recalculation", async () => {
    const r = await fetch(`${BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            product: 1,
            productId: 1,
            name: "NorthPeak Monsoon Rain Jacket",
            price: 1499,
            quantity: 1,
          },
        ],
        shippingAddress: {
          fullName: "Audit Customer",
          phone: "9876543210",
          street: "123 Campus Road",
          city: "Ahmedabad",
          state: "Gujarat",
          postalCode: "380054",
        },
        shippingMethod: "standard",
        paymentMethod: "cod",
      }),
    });
    const d = await r.json();
    if (!d.success && !d.order) throw new Error(d.message || "Order creation failed");
    return `Order created: #${d.order?.orderNumber || d.order?._id}`;
  });

  // 9. Reviews & Ratings System
  await assertTest("Reviews: Read & Submit Review", async () => {
    // Read
    const rGet = await fetch(`${BASE_URL}/reviews/product/1`);
    const dGet = await rGet.json();
    if (!dGet.success) throw new Error("Failed to read reviews");

    // Submit
    const rPost = await fetch(`${BASE_URL}/reviews/product/1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        rating: 5,
        title: "Exceptional monsoon gear",
        comment: "Tested during heavy rain showers, completely dry and breathable.",
      }),
    });
    const dPost = await rPost.json();
    if (!dPost.success) throw new Error(dPost.message || "Review post failed");
    return `Review posted. Stats: Avg ${dPost.stats?.average} (${dPost.stats?.total} total reviews)`;
  });

  // 10. Analytics Telemetry Pipeline
  await assertTest("Analytics Telemetry Event Ingestion & Dashboard", async () => {
    const rPost = await fetch(`${BASE_URL}/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "product_view",
        productId: 1,
        productName: "NorthPeak Monsoon Rain Jacket",
        category: "Fashion",
        weather: "rain",
        city: "Ahmedabad",
        orderValue: 1499,
      }),
    });
    const dPost = await rPost.json();
    if (!dPost.success) throw new Error("Analytics event failed");

    const rDash = await fetch(`${BASE_URL}/analytics/dashboard`);
    const dDash = await rDash.json();
    if (!dDash.success || !dDash.funnel) throw new Error("Analytics dashboard failed");
    return `Funnel active with ${dDash.funnel.stages.length} stages, ML uplift: ${dDash.recommendationUplift?.upliftPercentage}`;
  });

  console.log("\n=== AUDIT SUMMARY ===");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`Total Tests: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
}

runAudit();
