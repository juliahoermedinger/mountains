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
- Tapping a peak shows a deliberately minimal detail sheet: **elevation, distance,
  estimated hiking time, live weather**, and whether a **hut / water source / trailhead
  parking** exists nearby (as a yes/no, not a distance — the exact distance to an amenity
  near the peak was more confusing than useful). No coordinates, bearing, or prominence
  clutter.
- **Live weather** for a peak's summit is fetched on demand when you open its detail
  sheet (`web/js/weather.js`, via Open-Meteo) — this is the one thing in the app that
  needs a live connection; it just doesn't show if you're offline, everything else still
  works with no signal.
- **Estimated hiking time** (`web/js/hiking-estimate.js`) uses Naismith's rule (distance +
  elevation gain) — explicitly a rough estimate from straight-line distance, not a real
  trail time, since no reliable global trail-time dataset exists to draw from instead.
- **German localization** (`web/js/i18n.js`) — auto-detected from the browser, with a
  manual toggle in Settings. Covers UI text, weather descriptions, and compass
  abbreviations (German uses O for Ost/East, not E).

## Repo layout

- `web/` — the PWA itself (plain HTML/CSS/JS, no build step, no framework)
  - `index.html`, `css/style.css`, `js/*.js` — the app
  - `manifest.json`, `service-worker.js` — what makes it installable and work offline
  - `data/peaks.json`, `data/pois.json` — the bundled databases (from the pipeline below)
- `tools/` — Python data pipeline that builds those from OpenStreetMap (see
  `tools/README.md`; `tools/check_progress.py` shows a live progress bar while it runs)
- `.github/workflows/deploy-pages.yml` — deploys `web/` to GitHub Pages on every push

## Status

Deployed, installed, and tested on a real iPhone — the camera/AR overlay, permission
flow, and detail sheet all work in practice. The current known gap is **data coverage**,
not the app itself: the peak/POI database currently covers western and central Austria
only (fetched under a tight time constraint), with the Oberösterreich/eastern strip
(where e.g. Hoher Nock and Erlakogl are) still being backfilled as the shared public
Overpass API recovers from an extended outage — see `tools/README.md` for the full story
on that pipeline, including a real bug it caught (a regional Overpass mirror silently
returning empty-but-valid results for most of the world on one run).

Two things remain flagged as worth double-checking if AR label placement ever looks off:

1. **Compass heading/pitch** (`web/js/sensors.js`) — derived from iOS Safari's
   non-standard `webkitCompassHeading` and the standard `beta` tilt field.
2. **Camera field of view** (`web/js/sensors.js`, `ASSUMED_HORIZONTAL_FOV_DEGREES`) —
   browsers don't expose a device's actual calibrated FOV the way native camera APIs do,
   so this is a fixed approximation.
