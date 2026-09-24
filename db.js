import { LS_KEYS } from './config.js';
const LS = LS_KEYS.DB;
let DEV = localStorage.getItem(LS_KEYS.DEV);
if (!DEV) { DEV = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem(LS_KEYS.DEV, DEV); }
export const DEVSALT = (DEV.charCodeAt(1) || 49) % 9;
export { DEV };
export let DB = JSON.parse(localStorage.getItem(LS) || 'null');
const EMPTY_DB = () => ({
  seq: 1, rev: 0,
  settings: { warnDays: 10, city: '', accent: '#0b5394', dark: 'auto', fontSize: 14 },
  users: [], session: null, bagTypes: [], bags: [], cars: [], ecg: [],
  reports: [], tasks: [], chat: [], sched: { months: [], days: [] },
  tomb: [], bans: [], kitTemplates: [], potents: [],
  bagTomb: [], carTomb: [], potTomb: [], tplTomb: [], schedTomb: {}
});
export function save() {
  DB.rev = (DB.rev || 0) + 1;
  try { localStorage.setItem(LS, JSON.stringify(DB)); } catch (e) { if (window.toast) window.toast('⚠ Недостаточно места'); }
  if (window.__onSave) window.__onSave();
}
export function uid() { DB.seq = (DB.seq || 0) + 1; return Date.now() * 1000 + DEVSALT * 100 + (DB.seq % 100); }
export function normalizeDB() {
  if (!DB) DB = EMPTY_DB();
  const def = EMPTY_DB();
  for (const k in def) if (DB[k] === undefined) DB[k] = def[k];
  if (!DB.settings.fontSize) DB.settings.fontSize = 14;
  ['days', 'months'].forEach(k => { if (!Array.isArray(DB.sched[k])) DB.sched[k] = []; });
  ['users','bags','cars','chat','tasks','reports','ecg','tomb','bans','kitTemplates','potents','bagTomb','carTomb','potTomb','tplTomb','bagTypes'].forEach(k => { if (!Array.isArray(DB[k])) DB[k] = []; });
  if (typeof DB.schedTomb !== 'object' || DB.schedTomb === null) DB.schedTomb = {};
  DB.users.forEach(u => { u.cars = u.cars || []; u.bags = u.bags || []; });
  DB.bags.forEach(b => { b.items = b.items || []; b.kits = b.kits || []; });
  DB.cars.forEach(c => { c.equip = c.equip || []; c.kits = c.kits || []; c.kits.forEach(k => { k.items = k.items || []; }); });
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
export function normName(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
export function isDead(id) { return (DB.tomb || []).indexOf(id) >= 0 || (DB.bans || []).some(b => b.id === id); }
export function isBannedName(n) { return (DB.bans || []).some(b => normName(b.name) === normName(n)); }
export function me() { for (let i = 0; i < DB.users.length; i++) if (DB.users[i].id === DB.session && !isDead(DB.users[i].id)) return DB.users[i]; return null; }
export function isBoss() { const u = me(); return !!u && (u.role === 'admin' || u.role === 'lead'); }
export function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function daysLeft(iso) { const d = new Date(iso + 'T00:00:00'), t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 864e5); }
export function esc(s) { s = s == null ? '' : String(s); return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;'); }
export async function hashPin(pin, salt) { const data = new TextEncoder().encode(salt + ':' + pin); const buf = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
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