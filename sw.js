const CACHE = 'searchquest-v1';
const CORE = ['/', '/index.html', '/styles.css', '/app.js', '/course-data.js', '/assets/icon.svg', '/assets/rainstep.svg', '/assets/index-card.svg', '/assets/launch.svg', '/manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && (k.startsWith('searchquest-') || k.startsWith('dataquest-'))).map(k => caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c=>c.put(e.request, copy)); return r; }).catch(()=>caches.match(e.request)));
});
