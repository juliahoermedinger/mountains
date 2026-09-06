import { distanceMeters, bearingDegrees, elevationAngleDegrees } from "./geo-math.js";

let poisPromise = null;

/** Fetches (once, cached in memory) the bundled POI list: [{id,name?,lat,lon,kind,ele?}]. */
function loadPois() {
  if (!poisPromise) {
    poisPromise = fetch("data/pois.json").then((res) => {
      if (!res.ok) throw new Error(`Failed to load POI data: ${res.status}`);
      return res.json();
    });
  }
  return poisPromise;
}

const KIND_LABELS = { hut: "Hut", spring: "Water source", parking: "Parking" };

export function displayName(poi) {
  return poi.name || KIND_LABELS[poi.kind] || "Point of interest";
}

/**
 * POIs within radiusMeters of (fromLat, fromLon), optionally filtered to a set of kinds,
 * sorted nearest-first. Works the same whether "from" is the user's live location (for
 * "what's near me") or a peak's coordinates (for "what's near that summit").
 */
export async function nearbyPois(fromLat, fromLon, fromAltMeters, radiusMeters, { kinds = null, limit = 40 } = {}) {
  const pois = await loadPois();
  const results = [];

  for (const p of pois) {
    if (kinds && !kinds.includes(p.kind)) continue;
    const distance = distanceMeters(fromLat, fromLon, p.lat, p.lon);
    if (distance > radiusMeters) continue;

    const bearing = bearingDegrees(fromLat, fromLon, p.lat, p.lon);
    // Most POIs (springs, parking, many huts) have no elevation tag; falling back to the
    // observer's own altitude gives a roughly-level elevation angle rather than an
    // undefined one, which is a reasonable default for things that aren't summits.
    const targetEle = p.ele != null ? p.ele : fromAltMeters;
    const elevationAngle = elevationAngleDegrees(fromLat, fromLon, fromAltMeters, p.lat, p.lon, targetEle);

    results.push({ poi: p, distanceMeters: distance, bearingDegrees: bearing, elevationAngleDegrees: elevationAngle });
  }

  results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return results.slice(0, limit);
}

/** The single nearest POI of a given kind to (fromLat, fromLon), or null if none within radius. */
export async function nearestOfKind(fromLat, fromLon, kind, radiusMeters = 20000) {
  const results = await nearbyPois(fromLat, fromLon, 0, radiusMeters, { kinds: [kind], limit: 1 });
  return results[0] ?? null;
}
