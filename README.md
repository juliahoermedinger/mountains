# MountainScope

Point your iPhone's camera at a mountain range and see peak names, elevations, distances,
nearby huts, live weather, and a rough hiking-time estimate — like PeakFinder/PeakVisor,
but as an installable website (PWA) rather than a native App Store app.

Live at: https://juliahoermedinger.github.io/mountains/

## Why a PWA instead of a native app

No Mac was available to build/sign a native iOS app, and the goal was a **permanent**,
free install for a gift recipient. A PWA solves both: host the site anywhere with HTTPS,
the recipient taps "Add to Home Screen" in Safari once, and it behaves like a real
app — its own icon, full-screen, works offline — with no Apple Developer account, no App
Review, and no Xcode ever required, for either of us, now or for any future update.

## How it works

No ML image recognition, no ARKit-style geo-anchors. Instead: GPS + compass + gyroscope
(via the browser's Geolocation and DeviceOrientation APIs) tell the app exactly where you
are and which way you're pointing, matched against a bundled global database of
OpenStreetMap peaks and points of interest using plain trigonometry (bearing, distance,
elevation angle) to figure out what's in the camera's field of view right now. See
`web/js/geo-math.js` and `web/js/screen-projection.js` for the actual math, and
`web/js/sensors.js` for how device orientation is read.

Beyond the AR peak overlay:
- **Huts** show up in the camera view alongside peaks (blue labels vs. dark ones).
- **Nearest hut / water source / trailhead parking** to whichever peak you're viewing is
  shown in its detail sheet (`web/js/poi-data.js`).
- **Live weather** for a peak's summit is fetched on demand when you open its detail
  sheet (`web/js/weather.js`, via Open-Meteo) — this is the one thing in the app that
  needs a live connection; it just doesn't show if you're offline, everything else still
  works with no signal.
- **Estimated hiking time** (`web/js/hiking-estimate.js`) uses Naismith's rule (distance +
  elevation gain) — explicitly a rough estimate from straight-line distance, not a real
  trail time, since no reliable global trail-time dataset exists to draw from instead.

## Repo layout

- `web/` — the PWA itself (plain HTML/CSS/JS, no build step, no framework)
  - `index.html`, `css/style.css`, `js/*.js` — the app
  - `manifest.json`, `service-worker.js` — what makes it installable and work offline
  - `data/peaks.json`, `data/pois.json` — the bundled databases (from the pipeline below)
- `tools/` — Python data pipeline that builds those from OpenStreetMap (see
  `tools/README.md`; `tools/check_progress.py` shows a live progress bar while it runs)
- `.github/workflows/deploy-pages.yml` — deploys `web/` to GitHub Pages on every push

## Status

The site is deployed and reachable, but hasn't been tested on a real iPhone yet. The
geometry math, hiking-time formula, peak/POI lookup logic, and the weather API call have
all been independently verified by actually running them (in Node, and against the real
Open-Meteo API) — see commit history. Two things are flagged as most likely to need
adjustment after the first real on-device test:

1. **Compass heading/pitch** (`web/js/sensors.js`) — derived from iOS Safari's
   non-standard `webkitCompassHeading` and the standard `beta` tilt field. The pitch
   sign convention in particular is a best-effort derivation, not something I could
   verify without a real device — if the AR overlay appears upside-down or inverted on
   first test, that's the place to look.
2. **Camera field of view** (`web/js/sensors.js`, `ASSUMED_HORIZONTAL_FOV_DEGREES`) —
   browsers don't expose a device's actual calibrated FOV the way native camera APIs do,
   so this is a fixed approximation. Label placement may drift somewhat from true
   position; adjusting this constant is the fix if it looks systematically off.

See `tools/README.md` for a data pipeline gotcha worth knowing about (a regional Overpass
mirror silently returning empty-but-valid results for most of the world on one run).
