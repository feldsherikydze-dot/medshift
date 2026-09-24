var CACHE = 'medshift-cache-v49';

var ASSETS = [
  './',
  './index.html',
  './drugs.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS).catch(function (err) {
        console.error('[SW] addAll error:', err);
        return Promise.all(
          ASSETS.map(function (asset) {
            return cache.add(asset).catch(function (e) {
              console.warn('[SW] Failed to cache:', asset, e);
            });
          })
        );
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  if (req.method !== 'GET') {
    return;
  }

  var url = new URL(req.url);

  if (url.origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      }).catch(function () {
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return caches.match('./index.html').then(function (fallback) {
            return fallback || new Response(
              '<!doctype html><meta charset="utf-8"><p>Нет соединения.</p>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        }
        return new Response('Нет сети', { status: 503 });
      });
      return cached || network;
    })
  );
});
