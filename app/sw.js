const CACHE_NAME = "cb350-maintenance-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./mobile-fixes.css",
  "./maintenance-items.js",
  "./parser.js",
  "./app.js",
  "./navigation-fixes.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./assets/cb350-rs-banner.webp",
  "./assets/cb350-rs-red.jpg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).pathname.includes("/api/")) return;
  event.respondWith(caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (!response || response.status !== 200 || response.type === "opaque") return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    });
  }));
});
