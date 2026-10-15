// Service worker: guarda os arquivos do app para funcionar offline.
// Ao mudar qualquer arquivo, incremente VERSION para os celulares baixarem a versão nova.
const VERSION = 'v15';
const CACHE = `pelada-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'fonts/inter.woff2',
  'fonts/oswald.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/ui.js',
  'js/db.js',
  'js/store.js',
  'js/rng.js',
  'js/elo.js',
  'js/balance.js',
  'js/rotation.js',
  'js/wrapped.js',
  'js/views/players.js',
  'js/views/day.js',
  'js/views/match.js',
  'js/views/history.js',
  'js/views/config.js',
  'js/views/wrapped.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pelada-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Rede primeiro (pega atualizações quando online), cache como fallback offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
