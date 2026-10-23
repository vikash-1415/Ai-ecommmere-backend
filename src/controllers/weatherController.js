import { getWeatherByCoordinates } from "../services/weatherService.js";

export async function getCurrentWeather(req, res) {
  try {
    let latitude = Number(req.query.lat);
    let longitude = Number(req.query.lon);
    const city = req.query.city;

    // City-based coordinate resolution if lat/lon not supplied
    if ((!Number.isFinite(latitude) || !Number.isFinite(longitude)) && city) {
      const cityMap = {
        ahmedabad: { lat: 23.0225, lon: 72.5714 },
        mumbai: { lat: 19.076, lon: 72.8777 },
        delhi: { lat: 28.6139, lon: 77.209 },
        bengaluru: { lat: 12.9716, lon: 77.5946 },
        kolkata: { lat: 22.5726, lon: 88.3639 },
        chennai: { lat: 13.0827, lon: 80.2707 },
        shimla: { lat: 31.1048, lon: 77.1734 },
        london: { lat: 51.5074, lon: -0.1278 },
        newyork: { lat: 40.7128, lon: -74.006 },
      };
      const cleanCity = city.toLowerCase().replace(/\s+/g, "");
      const coords = cityMap[cleanCity] || cityMap.ahmedabad;
      latitude = coords.lat;
      longitude = coords.lon;
    } else if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      // Default to campus location (Ahmedabad)
      latitude = 23.0225;
      longitude = 72.5714;
    }

    const weather = await getWeatherByCoordinates(latitude, longitude);

    res.json({
      success: true,
      weather,
    });
  } catch (error) {
    console.error("Weather API error:", error.message);

    res.status(502).json({
      success: false,
      message: "Unable to fetch current weather",
    });
  }
}
