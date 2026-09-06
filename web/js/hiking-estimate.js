// Rough hiking-time estimate using Naismith's rule (a long-standing standard formula:
// ~1 hour per 5km walked plus ~1 hour per 600m climbed). This is a well-known
// approximation for planning, NOT a real trail time — there's no reliable global OSM
// dataset of actual trail durations to draw from instead (route/duration tagging is far
// too sparse to trust). Critically, this uses STRAIGHT-LINE distance to the peak, not
// the actual trail's length, so it will typically UNDER-estimate real hiking time on
// anything but a direct route. Always label this as an estimate in the UI — never
// present it as a measured trail time.
export function estimateHikingHours(distanceMeters, ascentMeters) {
  const distanceKm = distanceMeters / 1000;
  const ascent = Math.max(0, ascentMeters);
  return distanceKm / 5 + ascent / 600;
}

export function formatHikingTime(hours) {
  if (hours < 1) return `~${Math.round(hours * 60)} min`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}
