const CACHE_NAME = "cb350-maintenance-v21-jessie";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./mobile-fixes.css",
  "./maintenance-icons.css",
  "./desktop-fixes.css",
  "./small-service.css",
  "./vehicle-theme.css",
  "./vehicle-profiles.js",
  "./vehicle-sync.js",
  "./assets/ezzy-500-jessie.jpg",
  "./maintenance-items.js",
  "./parser.js",
  "./app.js",
  "./maintenance-icons.js",
  "./navigation-fixes.js",
  "./small-service.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./assets/cb350-rs-banner.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("cb350-maintenance-") && key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

// Stale-while-revalidate：先用快取讓畫面立即出現，同時在背景抓新版，下次開啟就是最新的。
// 之前是純 cache-first，不改 CACHE_NAME 就永遠拿不到更新。
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    const network = fetch(request).then((response) => {
      if (response && response.status === 200 && response.type === "basic") cache.put(request, response.clone());
      return response;
    });
    if (cached) {
      event.waitUntil(network.catch(() => {}));
      return cached;
    }
    return network;
  }));
});
