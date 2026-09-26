import { getWeatherByCoordinates } from "../services/weatherService.js";

export async function getCurrentWeather(req, res) {
  try {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required",
      });
    }

    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid coordinates",
      });
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
