// Projects a peak's (bearing, elevation angle) — its true position in the world — onto a
// point on screen, given where the camera is currently pointed and its field of view.
// This is what makes labels track the camera as the phone moves.
//
// CAVEAT: the browser gives no way to read a device's actual camera field of view (no
// equivalent of AVFoundation's calibrated FOV). horizontalFovDegrees below is a fixed
// approximation for a typical iPhone main/wide rear camera, not measured per-device —
// label placement will drift a bit from true position, more so on devices with a
// meaningfully different FOV than assumed. See sensors.js for where this is set.

function normalizedAngleDelta(delta) {
  let d = delta % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Returns {x, y} in CSS pixels, or null if the peak is well outside the frame.
 * angles in degrees; screenWidth/screenHeight in CSS pixels.
 */
export function projectToScreen({
  bearingDegrees,
  elevationAngleDegrees,
  deviceHeadingDegrees,
  devicePitchDegrees,
  horizontalFovDegrees,
  verticalFovDegrees,
  screenWidth,
  screenHeight,
}) {
  const deltaBearing = normalizedAngleDelta(bearingDegrees - deviceHeadingDegrees);
  const deltaElevation = elevationAngleDegrees - devicePitchDegrees;

  // Generous margin beyond the visible frame so labels already exist just off to the
  // side and can be positioned reasonably as the camera pans toward them, rather than
  // popping in abruptly right at the frame edge.
  const hMargin = horizontalFovDegrees;
  const vMargin = verticalFovDegrees;
  if (
    Math.abs(deltaBearing) >= horizontalFovDegrees / 2 + hMargin ||
    Math.abs(deltaElevation) >= verticalFovDegrees / 2 + vMargin
  ) {
    return null;
  }

  const hFovRad = (horizontalFovDegrees * Math.PI) / 180;
  const vFovRad = (verticalFovDegrees * Math.PI) / 180;

  // Tangent-based (pinhole camera) projection: equal angular steps map to larger screen
  // distances near the edges of the frame than near the center.
  const xFraction = Math.tan((deltaBearing * Math.PI) / 180) / Math.tan(hFovRad / 2);
  const yFraction = Math.tan((deltaElevation * Math.PI) / 180) / Math.tan(vFovRad / 2);

  const x = screenWidth / 2 + xFraction * (screenWidth / 2);
  const y = screenHeight / 2 - yFraction * (screenHeight / 2);
  return { x, y };
}
