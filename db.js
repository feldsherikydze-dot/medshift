import { LS_KEYS } from './config.js';
const LS = LS_KEYS.DB;
let DEV = localStorage.getItem(LS_KEYS.DEV);
if (!DEV) { DEV = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem(LS_KEYS.DEV, DEV); }
export const DEVSALT = (DEV.charCodeAt(1) || 49) % 9;
export { DEV };

let _midMs = 0, _midAt = 0;
let _soonC = null, _alC = null;
let _badgeC = {}, _badgeN = 0, _bdC = null;
const _ck = () => (DB.rev || 0) + '|' + Math.floor(Date.now() / 36e5);
function todayMid() {
  const n = Date.now();
  if (!_midAt || n - _midAt > 60000) { const t = new Date(n); t.setHours(0, 0, 0, 0); _midMs = t.getTime(); _midAt = n; }
  return _midMs;
}
export let DB = JSON.parse(localStorage.getItem(LS) || 'null');
const EMPTY_DB = () => ({
  seq: 1, rev: 0,
  settings: { warnDays: 10, city: 'Красноярск', accent: '#0b5394', dark: 'auto', fontSize: 14 },
  users: [], session: null, bagTypes: [], bags: [], cars: [], ecg: [],
  reports: [], tasks: [], chat: [], sched: { months: [], days: [] },
  tomb: [], bans: [], kitTemplates: [], potents: [],
  bagTomb: [], carTomb: [], potTomb: [], tplTomb: [], schedTomb: {}
});
export function seedBasics() {
  if (!DB.settings.city) DB.settings.city = 'Красноярск';
  if (window.SEED && window.SEED.length && !DB.bagTypes.length) {
    DB.bagTypes.push({ id: 1, name: 'Рабочая сумка', items: window.SEED.map(r => ({ name: r[2], spec: r[3], unit: r[4], qty: r[5], expiry: '', potent: false })) });
  }
  if (!DB.kitTemplates.length) {
    const from = list => (window[list] || []).map(r => ({ name: r[0], spec: '', unit: r[2], qty: r[1], expiry: '', potent: false }));
    const potentItems = (window.DRUG_DB || []).filter(d => (d.g || '').indexOf('⚕') >= 0).map(d => ({ name: d.n, spec: d.s, unit: d.u, qty: 1, expiry: '', potent: true }));
    DB.kitTemplates.push(
      { name: 'Реанимационная', items: from('RE') },
      { name: 'Травматологическая', items: from('TR') },
      { name: 'Акушерская', items: from('AK') },
      { name: 'Термосумка', items: from('TM') },
      { name: '⚕ Сильнодействующие', items: potentItems }
    );
  }
  const REN = { 'Универсальная': 'Рабочая сумка', 'Шаблон сумки (стандарт)': 'Рабочая сумка', 'Перевязочная': 'Травматологическая', 'Токсикологическая': 'Термосумка', '⚕ Сильнодействующие (НС/ПВ/СД)': '⚕ Сильнодействующие' };
  if (DB.bagTypes.length && REN[DB.bagTypes[0].name]) DB.bagTypes[0].name = REN[DB.bagTypes[0].name];
  DB.kitTemplates.forEach(k => { if (REN[k.name]) k.name = REN[k.name]; });
}
let _svT = null;
let _write = () => {
  try { localStorage.setItem(LS, JSON.stringify(DB)); } catch (e) { if (window.toast) window.toast('⚠ Недостаточно места'); }
  if (window.__onSave) window.__onSave();
};
let _flushSave = () => { if (_svT !== null) { clearTimeout(_svT); _svT = null; _write(); } };
export function save() {
  DB.rev = (DB.rev || 0) + 1;
  if (_svT !== null) clearTimeout(_svT);
  _svT = setTimeout(_write, 300);
}
export function saveNow() { _flushSave(); }
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flushSave(); });
window.addEventListener('pagehide', _flushSave);
window.addEventListener('beforeunload', _flushSave);
// Слот внутри миллисекунды: 1000 значений + случайный старт, чтобы
// два устройства не выдали одинаковый id в одну и ту же миллисекунду.
// Порядок величины сохранён (≈1.8e15) — id остаются точными целыми,
// что важно для мест с +getAttribute('data-id').
let _uidN = Math.floor(Math.random() * 1000);
export function uid() {
  DB.seq = (DB.seq || 0) + 1;
  _uidN = (_uidN + 1) % 1000;
  return Date.now() * 1000 + DEVSALT * 1000 + _uidN;
}
export function normalizeDB() {
  if (!DB) DB = EMPTY_DB();
  const def = EMPTY_DB();
  for (const k in def) if (DB[k] === undefined) DB[k] = def[k];
  if (!DB.settings.fontSize) DB.settings.fontSize = 14;
  ['days', 'months'].forEach(k => { if (!Array.isArray(DB.sched[k])) DB.sched[k] = []; });
  ['users','bags','cars','chat','tasks','reports','ecg','tomb','bans','kitTemplates','potents','bagTomb','carTomb','potTomb','tplTomb','bagTypes'].forEach(k => { if (!Array.isArray(DB[k])) DB[k] = []; });
  if (typeof DB.schedTomb !== 'object' || DB.schedTomb === null) DB.schedTomb = {};
  seedBasics();
  DB.users.forEach(u => { u.cars = u.cars || []; u.bags = u.bags || []; });
  DB.bags.forEach(b => { b.items = b.items || []; b.kits = b.kits || []; });
  DB.cars.forEach(c => { c.equip = c.equip || []; c.kits = c.kits || []; c.kits.forEach(k => { k.items = k.items || []; }); });
  if (!DB._termPatched) { if (termSanitize()) { DB._termPatched = 1; save(); } }
}
export function termSanitize() {
  let ch = false;
  const fix = s => { s = String(s == null ? '' : s); if (s.indexOf('НС/ПВ/СД') >= 0) return s; return s.split('Сильнодействующие').join('НС/ПВ/СД препараты').split('сильнодействующих').join('НС/ПВ/СД препаратов').split('НС/ЛС').join('НС/ПВ/СД'); };
  const walk = arr => (arr || []).forEach(t => {
    const n1 = t.name; t.name = fix(t.name); if (t.name !== n1) ch = true;
    (t.items || []).forEach(it => { const v = fix(it.name); if (v !== it.name) { it.name = v; ch = true; } });
  });
  walk(DB.kitTemplates); walk(DB.potents);
  DB.bags.forEach(b => walk(b.items ? [{ items: b.items }] : []));
  DB.cars.forEach(c => walk(c.kits));
  return ch;
}
export function dedupe() {
  const remap = {};
  ['bags', 'cars', 'kitTemplates'].forEach(coll => {
    const by = {}, out = [];
    (DB[coll] || []).forEach(o => {
      const key = normName(o.name || '');
      if (!key) { out.push(o); return; }
      if (!by[key]) { by[key] = o; out.push(o); return; }
      const keep = by[key], drop = o;
      if (drop.id < keep.id) {
        remap[keep.id] = drop.id; by[key] = drop;
        const ix = out.indexOf(keep); out[ix] = drop;
      } else remap[drop.id] = keep.id;
    });
    DB[coll] = out;
  });
  if (Object.keys(remap).length) {
    DB.users.forEach(u => ['cars', 'bags'].forEach(k => {
      if (!u[k]) return; u[k] = u[k].map(id => remap[id] != null ? remap[id] : id).filter((v, i, a) => a.indexOf(v) === i);
    }));
    (DB.reports || []).forEach(r => { if (r.carId != null && remap[r.carId] != null) r.carId = remap[r.carId]; });
  }
  return Object.keys(remap).length;
}
export function migrate() {
  if (DB.users.length) return;
  const raw = localStorage.getItem('medshift_v11') || localStorage.getItem('medshift_v6');
  if (!raw) return;
  let o; try { o = JSON.parse(raw); } catch { return; }
  if (!o) return;
  if (o.users) o.users.forEach(u => DB.users.push({ id: uid(), name: u.name, pin: u.pin || '', role: u.role || 'user', cars: [], bags: [], phone: '', bday: '' }));
  if (o.bags) o.bags.forEach(b => { const nb = { id: uid(), name: b.name, typeId: 1, items: [], kits: [] }; (b.items || []).forEach(it => nb.items.push({ name: it.name, spec: (it.spec || '') + (it.vol ? ' ' + it.vol : ''), unit: it.unit || 'шт', qty: it.qty || 1, expiry: it.expiry || '', potent: !!it.potent })); DB.bags.push(nb); });
  if (o.cars) o.cars.forEach(c => { const nc = { id: uid(), name: c.name, plates: c.plates || '', equip: [], kits: [] }; (c.items || []).forEach(e => nc.equip.push({ id: uid(), ovm: e.ovm || '', name: e.name, status: e.status || 'ok', charge: e.charge || '', defect: '' })); (c.kits || []).forEach(k => { const nk = { id: uid(), name: k.name, items: [] }; (k.items || []).forEach(it => nk.items.push({ name: it.name, spec: it.spec || '', unit: it.unit || 'шт', qty: it.qty || 1, expiry: it.expiry || '', potent: !!it.potent })); nc.kits.push(nk); }); DB.cars.push(nc); });
  if (o.messages) o.messages.forEach(m => DB.chat.push({ id: uid(), ts: Date.now(), author: m.from || 'Диспетчер', room: 'общая', text: m.text || '' }));
  save();
}
export function myBags() { const u = me(); if (!u) return []; if (isBoss()) return DB.bags; return DB.bags.filter(b => (u.bags || []).includes(b.id)); }
export function myCars() { const u = me(); if (!u) return []; if (isBoss()) return DB.cars; return DB.cars.filter(c => (u.cars || []).includes(c.id)); }
export function soonList() {
  const _k = _ck();
  if (_soonC && _soonC.k === _k) return _soonC.v;
  const out = [];
  DB.bags.forEach(b => (b.items || []).forEach(it => {
    if (it.expiry && (daysLeft(it.expiry) < 0 || daysLeft(it.expiry) <= DB.settings.warnDays)) out.push({ type: 'bag', bagId: b.id, name: b.name, item: it });
  }));
  DB.cars.forEach(c => (c.kits || []).forEach(k => (k.items || []).forEach(it => {
    if (it.expiry && (daysLeft(it.expiry) < 0 || daysLeft(it.expiry) <= DB.settings.warnDays)) out.push({ type: 'kit', carId: c.id, kitId: k.id, carName: c.name, kitName: k.name, item: it });
  })));
  (DB.potents || []).forEach(k => (k.items || []).forEach(it => {
    if (it.expiry && (daysLeft(it.expiry) < 0 || daysLeft(it.expiry) <= DB.settings.warnDays)) out.push({ type: 'pot', potId: k.id, name: k.name, item: it });
  }));
  _soonC = { k: _k, v: out };
  return out;
}
export function alerts() {
  const _k = _ck();
  if (_alC && _alC.k === _k) return _alC.v;
  const out = [];
  const so = soonList();
  if (so.length) out.push({ t: 'Истекает/просрочено: ' + so.length + ' поз.', l: 'bSoon', items: so });
  DB.cars.forEach(c => (c.equip || []).forEach(e => { if (e.status === 'def') out.push({ t: c.name + ': дефект ' + (e.name || ''), l: 'bExp', carId: c.id }); }));
  if (isBoss()) (DB.reports || []).forEach(r => { if (!r.viewed && r.status !== 'green') out.push({ t: 'Непрочитанный отчёт: ' + (r.car || '') + ' (' + (r.user || '') + ')', l: r.status === 'red' ? 'bR' : 'bY', reportId: r.id }); });
  _alC = { k: _k, v: out };
  return out;
}
export function badgeExp(iso) {
  const key = (DB.settings.warnDays || 0) + '|' + todayMid() + '|' + (iso || '');
  if (_badgeC[key] !== undefined) return _badgeC[key];
  let v;
  if (!iso) v = '<span class="badge bWarn">нет срока</span>';
  else {
    const d = daysLeft(iso);
    if (d < 0) v = '<span class="badge bExp">просрочен ' + (-d) + ' дн</span>';
    else if (d <= DB.settings.warnDays) v = '<span class="badge bSoon">осталось ' + d + ' дн</span>';
    else if (d <= 30) v = '<span class="badge bWarn">' + d + ' дн</span>';
    else v = '<span class="badge bOk">' + d + ' дн</span>';
  }
  if (_badgeN > 300) { _badgeC = {}; _badgeN = 0; }
  _badgeC[key] = v; _badgeN++;
  return v;
}
export function bdayToday() {
  const k = (DB.rev || 0) + '|' + todayMid();
  if (_bdC && _bdC.k === k) return _bdC.v;
  const t = todayStr().slice(5), out = [];
  DB.users.forEach(u => { if (u.bday && u.bday.slice(5) === t) out.push(u.name); });
  _bdC = { k, v: out };
  return out;
}
export function mkKit() { return { id: uid(), name: '', items: [] }; }
export function normName(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
export function isDead(id) { return (DB.tomb || []).indexOf(id) >= 0 || (DB.bans || []).some(b => b.id === id); }
export function isBannedName(n) { return (DB.bans || []).some(b => normName(b.name) === normName(n)); }
export function me() { for (let i = 0; i < DB.users.length; i++) if (DB.users[i].id === DB.session && !isDead(DB.users[i].id)) return DB.users[i]; return null; }
export function isBoss() { const u = me(); return !!u && (u.role === 'admin' || u.role === 'lead'); }
export function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
// null, если даты нет или она неразбираема — иначе NaN молча ломает
// сравнения вида `d < 0` / `d <= warnDays` (просрочка просто не покажется)
export function daysLeft(iso) { if (!iso) return null; const d = new Date(iso + 'T00:00:00'); const v = d.getTime(); if (!Number.isFinite(v)) return null; return Math.round((v - todayMid()) / 864e5); }
export function esc(s) { s = s == null ? '' : String(s); return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;'); }
export function sha256Hex(u8) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H = new Int32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const l = u8.length, bitLen = l * 8, ml = ((l + 8) >> 6) + 1;
  const m = new Uint8Array(ml * 64); m.set(u8); m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32((ml * 64) - 4, bitLen >>> 0, false);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Int32Array(64);
  for (let i = 0; i < ml; i++) {
    for (let j = 0; j < 16; j++) w[j] = dv.getInt32(i * 64 + j * 4, false);
    for (let j = 16; j < 64; j++) { const a0 = w[j-15], a1 = w[j-2]; w[j] = (w[j-16] + ((rotr(a0,7) ^ rotr(a0,18) ^ (a0 >>> 3))) + w[j-7] + ((rotr(a1,17) ^ rotr(a1,19) ^ (a1 >>> 10)))) | 0; }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let j = 0; j < 64; j++) {
      const t1 = (h + ((rotr(e,6) ^ rotr(e,11) ^ rotr(e,25)) + ((e & f) ^ (~e & g)) + K[j] + w[j])) | 0;
      const t2 = ((rotr(a,2) ^ rotr(a,13) ^ rotr(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return Array.from(H).map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  let hex;
  if (crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    hex = sha256Hex(data);
  }
  return hex;
}
export function genSalt() { const a = new Uint8Array(8); crypto.getRandomValues(a); return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join(''); }
normalizeDB();
migrate();
if (!DB._welcome) { DB._welcome = 1; if (DB.chat.length === 0) DB.chat.push({ id: 'wl' + uid(), ts: Date.now(), author: '🐱 Феликс', room: 'общая', text: 'Привет! Я Феликс 🐱 Напиши !шутка или позови меня по имени.' }); save(); }
export function purgeSched() {
  const now = Date.now();
  DB.sched.days = DB.sched.days.filter(p => now - p.ts < 2 * 864e5);
  DB.sched.months = DB.sched.months.filter(p => { const q = p.month.split('-'); const cut = new Date(+q[0], +q[1], 3).getTime(); return now < cut; });
}
window.DB = DB;
window.LS = LS;
window.saveNow = saveNow;
window.__flushSave = _flushSave;