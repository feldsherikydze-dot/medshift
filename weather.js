import { LIMITS, LS_KEYS } from './config.js';
import { DB, esc } from './db.js';

/* ==================================================================
   Погодный модуль.

   Источники (в порядке предпочтения, все бесплатные и без ключа):
     1. met.no / Yr  — api.met.no, 10 суток, ~140 мс, официальный
                       метеослужба. Основной.
     2. open-meteo   — 7 суток, запасной.
     3. wttr.in      — 3 суток, последний резерв (только температура).

   Геокодинг: open-meteo geocoding → nominatim → ранее найденные координаты.

   Кэш живёт в localStorage, а не в DB.settings: прогноз не должен
   попадать в общую базу и поднимать rev, который потом уезжает в
   Firebase и конфликтует у всех остальных.
   ================================================================== */

export function wIcon(c) {
  return c === 0 ? '☀️' : c <= 3 ? '⛅' : c <= 48 ? '🌫'
       : c <= 67 ? '🌧' : c <= 77 ? '❄️' : c <= 82 ? '🌦' : '⛈';
}

function fetchJSON(url, ms) {
  return new Promise((res, rej) => {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), ms || 8000);
    fetch(url, { signal: ctl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)))
      .then(j => { clearTimeout(to); res(j); })
      .catch(e => { clearTimeout(to); rej(e); });
  });
}

const WX_KEY = LS_KEYS.WX;
const CACHE_MS = LIMITS.WEATHER_CACHE_MS || 1800000;
const RETRY_MS = LIMITS.WEATHER_RETRY_MS || 30000;

function readWx() { try { return JSON.parse(localStorage.getItem(WX_KEY) || 'null'); } catch (_) { return null; } }
function writeWx(o) { try { o ? localStorage.setItem(WX_KEY, JSON.stringify(o)) : localStorage.removeItem(WX_KEY); } catch (_) {} }
function city() { return (DB.settings.city || '').trim(); }
function fresh(w, c) { return !!(w && w.city === c && Date.now() - (w.ts || 0) < CACHE_MS); }
function hasDaily(w, c) { return !!(w && w.city === c && w.daily && w.daily.length); }
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

/* Виджет пересоздаётся при каждом render(), поэтому узел берём в момент
   отрисовки. Раньше он захватывался один раз, и ответ сети уходил в
   отсоединённый узел — виджет навсегда оставался с «…». */
function paint(html) {
  const el = document.getElementById('cwWeather');
  if (el) el.innerHTML = html;
}

function paintCurrent(w, c, fromCache) {
  paint('<span class="cwTemp">' + wIcon(w.code) + ' ' + w.temp + '°C</span><br><span class="cwDesc">'
    + esc(c) + (fromCache ? ' · из кэша' : '') + '</span>');
}

/* ---------------- met.no: symbol_code → код WMO ----------------
   wIcon() ждёт числовой код WMO, а met.no отдаёт строки. Коды подобраны
   так, чтобы попадать в существующие корзины: 83-86 в них не входят,
   поэтому ливневый снег отдаём как снег (73), а не как гроза. */
const MET_WMO = {
  clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
  lightrain: 61, rain: 63, heavyrain: 65,
  lightrainshowers: 80, rainshowers: 80, heavyrainshowers: 82,
  lightsleet: 71, sleet: 71, heavysleet: 75,
  lightsnow: 71, snow: 73, heavysnow: 75,
  lightsnowshowers: 73, snowshowers: 73, heavysnowshowers: 75,
  lightrainandthunder: 95, lightrainshowersandthunder: 95,
  rainandthunder: 96, rainshowersandthunder: 96,
  thunder: 96, thunderstorm: 96
};
function metCode(sym) {
  if (!sym) return 3;
  return MET_WMO[sym] != null ? MET_WMO[sym] : MET_WMO[sym.replace(/_(day|night|polartwilight)$/, '')] || 3;
}

/* Группируем почасовые точки met.no в сутки. Даты берём по часовому
   поясу телефона — он же стоит на станции, поэтому это и есть местное
   время станции (в отличие от ответа с подписью UTC). */
function parseMet(j) {
  const ts = (j.properties && j.properties.timeseries) || [];
  if (!ts.length) throw new Error('met: пусто');
  const byDay = new Map();
  let cur = null;

  ts.forEach((t, i) => {
    const data = t.data || {};
    const det = (data.instant && data.instant.details) || {};
    const sum = (data.next_1_hours && data.next_1_hours.summary) || {};
    const temp = det.air_temperature;
    const code = metCode(sum.symbol_code);
    const d = new Date(t.time);
    const key = ymd(d);

    if (!byDay.has(key)) byDay.set(key, { d: key, min: Infinity, max: -Infinity, codes: [] });
    const day = byDay.get(key);
    if (typeof temp === 'number') {
      if (temp < day.min) day.min = temp;
      if (temp > day.max) day.max = temp;
    }
    if (sum.symbol_code) day.codes.push({ h: d.getHours(), c: code });
    if (i === 0 && typeof temp === 'number') cur = { temp: Math.round(temp), code };
  });

  const daily = [];
  byDay.forEach(day => {
    if (!isFinite(day.min) || !isFinite(day.max)) return;
    // знак берём около 13:00 — так он лучше всего описывает день
    let icon = 3;
    if (day.codes.length) {
      icon = day.codes.reduce((a, b) => (Math.abs(b.h - 13) < Math.abs(a.h - 13) ? b : a)).c;
    }
    daily.push({ d: day.d, min: Math.round(day.min), max: Math.round(day.max), code: icon });
  });
  daily.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  if (!daily.length) throw new Error('met: нет суток');
  return { temp: cur ? cur.temp : Math.round(daily[0].max), code: cur ? cur.code : daily[0].code, daily: daily.slice(0, 7) };
}

/* ---------------- open-meteo: запасной источник ---------------- */
function parseOpenMeteo(f) {
  if (!f.daily || !f.daily.time) throw new Error('om: нет daily');
  const daily = [];
  for (let i = 0; i < f.daily.time.length; i++) {
    daily.push({
      d: f.daily.time[i],
      min: Math.round(f.daily.temperature_2m_min[i]),
      max: Math.round(f.daily.temperature_2m_max[i]),
      code: f.daily.weather_code[i]
    });
  }
  const temp = f.current ? Math.round(f.current.temperature_2m) : daily[0].max;
  const code = f.current ? f.current.weather_code : daily[0].code;
  return { temp, code, daily: daily.slice(0, 7) };
}

/* ---------------- геокодинг ---------------- */
function geocode(c, prev) {
  if (prev && prev.city === c && prev.lat != null) {
    return Promise.resolve({ latitude: prev.lat, longitude: prev.lon });
  }
  // Обе ветки обязаны отдавать одинаковую форму {latitude, longitude}:
  // иначе следующий .then() в цепочке путает lat и latitude.
  const viaOpenMeteo = () => fetchJSON('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(c) + '&count=1&language=ru', 8000)
    .then(j => {
      if (!j.results || !j.results[0]) throw new Error('open-meteo: нет результата');
      return { latitude: j.results[0].latitude, longitude: j.results[0].longitude };
    });
  const viaNominatim = () => fetchJSON('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(c), 8000)
    .then(j => {
      const r = Array.isArray(j) ? j[0] : j;
      if (!r || r.lat == null || r.lon == null) throw new Error('nominatim: нет результата');
      return { latitude: +r.lat, longitude: +r.lon };
    });
  return viaOpenMeteo().catch(viaNominatim);
}

/* ---------------- wttr.in: последний резерв ----------------
   Отдаёт всего 3 суток, зато разбираем их целиком — иначе при отказе
   основных источников неделя в диалоге была бы пустой. */
function parseWttr(j) {
  const cc = j && j.current_condition && j.current_condition[0];
  if (!cc) throw new Error('wttr: нет current');
  const daily = [];
  ((j.weather) || []).slice(0, 7).forEach(day => {
    const codes = ((day.hourly) || []).map(hh => +hh.weatherCode).filter(n => !isNaN(n));
    daily.push({
      d: day.date,
      min: Math.round(+day.mintempC || 0),
      max: Math.round(+day.maxtempC || 0),
      code: codes.length ? codes[Math.floor(codes.length / 2)] : 3
    });
  });
  return { temp: Math.round(+cc.temp_C || 0), code: +cc.weatherCode || 0, daily };
}

/* ================= основной поток ================= */
export function loadWeather(force) {
  const c = city();
  if (!c) { paint('<span class="cwDesc">город не задан</span>'); return Promise.resolve(null); }

  const w = readWx();

  if (!force && fresh(w, c)) { paintCurrent(w, c, false); return Promise.resolve(null); }

  // Грязный кэш всё равно показываем: пустой виджет хуже устаревших данных.
  if (w && w.city === c) paintCurrent(w, c, true);

  // Троттл. DOM уже отрисован выше, поэтому ранний return больше не
  // оставляет пользователя с вечным «…» (именно это было раньше).
  if (!force && Date.now() - (window.__weatherTryTs || 0) < RETRY_MS) return Promise.resolve(null);
  window.__weatherTryTs = Date.now();

  if (!navigator.onLine) {
    if (!w || w.city !== c) paint('<span class="cwDesc">нет связи (офлайн)</span>');
    return Promise.resolve(null);
  }
  if (!w || w.city !== c) paint('<span class="cwDesc">…</span>');

  const commit = (src, p, k) => {
    const next = { city: c, src, ts: Date.now(), temp: p.temp, code: p.code, daily: p.daily || [] };
    const kk = k || ((w && w.city === c && w.lat != null) ? { latitude: w.lat, longitude: w.lon } : null);
    if (kk) { next.lat = kk.latitude; next.lon = kk.longitude; }
    // выжившие дневные данные не выбрасываем, если пришёл урезанный ответ
    if (!next.daily.length && w && w.city === c) next.daily = w.daily || [];
    writeWx(next);
    paintCurrent(next, c, false);
    return next;
  };

  // Источники перебираются строго по очереди: первый, кто ответил и
  // разобрался, и побеждает. Раньше цепочка .catch() была собрана так,
  // что последний .then получал результат open-meteo вместо wttr.in.
  const providers = [
    { name: 'met.no', needsCoords: true, run: k => fetchJSON('https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=' + k.latitude + '&lon=' + k.longitude, 9000).then(parseMet) },
    { name: 'open-meteo', needsCoords: true, run: k => fetchJSON('https://api.open-meteo.com/v1/forecast?latitude=' + k.latitude + '&longitude=' + k.longitude + '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7', 9000).then(parseOpenMeteo) },
    { name: 'wttr.in', needsCoords: false, run: () => fetchJSON('https://wttr.in/' + encodeURIComponent(c.split(' ')[0]) + '?format=j1&lang=ru', 10000).then(parseWttr) }
  ];

  geocode(c, w)
    .then(k => {
      const tried = [];
      const next = (i) => {
        if (i >= providers.length) return Promise.reject(new Error('все источники недоступны: ' + tried.join(', ')));
        const p = providers[i];
        // без координат в первую очередь пропускаем провайдеров, которым они нужны
        if (p.needsCoords && !k) return next(i + 1);
        return p.run(k)
          .then(data => ({ p: data, k, name: p.name }))
          .catch(err => { tried.push(p.name + '(' + (err && err.message ? err.message : 'ошибка') + ')'); return next(i + 1); });
      };
      return next(0);
    })
    .then(r => commit(r.name, r.p, r.k))
    .catch(err => {
      window.__weatherErr = String(err && err.message || err);
      if (!w || w.city !== c) paint('<span class="cwDesc">' + (navigator.onLine ? 'нет связи' : 'нет связи (офлайн)') + '</span>');
      return null;
    });
}

/* Смена города обязана сбрасывать локальный кэш, иначе до истечения
   WEATHER_CACHE_MS виджет и прогноз показывали бы прежний город. */
export function clearWeatherCache() {
  writeWx(null);
  window.__weatherTryTs = 0;
}

window.addEventListener('online', () => { window.__weatherTryTs = 0; loadWeather(true); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { window.__weatherTryTs = 0; loadWeather(); } });

/* ------------------------------------------------------------------
   Прогноз на неделю. Раньше здесь стояла проверка «есть ли кэш текущей
   погоды» и return с тостом «Нет данных о погоде» — при том, что через
   три строки код всё равно шёл в сеть. Проверка срабатывала ровно
   тогда, когда текущая погода не загрузилась, и неделя не показывалась.
   Теперь диалог рисуется сразу из кэша, а сеть — только чтобы обновить.
   ------------------------------------------------------------------ */
export function showForecast() {
  const c = city();
  if (!c) { if (window.toast) window.toast('Город не задан (Ещё → Правила)'); return; }

  const w = readWx();
  const body = hasDaily(w, c) ? forecastHtml(c, w, fresh(w, c)) : '<p style="color:var(--mut)">Загрузка прогноза…</p>';
  if (window.openDlg) window.openDlg('<h3>🌤 Прогноз на неделю</h3>'
    + '<p style="font-size:calc(var(--fs) - 1px);color:var(--mut)">' + esc(c) + (w && w.src ? ' · ' + esc(w.src) : '') + '</p>'
    + '<div id="fcBox">' + body + '</div>'
    + '<p><button class="btn sec" data-act="close">Закрыть</button> <button class="btn" data-act="wxRefresh">🔄 Обновить</button></p>');

  if (!hasDaily(w, c) || !fresh(w, c)) refreshForecast(c);
}

function forecastHtml(c, w, isFresh) {
  const DN = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const today = ymd(new Date());
  let h = '<div class="forecastGrid">';
  w.daily.forEach(day => {
    const dt = new Date(day.d + 'T00:00:00');
    const isToday = day.d === today;
    h += '<div class="fcDay' + (isToday ? ' today' : '') + '"><div>' + (isToday ? 'Сегодня' : DN[dt.getDay()]) + '</div>'
      + '<div class="fcTemp">' + wIcon(day.code) + ' ' + day.max + '°</div>'
      + '<div style="font-size:calc(var(--fs) - 4px);opacity:.7">' + day.min + '°</div></div>';
  });
  h += '</div>';
  if (!isFresh) h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut);margin:8px 0 0">Данные могут быть устаревшими — нажмите «Обновить».</p>';
  return h;
}

function refreshForecast(c) {
  const done = () => {
    const w = readWx(), b = document.getElementById('fcBox');
    if (b && hasDaily(w, c)) b.innerHTML = forecastHtml(c, w, fresh(w, c));
  };
  window.__weatherTryTs = 0;
  Promise.resolve(loadWeather(true)).then(done, done);
}

/* Ручное обновление по кнопке — снимает троттл, который иначе съедает
   нажатие: после неудачи 30 секунд клик не делал ничего. */
window.wxRefresh = () => { window.__weatherTryTs = 0; Promise.resolve(loadWeather(true)).then(() => refreshForecast(city())); };

let clockTimer = null;
export function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  tick();
  clockTimer = setInterval(tick, 1000);
}
function tick() {
  const el = document.getElementById('cwTime');
  const eld = document.getElementById('cwDate');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (eld) eld.textContent = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
}

window.loadWeather = loadWeather;
window.showForecast = showForecast;
window.startClock = startClock;
window.wIcon = wIcon;
