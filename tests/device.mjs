/* =====================================================================
   Одно «устройство» сквозного теста синхронизации.

   Запускается отдельным процессом node: sync.js импортирует './db.js'
   без вопроса в имени, поэтому два экземпляра БД в одном процессе
   невозможны — а нам нужны именно два независимых устройства.
   Именно так ведёт себя настоящая станция: два телефона, одна база.

   Запуск:  node tests/device.mjs <сценарий> <url сервера> <файл с БД>
   Печатает в stdout итоговую БД одним JSON — её и проверяет sync-e2e.mjs.
   ===================================================================== */
import { readFileSync } from 'node:fs';

const [, , scenario, serverUrl, dbFile] = process.argv;

/* --- шимы ДО импорта модулей приложения: db.js читает localStorage
       на этапе загрузки модуля --- */
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
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  localStorage: null, toast: () => {}, render: () => {}, renderNav: () => {},
  setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a),
  setInterval: () => 0, clearInterval: () => {},
};
win.window = win;
globalThis.localStorage = new MemStorage();
globalThis.window = win;
globalThis.document = {
  visibilityState: 'visible', addEventListener() {},
  getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
  body: null, createElement: () => ({ style: {}, appendChild() {}, classList: { add() {}, remove() {} } })
};
if (dbFile) localStorage.setItem('medshift_v3', readFileSync(dbFile, 'utf8'));

/* --- адрес сервера переопределяем ДО первого сетевого запроса --- */
const cfg = await import('../config.js');
cfg.FB_CONF.databaseURL = serverUrl;
globalThis.window.__fbToken = 'test-token';

const db = await import('../db.js');
const sync = await import('../sync.js');

/* Импорт состояния, которое оставил предыдущий шаг: устройство могло
   получить данные с сервера, и следующий сценарий должен видеть
   накопленное, а не стартовое состояние. */
const out = { scenario, db: null, err: null };
const dump = () => JSON.parse(JSON.stringify(db.DB));

/* Полный круг: забрать с сервера и отдать своё.
   Забор делает syncInit() — он приватную syncPull() вызывает один раз
   при старте; экспортировать её ради теста не будем, публичный интерфейс
   приложения из-за тестов менять нельзя. Отправка отложена на
   SYNC_PUSH_DELAY_MS, поэтому после неё ждём, а не гадаем. */
const wait = ms => new Promise(r => setTimeout(r, ms));
async function roundTrip(ms = 1400) {
  sync.syncInit();
  await wait(300);
  sync.syncPush();
  await wait(ms);
}

try {
  switch (scenario) {

    case 'seed': {
      /* Первое устройство заводит станцию: сотрудники, машина, сумка, график. */
      db.DB.users = [
        { id: 1, name: 'Иванов Иван', pin: '1111', role: 'admin', cars: [1], bags: [1], bday: '' },
        { id: 2, name: 'Петрова Мария', pin: '2222', role: 'user', cars: [1], bags: [1], bday: '' }
      ];
      db.DB.bags = [{ id: 1, name: 'Сумка 1', items: [{ name: 'Аспирин', qty: 1 }] }];
      db.DB.cars = [{ id: 1, name: '1', equip: [], kits: [] }];
      db.DB.shiftGrid = [{ date: '2026-10-01', brigade: 'А', car: '1', staff: 'Иванов', note: '', upd: 100 }];
      db.DB.session = 1;
      await roundTrip();
      break;
    }

    case 'pull': {
      /* Второе устройство пустое: забирает всё со станции. */
      await roundTrip();
      break;
    }

    case 'add-bag': {
      /* Второе устройство работает офлайн-как: создало свою сумку. */
      db.DB.bags.push({ id: 2, name: 'Сумка 2 (второе устройство)', items: [] });
      await roundTrip();
      break;
    }

    case 'pull2': {
      await roundTrip();
      break;
    }

    case 'del-bag': {
      /* Первое устройство удаляет сумку. Идентификатор приходит строкой —
         ровно как из data-arg в кнопке. */
      db.DB.bags = db.DB.bags.filter(b => String(b.id) !== '1');
      db.DB.bagTomb = (db.DB.bagTomb || []).concat([1]);
      db.save();
      await roundTrip();
      break;
    }

    case 'pull3': {
      await roundTrip();
      break;
    }

    case 'del-bag-wrong-type': {
      /* Тот же сценарий, но могила положена СТРОКОЙ — исторически
         delBag именно так и делал, и могилы не срабатывали. */
      db.DB.bags = db.DB.bags.filter(b => String(b.id) !== '2');
      db.DB.bagTomb = (db.DB.bagTomb || []).concat(['2']);
      db.save();
      await roundTrip();
      break;
    }

    case 'pull4': {
      await roundTrip();
      break;
    }

    case 'shift-edit': {
      /* Правка графика на первом устройстве. */
      const row = db.DB.shiftGrid.find(r => r.date === '2026-10-01');
      if (row) { row.staff = 'Петрова'; row.upd = 500; }
      db.save();
      await roundTrip();
      break;
    }

    case 'shift-add': {
      /* Второе устройство дописывает другую строку, пока первое офлайн. */
      db.DB.shiftGrid.push({ date: '2026-10-02', brigade: 'Б', car: '2', staff: 'Сидоров', note: '', upd: 500 });
      db.save();
      await roundTrip();
      break;
    }

    case 'pull5': {
      await roundTrip();
      break;
    }

    case 'del-shift': {
      db.DB.shiftGrid = db.DB.shiftGrid.filter(r => r.date !== '2026-10-02');
      db.DB.shiftTomb = (db.DB.shiftTomb || []).concat(['2026-10-02|Б|2']);
      db.save();
      await roundTrip();
      break;
    }

    case 'pull6': {
      await roundTrip();
      break;
    }

    case 'del-user': {
      /* Удаление сотрудника: без этого удалённый возвращался с сервера
         вместе со своим PIN-хэшем. */
      db.DB.users = db.DB.users.filter(u => String(u.id) !== '2');
      db.DB.tomb = (db.DB.tomb || []).concat([2]);
      db.save();
      await roundTrip();
      break;
    }

    case 'pull7': {
      await roundTrip();
      break;
    }

    case 'del-shift-again': {
      /* Устройство офлайн правит удалённую на сервере строку: правка
         не должна ни воскресить строку, ни затереть удаление. */
      db.DB.shiftGrid.push({ date: '2026-10-02', brigade: 'Б', car: '2', staff: 'Возрождён', note: '', upd: 9999 });
      db.save();
      await roundTrip();
      break;
    }

    case 'pull8': {
      await roundTrip();
      break;
    }

    case 'report': {
      db.DB.reports.push({
        id: 'rp1', ts: Date.now(), author: 'Петрова Мария', userId: 2,
        car: '1', status: 'green', exp: [], rem: '', defs: []
      });
      await roundTrip();
      break;
    }

    case 'pull9': {
      await roundTrip();
      break;
    }

    default:
      throw new Error('неизвестный сценарий: ' + scenario);
  }
  out.db = dump();
} catch (e) {
  out.err = String(e && e.stack || e);
}

process.stdout.write(JSON.stringify(out));
process.exit(0);
