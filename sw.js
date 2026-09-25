/* =====================================================================
   SERVICE WORKER — MedShift / ООО «КрасНЕО»
   Стратегия: Network First + Cache Fallback
   При обновлении — bump CACHE (v204 → v205 и т.д.)
   ===================================================================== */
var CACHE = 'medshift-cache-v233';

var ASSETS = [
  './',
  './index.html',
  './boot.js',
  './config.js',
  './db.js',
  './sync.js',
  './auth.js',
  './ui.js',
  './weather.js',
  './seasons.js',
  './chat.js',
  './reports.js',
  './views.js',
  './background.js',
  './styles.css',
  './drugs.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

/* ---------- INSTALL: предзагрузка ядра ---------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS).catch(function (err) {
        console.warn('[SW] partial cache fail:', err);
        return cache.add('./');
      });
    })
  );
  self.skipWaiting();
});

/* ---------- ACTIVATE: чистка старых кэшей ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE; })
            .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

/* ---------- FETCH: Network First + Cache Fallback ---------- */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== location.origin) return;

  // API-запросы (Firebase, Open-Meteo, Google) — всегда в сеть
  if (url.hostname.indexOf('firebasedatabase') >= 0 ||
      url.hostname.indexOf('identitytoolkit') >= 0 ||
      url.hostname.indexOf('securetoken') >= 0 ||
      url.hostname.indexOf('open-meteo') >= 0 ||
      url.hostname.indexOf('googleapis') >= 0) {
    return;
  }

  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) {
          cache.put(req, copy);
        });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (cached) {
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('Нет сети', {
          status: 503,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
      });
    })
  );
});
