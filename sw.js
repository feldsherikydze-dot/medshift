/* =====================================================================
   SERVICE WORKER — MedShift / ООО «КрасНЕО»
   Стратегия: Network First + Cache Fallback

   Имя кэша берётся из VERSION в config.js при установке, поэтому версия
   живёт в ОДНОМ месте. Раньше здесь стоял ручной 'medshift-cache-v238',
   который расходился с VERSION в config.js и с '?v=' в index.html —
   чтобы обновить PWA, надо было вспомнить про все три сразу.
   ===================================================================== */
var CACHE = 'medshift-cache-dev';

var ASSETS = [
  './',
  './index.html',
  './boot.js',
  './config.js',
  './db.js',
  './sync.js',
  './auth.js',
  './ui.js',
  './logic.js',
  './weather.js',
  './seasons.js',
  './chat.js',
  './reports.js',
  './views.js',
  './background.js',
  './styles.css',
  './seed.js',
  './drugload.js',
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
    // config.js — единственный источник версии. config.js:28
    fetch(new Request('./config.js', { cache: 'no-store' }))
      .then(function (r) { return r.ok ? r.text() : ''; })
      .catch(function () { return ''; })
      .then(function (txt) {
        var m = txt.match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
        // Версию не прочитали — установка не удалась, и это правильно:
        // раньше CACHE оставался 'medshift-cache-dev', новый воркер
        // активировался и сносил боевой кэш, хотя ставить было нечего.
        // Теперь старый воркер и старый кэш остаются как были.
        if (!m) throw new Error('[SW] no VERSION in config.js, install aborted');
        CACHE = 'medshift-cache-' + m[1];
        return caches.open(CACHE).then(function (cache) {
          return cache.addAll(ASSETS).catch(function (err) {
            console.warn('[SW] partial cache fail:', err);
            return cache.add('./');
          });
        });
      })
      .then(function () { self.skipWaiting(); })
  );
});

/* ---------- ACTIVATE: чистка старых кэшей ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      // Сносим только свои старые кэши. Запасной 'medshift-cache-dev'
      // (установка без версии) ничего не трогает — пояс для подтяжек к 5.2.
      if (CACHE === 'medshift-cache-dev') return Promise.resolve();
      return Promise.all(
        keys.filter(function (key) { return key.indexOf('medshift-cache-') === 0 && key !== CACHE; })
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

  // Ответ из кэша. Для навигации последним рубежом служит index.html:
  // пользователь должен получить работающее приложение, а не страницу ошибки.
  // Запрос может прийти с версией (?v=2.6.2, так подключает index.html),
  // а в precache лежит голый './boot.js': версию снимаем и ищем голый URL.
  // Раньше первая загрузка в офлайне держалась только на рантайм-кэше.
  function fromCache() {
    return caches.match(req).then(function (cached) {
      if (cached) return cached;
      if (url.search) {
        return caches.match(url.pathname).then(function (c2) {
          if (c2) return c2;
          return navFallback();
        });
      }
      return navFallback();
    });
  }
  function navFallback() {
    if (req.mode === 'navigate') return caches.match('./index.html');
    return new Response('Нет сети', {
      status: 503,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
  }

  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) {
          cache.put(req, copy);
        });
        return res;
      }
      // Сеть ответила, но ответ — мусор: 502 от прокси или перехватчика
      // (вышка в больнице, гости-кафе, МЧС-фильтр), 404 у нового файла,
      // 503 при перегрузке. Раньше такой ответ уходил в страницу как есть,
      // и вместо приложения человек видел ошибку — хотя нужный файл лежал
      // в кэше. Офлайн-режим обязан срабатывать и на этом.
      return fromCache().then(function (cached) {
        if (cached && cached.status === 200) return cached;
        return res;
      });
    }).catch(function () {
      // Сети нет совсем (или запрос не прошёл) — это и есть офлайн.
      return fromCache();
    })
  );
});
