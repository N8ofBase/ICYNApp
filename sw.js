// I Crit You Not! app shell: always try the network first so new versions show up right away,
// and fall back to the last copy so duels vs the Computer still work offline.
const CACHE = 'icyn-v2';
const SHELL = ['/', '/index.html', '/auth.js', '/stats.js', '/online.js', '/pass.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/music/')) return; // music streams with range requests, so skip the cache // sign-in, stats and online calls go straight to the network
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; })
    .catch(() => caches.match(r).then((m) => m || (r.mode === 'navigate' ? caches.match('/index.html') : undefined))));
});
