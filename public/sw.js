const STATIC_CACHE = "nextset-static-v2";
const PAGES_CACHE = "nextset-pages-v1";
const CURRENT_CACHES = [STATIC_CACHE, PAGES_CACHE];
// Hashed build assets accumulate across deploys; keep only the newest ones.
const MAX_STATIC_ENTRIES = 150;
const MAX_PAGE_ENTRIES = 30;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !CURRENT_CACHES.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
    await trimCache(cache, MAX_STATIC_ENTRIES);
  }
  return response;
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic" && !response.redirected) {
      const cache = await caches.open(PAGES_CACHE);
      await cache.put(request, response.clone());
      await trimCache(cache, MAX_PAGE_ENTRIES);
    }
    return response;
  } catch {
    const cache = await caches.open(PAGES_CACHE);
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ??
      (await cache.match("/"));
    return cached ?? Response.error();
  }
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  // Cache keys are returned in insertion order, so the oldest go first.
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)),
  );
}
