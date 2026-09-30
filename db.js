import { LS_KEYS } from './config.js';
import { reportStatusOf, countNoExpiry } from './logic.js';
const LS = LS_KEYS.DB;
let DEV = localStorage.getItem(LS_KEYS.DEV);
if (!DEV) { DEV = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem(LS_KEYS.DEV, DEV); }
export const DEVSALT = (DEV.charCodeAt(1) || 49) % 9;
export { DEV };

let _midMs = 0, _midAt = 0;
let _soonC = null, _alC = null;
let _badgeC = {}, _badgeN = 0, _bdC = null;
/* Ключ кэша сводных списков (просрочка, тревоги).
   В нём обязателен DB.session: списки зависят от того, кто вошёл, ведь
   сотруднику показывается просрочка только по его сумкам и машинам. Без
   сессии в ключе смена пользователя на одном телефоне могла бы показать
   прежнему человеку его данные — а это как раз данные об ответственности. */
const _ck = () => (DB.rev || 0) + '|' + (DB.session == null ? '' : DB.session) + '|' + Math.floor(Date.now() / 36e5);
function todayMid() {
  const n = Date.now();
  if (!_midAt || n - _midAt > 60000) { const t = new Date(n); t.setHours(0, 0, 0, 0); _midMs = t.getTime(); _midAt = n; }
  return _midMs;
}
/* Хранилище может быть битым: ручная правка, обрыв записи, несовместимый
   старый формат. Раньше JSON.parse бросал прямо на импорте модуля — падал
   весь граф зависимостей, и человек видел только заглушку watchdog про
   три секунды вместо причины. Повреждённая база читается как пустая. */
export let DB = (() => {
  try { return JSON.parse(localStorage.getItem(LS) || 'null'); }
  catch (e) { if (window.console && console.warn) console.warn('medshift: хранилище повреждено, база начата заново — ' + (e && e.message)); return null; }
})();
const EMPTY_DB = () => ({
  seq: 1, rev: 0,
  settings: { warnDays: 10, city: 'Красноярск', accent: '#0b5394', dark: 'auto', fontSize: 14 },
  users: [], session: null, bagTypes: [], bags: [], cars: [], ecg: [],
  reports: [], tasks: [], chat: [], sched: { months: [], days: [] },
  tomb: [], bans: [], kitTemplates: [], potents: [],
  /* banTomb — снятые бани. Нужен, чтобы снятие переживало синхронизацию:
     без него устройство, у которого бан уже снят, снова получал бы бан
     с сервера (и наоборот: бан, снятый на одном телефоне, воскресал бы на
     всех). Работает так же, как могилы удалений, только для бана. */
  banTomb: [],
  bagTomb: [], carTomb: [], potTomb: [], tplTomb: [], schedTomb: {},
  shiftGrid: [], shiftTomb: []
});
export function seedBasics() {
  if (!DB.settings.city) DB.settings.city = 'Красноярск';
  if (window.SEED && window.SEED.length && !DB.bagTypes.length) {
    DB.bagTypes.push({ id: 1, name: 'Рабочая сумка', items: window.SEED.map(r => ({ name: r[2], spec: r[3], unit: r[4], qty: r[5], expiry: '', potent: false })) });
  }
  if (!DB.kitTemplates.length) {
    const from = list => (window[list] || []).map(r => ({ name: r[0], spec: '', unit: r[2], qty: r[1], expiry: '', potent: false }));
    // Сильнодействующие брались прямо из большого справочника DRUG_DB. Теперь
    // он грузится по надобности, и на первой установке (когда база пустая и
    // seedBasics() отрабатывает в самом начале) его просто ещё нет — укладка
    // «Сильнодействующие» при этом создавалась пустой. Поэтому те же записи
    // продублированы в seed.js как POTENT_SEED: справочник большой, а нужен
    // он тут от случая к случаю. Состав проверяет тест — равен ли
    // POTENT_SEED тому, что даёт фильтр по DRUG_DB.
    const potentItems = (window.POTENT_SEED || (window.DRUG_DB || []).filter(d => (d.g || '').indexOf('⚕') >= 0).map(d => [d.n, d.s, d.u]))
      .map(r => ({ name: r[0], spec: r[1], unit: r[2], qty: 1, expiry: '', potent: true }));
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
/* ---------- Медиа (фото и файлы смен) ----------
   Раньше картинки лежали прямо в DB.sched, а значит попадали в
   JSON.stringify(DB) при КАЖДОМ сохранении. При двух-трёх выгрузках
   документов это мегабайты base64 — сохранение подвисало на телефоне,
   а при исчерпании квоты localStorage setItem падал и переставал
   сохраняться ВСЁ: сумки, машины, отчёты, сотрудники.
   Теперь img живёт в отдельном ключе, в DB остаётся только метаданные.
   Рендер и просмотр фото работают как раньше — img в памяти остаётся. */
const LS_MEDIA = 'medshift_media';
let _media = null;
function mediaStore() {
  if (_media) return _media;
  try { const p = JSON.parse(localStorage.getItem(LS_MEDIA) || '{}'); _media = (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; }
  catch (e) { _media = {}; }
  return _media;
}
export function mediaDrop(id) { delete mediaStore()[String(id)]; }
/* ---------- Выгрузка и восстановление фото ----------
   В файл базы фото НЕ идут. Картинки в base64 раздувают выгрузку до
   мегабайт — такой файл не отправить в мессенджере, и он молча мешает
   развернуть копию. Поэтому база выгружается компактной (только метаданные),
   а фото и файлы смен — отдельным файлом. Второй довод: фото и так
   синхронизируются со станцией, поэтому при переносе на новый телефон они
   приедут сами, даже если этот файл потерялся. */
export function exportSlim() {
  const o = { ...DB, sched: mediaDetach() };
  // Сессия — личность вошедшего, в файле выгрузки ей не место: иначе
  // импортёр входит под тем, кто выгружал. sync.js в той же ситуации
  // явно вырезает session перед отправкой на сервер.
  delete o.session;
  return o;
}
export function mediaAll() {
  const ms = mediaStore(), out = {};
  Object.keys(ms).forEach(k => { out[k] = ms[k]; });
  return out;
}
export function mediaRestore(src) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) throw new Error('Файл не похож на выгрузку фото');
  const ms = mediaStore();
  let n = 0;
  for (const k in src) if (typeof src[k] === 'string' && src[k].length > 8) { ms[String(k)] = src[k]; n++; }
  try { localStorage.setItem(LS_MEDIA, JSON.stringify(ms)); }
  catch (e) { if (window.toast) window.toast('⚠ Фото не поместились в хранилище'); return 0; }
  mediaAttach();
  return n;
}
/* ---------- Импорт выгрузки ----------
   Именно замена, а не Object.assign. assign не удаляет ключи, поэтому всё,
   чего в файле нет, оставалось на устройстве: проверено вживую — при
   восстановлении выгрузки, сделанной до появления графика смен, старая
   сетка смен оставалась на месте, и восстановление давало смесь двух
   состояний. Ключи на месте всегда (seq/rev/settings), так что лишних
   удалений на живых базах не будет. */
export function adoptDB(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Файл не похож на выгрузку базы');
  for (const k of Object.keys(DB)) if (!(k in raw)) delete DB[k];
  Object.assign(DB, raw);
  normalizeDB();
  return DB;
}
function mediaDetach() {
  // Возвращает копию списка без img и попутно кладёт картинки в отдельный
  // ключ. Осиротевшие записи (фото удалили) отбрасываются, иначе хранилище
  // растёт бесконечно.
  const ms = mediaStore(), alive = {}, out = {};
  ['days', 'months'].forEach(k => (DB.sched[k] || []).forEach(p => {
    if (!p || !p.img) return;
    ms[String(p.id)] = p.img;
    alive[String(p.id)] = 1;
  }));
  Object.keys(ms).forEach(id => { if (!alive[id]) delete ms[id]; });
  ['days', 'months'].forEach(k => {
    out[k] = (DB.sched[k] || []).map(p => {
      if (!p || !p.img) return p;
      const c = {}; Object.keys(p).forEach(x => { if (x !== 'img') c[x] = p[x]; });
      return c;
    });
  });
  return out;
}
function mediaAttach() {
  const ms = mediaStore();
  ['days', 'months'].forEach(k => (DB.sched[k] || []).forEach(p => {
    if (p && !p.img && ms[String(p.id)]) p.img = ms[String(p.id)];
  }));
}
let _doWrite = (notify) => {
  try {
    const slim = mediaDetach();
    // Сначала главная база: медиа не должны иметь права помешать
    // сохранению отчётов и сумок.
    localStorage.setItem(LS, JSON.stringify({ ...DB, sched: slim }));
    try { localStorage.setItem(LS_MEDIA, JSON.stringify(mediaStore())); }
    catch (e) { if (window.toast) window.toast('⚠ Фото/файлы смен не поместились в хранилище'); }
  } catch (e) {
    if (window.toast) window.toast('⚠ Хранилище переполнено — новые правки не сохранятся. Удалите старые фото и файлы смен.');
  }
  if (notify && window.__onSave) window.__onSave();
};
let _write = () => _doWrite(true);
/* saveNow() обязан писать всегда. Раньше он только сбрасывал отложенный
   таймер, и если таймера не было — молчал: вызывающий думал, что сохранил. */
let _flushSave = () => { if (_svT !== null) { clearTimeout(_svT); _svT = null; } _write(); };
/* Немедленная запись без события __onSave — для синхронизатора. Пишет тем же
   путём, что и обычное сохранение (медиа отцепляются в отдельный ключ,
   переполнение ловится), но не будит лишний пуш: adoptState и syncPut сами
   уже находятся внутри цикла обмена. Прямой JSON.stringify(DB) здесь был
   опасен: в базе в памяти лежат base64-фото, они возвращались в главный
   ключ, раздували его на мегабайты и упирались в квоту — а квота тогда
   глушится, и новые правки молча перестают сохраняться. */
export function saveLocalNow() { if (_svT !== null) { clearTimeout(_svT); _svT = null; } _doWrite(false); }
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
  if (!DB || typeof DB !== 'object' || Array.isArray(DB)) DB = EMPTY_DB();
  const def = EMPTY_DB();
  for (const k in def) if (DB[k] === undefined) DB[k] = def[k];
  // Проверка на null обязательна: в базе, пришедшей из Firebase или из
  // импортированного файла, settings/sched могли быть null, и следующая
  // строка (DB.sched[k]) роняла приложение на старте.
  if (!DB.settings || typeof DB.settings !== 'object') DB.settings = def.settings;
  if (!DB.sched || typeof DB.sched !== 'object') DB.sched = def.sched;
  if (!DB.settings.fontSize) DB.settings.fontSize = 14;
  // warnDays проверяем числом, а не на «есть ли поле». Раньше его не
  // восстанавливало вовсе: в базе без этого поля `(warnDays || 0)` давало 0,
  // и ВСЕ тревоги по срокам молча выключались — ни одно место не
  // сообщало об этом, просто переставали гореть просрочки.
  const wd = +DB.settings.warnDays;
  if (!Number.isFinite(wd) || wd < 0 || wd > 365) DB.settings.warnDays = 10;
  const fs = +DB.settings.fontSize;
  if (!Number.isFinite(fs) || fs < 10 || fs > 30) DB.settings.fontSize = 14;
  if (DB.settings.dark !== 'auto' && DB.settings.dark !== 'dark' && DB.settings.dark !== 'light') DB.settings.dark = 'auto';
  // accent уходит в style="background:…" без экранирования, а write-guard
  // стоял только в setAccent. Через импорт JSON-файла и через adoptState
  // в базу могло попасть что угодно — проверяем здесь, на слиянии.
  if (!/^#[0-9a-f]{6}$/i.test(String(DB.settings.accent || ''))) DB.settings.accent = '#0b5394';
  if (DB.settings.leaves !== undefined) DB.settings.leaves = !!DB.settings.leaves;
  ['days', 'months'].forEach(k => { if (!Array.isArray(DB.sched[k])) DB.sched[k] = []; });
  ['users','bags','cars','chat','tasks','reports','ecg','tomb','bans','banTomb','kitTemplates','potents','bagTomb','carTomb','potTomb','tplTomb','bagTypes','shiftGrid','shiftTomb'].forEach(k => { if (!Array.isArray(DB[k])) DB[k] = []; });
  if (typeof DB.schedTomb !== 'object' || DB.schedTomb === null) DB.schedTomb = {};
  seedBasics();
  // Записи, пришедшие извне, могут быть null — иначе u.cars ронял бы normalizeDB()
  DB.users = DB.users.filter(u => u && typeof u === 'object');
  DB.users.forEach(u => { if (typeof u.name !== 'string') u.name = String(u.name == null ? '' : u.name); if (typeof u.bday !== 'string') u.bday = String(u.bday == null ? '' : u.bday); u.cars = Array.isArray(u.cars) ? u.cars : []; u.bags = Array.isArray(u.bags) ? u.bags : []; });
  DB.bags = DB.bags.filter(b => b && typeof b === 'object');
  DB.bags.forEach(b => { b.items = Array.isArray(b.items) ? b.items : []; b.kits = Array.isArray(b.kits) ? b.kits : []; });
  DB.cars = DB.cars.filter(c => c && typeof c === 'object');
  DB.cars.forEach(c => { c.equip = Array.isArray(c.equip) ? c.equip : []; c.kits = Array.isArray(c.kits) ? c.kits : []; c.kits = c.kits.filter(k => k && typeof k === 'object'); c.kits.forEach(k => { k.items = Array.isArray(k.items) ? k.items : []; }); });
  // ---------- Владелец станции ----------
  // Раньше админом становился тот, кто зарегистрировался первым: правило
  // стояло в месте регистрации. Стоило ему удалить свой аккаунт (кнопка
  // «Удалить мой аккаунт» есть у всех) — и админом становился тот, кто
  // зарегистрируется следующим, то есть новый человек. Для работающей
  // станции это неприемлемо: человек один ушёл, а права уехали к новичку.
  // Теперь владелец запоминается один раз и навсегда.
  // Никого не удаляем и ничьих прав не отбираем: только гарантируем, что
  // владелец остаётся админом, даже если его роль испортили переносом базы.
  if (!DB.ownerId) {
    const boss = DB.users.filter(u => u.role === 'admin' || u.role === 'lead')[0]
      || DB.users.slice().sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))[0];
    if (boss) { DB.ownerId = boss.id; save(); }
  } else {
    const o = DB.users.filter(u => u.id === DB.ownerId)[0];
    // Владелец удалил аккаунт — права переходят следующему по времени,
    // иначе на станции вообще не осталось бы человека с правами.
    if (!o) {
      const next = DB.users.slice().sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))[0];
      if (next) { DB.ownerId = next.id; save(); }
    } else if (o.role !== 'admin' && o.role !== 'lead') {
      o.role = 'admin'; save();
    }
  }
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
/* Слияние содержимого двух одноимённых записей.
   Записи с одинаковым именем и разными id — это почти всегда правки одной
   и той же сумки/машины/укладки, сделанные с разных телефонов. Раньше
   побеждала одна запись целиком, а содержимое второй уходило молча:
   человек добавил позицию на станции, она пропала при первом же синке.
   Выживший выбирается прежним правилом (меньший id), чтобы не сдвинуть
   назначения и отчёты, — а вот содержимое складывается в него целиком. */
function itemKey(it) { return normName((it && it.name) || '') + '|' + ((it && it.spec) || '') + '|' + ((it && it.expiry) || ''); }
function mergeItemsInto(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return;
  const seen = {};
  a.forEach(it => { seen[itemKey(it)] = 1; });
  b.forEach(it => { const k = itemKey(it); if (seen[k]) return; seen[k] = 1; a.push(it); });
}
function mergeKitsInto(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return;
  b.forEach(kb => {
    const key = normName((kb && kb.name) || '');
    const ka = a.find(x => normName(x.name || '') === key);
    if (ka) mergeItemsInto(ka.items, kb.items);
    else a.push(kb);
  });
}
function mergeDupContent(survivor, other, coll) {
  if (!survivor || !other) return;
  mergeItemsInto(survivor.items, other.items);
  mergeKitsInto(survivor.kits, other.kits);
  if (coll === 'cars' && Array.isArray(other.equip)) {
    if (!Array.isArray(survivor.equip)) survivor.equip = [];
    const seen = {};
    survivor.equip.forEach(e => { seen[String(e.id)] = 1; const n = normName(e.name || ''); if (n) seen[n] = 1; });
    other.equip.forEach(e => {
      const id = String(e.id), n = normName(e.name || '');
      if (seen[id] || (n && seen[n])) return;
      seen[id] = 1; if (n) seen[n] = 1;
      survivor.equip.push(e);
    });
  }
  // Скалярные поля переносим только в пустую сторону: табличка, госномер,
  // заряд и дефект из дубля не должны затирать уже вписанное.
  ['desc', 'typeId', 'plates', 'charge', 'defect'].forEach(k => {
    if ((survivor[k] === '' || survivor[k] == null) && other[k] !== '' && other[k] != null) survivor[k] = other[k];
  });
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
      // Выживший определяется заранее, чтобы содержимое сложилось именно
      // в ту запись, которая останется в базе.
      const survivor = (drop.id < keep.id) ? drop : keep;
      mergeDupContent(survivor, (survivor === keep) ? drop : keep, coll);
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
/* Что сотрудник видит и за что отвечает.
   Руководитель и админ — всё. Сотрудник — назначенные ему сумки и машины.
   НО если назначений нет ни одного, показываем ВСЁ. Так решено намеренно:
   назначения ставятся вручную («Ответственность»), а ограничение появилось
   позже, и станция могла какое-то время работать без них. Строгий вариант
   был бы опаснее: человек увидел бы ноль просрочки и спокойно отчитался
   «всё проверил», а по процессу за пропуск штрафуют. Лучше лишняя строчка
   в списке, чем человек, который ничего не увидел. Как только назначения
   появятся, ограничение начнёт работать само.
   Права на правку от этого не расширяются: она по-прежнему по назначению
   (canUseBag), то есть всё видно, но руками ничего не трогаем. */
export function myBags() {
  const u = me(); if (!u) return [];
  if (isBoss()) return DB.bags;
  const свои = DB.bags.filter(b => (u.bags || []).includes(b.id));
  return свои.length ? свои : DB.bags;
}
export function myCars() {
  const u = me(); if (!u) return [];
  if (isBoss()) return DB.cars;
  const свои = DB.cars.filter(c => (u.cars || []).includes(c.id));
  return свои.length ? свои : DB.cars;
}
/** Назначений нет — показываем всё. Экраны используют это, чтобы объяснить
    человеку, почему список вдруг полный, и напомнить про руководителя. */
export function безНазначений() {
  const u = me(); if (!u || isBoss()) return false;
  return !(u.bags || []).length && !(u.cars || []).length;
}

/* Право распоряжаться конкретной сумкой.
   Правило станции: руководитель и админ распоряжаются всем, сотрудник —
   только тем, на что он назначен. Назначений может быть несколько (людей
   переставляют с машины на машину и с сумки на сумку), и право приходит
   вместе с каждым назначением.
   По машинам правило другое, и отдельной функции здесь нет намеренно:
   машины видны и открыты всем (сотрудник приходит на любую и отчитывается),
   а перечень оборудования с номерами ОВМ, статусы, укладки, название,
   госномер и удаление машины ведёт только isBoss(). Поэтому назначение на
   машину прав не даёт, и проверять его нечего.
   Правило держится одним куском, потому что та же проверка нужна и на
   экране, и в обработчике удаления. Копии разошлись бы так же, как разошлись
   копии статуса отчёта: в одном месте забыли, и кнопка молча показывалась
   всем. */
export function canUseBag(id) {
  const u = me(); if (!u) return false;
  if (isBoss()) return true;
  return (u.bags || []).some(b => String(b) === String(id));
}
/* Список истекающего и просроченного — по ответственности.
   Руководитель и админ видят всё. Сотрудник — только то, за что отвечает:
   назначенные ему сумки, назначенные машины и их укладки. Просрочка в чужой
   сумке сотруднику не нужна, и раньше она попадала и в отчёт, и в тревоги на
   его экране: человек получал красный отчёт из-за сумки, которую не вёл.
   Комплекты НС/ПВ/СД (DB.potents) назначения не имеют, они общие для станции,
   поэтому видны всем: наркотики — дело общее, и скрыть просрочку по ним
   опаснее, чем показать лишнее.
   Отчёт по смене считает просрочку этой же функцией, поэтому статус отчёта
   тоже отражает только то, за что человек отвечает. */
export function soonList() {
  const _k = _ck();
  if (_soonC && _soonC.k === _k) return _soonC.v;
  const out = [];
  const bad = it => { const c = expClass(it && it.expiry); return c === 'exp' || c === 'soon'; };
  myBags().forEach(b => (b.items || []).forEach(it => {
    if (bad(it)) out.push({ type: 'bag', bagId: b.id, name: b.name, item: it });
  }));
  myCars().forEach(c => (c.kits || []).forEach(k => (k.items || []).forEach(it => {
    if (bad(it)) out.push({ type: 'kit', carId: c.id, kitId: k.id, carName: c.name, kitName: k.name, item: it });
  })));
  (DB.potents || []).forEach(k => (k.items || []).forEach(it => {
    if (bad(it)) out.push({ type: 'pot', potId: k.id, name: k.name, item: it });
  }));
  _soonC = { k: _k, v: out };
  return out;
}
export function alerts() {
  const _k = _ck();
  if (_alC && _alC.k === _k) return _alC.v;
  const out = [];
  const so = soonList();
  // Позиции без срока годности не проверяются нигде: ни просрочка, ни отчёт,
  // ни тревоги их не видят. По процессу станции сотрудник отвечает за пропуск,
  // поэтому такая позиция должна быть названа вслух. Считаем по тому, за что
  // человек отвечает, и показываем одним пунктом, чтобы не засорять список.
  let безСрока = 0;
  myBags().forEach(b => { безСрока += countNoExpiry(b.items); });
  myCars().forEach(c => (c.kits || []).forEach(k => { безСрока += countNoExpiry(k.items); }));
  if (безСрока) {
    out.push({
      t: 'Без срока годности: ' + безСрока + ' поз. — их невозможно проверить',
      l: 'bNoDate', noDate: true
    });
  }
  if (so.length) out.push({ t: 'Истекает/просрочено: ' + so.length + ' поз.', l: 'bSoon', items: so });
  // Дефекты — тоже по ответственности: раньше сотрудник получал тревогу по
  // чужой машине, а счётчик главной и тревоги считались по разным правилам.
  myCars().forEach(c => (c.equip || []).forEach(e => { if (e.status === 'def') out.push({ t: c.name + ': дефект ' + (e.name || ''), l: 'bExp', carId: c.id }); }));
  if (isBoss()) (DB.reports || []).forEach(r => {
    if (r.viewed || r.status === 'green') return;
    // Машина может быть не указана (отчёт со старого телефона) — тогда в
    // тревоге не должно быть пустых скобок. Цвет берём из общей формулы
    // статуса, чтобы «нет статуса» не выглядело как красный вызов.
    const s = reportStatusOf(r);
    out.push({
      t: 'Непрочитанный отчёт: ' + (r.car || 'без машины') + ' (' + (r.user || 'без подписи') + ')',
      l: s.cls === 'bR' ? 'bR' : 'bY', reportId: r.id
    });
  });
  _alC = { k: _k, v: out };
  return out;
}
export function badgeExp(iso) {
  const key = (DB.settings.warnDays || 0) + '|' + todayMid() + '|' + (iso || '');
  if (_badgeC[key] !== undefined) return _badgeC[key];
  const d = daysLeft(iso);
  let v;
  if (d === null) v = '<span class="badge bWarn">нет срока</span>';
  else if (d < 0) v = '<span class="badge bExp">просрочен ' + (-d) + ' дн</span>';
  else if (d <= (DB.settings.warnDays || 0)) v = '<span class="badge bSoon">осталось ' + d + ' дн</span>';
  else if (d <= 30) v = '<span class="badge bWarn">' + d + ' дн</span>';
  else v = '<span class="badge bOk">' + d + ' дн</span>';
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
// Сравнение по строке: id приходит и как число (из базы), и как строка
// (из data-arg). Строгий indexOf() при этом молча не срабатывал, и удалённый
// сотрудник считался живым — вместе со своим PIN-хэшем.
const sameId = (a, b) => String(a) === String(b);
export function isDead(id) { return (DB.tomb || []).some(x => sameId(x, id)) || (DB.bans || []).some(b => sameId(b && b.id, id)); }
export function isBannedName(n) { return (DB.bans || []).some(b => normName(b.name) === normName(n)); }
export function me() { for (let i = 0; i < DB.users.length; i++) if (DB.users[i].id === DB.session && !isDead(DB.users[i].id)) return DB.users[i]; return null; }
export function isBoss() { const u = me(); return !!u && (u.role === 'admin' || u.role === 'lead'); }
export function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
// null, если даты нет или она неразбираема — иначе NaN молча ломает
// сравнения вида `d < 0` / `d <= warnDays` (просрочка просто не покажется)
export function daysLeft(iso) { if (!iso) return null; const d = new Date(iso + 'T00:00:00'); const v = d.getTime(); if (!Number.isFinite(v)) return null; return Math.round((v - todayMid()) / 864e5); }
/* Классификация срока годности. Сравнивать daysLeft() с числом напрямую
   нельзя: он возвращает null для пустой или неразбираемой даты, а в JS
   `null <= 10` === true и `null < 0` === false. Из-за этого позиция с
   битым форматом даты попадала в «истекает», а просроченная в «просрочено»
   не попадала — отчёт уходил жёлтым вместо красного.
   Возвращает: 'exp' | 'soon' | 'ok' | 'none'. */
export function expClass(iso) {
  const d = daysLeft(iso);
  if (d === null) return 'none';
  if (d < 0) return 'exp';
  if (d <= (DB.settings.warnDays || 0)) return 'soon';
  return 'ok';
}
// Экранирует и одинарную кавычку: сегодня атрибутов в одинарных кавычках
// нет, но это единственная защита, если такой появится.
export function esc(s) { s = s == null ? '' : String(s); return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;').split("'").join('&#39;'); }
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
mediaAttach();
if (!DB._welcome) { DB._welcome = 1; if (DB.chat.length === 0) DB.chat.push({ id: 'wl' + uid(), ts: Date.now(), author: '🐱 Феликс', room: 'общая', text: 'Привет! Я Феликс 🐱 Напиши !шутка или позови меня по имени.' }); save(); }
export function purgeSched() {
  const now = Date.now();
  DB.sched.days = DB.sched.days.filter(p => p && now - (p.ts || 0) < 2 * 864e5);
  // Раньше здесь стояло p.month.split('-') без проверки: запись счёта с
  // отсутствующим month роняла приложение на каждом запуске.
  DB.sched.months = DB.sched.months.filter(p => {
    if (!p || typeof p.month !== 'string') return false;
    const q = p.month.split('-');
    const y = +q[0], m = +q[1];
    if (!y || !m) return false;
    const cut = new Date(y, m, 3).getTime();
    return Number.isFinite(cut) && now < cut;
  });
}
window.DB = DB;
window.LS = LS;
window.saveNow = saveNow;
window.__flushSave = _flushSave;
