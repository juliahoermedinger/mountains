// Caches the app shell + peak data so the app still works with no signal — the actual
// point of using it, since you're typically in the mountains without reception.
// Bump CACHE_NAME on any deploy that changes these files, so returning users get the
// update instead of a stale cache.
const CACHE_NAME = "mountainscope-v1";

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/app.js",
  "js/geo-math.js",
  "js/screen-projection.js",
  "js/peak-data.js",
  "js/sensors.js",
  "js/units.js",
  "data/peaks.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
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
  // Never intercept the Overpass/elevation API calls etc. — this app makes none at
  // runtime (all peak data is bundled), but being explicit here avoids ever accidentally
  // caching a cross-origin request.
  if (new URL(event.request.url).origin !== self.location.origin) return;

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
