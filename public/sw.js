/* CampusAI service worker.
 *
 * The build replaces the two placeholders below. VERSION changes whenever the app changes, so the
 * browser installs the new worker and the old cache is dropped; SHELL_FILES is the entry script and
 * stylesheets, precached so the app opens offline even if it was never reloaded while online.
 *
 * Everything else same-origin (lazy chunks, the inference worker) is cached the first time it is used.
 * The knowledge pack (knowledge-pack/) is network-first: a newer pack is used as soon as the device is online, and the
 * last copy that was downloaded is used offline. The app verifies every pack file against the manifest's SHA-256
 * hashes, and requests files by hash, so a half-updated cache cannot be mixed up into a wrong pack.
 * AI model files are NOT handled here: WebLLM caches model files itself. Cross-origin requests are left alone.
 */
const VERSION = /*__VERSION__*/ 'dev';
const SHELL_FILES = /*__SHELL_FILES__*/ [];
const CACHE = `campusai-${VERSION}`;
const CORE = ['./', './manifest.webmanifest', './icons/icon.svg', ...SHELL_FILES];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/knowledge-pack/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreVary: true }).then((hit) => hit || Response.error()))
    );
    return;
  }

  // ignoreVary: hosts often send "Vary: Origin", and the page's crossorigin script/style requests
  // carry an Origin header that the precached copies lack, which would make every lookup miss.
  // Only our own same-origin static files are ever matched here, so ignoring Vary is safe.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('./', { ignoreVary: true }) : Response.error()));
    })
  );
});
