var CACHE = 'medshift-cache-v26';

var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './drugs.js',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS).catch(function (err) {
        console.error('[SW] Ошибка кэширования ASSETS:', err);
        return cache.add('./');
      });
    }).then(function () {
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE) {
            console.log('[SW] Удаляю старый кэш:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Стратегия «кэш-сначала» (stale-while-revalidate):
// страница открывается мгновенно из кэша, свежая версия подтягивается в фоне.
// При отсутствии сети работает кэш. Данные всё равно всегда берутся из Firebase по сети.
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
            cache.put(req, copy).catch(function (err) {
              console.error('[SW] Ошибка записи в кэш:', req.url, err);
            });
          });
        }
        return res;
      }).catch(function () {
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return caches.match('./index.html').then(function (fallback) {
            return fallback || new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Офлайн</title></head>' +
              '<body style="font-family:sans-serif;text-align:center;padding:2rem">' +
              '<h2>Нет подключения к сети</h2><p>Приложение недоступно офлайн в данной версии кэша.</p>' +
              '</body></html>',
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
