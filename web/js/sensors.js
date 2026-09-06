// Thin wrappers over the three browser sensor APIs the AR view depends on. Grouped here
// so app.js doesn't need to know about getUserMedia/geolocation/deviceorientation quirks
// directly.
//
// IMPORTANT iOS quirk: DeviceOrientationEvent.requestPermission() (needed for compass/
// pitch on iOS 13+) only works when called directly inside a user-gesture handler (a tap
// on a button). Calling it from a page-load handler silently fails. That's why
// requestAllPermissions() below must be invoked from an onclick handler in app.js, not
// from initialization code.

// Typical horizontal field of view for an iPhone's main/wide rear camera. The browser
// has no API to read the actual calibrated FOV (unlike native AVFoundation), so this is
// a fixed approximation — see the caveat in screen-projection.js.
export const ASSUMED_HORIZONTAL_FOV_DEGREES = 60;

export class CameraController {
  constructor(videoElement) {
    this.videoElement = videoElement;
    this.stream = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    this.videoElement.srcObject = this.stream;
    await this.videoElement.play();
  }

  stop() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }

  /** Vertical FOV derived from the assumed horizontal FOV and the actual video aspect ratio. */
  get verticalFovDegrees() {
    const w = this.videoElement.videoWidth || 16;
    const h = this.videoElement.videoHeight || 9;
    const hFovRad = (ASSUMED_HORIZONTAL_FOV_DEGREES * Math.PI) / 180;
    return (2 * Math.atan(Math.tan(hFovRad / 2) * (h / w)) * 180) / Math.PI;
  }
}

export class LocationController {
  constructor() {
    this.watchId = null;
    this.latest = null; // {lat, lon, altitude, timestamp}
    this._listeners = [];
  }

  onUpdate(callback) {
    this._listeners.push(callback);
  }

  start() {
    if (!("geolocation" in navigator)) return;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.latest = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          // altitude is frequently null on phones without a recent GPS altitude fix;
          // 0 is a reasonable fallback (flat-ish error versus the alternative of NaN
          // propagating through every downstream elevation-angle calculation).
          altitude: pos.coords.altitude ?? 0,
          timestamp: pos.timestamp,
        };
        for (const cb of this._listeners) cb(this.latest);
      },
      (err) => console.warn("Geolocation error:", err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

export class OrientationController {
  constructor() {
    this.latest = null; // {headingDegrees, pitchDegrees}
    this._listeners = [];
    this._handler = this._handleEvent.bind(this);
  }

  onUpdate(callback) {
    this._listeners.push(callback);
  }

  start() {
    window.addEventListener("deviceorientation", this._handler, true);
  }

  stop() {
    window.removeEventListener("deviceorientation", this._handler, true);
  }

  _handleEvent(event) {
    // webkitCompassHeading (iOS Safari only) is degrees clockwise from true north — the
    // most direct heading source available on iOS; there's no equivalently reliable
    // standard-API equivalent, so no fallback is attempted here for non-iOS browsers.
    let heading = event.webkitCompassHeading;
    if (heading === undefined || heading === null) {
      // Best-effort fallback for non-iOS browsers using the standard `alpha` field, which
      // is only reliably north-referenced via the `deviceorientationabsolute` event —
      // this is an approximation, not verified against a real Android device.
      heading = event.alpha != null ? 360 - event.alpha : null;
    }
    if (heading === null || heading === undefined) return;

    // beta: 0 = flat screen-up, 90 = vertical with camera pointing at the horizon.
    // See sensors.js module comment / README for the reasoning; this is the one part of
    // the app most likely to need a sign flip (try `90 - event.beta` instead) after the
    // first real on-device test.
    const pitch = (event.beta ?? 90) - 90;

    this.latest = { headingDegrees: heading, pitchDegrees: pitch };
    for (const cb of this._listeners) cb(this.latest);
  }
}

/** Must be called from inside a click/tap handler — see module comment above. */
export async function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    const result = await DeviceOrientationEvent.requestPermission();
    return result === "granted";
  }
  // Not iOS 13+, or not a browser that gates this behind a permission at all.
  return true;
}
