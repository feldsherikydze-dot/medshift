import { FB_CONF, LIMITS, LS_KEYS } from './config.js';
import { DB, DEV, save, isDead, normName, dedupe } from './db.js';
export const SYNCSTAT = { pushOk: false, lastPush: 0, lastPull: 0, lastErr: '' };
let syncBusy = false, pushTimer = null, tickTimer = null;
export let onlineN = null;
export function fbUrl(p) {
  let u = FB_CONF.databaseURL.replace(/\/$/, '') + '/' + p + '.json';
  if (window.__fbToken) u += (u.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(window.__fbToken);
  return u;
}
export function restPut(p, o) {
  return fetch(fbUrl(p), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r; }).catch(e => { SYNCSTAT.lastErr = String(e.message || e); throw e; });
}
export function restGet(p) {
  return fetch(fbUrl(p)).then(r => { if (!r.ok) { SYNCSTAT.lastErr = 'HTTP ' + r.status; return null; } return r.json(); }).catch(e => { SYNCSTAT.lastErr = String(e.message || e); return null; });
}
export function restDelete(p) { return fetch(fbUrl(p), { method: 'DELETE' }).catch(() => {}); }
function mergeArr(local, rem) { const ids = {}; local.forEach(x => ids[x.id] = 1); rem.forEach(x => { if (!ids[x.id]) local.push(x); }); local.sort((a, b) => (a.ts || 0) - (b.ts || 0)); return local; }
function mergeUsers(rem, loc) { rem = rem.filter(u => !isDead(u.id)); const ids = {}; rem.forEach(u => ids[u.id] = 1); loc.forEach(u => { if (!ids[u.id] && !isDead(u.id)) rem.push(u); }); return rem; }
function mergeTombs(rem) {
  ['bagTomb', 'carTomb', 'potTomb', 'tplTomb'].forEach(k => { rem[k] = (rem[k] || []).concat((DB[k] || []).filter(x => (rem[k] || []).indexOf(x) < 0)); });
  rem.schedTomb = rem.schedTomb || {};
  Object.entries(DB.schedTomb || {}).forEach(([id, ts]) => { if (!rem.schedTomb[id] || ts > rem.schedTomb[id]) rem.schedTomb[id] = ts; });
  rem.bags = (rem.bags || []).filter(b => !rem.bagTomb.includes(b.id));
  rem.cars = (rem.cars || []).filter(c => !rem.carTomb.includes(c.id));
  rem.potents = (rem.potents || []).filter(p => !rem.potTomb.includes(p.id));
  rem.kitTemplates = (rem.kitTemplates || []).filter(k => !rem.tplTomb.includes(k.id));
}
// ---------- Фото смен (sched): могилы, привязка по времени жизни ----------
const SCHED_CUT = 40 * 864e5;
function pruneTomb() {
  const t = (DB.schedTomb = DB.schedTomb || {}), now = Date.now();
  Object.keys(t).forEach(id => { if (now - (+t[id] || 0) > SCHED_CUT) delete t[id]; });
}
export function purgeLocal() {
  if (!DB.sched) return false;
  const t = (DB.schedTomb = DB.schedTomb || {}); let ch = false;
  ['days', 'months'].forEach(k => {
    const arr = DB.sched[k] || [];
    const f = arr.filter(p => !t[p.id]);
    if (f.length !== arr.length) { DB.sched[k] = f; ch = true; }
  });
  return ch;
}
function mergeTomb(tb) {
  tb = tb || {};
  const t = (DB.schedTomb = DB.schedTomb || {});
  Object.keys(tb).forEach(id => {
    const ts = (tb[id] && tb[id].ts) ? +tb[id].ts : +tb[id];
    if (ts && (!t[id] || ts > t[id])) t[id] = ts;
  });
  pruneTomb();
}
export function alive(kind, p, now) {
  if (!p || !p.ts) return false;
  if (kind === 'days') return (now - p.ts < 2 * 864e5);
  const q = String(p.month || '').split('-');
  if (!q[0] || !q[1]) return false;
  return now < new Date(+q[0], +q[1], 3).getTime();
}
export function bumpSchedMeta() {
  if (!window.__fbToken) return;
  restPut('schedmeta', { ts: Date.now() }).then(() => { window.__schedSeen = Date.now(); window.__schedDirty = false; }).catch(() => {});
}
function getSchedRemote() {
  return restGet('schedtomb').then(tb => {
    mergeTomb(tb);
    if (purgeLocal()) save();
    return restGet('sched').then(rem => {
      rem = rem || {};
      const t = DB.schedTomb || {};
      ['days', 'months'].forEach(k => {
        const obj = rem[k] || {};
        Object.keys(obj).forEach(id => { if (t[id]) delete obj[id]; });
        rem[k] = obj;
      });
      return rem;
    });
  }).catch(() => ({}));
}
export function schedSync() {
  if (!FB_CONF.databaseURL || !window.__fbToken) return;
  restGet('schedmeta').then(m => {
    const ts = (m && m.ts) || 0;
    if (window.__schedSeenOnce && ts === window.__schedSeen && !window.__schedDirty) return;
    window.__schedSeen = ts; window.__schedSeenOnce = true;
    return getSchedRemote().then(rem => {
      const now = Date.now();
      let chLocal = false, chRemote = false;
      ['days', 'months'].forEach(kind => {
        const robj = rem[kind] || {};
        const rlist = Object.keys(robj).map(id => robj[id]);
        const llist = (DB.sched[kind] = DB.sched[kind] || []);
        rlist.forEach(p => {
          if (!p || !p.img || p.id == null) return;
          if (!llist.some(x => x.id !== undefined && String(x.id) === String(p.id))) {
            if (alive(kind, p, now)) { llist.push(p); chLocal = true; }
          }
        });
        llist.forEach(p => {
          if (!p.id) return;
          if (!robj[p.id] && alive(kind, p, now)) { restPut('sched/' + kind + '/' + p.id, p).catch(() => { window.__schedDirty = true; }); chRemote = true; }
        });
        Object.keys(robj).forEach(id => {
          if (robj[id] && !alive(kind, robj[id], now)) { restDelete('sched/' + kind + '/' + id); chRemote = true; }
        });
      });
      if (chLocal) { save(); if (window.render && DB.session) window.render(); }
      if (chRemote) bumpSchedMeta();
    });
  }).catch(() => {});
}
export function serverCleanup() {
  if (!FB_CONF.databaseURL || !window.__fbToken) return;
  restGet('schedtomb').then(tb => {
    tb = tb || {};
    mergeTomb(tb);
    pruneTomb();
    if (purgeLocal()) save();
    const missing = Object.keys(DB.schedTomb || {}).filter(id => !tb[id]);
    let p = Promise.resolve();
    if (missing.length) {
      p = Promise.all(missing.map(id => restPut('schedtomb/' + id, { ts: DB.schedTomb[id] }).catch(() => {})))
        .then(() => restPut('schedmeta', { ts: Date.now() }).catch(() => {}));
    }
    return p.then(() => restGet('sched')).then(rem => {
      rem = rem || {};
      const t = DB.schedTomb || {}, dels = [];
      ['days', 'months'].forEach(k => Object.keys(rem[k] || {}).forEach(id => { if (t[id]) dels.push('sched/' + k + '/' + id); }));
      if (!dels.length) return;
      return Promise.all(dels.map(d => restDelete(d))).then(() => restPut('schedmeta', { ts: Date.now() }).catch(() => {}));
    }).catch(() => {});
  }).catch(() => {});
}
export function adoptState(rem, rrev) {
  mergeTombs(rem);
  const lt = (DB.tomb || []).slice(), lb = (DB.bans || []).slice();
  rem.chat = mergeArr(rem.chat || [], DB.chat); rem.reports = mergeArr(rem.reports || [], DB.reports);
  rem.tasks = mergeArr(rem.tasks || [], DB.tasks); rem.bags = mergeArr(rem.bags || [], DB.bags);
  rem.cars = mergeArr(rem.cars || [], DB.cars); rem.potents = mergeArr(rem.potents || [], DB.potents);
  rem.kitTemplates = mergeArr(rem.kitTemplates || [], DB.kitTemplates); rem.bagTypes = mergeArr(rem.bagTypes || [], DB.bagTypes);
  rem.ecg = (DB.ecg.length >= (rem.ecg || []).length) ? DB.ecg : (rem.ecg || []);
  rem.tomb = (rem.tomb || []).concat(lt.filter(x => !rem.tomb.includes(x)));
  rem.bans = mergeUsers(rem.bans || [], lb); rem.users = mergeUsers(rem.users || [], DB.users);
  rem.users = rem.users.filter(u => !rem.tomb.includes(u.id) && !rem.bans.some(b => b.id === u.id));
  rem.session = DB.session; rem.sched = DB.sched; rem.settings = DB.settings;
  Object.assign(DB, rem); DB.rev = rrev;
  mergeTomb(DB.schedTomb); purgeLocal();
  dedupe();
  try { localStorage.setItem(LS_KEYS.DB, JSON.stringify(DB)); } catch {}
  if (window.__onAdopt) window.__onAdopt();
}
function syncPut(attempt = 0) {
  if (syncBusy) { if (attempt === 0) pushTimer = setTimeout(() => syncPut(0), 1200); return; }
  if (!window.__fbToken) return;
  syncBusy = true;
  restGet('meta').then(m => {
    let srev = (m && m.rev) ? +m.rev : 0;
    return restGet('state').then(v => {
      if (v && v.data && +v.data.rev > srev) srev = +v.data.rev;
      if (v && v.data && srev > (DB.rev || 0)) adoptState(v.data, srev);
      const nr = Math.max(DB.rev || 0, srev) + 1; DB.rev = nr;
      try { localStorage.setItem(LS_KEYS.DB, JSON.stringify(DB)); } catch {}
      const d = JSON.parse(JSON.stringify(DB)); delete d.session; delete d.sched;
      return restPut('state', { rev: nr, data: d }).then(() => restPut('meta', { rev: nr, ts: Date.now() }));
    });
  }).then(() => restGet('meta')).then(m2 => {
    const sr2 = (m2 && m2.rev) ? +m2.rev : 0;
    if (sr2 > (DB.rev || 0) && attempt < 3) { syncBusy = false; setTimeout(() => syncPut(attempt + 1), 1200); return; }
    SYNCSTAT.pushOk = true; SYNCSTAT.lastPush = Date.now(); SYNCSTAT.lastErr = '';
    if (window.__onSync) window.__onSync();
  }).catch(() => { SYNCSTAT.pushOk = false; if (window.__onSync) window.__onSync(); }).then(() => { syncBusy = false; });
}
export function syncPush() { if (!FB_CONF.databaseURL) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => syncPut(0), LIMITS.SYNC_PUSH_DELAY_MS); }
function syncPull() {
  if (!FB_CONF.databaseURL) return;
  restGet('meta').then(m => { SYNCSTAT.lastPull = Date.now(); if (m && m.rev && m.rev > (DB.rev || 0)) restGet('state').then(v => { if (v && v.data && (v.rev || 0) > (DB.rev || 0)) adoptState(v.data, v.rev || 0); }); });
}
export function presBeat() {
  if (!FB_CONF.databaseURL || !window.__fbToken) return;
  const now = Date.now(); if (now - (window.__pb39 || 0) < LIMITS.PRESENCE_COOLDOWN_MS) return; window.__pb39 = now;
  const u = (window.me ? window.me() : null);
  restPut('online/' + DEV, { n: (u && u.name) || 'гость', t: Date.now() }).catch(() => {});
  restGet('online').then(o => {
    if (!o) { onlineN = null; if (window.__onSync) window.__onSync(); return; }
    let n = 0; const map = {}, t2 = Date.now();
    for (const k in o) if (o[k] && o[k].t && t2 - o[k].t < LIMITS.PRESENCE_TTL_MS) { n++; map[o[k].n] = true; }
    const sig = Object.keys(map).sort().join('|'), changed = sig !== (window.__onlineSig || '');
    onlineN = n; window.__onlineMap = map; window.__onlineSig = sig;
    try { localStorage.setItem(LS_KEYS.ONLINE_CACHE, JSON.stringify(o)); } catch {}
    if (window.__onSync) window.__onSync();
    if (changed && window.__onPresenceChange) window.__onPresenceChange();
  }).catch(() => {});
}
function syncTick() { presBeat(); syncPull(); }
export function syncInit() {
  if (!FB_CONF.databaseURL) return;
  presBeat(); syncPull();
  tickTimer = setInterval(syncTick, LIMITS.SYNC_TICK_INTERVAL_MS);
  setInterval(schedSync, 20000);
  setInterval(serverCleanup, 25000);
  setTimeout(schedSync, 3000);
  setTimeout(serverCleanup, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { presBeat(); syncPull(); schedSync(); serverCleanup(); } });
  window.addEventListener('pagehide', () => { try { fetch(fbUrl('online/' + DEV), { method: 'DELETE', keepalive: true }); } catch {} });
}
export function syncTest() {
  if (!FB_CONF.databaseURL) { if (window.toast) window.toast('Склад не настроен'); return; }
  restPut('ping/' + DEV, { t: Date.now() }).then(() => restGet('ping/' + DEV)).then(v => { if (window.toast) window.toast(v && v.t ? '📡 Связь есть' : '⚠ Не отвечает'); }).catch(() => { if (window.toast) window.toast('⚠ Ошибка: ' + SYNCSTAT.lastErr); });
}
window.__onSave = syncPush;