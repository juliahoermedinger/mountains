// Live weather via Open-Meteo (https://open-meteo.com) — free, no API key, CORS-friendly
// for direct browser calls. Deliberately NOT bundled/cached offline like the peak data:
// weather is only ever "right now," so there's no meaningful offline version of it. If
// there's no signal, this just fails and callers should show that as "unavailable"
// rather than an error.
//
// Returns the raw WMO weather code rather than a description string — the description
// text lives in i18n.js (weatherDescription()) alongside all other display strings, so
// this module doesn't need to know about languages at all.

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
      weatherCode: current.weather_code,
    };
  } catch (err) {
    return null; // offline, timed out, or the API is unreachable — not fatal to the app
  }
}
