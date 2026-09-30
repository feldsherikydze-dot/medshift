/* =====================================================================
   Тестовое окружение: минимальные шимы localStorage/window.
   Подключать ДО импорта модулей приложения — db.js читает
   localStorage на этапе загрузки модуля.
   ===================================================================== */

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
  setItem(k, v) { this.m.set(String(k), String(v)); }
  removeItem(k) { this.m.delete(String(k)); }
  clear() { this.m.clear(); }
  key(i) { return Array.from(this.m.keys())[i] ?? null; }
  get length() { return this.m.size; }
}

const win = {
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage: null,
  toast: () => {},
  render: () => {},
  renderNav: () => {},
  setTimeout: (...a) => setTimeout(...a),
  clearTimeout: (...a) => clearTimeout(...a),
  setInterval: () => 0,
  clearInterval: () => {},
};
win.window = win;

globalThis.localStorage = new MemStorage();
globalThis.window = win;

/* ---- подставные элементы по id ----
   Код вида «нашёл элемент и поправил его на месте» (например подвал,
   который дописывает себе число препаратов) не проверяется, если
   getElementById всегда возвращает null. Здесь тест сам кладёт нужный
   элемент и потом смотрит, что с ним стало. */
const fakeEls = new Map();
globalThis.__setEl = (id, el) => { fakeEls.set(id, el); return el; };
globalThis.__resetEls = () => fakeEls.clear();

/* Настоящий head приложения. Его сохраняем до подмены на «сеть сломана»,
   чтобы networkUp() возвращала всё как было. */
let realHead = null;

/* ---- выполнение файлов приложения как <script> ----
   drugs.js и seed.js — обычные скрипты: верхнеуровневый `var` в них попадает
   в window (в браузере это так и есть). Чтобы это можно было проверить без
   браузера, файлы исполняются в контексте шимового window: vm даёт
   отдельную realm, где `var DRUG_DB=...` становится свойством window.
   document.head.appendChild скрипта тоже перехватывается — на этом и
   держится проверка «справочник догружается по требованию». */
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
const projRoot = new URL('../', import.meta.url);
const ctx = vm.createContext(win);

/** Выполнить файл приложения в контексте window. null — файла нет. */
export function runScript(name) {
  const file = new URL(String(name).replace(/^\.\//, ''), projRoot);
  if (!existsSync(file)) return null;
  vm.runInContext(readFileSync(file, 'utf8'), ctx, { filename: name });
  return win;
}

/** Сеть на замке: любой <script> падает с onerror. Обратный ход — networkUp(). */
export function networkDown() {
  globalThis.document.head = {
    appendChild(node) {
      // Именно асинхронно, как в браузере. Синхронный onerror вводил бы в
      // заблуждение: в браузере событие загрузки не может прийти внутри
      // appendChild, и код, рассчитанный на асинхронность, сломался бы
      // только на этом неправдоподобном шиме.
      setTimeout(() => { if (node.onerror) node.onerror(new Error('offline')); }, 0);
    }
  };
}
export function networkUp() {
  globalThis.document.head = realHead;
}

/* Настоящий head: подставные <script> исполняются как в браузере, и событие
   загрузки приходит асинхронно — тоже как в браузере. */
realHead = {
  appendChild(node) {
    const name = String(node.src || '').split('?')[0].replace(/^\.\//, '');
    setTimeout(() => {
      let ok = false;
      try { ok = !!runScript(name); } catch (e) { if (node.onerror) node.onerror(e); return; }
      if (ok) { if (node.onload) node.onload(); }
      else if (node.onerror) node.onerror(new Error('404 ' + name));
    }, 0);
  }
};

globalThis.document = {
  visibilityState: 'visible', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, body: null,
  createElement: () => ({ style: {}, appendChild() {}, classList: { add() {}, remove() {} } }),
  getElementById: id => (fakeEls.has(id) ? fakeEls.get(id) : null),
  head: realHead
};

/* ---- service worker как настоящий обработчик запросов ----
   Стратегию офлайна нельзя проверить, глядя в текст sw.js: баг был именно
   в том, КАКОЙ ответ возвращается. Поэтому sw.js исполняется по-настоящему,
   а fetch и caches подставлены. Тест сам решает, что «ответила сеть»
   (200, 502, 404, обрыв) и что лежит в кэше, и получает ровно тот ответ,
   который увидел бы браузер.
   net — объект:
     { status: 200, body: '...' }  — сеть ответила;
     { throws: true }              — сети нет вовсе;
     cache: { 'seed.js': '...' }   — что лежит в кэше. */
export async function swAnswer(url, net) {
  const store = Object.assign({}, net.cache || {});
  const listeners = {};
  const sw = {
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    skipWaiting() {}, clients: { claim: () => Promise.resolve() },
    location: { origin: 'https://med.test' },
    console
  };
  const mkRes = (status, body) => ({
    status, ok: status >= 200 && status < 300,
    clone() { return mkRes(status, body); },
    text() { return Promise.resolve(body); }
  });
  const cacheObj = {
    put: (req, res) => { store[new URL(req.url || req).pathname] = '(put)'; return Promise.resolve(); },
    addAll: () => Promise.resolve(),
    add: () => Promise.resolve(),
    matchKeys: null
  };
  const swGlobal = {
    self: sw, console,
    // В service worker `location` — глобальная, а не свойство self.
    location: { origin: 'https://med.test' },
    Response: class { constructor(b, o) { this.body = b; this.status = o && o.status; } },
    Request: class { constructor(u, o) { this.url = u; this.method = (o && o.method) || 'GET'; this.mode = (o && o.mode) || 'no-cors'; } },
    URL, Promise, setTimeout, fetch: () => net.throws ? Promise.reject(new TypeError('offline')) : Promise.resolve(mkRes(net.status, net.body || '')),
    caches: {
      open: () => Promise.resolve(cacheObj),
      match: req => {
        const key = new URL(req.url || req).pathname.replace(/^\//, '');
        return Promise.resolve(store[key] !== undefined ? mkRes(200, store[key]) : undefined);
      },
      keys: () => Promise.resolve(['medshift-cache-test']),
      delete: () => Promise.resolve(true)
    }
  };
  const swCtx = vm.createContext(swGlobal);
  vm.runInContext(readFileSync(new URL('sw.js', projRoot), 'utf8'), swCtx, { filename: 'sw.js' });
  const req = new swGlobal.Request(url.startsWith('http') ? url : 'https://med.test/' + url,
    { mode: url.indexOf('index.html') >= 0 ? 'navigate' : 'no-cors' });
  let answer = null;
  const event = {
    request: req,
    waitUntil: () => {},
    respondWith: p => { answer = p; }
  };
  (listeners.fetch || []).forEach(fn => fn(event));
  if (!answer) return { черезSW: false };
  const res = await answer;
  return {
    черезSW: true,
    статус: res.status,
    тело: typeof res.text === 'function' ? await res.text() : ''
  };
}

/* ---- микро-фреймворк ----
   Группы регистрируются на верхнем уровне файла, а тесты внутри них — уже
   в момент выполнения (часто после await). Поэтому у каждой группы свой
   список тестов, иначе все заголовки встали бы в очередь раньше тестов.
   Выполнение строго последовательное: тесты делят один localStorage. */
let passed = 0, failed = 0;
const failures = [];
const suites = [];
let current = null;

export function suite(name, fn) { suites.push({ name, fn, tests: [] }); }
export function test(name, fn) { (current ? current.tests : suites).push({ name, fn }); }

async function runOne(t, suiteName) {
  try {
    await t.fn();
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + t.name);
  } catch (e) {
    failed++;
    failures.push({ suite: suiteName, name: t.name, err: e });
    console.log('  \x1b[31m✗\x1b[0m ' + t.name + '\n      \x1b[31m' + (e && e.message ? e.message : e) + '\x1b[0m');
  }
}

export async function runAll() {
  for (const s of suites) {
    if (s.t === 'test') { await runOne(s, ''); continue; }   // тест без группы
    console.log('\n\x1b[1m' + s.name + '\x1b[0m');
    current = s;
    await s.fn();
    for (const t of s.tests) await runOne(t, s.name);
    current = null;
  }
}

export function report() {
  console.log('\n' + '─'.repeat(52));
  if (!failed) {
    console.log('\x1b[32m\x1b[1mВсе тесты прошли: ' + passed + '\x1b[0m');
  } else {
    console.log('\x1b[31m\x1b[1mПровалено: ' + failed + ', прошло: ' + passed + '\x1b[0m');
    failures.forEach(f => console.log('  • [' + f.suite + '] ' + f.name + '\n    ' + String(f.err.stack || f.err).split('\n').slice(0, 3).join('\n    ')));
  }
  console.log('─'.repeat(52));
  return failed;
}
export function assert(cond, msg) { if (!cond) throw new Error(msg || 'ожидалось истинное значение, получено ' + JSON.stringify(cond)); }
export function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg ? msg + ': ' : '') + 'ожидалось ' + b + ', получено ' + a);
}
export function throws(fn, msg) {
  try { fn(); } catch { return; }
  throw new Error(msg || 'ожидалось исключение');
}

/* ---- календарные помощники (тесты не должны протухать со временем) ---- */
export function iso(offsetDays) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function resetStorage() { globalThis.localStorage.clear(); }
export function seedDB(obj) { globalThis.localStorage.setItem('medshift_v3', JSON.stringify(obj)); }
/** фиксированный id устройства, чтобы DEVSALT был предсказуемым */
export function seedDev(id) { globalThis.localStorage.setItem('medshift_dev', id); }
