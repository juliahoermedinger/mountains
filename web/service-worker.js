// Caches the app shell + peak/POI data so the app still works with no signal — the
// actual point of using it, since you're typically in the mountains without reception.
// Bump CACHE_NAME on any deploy that changes these files, so returning users get the
// update instead of a stale cache.
const CACHE_NAME = "mountainscope-v2";

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/app.js",
  "js/geo-math.js",
  "js/screen-projection.js",
  "js/peak-data.js",
  "js/poi-data.js",
  "js/sensors.js",
  "js/units.js",
  "js/weather.js",
  "js/hiking-estimate.js",
  "data/peaks.json",
  "data/pois.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Individual cache.add calls, not cache.addAll: addAll is all-or-nothing, so one
      // missing file (e.g. data/pois.json before the pipeline has produced it yet) would
      // silently fail caching for every other file too. Each file failing independently
      // means the rest of the app shell still gets cached for offline use.
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn(`Service worker: failed to cache ${url}`, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never intercept cross-origin requests (e.g. the live Open-Meteo weather calls) —
  // those are meant to hit the network fresh every time, not get cached offline.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
