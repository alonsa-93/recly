/* Recly service worker: makes the app installable and lets it open offline.
   It only ever touches this site's own files (rule: no outside requests). Network first, so a
   new version shows up on the next load; the cache is the fallback when there is no network. */
const CACHE = 'recly-v2';
const CORE = ['./', 'index.html', 'manifest.webmanifest',
  'fonts/rubik-hebrew-wght-normal.woff2', 'fonts/rubik-latin-wght-normal.woff2',
  'icons/mark.svg', 'icons/mark-small.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
