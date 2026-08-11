// A deliberately small, safe service worker: it gives the app an offline shell
// and instant repeat loads via a runtime cache, without ever touching the
// Socket.IO connection (WebSocket/polling) that the live game runs on.
const CACHE = "canos-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept the realtime channel — let it hit the network directly.
  if (url.pathname.startsWith("/socket.io")) return;

  // Network-first, fall back to cache: always prefer fresh assets when online,
  // but keep working (and serve the app shell) when the network is gone.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        throw new Error("offline and not cached");
      }
    })(),
  );
});
