// Pure geometry: bearing, distance, and apparent elevation angle between two points on
// Earth. Direct port of the same math from the (now-removed) native prototype — see git
// history if you want the Swift version for reference. No DOM dependencies, so this is
// easy to reason about and hand-verify against known reference points independently of
// the rest of the app.

const EARTH_RADIUS_METERS = 6371000.0;

// Standard atmospheric refraction coefficient: light bends slightly toward the Earth's
// surface, making distant peaks appear ~13% higher than pure geometry (curvature alone)
// would suggest. Same constant used by terrestrial surveying and other peak-finder apps.
const REFRACTION_COEFFICIENT = 0.13;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

export function distanceMeters(aLat, aLon, bLat, bLon) {
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
}

/** Initial great-circle bearing from (aLat,aLon) to (bLat,bLon), degrees true north, 0..360. */
export function bearingDegrees(aLat, aLon, bLat, bLon) {
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const dLon = toRadians(bLon - aLon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = toDegrees(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/**
 * Apparent angle above (positive) or below (negative) the horizontal, accounting for
 * height difference, Earth's curvature over the intervening distance, and atmospheric
 * refraction.
 */
export function elevationAngleDegrees(observerLat, observerLon, observerAltMeters, targetLat, targetLon, targetEleMeters) {
  const d = distanceMeters(observerLat, observerLon, targetLat, targetLon);
  if (d <= 1) return 0;

  const curvatureDrop = (d * d) / (2 * EARTH_RADIUS_METERS) * (1 - REFRACTION_COEFFICIENT);
  const apparentHeightDiff = targetEleMeters - observerAltMeters - curvatureDrop;
  return toDegrees(Math.atan2(apparentHeightDiff, d));
}
