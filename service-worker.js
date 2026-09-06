// service-worker.js
// Caches only the site's own static files (HTML/CSS/JS/icons) so the app
// shell loads instantly on repeat visits. Firestore / gstatic.com calls are
// NEVER touched here — they always go straight to the network.

const CACHE_NAME = "mockbaza-v1";
const CORE_ASSETS = [
  "index.html",
  "dashboard.html",
  "admin.html",
  "css/style.css",
  "js/firebase-config.js",
  "js/common.js",
  "js/dashboard.js",
  "js/admin.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle our own same-origin GET requests. Everything else
  // (Firestore, gstatic.com Firebase SDK, Google Fonts, etc.) is left
  // completely alone so live data always stays fresh.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
