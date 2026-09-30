export const FB_CONF = {
  apiKey: 'AIzaSyDhn3rsGWOf_jxng2Q8wqjqYeYlF9T59Kw',
  authDomain: 'medshift-8daea.firebaseapp.com',
  databaseURL: 'https://medshift-8daea-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'medshift-8daea',
  storageBucket: 'medshift-8daea.firebasestorage.app',
  messagingSenderId: '328469733031',
  appId: '1:328469733031:web:396d4d57c530ecd6164582'
};
export const APP = {
  name: 'ООО «КрасНЕО»',
  tagline: 'первая частная скорая помощь',
  city: 'Красноярск',
  address: 'пр. Металлургов 8',
  phone: '203-03-03',
  url: 'https://feldsherikydze-dot.github.io/medshift/'
};
// Собирается из полей выше, а не дублируется строкой: иначе телефон
// приходится менять в двух местах и они расходятся.
APP.footer = APP.name + ' — ' + APP.tagline + ' · ' + APP.city + ', ' + APP.address + ' · тел. ' + APP.phone;
export const LS_KEYS = {
  DB: 'medshift_v3', DEV: 'medshift_dev', MY_ID: 'medshift_my',
  REM: 'medshift_rem', REM_TS: 'medshift_rem_ts', TAB: 'medshift_tab',
  BIO: 'medshift_bio', FB_AUTH: 'medshift_fb_auth',
  ONLINE_CACHE: 'medshift_online_cache', BG_CUSTOM: 'medshift_bg_custom',
  WX: 'medshift_wx'
};
// Единственный источник версии: sw.js читает её отсюда при установке,
// а index.html дублирует в '?v=' — расхождение ловит тест
// «версия в одном месте» в tests/run.mjs.
export const VERSION = '2.6.2';

export const LIMITS = {
  CHAT_MAX: 500, CHAT_SHOW: 100, REPORTS_SHOW: 50, DRUG_SEARCH_LIMIT: 15,
  DRUG_SEARCH_CACHE: 200, WEATHER_CACHE_MS: 1800000, WEATHER_RETRY_MS: 30000,
  PRESENCE_TTL_MS: 70000, PRESENCE_COOLDOWN_MS: 10000,
  SYNC_PUSH_DELAY_MS: 800, SYNC_PULL_INTERVAL_MS: 12000, SYNC_TICK_INTERVAL_MS: 20000,
  SESSION_TTL_MS: 86400000, LEAVES_COUNT_MOBILE: 8, LEAVES_COUNT_DESKTOP: 10,
  // Подбор PIN: 4 цифры — это 10 000 вариантов, без ограничения набирается
  // руками за пару минут. Счётчик лежит на самом сотруднике, поэтому
  // блокировка общая для всех устройств и переживает перезагрузку.
  PIN_MAX_FAILS: 5, PIN_LOCK_MS: 300000,
  PHOTO_MAX_DIM: 1200, PHOTO_QUALITY: 0.7, BG_MAX_DIM: 1000, BG_QUALITY: 0.6, BG_MAX_BYTES: 900000
};
