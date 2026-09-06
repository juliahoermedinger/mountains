// Live weather via Open-Meteo (https://open-meteo.com) — free, no API key, CORS-friendly
// for direct browser calls. Deliberately NOT bundled/cached offline like the peak data:
// weather is only ever "right now," so there's no meaningful offline version of it. If
// there's no signal, this just fails and callers should show that as "unavailable"
// rather than an error.

const WEATHER_CODE_DESCRIPTIONS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

/**
 * Current conditions at (lat, lon), or null if the request fails (no signal, API down,
 * etc.) — callers should treat null as "show nothing" rather than an error state.
 */
export async function currentWeather(lat, lon, elevationMeters) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: "temperature_2m,weather_code,wind_speed_10m",
    wind_speed_unit: "kmh",
  });
  if (elevationMeters != null) params.set("elevation", Math.round(elevationMeters));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const data = await res.json();
    const current = data.current;
    if (!current) return null;

    return {
      temperatureCelsius: current.temperature_2m,
      windSpeedKmh: current.wind_speed_10m,
      description: WEATHER_CODE_DESCRIPTIONS[current.weather_code] ?? "Unknown conditions",
    };
  } catch (err) {
    return null; // offline, timed out, or the API is unreachable — not fatal to the app
  }
}
