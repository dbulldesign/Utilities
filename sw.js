/* Split — offline service worker */
const VERSION = "1.1.2";        // keep in sync with APP_VERSION in index.html
const CACHE = "utilities-v" + VERSION;
const CORE = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icon-180.png", "./icon-192.png", "./icon-512.png"
];

// precache straight from the network — never let the HTTP cache seed a stale copy
async function precache() {
  const c = await caches.open(CACHE);
  await Promise.all(CORE.map(async u => {
    try {
      const res = await fetch(u + "?v=" + VERSION, { cache: "no-store" });
      if (res.ok) await c.put(u, res);          // stored under the clean URL
    } catch (_) {}
  }));
}

self.addEventListener("install", e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// let the page force an update check / cache purge
self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) return;   // leave cross-origin requests alone

  const isDoc = req.mode === "navigate" || req.destination === "document"
             || url.pathname.endsWith("/") || url.pathname.endsWith(".html");

  if (isDoc) {
    // network-first for the page itself, so a new deploy is picked up immediately;
    // the cache is only the offline fallback
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => { try { c.put("./index.html", copy); } catch (_) {} });
        return res;
      }).catch(() => caches.match("./index.html").then(hit => hit || caches.match("./")))
    );
    return;
  }

  // static assets: cache-first is fine, they're versioned with the release
  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => { try { c.put(req, copy); } catch (_) {} });
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
