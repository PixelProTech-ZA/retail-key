/* Retail Key service worker — one per folder. Bump VERSION whenever any file changes. */
const VERSION = 'retail-key-v2.0.2';
const FILES = [
  './', 'index.html', 'app.css', 'app.js', 'engine.js', 'codes.js', 'bricolage.woff2',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // the shell is cache-first so the app opens instantly offline; query strings (share / shortcuts) are ignored for matching
    e.respondWith(caches.match('index.html').then(hit => hit || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
