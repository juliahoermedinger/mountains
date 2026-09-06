const STORAGE_KEY = "mountainscope.unit";

export function getUnitPreference() {
  return localStorage.getItem(STORAGE_KEY) === "imperial" ? "imperial" : "metric";
}

export function setUnitPreference(unit) {
  localStorage.setItem(STORAGE_KEY, unit);
}

export function formatElevation(meters, unit) {
  if (unit === "imperial") {
    return `${Math.round(meters * 3.28084)} ft`;
  }
  return `${Math.round(meters)} m`;
}

export function formatDistance(meters, unit) {
  if (unit === "imperial") {
    const feet = meters * 3.28084;
    if (feet >= 5280) return `${(feet / 5280).toFixed(1)} mi`;
    return `${Math.round(feet)} ft`;
  }
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}
