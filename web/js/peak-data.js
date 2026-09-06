import { distanceMeters, bearingDegrees, elevationAngleDegrees } from "./geo-math.js";

let peaksPromise = null;

/** Fetches (once, cached in memory) the bundled peak list: [{id,name,lat,lon,ele,prom?}]. */
function loadPeaks() {
  if (!peaksPromise) {
    peaksPromise = fetch("data/peaks.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load peak data: ${res.status}`);
        return res.json();
      });
  }
  return peaksPromise;
}

/**
 * Peaks within radiusMeters of the observer, sorted nearest-first, each annotated with
 * distanceMeters/bearingDegrees/elevationAngleDegrees relative to the observer. `limit`
 * caps how many are returned (dense ranges like the Alps can have hundreds within a wide
 * radius — capping keeps both compute and on-screen clutter bounded).
 */
export async function sightedPeaks(observerLat, observerLon, observerAltMeters, radiusMeters, limit = 40) {
  const peaks = await loadPeaks();
  const sighted = [];

  for (const p of peaks) {
    const distance = distanceMeters(observerLat, observerLon, p.lat, p.lon);
    if (distance > radiusMeters) continue;

    const bearing = bearingDegrees(observerLat, observerLon, p.lat, p.lon);
    const elevationAngle = elevationAngleDegrees(observerLat, observerLon, observerAltMeters, p.lat, p.lon, p.ele);

    sighted.push({
      peak: p,
      distanceMeters: distance,
      bearingDegrees: bearing,
      elevationAngleDegrees: elevationAngle,
    });
  }

  sighted.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return sighted.slice(0, limit);
}

/** Case-insensitive substring search by name, for the browsable peak list. */
export async function searchPeaks(query, limit = 200) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const peaks = await loadPeaks();
  const results = [];
  for (const p of peaks) {
    if (p.name.toLowerCase().includes(trimmed)) {
      results.push(p);
      if (results.length >= limit) break;
    }
  }
  return results;
}
