// Service worker mínimo: guarda la "cáscara" de la app para abrir rápido e instalarla como app.
// Los datos NO se guardan aquí: siempre se leen en vivo desde Google Sheets.
const C = 'esmi-shell-v2';
const SHELL = ['./', 'index.html', 'app.js', 'qr-lib.js', 'config.js', 'icon-192.png', 'logo.png', 'logo.js', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // API y CDNs: directo a la red
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
