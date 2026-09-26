import { FB_CONF, LIMITS } from './config.js';
import { DB, save, esc } from './db.js';

export function wIcon(c) {
  return c === 0 ? '☀️' : c <= 3 ? '⛅' : c <= 48 ? '🌫'
       : c <= 67 ? '🌧' : c <= 77 ? '❄️' : c <= 82 ? '🌦' : '⛈';
}

function fetchJSON(url, ms) {
  return new Promise((res, rej) => {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), ms || 7000);
    fetch(url, { signal: ctl.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)))
      .then(j => { clearTimeout(to); res(j); })
      .catch(e => { clearTimeout(to); rej(e); });
  });
}

export function loadWeather() {
  const el = document.getElementById('cwWeather');
  if (!el) return;
  const s = DB.settings;
  const city = (s.city || '').trim();
  const now = Date.now();
  if (!city) { el.innerHTML = '<span class="cwDesc">город не задан</span>'; return; }
  const g = s.geo;
  const showCache = () => {
    if (g && g.city === city) el.innerHTML = '<span class="cwTemp">' + wIcon(g.code) + ' ' + g.temp + '°C</span><br><span class="cwDesc">' + esc(city) + ' · из кэша</span>';
    else el.innerHTML = '<span class="cwDesc">' + (navigator.onLine ? 'нет связи' : 'нет связи (офлайн)') + '</span>';
  };
  if (g && g.city === city && now - g.ts < (LIMITS.WEATHER_CACHE_MS || 1800000)) {
    el.innerHTML = '<span class="cwTemp">' + wIcon(g.code) + ' ' + g.temp + '°C</span><br><span class="cwDesc">' + esc(city) + '</span>';
    return;
  }
  if (!navigator.onLine) { showCache(); return; }
  if (now - (window.__weatherTryTs || 0) < (LIMITS.WEATHER_RETRY_MS || 30000)) return;
  window.__weatherTryTs = now;
  el.innerHTML = '<span class="cwDesc">…</span>';
  const apply = (temp, code) => {
    s.geo = { city, ts: Date.now(), temp, code };
    save();
    el.innerHTML = '<span class="cwTemp">' + wIcon(code) + ' ' + temp + '°C</span><br><span class="cwDesc">' + esc(city) + '</span>';
  };
  fetchJSON('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=ru', 8000)
    .then(j => {
      if (!j.results || !j.results[0]) throw new Error('geo');
      const c = j.results[0];
      return fetchJSON('https://api.open-meteo.com/v1/forecast?latitude=' + c.latitude + '&longitude=' + c.longitude + '&current=temperature_2m,weather_code', 8000);
    })
    .then(w => {
      if (!w.current) throw new Error('cur');
      apply(Math.round(w.current.temperature_2m), w.current.weather_code);
    })
    .catch(() => {
      fetchJSON('https://wttr.in/' + encodeURIComponent(city.split(' ')[0]) + '?format=j1&lang=ru', 10000)
        .then(w => {
          if (!w.current_condition || !w.current_condition[0]) throw new Error('wt');
          apply(Math.round(+w.current_condition[0].temp_C || 0), +w.current_condition[0].weatherCode || 0);
        })
        .catch(showCache);
    });
}

window.addEventListener('online', () => { window.__weatherTryTs = 0; loadWeather(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { window.__weatherTryTs = 0; loadWeather(); } });

export function showForecast() {
  const s = DB.settings;
  const city = (s.city || '').trim();
  if (!city) { if (window.toast) window.toast('Город не задан (Ещё → Правила)'); return; }
  const g = s.geo;
  if (!g || g.city !== city) { if (window.toast) window.toast('Нет данных о погоде'); return; }
  if (window.toast) window.toast('Загрузка прогноза…');
  fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=ru')
    .then(r => r.json())
    .then(j => {
      if (!j.results || !j.results[0]) throw 0;
      const c = j.results[0];
      return fetch('https://api.open-meteo.com/v1/forecast?latitude=' + c.latitude + '&longitude=' + c.longitude + '&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7').then(r => r.json());
    })
    .then(w => {
      if (!w.daily) throw 0;
      const DN = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
      const today = (function(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
      let h = '<h3>🌤 Прогноз на неделю</h3><p style="font-size:calc(var(--fs) - 1px);color:var(--mut)">' + esc(city) + '</p><div class="forecastGrid">';
      for (let i = 0; i < w.daily.time.length; i++) {
        const dt = new Date(w.daily.time[i] + 'T00:00:00');
        const isToday = w.daily.time[i] === today;
        const dayName = i === 0 ? 'Сегодня' : DN[dt.getDay()];
        const tmax = Math.round(w.daily.temperature_2m_max[i]);
        const tmin = Math.round(w.daily.temperature_2m_min[i]);
        const icon = wIcon(w.daily.weather_code[i]);
        h += '<div class="fcDay' + (isToday ? ' today' : '') + '"><div>' + dayName + '</div><div class="fcTemp">' + icon + ' ' + tmax + '°</div><div style="font-size:calc(var(--fs) - 4px);opacity:.7">' + tmin + '°</div></div>';
      }
      h += '</div><p style="margin-top:10px"><button class="btn sec wide" data-act="close">Закрыть</button></p>';
      if (window.openDlg) window.openDlg(h);
    })
    .catch(() => { if (window.toast) window.toast('Не удалось загрузить прогноз'); });
}

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