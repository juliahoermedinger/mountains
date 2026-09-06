import { CameraController, LocationController, OrientationController, requestOrientationPermission, ASSUMED_HORIZONTAL_FOV_DEGREES } from "./sensors.js";
import { projectToScreen } from "./screen-projection.js";
import { sightedPeaks, searchPeaks } from "./peak-data.js";
import { nearbyPois, nearestOfKind, displayName as poiDisplayName } from "./poi-data.js";
import { getUnitPreference, setUnitPreference, formatElevation, formatDistance, compassAbbreviation } from "./units.js";
import { distanceMeters, bearingDegrees } from "./geo-math.js";
import { currentWeather } from "./weather.js";
import { estimateHikingHours, formatHikingTime } from "./hiking-estimate.js";

// --- state -------------------------------------------------------------

let unit = getUnitPreference();
let radiusKm = 50;
let currentSighted = []; // peaks, recomputed on location/radius change
let currentHuts = []; // huts, recomputed alongside currentSighted
let latestOrientation = null; // recomputed continuously, read by the render loop
const labelElements = new Map(); // "peak-<id>" / "hut-<id>" -> DOM element, reused across frames

const camera = new CameraController(document.getElementById("camera-video"));
const location = new LocationController();
const orientation = new OrientationController();

// --- tab switching -------------------------------------------------------------

const views = { scan: "view-scan", peaks: "view-peaks", settings: "view-settings" };

function switchView(name) {
  for (const [key, id] of Object.entries(views)) {
    document.getElementById(id).classList.toggle("active", key === name);
  }
  for (const btn of document.querySelectorAll(".tab-button")) {
    btn.classList.toggle("active", btn.dataset.view === name);
  }
  if (name === "peaks") renderPeakList();
}

for (const btn of document.querySelectorAll(".tab-button")) {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
}

// --- permission gate / scan startup -------------------------------------------------------------

const enableButton = document.getElementById("enable-button");
const permissionGate = document.getElementById("permission-gate");
const permissionMessage = document.getElementById("permission-message");
const radiusControl = document.getElementById("radius-control");

enableButton.addEventListener("click", async () => {
  enableButton.disabled = true;
  permissionMessage.textContent = "Requesting access…";
  try {
    // Must run inside this click handler for iOS's motion-permission gesture requirement.
    const orientationGranted = await requestOrientationPermission();
    await camera.start();
    location.start();
    if (orientationGranted) orientation.start();

    permissionGate.classList.add("hidden");
    radiusControl.classList.remove("hidden");
    requestAnimationFrame(renderLoop);
  } catch (err) {
    console.error(err);
    permissionMessage.textContent =
      "Couldn't get camera/location access. Check your browser's site settings and try again.";
    enableButton.disabled = false;
  }
});

// --- location -> recompute candidate peak/hut lists -------------------------------------------------------------

let updateScheduled = false;
function scheduleSightedPeaksUpdate() {
  if (updateScheduled) return;
  updateScheduled = true;
  queueMicrotask(async () => {
    updateScheduled = false;
    if (!location.latest) return;
    const { lat, lon, altitude } = location.latest;
    const radiusMeters = radiusKm * 1000;
    // Independent .catch() per call, not a shared Promise.all: pois.json failing to load
    // (e.g. not deployed yet, or a fetch error) must not also break peaks, which are
    // otherwise completely unrelated.
    [currentSighted, currentHuts] = await Promise.all([
      sightedPeaks(lat, lon, altitude, radiusMeters).catch((err) => {
        console.warn("Failed to load peaks:", err);
        return [];
      }),
      nearbyPois(lat, lon, altitude, radiusMeters, { kinds: ["hut"], limit: 20 }).catch((err) => {
        console.warn("Failed to load huts:", err);
        return [];
      }),
    ]);
  });
}

location.onUpdate(scheduleSightedPeaksUpdate);

const radiusSlider = document.getElementById("radius-slider");
const radiusValue = document.getElementById("radius-value");
radiusSlider.addEventListener("input", () => {
  radiusKm = Number(radiusSlider.value);
  radiusValue.textContent = String(radiusKm);
  scheduleSightedPeaksUpdate();
});

// --- orientation -> render loop -------------------------------------------------------------

orientation.onUpdate((o) => {
  latestOrientation = o;
});

const overlayContainer = document.getElementById("overlay-container");

function renderLoop() {
  if (document.getElementById("view-scan").classList.contains("active")) {
    renderOverlay();
  }
  requestAnimationFrame(renderLoop);
}

function renderOverlay() {
  if (!latestOrientation) return;

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const verticalFov = camera.verticalFovDegrees;

  const projectItem = (kind, item) => {
    const point = projectToScreen({
      bearingDegrees: item.bearingDegrees,
      elevationAngleDegrees: item.elevationAngleDegrees,
      deviceHeadingDegrees: latestOrientation.headingDegrees,
      devicePitchDegrees: latestOrientation.pitchDegrees,
      horizontalFovDegrees: ASSUMED_HORIZONTAL_FOV_DEGREES,
      verticalFovDegrees: verticalFov,
      screenWidth,
      screenHeight,
    });
    return point ? { kind, item, point } : null;
  };

  // Peaks first so they win distance-sort priority for label placement (huts are a
  // secondary layer — nice to see, but the summit labels are the main point).
  const placements = [
    ...currentSighted.map((s) => projectItem("peak", s)),
    ...currentHuts.map((s) => projectItem("hut", s)),
  ].filter(Boolean);

  // Simple distance-sorted stacking declutter — nudge a label down if it would land on
  // top of a nearer label already placed. Both source lists are already sorted
  // nearest-first, but need re-sorting once merged together.
  placements.sort((a, b) => a.item.distanceMeters - b.item.distanceMeters);

  const placed = [];
  const HORIZONTAL_COLLISION_THRESHOLD = 90;
  const VERTICAL_STACK_STEP = 34;
  for (const p of placements) {
    let stackOffset = 0;
    let collided = true;
    while (collided) {
      collided = false;
      for (const existing of placed) {
        const dx = Math.abs(existing.point.x - p.point.x);
        const dy = Math.abs(existing.point.y - (p.point.y + stackOffset));
        if (dx < HORIZONTAL_COLLISION_THRESHOLD && dy < VERTICAL_STACK_STEP) {
          stackOffset += VERTICAL_STACK_STEP;
          collided = true;
          break;
        }
      }
    }
    placed.push({ kind: p.kind, item: p.item, point: { x: p.point.x, y: p.point.y + stackOffset } });
  }

  const visibleKeys = new Set();
  for (const { kind, item, point } of placed) {
    const id = kind === "peak" ? item.peak.id : item.poi.id;
    const key = `${kind}-${id}`;
    visibleKeys.add(key);
    let el = labelElements.get(key);
    if (!el) {
      el = document.createElement("div");
      el.className = kind === "peak" ? "peak-label" : "peak-label poi-label--hut";
      el.innerHTML = `<span class="peak-name"></span><span class="peak-sub"></span>`;
      el.addEventListener("click", () => (kind === "peak" ? showPeakDetail(item) : showPoiDetail(item)));
      overlayContainer.appendChild(el);
      labelElements.set(key, el);
    }
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    if (kind === "peak") {
      el.querySelector(".peak-name").textContent = item.peak.name;
      el.querySelector(".peak-sub").textContent =
        `${formatElevation(item.peak.ele, unit)} · ${formatDistance(item.distanceMeters, unit)}`;
    } else {
      el.querySelector(".peak-name").textContent = `⛰ ${poiDisplayName(item.poi)}`;
      el.querySelector(".peak-sub").textContent = formatDistance(item.distanceMeters, unit);
    }
  }

  for (const [key, el] of labelElements) {
    if (!visibleKeys.has(key)) {
      el.remove();
      labelElements.delete(key);
    }
  }
}

// --- peaks tab -------------------------------------------------------------

const peakList = document.getElementById("peak-list");
const peakSearch = document.getElementById("peak-search");

async function renderPeakList() {
  const query = peakSearch.value.trim();
  let items;
  let subtitleFor;

  if (query) {
    items = await searchPeaks(query);
    subtitleFor = (p) => formatElevation(p.ele, unit);
  } else if (location.latest) {
    const nearby = await sightedPeaks(location.latest.lat, location.latest.lon, location.latest.altitude, 100_000, 50);
    items = nearby.map((s) => s.peak);
    subtitleFor = (p) => {
      const s = nearby.find((s) => s.peak.id === p.id);
      return formatDistance(s.distanceMeters, unit);
    };
  } else {
    peakList.innerHTML = `<li class="empty-message">Waiting for location…</li>`;
    return;
  }

  if (items.length === 0) {
    peakList.innerHTML = `<li class="empty-message">No peaks found</li>`;
    return;
  }

  peakList.innerHTML = "";
  for (const peak of items) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="peak-row-name">${escapeHtml(peak.name)}</span><span class="peak-row-sub">${subtitleFor(peak)}</span>`;
    li.addEventListener("click", () => showPeakDetail({ peak, distanceMeters: null, bearingDegrees: null }));
    peakList.appendChild(li);
  }
}

peakSearch.addEventListener("input", () => {
  renderPeakList();
});

location.onUpdate(() => {
  if (document.getElementById("view-peaks").classList.contains("active") && !peakSearch.value.trim()) {
    renderPeakList();
  }
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- peak / poi detail modal -------------------------------------------------------------

const modal = document.getElementById("peak-detail-modal");
const modalName = document.getElementById("modal-peak-name");
const modalDetails = document.getElementById("modal-peak-details");
document.getElementById("modal-close").addEventListener("click", () => modal.classList.add("hidden"));

const NEARBY_POI_SEARCH_RADIUS_METERS = 15000;

function showPeakDetail(sighted) {
  const { peak } = sighted;
  modalName.textContent = peak.name;

  // Peaks-tab entries don't precompute distance/bearing (only the AR overlay does, since
  // it needs them for projection anyway) — derive from the current location if missing,
  // so both entry points render the same row order.
  let distance = sighted.distanceMeters;
  let bearing = sighted.bearingDegrees;
  if (distance == null && location.latest) {
    distance = distanceMeters(location.latest.lat, location.latest.lon, peak.lat, peak.lon);
    bearing = bearingDegrees(location.latest.lat, location.latest.lon, peak.lat, peak.lon);
  }

  const rows = [["Elevation", formatElevation(peak.ele, unit)]];
  if (peak.prom != null) rows.push(["Prominence", formatElevation(peak.prom, unit)]);
  if (distance != null) rows.push(["Distance", formatDistance(distance, unit)]);
  if (bearing != null) rows.push(["Bearing", `${Math.round(bearing)}° ${compassAbbreviation(bearing)}`]);

  if (distance != null && location.latest) {
    const ascent = peak.ele - location.latest.altitude;
    const hours = estimateHikingHours(distance, ascent);
    rows.push(["Hiking time", `${formatHikingTime(hours)} (estimated, straight-line)`]);
  }

  rows.push(["Latitude", peak.lat.toFixed(5)]);
  rows.push(["Longitude", peak.lon.toFixed(5)]);

  modalDetails.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  modal.classList.remove("hidden");

  // Fire-and-forget: both append rows asynchronously once they resolve, and both fail
  // silently (just don't add their row) rather than blocking or erroring the modal —
  // weather.js already returns null on failure; nearestOfKind here needs its own catch
  // since pois.json might 404 (e.g. not deployed yet).
  appendWeatherRow(peak.lat, peak.lon, peak.ele);
  appendNearestPoiRows(peak.lat, peak.lon).catch((err) => console.warn("Failed to load nearby POIs:", err));
}

function showPoiDetail(sightedPoi) {
  const { poi } = sightedPoi;
  modalName.textContent = poiDisplayName(poi);

  const rows = [];
  if (poi.ele != null) rows.push(["Elevation", formatElevation(poi.ele, unit)]);
  rows.push(["Distance", formatDistance(sightedPoi.distanceMeters, unit)]);
  rows.push(["Bearing", `${Math.round(sightedPoi.bearingDegrees)}° ${compassAbbreviation(sightedPoi.bearingDegrees)}`]);
  rows.push(["Latitude", poi.lat.toFixed(5)]);
  rows.push(["Longitude", poi.lon.toFixed(5)]);

  modalDetails.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  modal.classList.remove("hidden");
}

/** Fetches live weather async and appends a row once it resolves — never blocks opening the modal. */
async function appendWeatherRow(lat, lon, elevationMeters) {
  const weather = await currentWeather(lat, lon, elevationMeters);
  if (modal.classList.contains("hidden")) return; // user closed it before this resolved
  const div = document.createElement("div");
  if (weather) {
    div.innerHTML = `<dt>Weather</dt><dd>${Math.round(weather.temperatureCelsius)}°C, ${escapeHtml(weather.description)}</dd>`;
  } else {
    div.innerHTML = `<dt>Weather</dt><dd>Unavailable (no signal?)</dd>`;
  }
  modalDetails.appendChild(div);
}

const POI_KIND_LABELS = { hut: "Nearest hut", spring: "Nearest water source", parking: "Nearest parking" };

/** Finds the nearest hut/spring/parking to the PEAK (not the user) — relevant for planning a hike there. */
async function appendNearestPoiRows(peakLat, peakLon) {
  for (const kind of ["hut", "spring", "parking"]) {
    const nearest = await nearestOfKind(peakLat, peakLon, kind, NEARBY_POI_SEARCH_RADIUS_METERS);
    if (modal.classList.contains("hidden")) return;
    if (!nearest) continue;
    const div = document.createElement("div");
    div.innerHTML = `<dt>${POI_KIND_LABELS[kind]}</dt><dd>${formatDistance(nearest.distanceMeters, unit)} away</dd>`;
    modalDetails.appendChild(div);
  }
}

// --- settings -------------------------------------------------------------

for (const btn of document.querySelectorAll("#unit-toggle button")) {
  btn.addEventListener("click", () => {
    unit = btn.dataset.unit;
    setUnitPreference(unit);
    for (const b of document.querySelectorAll("#unit-toggle button")) {
      b.classList.toggle("active", b === btn);
    }
    renderPeakList();
  });
}

document.querySelector(`#unit-toggle button[data-unit="${unit}"]`)?.classList.add("active");

// --- service worker registration -------------------------------------------------------------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => console.warn("SW registration failed:", err));
  });
}
