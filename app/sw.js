/* Service worker: deja la app disponible sin internet. Al cambiar archivos, subir VERSION. */
const VERSION = 'agro-v1.2.1';
const CORE = ['./', './index.html', './styles.css', './common.js', './potreros.js', './app.js', './dashboard.html', './dashboard.js',
  './manifest.webmanifest', './icon.svg', './vendor/chart.umd.js', './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css', './vendor/leaflet/images/layers.png', './vendor/leaflet/images/layers-2x.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(CORE);
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nunca cachear llamadas al Apps Script ni teselas de mapa.
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com') ||
      url.hostname.includes('tile') || url.hostname.includes('arcgisonline')) return;
  // Solo archivos estáticos propios; cualquier otra petición (API, mapas) va directo a la red.
  if (url.origin !== location.origin || (req.mode !== 'navigate' && !/\.(html|js|css|svg|png|webmanifest)$/.test(url.pathname))) return;
  // Caché primero (abre al instante con señal débil) y actualiza en segundo plano para la próxima vez.
  e.respondWith(caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(cached => {
    const red = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => cached || caches.match('./index.html'));
    return cached || red;
  }));
});
