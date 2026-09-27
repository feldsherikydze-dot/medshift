import './db.js';
import './sync.js';
import './auth.js';
import './ui.js';
import './weather.js';
import './seasons.js';
import './chat.js';
import './reports.js';
import './views.js';

import { DB, save, saveNow, uid, me, isBoss, esc, todayStr, daysLeft, expClass, normName, isDead, isBannedName, purgeSched, myBags, myCars, безНазначений, canUseBag, soonList, alerts, bdayToday, mkKit, badgeExp, dedupe, termSanitize, adoptDB, mediaDrop, exportSlim, mediaAll, mediaRestore } from './db.js';
import { FB_CONF, APP, LS_KEYS, LIMITS } from './config.js';
import { syncInit, syncTest, presBeat, fbUrl, restGet, restPut, restDelete, adoptState, SYNCSTAT, schedSync, serverCleanup, bumpSchedMeta, alive, purgeLocal } from './sync.js';
import { restoreToken, verifyPin, pinCheck, setPin, loginAs, logout, checkSessionExpiry, enableBiometric, disableBiometric, biometricLogin, banUser, unbanUser, signIn, errText } from './auth.js';
import { toast, openDlg, closeDlg, ask, askText, applyTheme, applyFontSize, updHead, renderNav, render, go, tab } from './ui.js';
import { loadWeather, showForecast, startClock, wIcon, clearWeatherCache } from './weather.js';
import { shiftKeyOf, parseShiftCsv, parseItemList, fsHintText, isIsoDate } from './logic.js';
import { withDrugs, drugsReady, preloadDrugs } from './drugload.js';
import { updateFoot } from './views.js';
import { seasonHtml, startLeaves, stopLeaves } from './seasons.js';
import { chatView, sendMsg, clearChat, botJoke, decorateChat, announceLogin } from './chat.js';
import { reportsView, openRep, submitRep, delReport, viewReport, resolveReport, unresolveReport, downloadReport, printReport, reportBadge, expiredItemText } from './reports.js';
import './views.js';

// ---------- Экспорт в window (для onclick из views.js) ----------
Object.assign(window, {
  DB, save, saveNow, uid, me, isBoss, esc, todayStr, daysLeft, normName, isDead, isBannedName,
  purgeSched, myBags, myCars, безНазначений, canUseBag, soonList, alerts, bdayToday, mkKit, badgeExp, dedupe, termSanitize,
  syncInit, syncTest, presBeat, fbUrl, restGet, restPut, restDelete, adoptState, SYNCSTAT,
  schedSync, serverCleanup, bumpSchedMeta, alive, purgeLocal,
  restoreToken, verifyPin, pinCheck, setPin, loginAs, logout, checkSessionExpiry,
  enableBiometric, disableBiometric, biometricLogin, banUser, unbanUser, signIn, errText,
  toast, openDlg, closeDlg, ask, askText, applyTheme, applyFontSize, updHead, renderNav, render, go,
  loadWeather, showForecast, startClock, wIcon, clearWeatherCache,
  seasonHtml, startLeaves, stopLeaves,
  chatView, sendMsg, clearChat, botJoke, decorateChat, announceLogin,
  reportsView, openRep, submitRep, delReport, viewReport, resolveReport, unresolveReport,
  downloadReport, printReport, reportBadge, expiredItemText,
  FB_CONF, APP, LS_KEYS, LIMITS
});

// ---------- Недостающие функции (из оригинального кода) ----------
let curBag = null, curCar = null, curKit = null;
let curTpl = false, curPot = false, curPotKit = null;
let openTplId = null, tplSearch = '', refSearch = '';
let schedSub = 'days';
let highlightItem = null;
let editBag = null, editKit = null, editEquip = null, editTpl = null;
let loginFor = null;
const defState = (name, getter, setter) => Object.defineProperty(window, name, { configurable: true, get: getter, set: setter });
defState('curBag', () => curBag, v => { curBag = v; });
defState('curCar', () => curCar, v => { curCar = v; });
defState('curKit', () => curKit, v => { curKit = v; });
defState('curTpl', () => curTpl, v => { curTpl = v; });
defState('curPot', () => curPot, v => { curPot = v; });
defState('curPotKit', () => curPotKit, v => { curPotKit = v; });
defState('openTplId', () => openTplId, v => { openTplId = v; });
defState('tplSearch', () => tplSearch, v => { tplSearch = v; });
defState('refSearch', () => refSearch, v => { refSearch = v; });
defState('schedSub', () => schedSub, v => { schedSub = v; });
defState('highlightItem', () => highlightItem, v => { highlightItem = v; });
defState('editBag', () => editBag, v => { editBag = v; });
defState('editKit', () => editKit, v => { editKit = v; });
defState('editEquip', () => editEquip, v => { editEquip = v; });
defState('editTpl', () => editTpl, v => { editTpl = v; });
defState('loginFor', () => loginFor, v => { loginFor = v; });

window.logout = () => { logout(); saveNow(); renderNav(); render(); toast('Вы вышли 👋'); };
window.biometricLogin = async () => { const u = await biometricLogin(); if (!u) return u; go('home'); announceLogin(u); presBeat(); toast('Смена начата 👋'); return u; };

// Закрытие диалогов идёт через data-act="close" (его ловит делегат клика
// в ui.js) и window.closeDlg. Раньше здесь стояло window.close = closeDlg:
// это перетирало нативный window.close, который браузер использует сам —
// выигрыша не было (незакрытых вызовов close() в проекте нет), а риск был.
window.__tplSearch = (v) => { tplSearch = v; render(); };
window.clearTpl = () => { tplSearch = ''; const i = document.getElementById('tplSearch'); if (i) i.value = ''; render(); };
/* У ui-шаблонов id позиционный ('bag' / 'kit_3'), а в базе у каждого свой
   uid(). Могилу кладём по настоящему id шаблона — иначе удалённый шаблон
   возвращался с сервера ближайшим adoptState. Раньше здесь стояла строка
   `DB.bagTypes = DB.bagTypes || []`: клик по «удалить шаблон сумки» показывал
   «Шаблон удалён», но ничего не удалял. */
window.delTpl = (id) => {
  ask('Удалить шаблон?', () => {
    const arr = id === 'bag' ? (DB.bagTypes = DB.bagTypes || []) : (DB.kitTemplates = DB.kitTemplates || []);
    const i = id === 'bag' ? 0 : parseInt(String(id).replace('kit_', ''));
    const t = arr[i];
    if (!t) return toast('Шаблон не найден — возможно, уже удалён');
    DB.tplTomb = DB.tplTomb || [];
    if (t.id !== undefined && !DB.tplTomb.some(x => String(x) === String(t.id))) DB.tplTomb.push(t.id);
    arr.splice(i, 1);
    if (openTplId === id) openTplId = null;
    if (editTpl === id) editTpl = null;
    save(); render(); toast('Шаблон удалён');
  });
};
window.newTplDlg = () => {
  askText('Название нового шаблона', 'Новый шаблон', n => {
    if (!n.trim()) return;
    DB.kitTemplates = DB.kitTemplates || [];
    DB.kitTemplates.push({ id: uid(), name: n.trim(), items: [] });
    save(); curTpl = true; openTplId = 'kit_' + (DB.kitTemplates.length - 1); render();
    toast('Шаблон создан. Добавляй позиции кнопкой «+ Позиция» или через поиск лекарств');
  });
};
function parseTplLines(text) {
  const items = [];
  String(text).split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line) return;
    line = line.replace(/^[-*•]\s*/, '').replace(/^\s*\d{1,4}\s*[.)]\s*/, '');
    let name = line, qty = 1, unit = 'шт';
    const cells = line.split(/\t|;|\|/).map(s => s.trim());
    if (cells.length >= 2 && cells[0]) {
      name = cells[0];
      for (let i = 1; i < cells.length; i++) {
        const c = cells[i]; if (!c) continue;
        const num = c.replace(',', '.').match(/\d+(?:\.\d+)?/);
        if (num) { qty = Math.max(1, Math.round(parseFloat(num[0]))); continue; }
        const um = c.match(/(амп|фл|шт|пар|уп|таб|капс|компл|блистер|пакет)/i);
        if (um && unit === 'шт') unit = um[1].toLowerCase();
      }
    } else {
      const m = line.match(/^(.*?)\s+([0-9]{1,4})\s*(амп|фл|шт|пар|уп|таб|капс|компл|блистер|пакет)?\.?$/i);
      if (m) { name = m[1]; qty = +m[2]; if (m[3]) unit = m[3].toLowerCase(); }
    }
    if (!name.trim()) return;
    items.push({ name: name.trim(), spec: '', unit, qty, expiry: '', potent: false });
  });
  return items;
}
window.parseTplLines = parseTplLines;
window.tplImportDlg = () => {
  openDlg('<h3>📥 Импорт шаблона</h3><p class="impHint">Позиции — каждая с новой строки. Формат «Название, количество, единица», «Название 10 фл» или вставка из Excel (колонки через табуляцию).</p>' +
    '<label class="btn sec" style="display:inline-block">📄 Из файла (.txt/.csv)<input type="file" hidden accept=".txt,.csv,text/plain" onchange="window.__rdTpl(this.files[0])"></label>' +
    '<textarea id="tpTxt" rows="8" placeholder="Анальгин, 10, таб&#10;Амплитизол, 5, фл&#10;Бинт стерильный, 2, уп"></textarea>' +
    '<p><button class="btn" data-act="tplPasteDo">📋 Импортировать</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.__rdTpl = (f) => {
  if (!f) return;
  if (/\.xlsx?$/i.test(f.name)) return toast('Для Excel: сохраните лист как CSV или просто скопируйте ячейки и вставьте в это окно');
  const r = new FileReader();
  r.onload = () => { const ta = document.getElementById('tpTxt'); if (ta) ta.value = r.result; toast('Файл прочитан — нажмите «Импортировать»'); };
  r.onerror = () => toast('Не удалось прочитать файл');
  r.readAsText(f);
};
window.tplPasteDo = () => {
  const ta = document.getElementById('tpTxt');
  const items = parseTplLines(ta ? ta.value : '');
  if (!items.length) return toast('Не распознаны позиции — проверьте формат');
  askText('Название шаблона', 'Шаблон из файла', n => {
    if (!n.trim()) return;
    DB.kitTemplates = DB.kitTemplates || [];
    DB.kitTemplates.push({ id: uid(), name: n.trim(), items: items });
    save(); curTpl = true; openTplId = 'kit_' + (DB.kitTemplates.length - 1); render();
    toast('Шаблон создан, позиций: ' + items.length);
  });
};
window.renameTpl = (id) => {
  if (id === 'bag') {
    const t = DB.bagTypes && DB.bagTypes[0]; if (!t) return;
    askText('Переименовать шаблон сумки', t.name, n => { if (!n.trim()) return; t.name = n.trim(); save(); render(); toast('Шаблон переименован'); });
  } else {
    const i = +String(id).replace('kit_', ''); const t = DB.kitTemplates[i]; if (!t) return;
    askText('Переименовать шаблон', t.name, n => { if (!n.trim()) return; t.name = n.trim(); save(); render(); toast('Шаблон переименован'); });
  }
};
window.addBagTpl = () => {
  if (!window.SEED || !window.SEED.length) return toast('Нет данных справочника');
  DB.bagTypes = [{ id: 1, name: 'Рабочая сумка', items: window.SEED.map(r => ({ name: r[2], spec: r[3], unit: r[4], qty: r[5], expiry: '', potent: false })) }];
  save(); render(); toast('Шаблон сумки создан');
};
window.openPotKit = (id) => { curPotKit = +id || null; curPot = true; render(); };
window.backPotents = () => { curPotKit = null; render(); };

// ---------- Сумки ----------
window.openBagDlg = () => {
  openDlg('<h3>Новая сумка</h3><label>Название</label><input id="bName"><label>Описание (табличка)</label><input id="bDesc" placeholder="например: дежурная бригада Б3, ночная"><p><button class="btn" data-act="saveBagDlg">Создать</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.saveBagDlg = () => {
  const n = document.getElementById('bName').value.trim();
  if (!n) return toast('Введите название');
  const d = (document.getElementById('bDesc') ? document.getElementById('bDesc').value.trim() : '') || '';
  DB.bags.push({ id: uid(), name: n, desc: d, items: [], kits: [] });
  save(); closeDlg(); render(); toast('Сумка создана');
};
window.renameBag = (id) => {
  const b = DB.bags.find(x => x.id == id); if (!b) return;
  // Правка названия и таблички одним диалогом. Табличка нужна, чтобы
  // отличить сумки в списке: номер меняется при перестановках, а «ночная,
  // Б3» остаётся понятным.
  let h = '<h3>Сумка</h3><label>Название</label><input id="rbName" value="' + esc(b.name) + '">';
  h += '<label>Описание (табличка)</label><input id="rbDesc" value="' + esc(b.desc || '') + '" placeholder="например: дежурная бригада Б3, ночная">';
  h += '<p><button class="btn" data-act="saveRenameBag" data-arg="' + b.id + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>';
  openDlg(h);
};
window.saveRenameBag = (id) => {
  const b = DB.bags.find(x => x.id == id); if (!b) return;
  const n = (document.getElementById('rbName').value || '').trim();
  if (!n) return toast('Введите название');
  b.name = n;
  b.desc = (document.getElementById('rbDesc').value || '').trim();
  save(); closeDlg(); render(); toast('Сумка сохранена');
};
window.delBag = (id) => {
  // Удаление сумки необратимо: в могилу уходит id, и с других телефонов сумка
  // уже не вернётся. Поэтому — только руководителю либо тому, кому сумка
  // назначена: назначение и есть право распоряжаться. Проверка в обработчике,
  // а не только скрытием кнопки: вызов можно сделать и вручную.
  if (!isBoss() && !myBags().some(b => String(b.id) === String(id))) {
    return toast('Сумка не ваша — удалить может руководитель или тот, кому она назначена');
  }
  ask('Удалить сумку со всеми позициями?', () => {
    // +id обязателен: id приходит из data-arg строкой, а фильтр могил
    // сравнивал строго — удалённая сумка возвращалась с сервера.
    DB.bagTomb = DB.bagTomb || []; if (!DB.bagTomb.some(x => String(x) === String(id))) DB.bagTomb.push(+id);
    DB.bags = DB.bags.filter(b => b.id != id); save(); render(); toast('Сумка удалена');
  });
};
window.openBag = (id) => { curBag = +id; render(); };
window.backBags = () => { curBag = null; highlightItem = null; editBag = null; render(); };
window.newBagFromTpl = () => {
  const t = DB.bagTypes[0]; if (!t) return toast('Шаблон не найден');
  askText('Новая сумка из шаблона', 'Рабочая сумка', n => {
    DB.bags.push({ id: uid(), name: n, typeId: t.id, items: t.items.map(i => ({ name: i.name, spec: i.spec, unit: i.unit, qty: i.qty, expiry: '', potent: !!i.potent })), kits: [] });
    save(); render(); toast('Сумка создана и заполнена');
  });
};
window.fillBagFromTpl = (bid) => {
  const b = DB.bags.find(x => x.id == bid); const t = DB.bagTypes[0];
  if (!t) return toast('Шаблон не найден');
  b.items = b.items.concat(t.items.map(i => ({ name: i.name, spec: i.spec, unit: i.unit, qty: i.qty, expiry: '', potent: !!i.potent })));
  save(); render(); toast('Добавлено из шаблона: ' + t.items.length);
};
window.toggleEditBag = (bid) => {
  bid = +bid;
  if (editBag === bid) { editBag = null; save(); toast('Сохранено'); } else { editBag = bid; editKit = null; }
  render();
};
window.editBagItem = (arg) => {
  const [bid, i, field] = String(arg).split(','); const b = DB.bags.find(x => x.id == bid);
  const el = document.querySelector(`[data-act="editBagItem"][data-arg="${arg}"]`);
  if (!el) return; const val = el.value;
  if (field === 'qty') b.items[+i].qty = +val; else b.items[+i][field] = val;
};
window.delBagItemEdit = (arg) => {
  const [bid, i] = String(arg).split(','); const b = DB.bags.find(x => x.id == bid);
  b.items.splice(+i, 1); render();
};
window.setExp = (arg) => {
  const [bid, i] = String(arg).split(','); const b = DB.bags.find(x => x.id == bid);
  const el = document.querySelector(`[data-act="setExp"][data-arg="${arg}"]`);
  b.items[+i].expiry = el.value; save(); render();
};
window.delItem = (arg) => {
  const [bid, i] = String(arg).split(',');
  ask('Удалить позицию?', () => {
    const b = DB.bags.find(x => x.id == bid); b.items.splice(+i, 1); save(); render(); toast('Позиция удалена');
  });
};
window.openItemDlg = (arg) => {
  const [bid, idx] = String(arg).split(','); const b = DB.bags.find(x => x.id == bid);
  const it = idx < 0 ? {} : b.items[+idx];
  openDlg('<h3>Позиция</h3><label>Название</label><input id="item_name" value="' + esc(it.name || '') + '">' + drugSearchHtml('item') + '<label>Форма</label><input id="item_spec" value="' + esc(it.spec || '') + '"><div class="row"><div><label>Кол-во</label><input id="iQty" type="number" value="' + (it.qty || 1) + '"></div><div><label>Ед.</label><input id="item_unit" value="' + esc(it.unit || 'шт') + '"></div></div><label>Срок годности</label><input id="iExp" type="date" value="' + (it.expiry || '') + '"><label><input type="checkbox" style="width:auto" id="iPot"' + (it.potent ? ' checked' : '') + '> Сильнодействующий препарат</label><p><button class="btn" data-act="saveItemDlg" data-arg="' + bid + ',' + idx + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.saveItemDlg = (arg) => {
  const [bid, idx] = String(arg).split(','); const b = DB.bags.find(x => x.id == bid);
  const o = {
    name: document.getElementById('item_name').value.trim(),
    spec: document.getElementById('item_spec').value.trim(),
    qty: +document.getElementById('iQty').value || 1,
    unit: document.getElementById('item_unit').value.trim() || 'шт',
    expiry: document.getElementById('iExp').value,
    potent: document.getElementById('iPot').checked
  };
  if (!o.name) return toast('Введите название');
  if (idx < 0) b.items.push(o); else b.items[+idx] = o;
  save(); closeDlg(); render();
};
window.openImportDlg = (bid) => {
  openDlg('<h3>📥 Импорт списка</h3><label class="btn sec" style="display:inline-block">📄 Выбрать файл<input type="file" hidden accept=".txt,.csv,text/plain" onchange="window.__readImpFile(this.files[0])"></label><textarea id="impTa" placeholder="Строки: Название 10 амп"></textarea><p><button class="btn" data-act="doImport" data-arg="' + bid + '">➕ Добавить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.__readImpFile = (f) => {
  if (!f) return; const r = new FileReader();
  r.onload = () => { const e = document.getElementById('impTa'); if (e) e.value = r.result; };
  r.readAsText(f);
};
window.doImport = (bid) => {
  const b = DB.bags.find(x => x.id == bid);
  const items = parseItemList(document.getElementById('impTa').value);
  b.items.push(...items);
  save(); closeDlg(); render(); toast('Добавлено позиций: ' + items.length);
};

// ---------- Машины ----------
window.openCarDlg = (id) => {
  const c = id ? DB.cars.find(x => x.id == id) : null;
  // Переименовать чужую машину нельзя: бортовой номер и госномер — общие
  // для станции, и сбитый номер уводит на неверную машину.
  if (c && !isBoss()) return toast('Название и госномер меняет руководитель или админ');
  let h = '<h3>' + (c ? 'Машина' : 'Новый автомобиль СМП') + '</h3><label>Бортовой номер</label><input id="cName" value="' + (c ? esc(c.name) : '') + '"><label>Госномер</label><input id="cPlates" value="' + (c ? esc(c.plates || '') : '') + '">';
  if (!c) {
    h += '<label><input type="checkbox" style="width:auto" id="cFill" checked> Заполнить базовым шаблоном оборудования (31 поз., без ОВМ)</label>';
    h += '<label><input type="checkbox" style="width:auto" id="kRes" checked> 🚑 Реанимационная укладка</label>';
    h += '<label><input type="checkbox" style="width:auto" id="kTra" checked> 🦴 Травматологическая укладка</label>';
    h += '<label><input type="checkbox" style="width:auto" id="kAk" checked> 🤰 Акушерская укладка</label>';
    h += '<label><input type="checkbox" style="width:auto" id="kThr" checked> ❄️ Термосумка</label>';
  }
  h += '<p><button class="btn" data-act="saveCarDlg" data-arg="' + (id || 'null') + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>';
  openDlg(h);
};
window.saveCarDlg = (id) => {
  const n = document.getElementById('cName').value.trim(); if (!n) return toast('Введите номер');
  const pl = document.getElementById('cPlates').value.trim();
  if (id && id !== 'null') {
    const c = DB.cars.find(x => x.id == id); c.name = n; c.plates = pl;
  } else {
    const carFrom = list => (window[list] || []).map(r => ({ name: r[0], spec: '', unit: r[2], qty: r[1], expiry: '', potent: false }));
    const eq = (document.getElementById('cFill') || {}).checked !== false
      ? (window.EQ || []).map(e => ({ id: uid(), ovm: '', name: e[1], status: 'ok', charge: '', defect: '' }))
      : [];
    const kits = [];
    const kitOn = (elId, arr, nm) => {
      const el = document.getElementById(elId);
      if (el && el.checked) kits.push({ id: uid(), name: nm, items: carFrom(arr) });
    };
    kitOn('kRes', 'RE', 'Реанимационная укладка');
    kitOn('kTra', 'TR', 'Травматологическая укладка');
    kitOn('kAk', 'AK', 'Акушерская укладка');
    kitOn('kThr', 'TM', 'Термосумка (холодовой режим)');
    DB.cars.push({ id: uid(), name: n, plates: pl, equip: eq, kits: kits });
  }
  save(); closeDlg(); render(); toast('Машина сохранена');
};
window.openCar = (id) => { curCar = +id; curKit = null; render(); };
window.editCar = (id) => window.openCarDlg(id);
window.delCar = (id) => {
  // Удаление машины уводит в могилу её id вместе со всем оборудованием и
  // укладками, и обратно не возвращается. Право — у руководителя либо у
  // того, кому машина назначена. Проверка в обработчике: кнопку можно
  // вызвать вручную.
  if (!isBoss()) return toast('Удалить машину может только руководитель или админ');
  ask('Удалить машину вместе с оборудованием и укладками?', () => {
    DB.carTomb = DB.carTomb || []; if (!DB.carTomb.includes(+id)) DB.carTomb.push(+id);
    DB.cars = DB.cars.filter(c => c.id != id); save(); render(); toast('Машина удалена');
  });
};
window.backCars = () => { curCar = null; curKit = null; highlightItem = null; editEquip = false; render(); };
window.addKitDlg = (cid) => {
  if (!isBoss()) return toast('Укладку может добавить руководитель или админ');
  const c = DB.cars.find(x => x.id == cid); if (!c) return;
  let h = '<h3>➕ Укладка · ' + esc(c.name) + '</h3><label>Название</label><input id="akName" placeholder="Реанимационная"><label>Из шаблона</label><select id="akTpl"><option value="-1">— Пустая —</option>';
  (DB.kitTemplates || []).forEach((kt, i) => h += '<option value="' + i + '">' + esc(kt.name) + ' (' + (kt.items || []).length + ' поз.)</option>');
  if (DB.bagTypes && DB.bagTypes[0]) h += '<option value="bag">👜 Шаблон сумки (' + (DB.bagTypes[0].items || []).length + ' поз.)</option>';
  h += '</select><p><button class="btn" data-act="addKitDo" data-arg="' + cid + '">Добавить</button><button class="btn sec" data-act="close">Закрыть</button></p>';
  openDlg(h);
};
window.addKitDo = (cid) => {
  const c = DB.cars.find(x => x.id == cid); if (!c) return;
  const name = document.getElementById('akName').value.trim();
  const sel = document.getElementById('akTpl').value; let items = [];
  if (sel === 'bag') { const bt = DB.bagTypes[0]; if (bt) items = bt.items.map(i => ({ name: i.name, spec: i.spec || '', unit: i.unit || 'шт', qty: i.qty || 1, expiry: '', potent: !!i.potent })); }
  else if (sel !== '-1') { const kt = DB.kitTemplates[+sel]; if (kt) items = kt.items.map(i => ({ name: i.name, spec: i.spec || '', unit: i.unit || 'шт', qty: i.qty || 1, expiry: '', potent: !!i.potent })); }
  if (!name) return toast('Укажи название');
  c.kits = c.kits || []; c.kits.push({ id: uid(), name, items });
  save(); closeDlg(); render(); toast('Укладка добавлена: ' + name);
};
window.toggleEditEquip = (cid) => {
  cid = +cid;
  if (!isBoss()) return toast('Оборудование правит руководитель или админ');
  if (editEquip === cid) { editEquip = false; save(); toast('Сохранено'); } else editEquip = cid;
  render();
};
window.editEquipItem = (arg) => {
  const [cid, i, field] = String(arg).split(','); const c = DB.cars.find(x => x.id == cid);
  if (!c || !isBoss()) return;
  const el = document.querySelector(`[data-act="editEquipItem"][data-arg="${arg}"]`);
  if (!el) return; c.equip[+i][field] = el.value;
};
window.delEquipItem = (arg) => {
  const [cid, i] = String(arg).split(','); const c = DB.cars.find(x => x.id == cid);
  if (!c || !isBoss()) return toast('Перечень оборудования правит руководитель или админ');
  c.equip.splice(+i, 1); render();
};
window.cellEdit = (arg) => {
  const p = String(arg).split(',');
  let target = null, field = '',
    LAB = { name: 'Наименование', spec: 'Форма', ovm: 'Инв. №', qty: 'Кол-во', expiry: 'Срок годности', charge: 'Отметки', defect: 'Пометка' };
  if (p[0] === 'bag') { const b = DB.bags.find(x => x.id == p[1]); if (b && b.items[+p[2]]) { target = b.items[+p[2]]; field = p[3]; } }
  else if (p[0] === 'kit') { const c = DB.cars.find(x => x.id == p[1]); const k = c && c.kits.find(x => x.id == p[2]); if (k && k.items[+p[3]]) { target = k.items[+p[3]]; field = p[4]; } }
  else if (p[0] === 'eq') { const c = DB.cars.find(x => x.id == p[1]); if (c && c.equip[+p[2]]) { target = c.equip[+p[2]]; field = p[3]; } }
  else if (p[0] === 'pot') { const k = (DB.potents || []).find(x => x.id == p[1]); if (k && k.items[+p[2]]) { target = k.items[+p[2]]; field = p[3]; } }
  else if (p[0] === 'tpl') { let list = null; if (p[1] === 'bag') { const t = DB.bagTypes && DB.bagTypes[0]; if (t) list = t.items; } else { const ki = +p[1].replace('kit_', ''); const kt = DB.kitTemplates && DB.kitTemplates[ki]; if (kt) list = kt.items; } if (list && list[+p[2]]) { target = list[+p[2]]; field = p[3]; } }
  if (!target) return toast('Позиция не найдена');
  const val = target[field] == null ? '' : target[field];
  const num = field === 'qty', date = field === 'expiry', one = field === 'ovm';
  let h = '<h3>✏️ ' + esc(LAB[field] || field) + '</h3>';
  if (one) h += '<input id="cellV" value="' + esc(val) + '" autofocus>';
  else if (num) h += '<input id="cellV" type="number" value="' + esc(val) + '" inputmode="numeric">';
  else if (date) h += '<div class="row" style="align-items:center;gap:6px"><input id="cellV" type="date" value="' + esc(val) + '" style="flex:1"><button class="btn del mini" data-act="cellClear" title="Удалить дату">🗑</button></div>';
  else h += '<textarea id="cellV" rows="3" style="width:100%;box-sizing:border-box;min-height:80px" autofocus>' + esc(val) + '</textarea>';
  h += '<p><button class="btn" data-act="cellOk">💾 Сохранить</button><button class="btn sec" data-act="close">Отмена</button></p>';
  openDlg(h);
  window.__dlgActions = {
    cellOk: () => {
      const el = document.getElementById('cellV');
      if (!el) return;
      const nv = el.value;
      if (num) { const n = Math.max(0, Math.round(+nv) || 0); target[field] = n; }
      else if (date) target[field] = nv || '';
      else target[field] = nv.trim();
      save(); closeDlg(); render();
    },
    cellClear: () => {
      target[field] = '';
      save(); closeDlg(); render();
      toast('Дата удалена');
    }
  };
};
window.addEquipItem = (cid) => {
  const c = DB.cars.find(x => x.id == cid); if (!c) return;
  c.equip = c.equip || [];
  c.equip.push({ id: uid(), ovm: '', name: 'Новое оборудование', status: 'ok', charge: '', defect: '' });
  // Без save() изменение жило только в памяти до pagehide — на новом
  // устройстве и после выгрузки оборудования не было.
  save(); render();
};
window.setEq = (arg) => {
  const [cid, eid] = String(arg).split(','); const c = DB.cars.find(x => x.id == cid);
  const e = c.equip.find(x => x.id == eid); const el = document.querySelector(`[data-act="setEq"][data-arg="${arg}"]`);
  e.status = el.value; save(); render();
};
window.setCh = (arg) => {
  const [cid, eid] = String(arg).split(','); const c = DB.cars.find(x => x.id == cid);
  const e = c.equip.find(x => x.id == eid); const el = document.querySelector(`[data-act="setCh"][data-arg="${arg}"]`);
  e.charge = el.value; save();
};
window.setDef = (arg) => {
  const [cid, eid] = String(arg).split(','); const c = DB.cars.find(x => x.id == cid);
  const e = c.equip.find(x => x.id == eid); const el = document.querySelector(`[data-act="setDef"][data-arg="${arg}"]`);
  e.defect = el.value; save();
};
window.openKit = (id) => { curKit = +id; render(); };
window.backKits = () => { curKit = null; highlightItem = null; editKit = null; render(); };
window.toggleEditKit = (kid) => {
  kid = +kid;
  if (editKit === kid) { editKit = null; save(); toast('Сохранено'); } else editKit = kid;
  render();
};
window.openKitItem = (arg) => {
  const [cid, kid, idx] = String(arg).split(',');
  const k = DB.cars.find(x => x.id == cid).kits.find(x => x.id == kid);
  const it = idx < 0 ? {} : k.items[+idx];
  openDlg('<h3>Позиция укладки</h3><label>Название</label><input id="kit_item_name" value="' + esc(it.name || '') + '">' + drugSearchHtml('kit_item') + '<div class="row"><div><label>Кол-во</label><input id="kQty" type="number" value="' + (it.qty || 1) + '"></div><div><label>Ед.</label><input id="kit_item_unit" value="' + esc(it.unit || 'шт') + '"></div></div><label>Форма</label><input id="kit_item_spec" value="' + esc(it.spec || '') + '"><label>Срок</label><input id="kExp" type="date" value="' + (it.expiry || '') + '"><label><input type="checkbox" style="width:auto" id="kPot"' + (it.potent ? ' checked' : '') + '> Сильнодействующий</label><p><button class="btn" data-act="saveKitItem" data-arg="' + cid + ',' + kid + ',' + idx + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.saveKitItem = (arg) => {
  const [cid, kid, idx] = String(arg).split(',');
  const k = DB.cars.find(x => x.id == cid).kits.find(x => x.id == kid);
  const o = {
    name: document.getElementById('kit_item_name').value.trim(),
    qty: +document.getElementById('kQty').value || 1,
    unit: document.getElementById('kit_item_unit').value.trim() || 'шт',
    expiry: document.getElementById('kExp').value,
    spec: document.getElementById('kit_item_spec').value.trim(),
    potent: document.getElementById('kPot').checked
  };
  if (!o.name) return toast('Введите название');
  if (idx < 0) k.items.push(o); else k.items[+idx] = o;
  save(); closeDlg(); render();
};
window.editKitItem = (arg) => {
  const [cid, kid, i, field] = String(arg).split(',');
  const c = DB.cars.find(x => x.id == cid); const k = c.kits.find(x => x.id == kid);
  const el = document.querySelector(`[data-act="editKitItem"][data-arg="${arg}"]`);
  if (!el) return; const val = el.value;
  if (field === 'qty') k.items[+i].qty = +val; else k.items[+i][field] = val;
};
window.delKitItemEdit = (arg) => {
  const [cid, kid, i] = String(arg).split(',');
  const c = DB.cars.find(x => x.id == cid); const k = c.kits.find(x => x.id == kid);
  k.items.splice(+i, 1); render();
};
window.setExpKit = (arg) => {
  const [cid, kid, i] = String(arg).split(',');
  const c = DB.cars.find(x => x.id == cid); const k = c.kits.find(x => x.id == kid);
  const el = document.querySelector(`[data-act="setExpKit"][data-arg="${arg}"]`);
  k.items[+i].expiry = el.value; save(); render();
};
window.setExpPot = (arg) => {
  const [kid, i] = String(arg).split(','); const k = DB.potents.find(x => x.id == kid);
  const el = document.querySelector(`[data-act="setExpPot"][data-arg="${arg}"]`);
  k.items[+i].expiry = el.value; save(); render();
};
window.delKitItem = (arg) => {
  const [cid, kid, i] = String(arg).split(',');
  ask('Удалить позицию?', () => {
    const c = DB.cars.find(x => x.id == cid); const k = c.kits.find(x => x.id == kid);
    k.items.splice(+i, 1); save(); render(); toast('Позиция удалена');
  });
};

// ---------- Шаблоны ----------
window.goTpl = () => { curTpl = true; render(); };
window.goPot = () => { curPot = true; render(); };
window.backBagsViews = () => { curTpl = false; curPot = false; curPotKit = null; openTplId = null; editTpl = null; tplSearch = ''; render(); };
window.toggleTplOpen = (id) => { openTplId = openTplId === id ? null : id; tplSearch = ''; render(); };
window.toggleEditTpl = (id) => {
  if (editTpl === id) { editTpl = null; save(); toast('Сохранено'); } else editTpl = id;
  render();
};
window.addTplPos = (id) => {
  if (id === 'bag') {
    if (!DB.bagTypes[0]) return toast('Шаблон сумки не создан');
    DB.bagTypes[0].items.push({ name: 'Новая позиция', spec: '', unit: 'шт', qty: 1, potent: false });
  } else {
    const t = DB.kitTemplates[parseInt(id.replace('kit_', ''))]; if (!t) return;
    // potent определяется по названию шаблона, а не по его позиции в массиве
    t.items.push({ name: 'Новая позиция', spec: '', unit: 'шт', qty: 1, potent: /НС\/ПВ\/СД|Сильнодейств/i.test(t.name || '') });
  }
  save(); render();
};
window.delTplPos = (arg) => {
  const parts = String(arg).split(','); const id = parts[0], i = +parts[1];
  const t = id === 'bag' ? (DB.bagTypes || [])[0] : (DB.kitTemplates || [])[parseInt(id.replace('kit_', ''))];
  if (!t || !Array.isArray(t.items) || i < 0 || i >= t.items.length) return toast('Позиция не найдена');
  t.items.splice(i, 1);
  save(); render();
};
window.createPotentBag = () => window.potNewDlg();
window.potNewDlg = () => {
  const tpls = DB.kitTemplates || [];
  let opts = '<option value="-1">— Вручную (пустой комплект) —</option>';
  tpls.forEach((t, i) => {
    const hot = /НС\/ПВ\/СД|Сильнодействующие/i.test(t.name);
    opts += '<option value="' + i + '">' + esc(t.name) + (hot ? ' ⚕' : '') + ' (' + (t.items || []).length + ' поз.)</option>';
  });
  openDlg('<h3>➕ Комплект НС/ПВ/СД</h3><label>Название</label><input id="pkName" placeholder="⚕ Комплект …"><label>Наполнение</label><select id="pkTpl">' + opts + '</select><p><button class="btn" data-act="potNewDo">Создать</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.potNewDo = () => {
  const n = document.getElementById('pkName').value.trim();
  if (!n) return toast('Введите название комплекта');
  const ti = +document.getElementById('pkTpl').value;
  let items = [];
  if (ti >= 0) {
    const t = (DB.kitTemplates || [])[ti]; if (!t) return toast('Шаблон не найден');
    items = Array.isArray(t.items) ? t.items.filter(i => i && i.name && i.name !== 'Новая позиция').map(i => ({ name: i.name, spec: i.spec || '', unit: i.unit || 'шт', qty: +i.qty || 1, expiry: '', potent: true })) : [];
  }
  DB.potents = DB.potents || [];
  DB.potents.push({ id: uid(), name: n, items });
  save(); curPotKit = DB.potents[DB.potents.length - 1].id; closeDlg(); render(); toast('Комплект создан');
};
window.createPotentFromTpl = (id) => {
  const i = +String(id).replace('kit_', ''); const t = (DB.kitTemplates || [])[i]; if (!t) return toast('Шаблон не найден');
  askText('Название комплекта', t.name, n => {
    if (!n.trim()) return;
    const items = Array.isArray(t.items) ? t.items.filter(x => x && x.name && x.name !== 'Новая позиция').map(x => ({ name: x.name, spec: x.spec || '', unit: x.unit || 'шт', qty: +x.qty || 1, expiry: '', potent: true })) : [];
    DB.potents = DB.potents || [];
    DB.potents.push({ id: uid(), name: n.trim(), items });
    save(); curPotKit = DB.potents[DB.potents.length - 1].id; render(); toast('Комплект создан из шаблона');
  });
};
window.renamePotKit = (id) => {
  const k = DB.potents.find(x => x.id == id); if (!k) return;
  askText('Новое название', '', n => { if (!n.trim()) return; k.name = n.trim(); save(); render(); toast('Переименовано'); });
};
window.delPotKit = (id) => {
  const k = DB.potents.find(x => x.id == id); if (!k) return;
  ask('Удалить комплект «' + (k.name || '') + '»?', () => {
    DB.potTomb = DB.potTomb || []; if (!DB.potTomb.includes(+id)) DB.potTomb.push(+id);
    DB.potents = DB.potents.filter(x => x.id != id);
    if (curPotKit == id) curPotKit = null; save(); render(); toast('Комплект удалён');
  });
};
window.openPotItem = (arg) => {
  const [kid, idx] = String(arg).split(','); const k = DB.potents.find(x => x.id == kid);
  const it = idx < 0 ? {} : k.items[+idx];
  openDlg('<h3>Позиция</h3><label>Название</label><input id="pot_name" value="' + esc(it.name || '') + '">' + drugSearchHtml('pot_item') + '<label>Форма</label><input id="pot_spec" value="' + esc(it.spec || '') + '"><div class="row"><div><label>Кол-во</label><input id="pQty" type="number" value="' + (it.qty || 1) + '"></div><div><label>Ед.</label><input id="pot_unit" value="' + esc(it.unit || 'шт') + '"></div></div><label>Срок</label><input id="pExp" type="date" value="' + (it.expiry || '') + '"><p><button class="btn" data-act="savePotItem" data-arg="' + kid + ',' + idx + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.savePotItem = (arg) => {
  const [kid, idx] = String(arg).split(','); const k = DB.potents.find(x => x.id == kid);
  const o = {
    name: document.getElementById('pot_name').value.trim(),
    spec: document.getElementById('pot_spec').value.trim(),
    qty: +document.getElementById('pQty').value || 1,
    unit: document.getElementById('pot_unit').value.trim() || 'шт',
    expiry: document.getElementById('pExp').value, potent: true
  };
  if (!o.name) return toast('Введите название');
  if (idx < 0) k.items.push(o); else k.items[+idx] = o;
  save(); closeDlg(); render(); toast('Сохранено');
};
window.delPotItem = (arg) => {
  const [kid, i] = String(arg).split(','); const k = DB.potents.find(x => x.id == kid);
  k.items.splice(+i, 1); save(); render(); toast('Позиция удалена');
};

// ---------- Поиск лекарств в справочнике (drug search) ----------
function searchDrugs(query) {
  if (typeof query !== 'string' || query.length < 2) return [];
  const q = query.toLowerCase(); const F = window.DRUG_DB || [];
  const out = [];
  for (let i = 0; i < F.length && out.length < 15; i++) {
    const d = F[i];
    if ((d.n || '').toLowerCase().indexOf(q) >= 0 || (d.s || '').toLowerCase().indexOf(q) >= 0) out.push(d);
  }
  return out;
}
function drugSearchHtml(prefix) {
  return '<div class="searchBox"><input type="text" placeholder="🔍 Поиск лекарства…" oninput="showDrugResults(\'' + prefix + '\',this.value)" id="' + prefix + '_search" autocomplete="off"><button class="searchClear" onclick="document.getElementById(\'' + prefix + '_search\').value=\'\';document.getElementById(\'' + prefix + '_results\').innerHTML=\'\'">✕</button></div><div class="drugResults" id="' + prefix + '_results"></div>';
}
window.showDrugResults = (prefix, val, noLoad) => {
  const el = document.getElementById(prefix + '_results'); if (!el) return;
  // drugs.js (73 КБ) грузится по надобности: первое же нажатие в поиске
  // его догружает и показывает результаты. Молчаливый пустой список был бы
  // худшим вариантом — человек решил бы, что препарата нет в справочнике.
  if (!drugsReady()) {
    withDrugs(el,
      '<div class="drugItem" style="opacity:.7">Загружаю справочник…</div>',
      '<div class="drugItem" style="opacity:.7">Справочник не загрузился — проверьте интернет</div>',
      () => window.showDrugResults(prefix, val, true), noLoad);
    return;
  }
  const res = searchDrugs(val);
  if (!res.length) { el.innerHTML = ''; return; }
  el.innerHTML = res.map((d, i) => '<div class="drugItem" onclick="pickDrug(\'' + prefix + '\',' + i + ')"><div class="diName">' + esc(d.n) + '</div><div class="diSpec">' + esc(d.s || '') + (d.u ? ' · ' + esc(d.u) : '') + '</div></div>').join('');
  window['__drugs_' + prefix] = res;
};
window.pickDrug = (prefix, idx) => {
  const d = window['__drugs_' + prefix];
  if (!d || !d[idx]) return;
  const item = d[idx];
  if (prefix === 'pot_item' || prefix === 'potkit_item') return pickPotDrug(idx, prefix);
  const resEl = document.getElementById(prefix + '_results'); if (resEl) resEl.innerHTML = '';
  const searchEl = document.getElementById(prefix + '_search'); if (searchEl) searchEl.value = '';
  if (prefix.indexOf('tpl_') === 0) {
    const tid = prefix.substring(4);
    if (tid === 'bag') {
      (DB.bagTypes[0] || {}).items = (DB.bagTypes[0] || {}).items || [];
      DB.bagTypes[0].items.push({ name: item.n, spec: item.s, unit: item.u || 'шт', qty: 1, potent: false });
    } else {
      const ki = parseInt(tid.replace('kit_', '') || '0');
      if (!isNaN(ki) && DB.kitTemplates[ki]) {
        const potent = /НС\/ПВ\/СД|Сильнодейств/i.test(DB.kitTemplates[ki].name || '');
        DB.kitTemplates[ki].items = DB.kitTemplates[ki].items || [];
        DB.kitTemplates[ki].items.push({ name: item.n, spec: item.s, unit: item.u || 'шт', qty: 1, potent });
      }
    }
    save(); render(); toast('✅ Добавлено в шаблон: ' + item.n);
    return;
  }
  const nameEl = document.getElementById(prefix + '_name');
  const specEl = document.getElementById(prefix + '_spec');
  const unitEl = document.getElementById(prefix + '_unit');
  if (nameEl) nameEl.value = item.n;
  if (specEl) specEl.value = item.s;
  if (unitEl) unitEl.value = item.u || 'шт';
  toast('✅ Подставлено: ' + item.n);
};
window.pickPotDrug = (idx, prefix) => {
  prefix = prefix || 'pot_item';
  const d = window['__drugs_' + prefix]; if (!d || !d[idx]) return;
  const it = d[idx];
  const resEl = document.getElementById(prefix + '_results'); if (resEl) resEl.innerHTML = '';
  const se = document.getElementById(prefix + '_search'); if (se) se.value = '';
  const ne = document.getElementById('pot_name');
  if (ne) {
    ne.value = it.n;
    const spe = document.getElementById('pot_spec'); if (spe) spe.value = it.s;
    const ue = document.getElementById('pot_unit'); if (ue) ue.value = it.u || 'шт';
    toast('✅ Подставлено: ' + it.n);
    return;
  }
  const k = (DB.potents || []).find(x => x.id == curPotKit); if (!k) return;
  k.items = k.items || [];
  k.items.push({ name: it.n, spec: it.s, unit: it.u || 'шт', qty: 1, expiry: '', potent: true });
  save(); render(); toast('✅ Добавлено: ' + it.n);
};
window.searchDrugs = searchDrugs;
window.drugSearchHtml = drugSearchHtml;

// ---------- Смены (фото) ----------
window.__addSchedPhoto = (inp, kind) => {
  const f = inp.files[0]; if (!f) return;
  compressImage(f, img => {
    try {
      const p = { id: uid(), ts: Date.now(), month: todayStr().slice(0, 7), img };
      DB.sched[kind].push(p);
      save(); render(); toast('Фото добавлено');
      if (kind === 'days' || kind === 'months') {
        if (!window.__fbToken) { window.__schedDirty = true; }
        else { restPut('sched/' + kind + '/' + p.id, p).then(() => bumpSchedMeta()).catch(() => { window.__schedDirty = true; }); }
      }
    } catch (e) { toast('Память переполнена'); }
  });
};
function compressImage(f, cb) {
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const max = 1200; let w = im.width, h = im.height;
      if (w > max || h > max) { const k = Math.min(max / w, max / h); w = Math.round(w * k); h = Math.round(h * k); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(im, 0, 0, w, h); cb(cv.toDataURL('image/jpeg', 0.7));
    };
    im.src = r.result;
  };
  r.readAsDataURL(f);
}
window.__addSchedDoc = (inp, kind) => {
  const f = inp.files[0]; if (!f) return;
  if (!/\.(txt|csv|xls|xlsx|doc|docx|pdf)$/i.test(f.name)) { toast('Поддерживаются: txt, csv, xls, xlsx, doc, docx, pdf'); inp.value = ''; return; }
  // 3.5 МБ в base64 раздувается до ~4.7 МБ, и два-три таких файла
  // исчерпывают квоту localStorage — после этого перестаёт сохраняться
  // вся база. 1.5 МБ — компромисс между полезной отсканированной страницей
  // и запасом на несколько выгрузок подряд.
  if (f.size > 1.5 * 1024 * 1024) { toast('Файл больше 1.5 МБ — сожмите или сфотографируйте постранично'); inp.value = ''; return; }
  const r = new FileReader();
  r.onload = () => {
    try {
      const p = { id: uid(), ts: Date.now(), month: todayStr().slice(0, 7), doc: 1, name: f.name, mime: f.type || '', size: f.size, img: r.result };
      DB.sched[kind].push(p);
      save(); render(); toast('📄 ' + f.name + ' добавлен');
      if (kind === 'days' || kind === 'months') {
        if (!window.__fbToken) { window.__schedDirty = true; }
        else { restPut('sched/' + kind + '/' + p.id, p).then(() => bumpSchedMeta()).catch(() => { window.__schedDirty = true; }); }
      }
    } catch (e) { toast('Память переполнена'); }
  };
  r.onerror = () => { toast('Не удалось прочитать файл'); };
  r.readAsDataURL(f);
};
function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' Б';
  if (n < 1048576) return (n / 1024).toFixed(1).replace(/\.0$/, '') + ' КБ';
  return (n / 1048576).toFixed(1).replace(/\.0$/, '') + ' МБ';
}
window.openPhoto = (arg) => {
  const [kind, id] = String(arg).split(',');
  const p = DB.sched[kind].find(x => x.id == id); if (!p) return;
  if (p.doc) {
    openDlg('<div class="photoDlgBody"><div class="docTile">📄</div><p class="docName">' + esc(p.name || 'документ') + '</p><p class="docMeta">' + fmtSize(p.size) + '</p><div class="photoBtns"><a class="btn" href="' + p.img + '" download="' + esc(p.name || 'file') + '">⬇ Скачать</a> <button class="btn del" data-act="delPhoto" data-arg="' + kind + ',' + id + '">🗑 Удалить</button> <button class="btn sec" data-act="close">Закрыть</button></div></div>');
    return;
  }
  openDlg('<div class="photoDlgBody"><div class="photoViewport" id="pvPort"><img id="pvImg" src="' + p.img + '"></div><div class="photoZoomBar"><button class="btn sec" data-act="pvZoom" data-arg="-1">−</button><span id="pvLabel">100%</span><button class="btn sec" data-act="pvZoom" data-arg="1">+</button><button class="btn sec" data-act="pvReset">↺</button></div><div class="photoBtns"><button class="btn del" data-act="delPhoto" data-arg="' + kind + ',' + id + '">🗑 Удалить</button><button class="btn sec" data-act="close">Закрыть</button></div></div>');
  window.__pvZoomFn = null; window.__pvResetFn = null;
  setTimeout(() => initPhotoViewer(), 0);
};
function initPhotoViewer() {
  const port = document.getElementById('pvPort');
  const img = document.getElementById('pvImg');
  const label = document.getElementById('pvLabel');
  if (!port || !img) return;
  let scale = 1, panX = 0, panY = 0;
  const minScale = 0.5, maxScale = 8;
  let dragging = false, startX = 0, startY = 0, startPanX = 0, startPanY = 0;
  let lastPinchDist = 0, lastPinchScale = 1;
  function applyTransform() {
    img.style.transform = 'translate(calc(-50% + ' + panX + 'px), calc(-50% + ' + panY + 'px)) scale(' + scale + ')';
    if (label) label.textContent = Math.round(scale * 100) + '%';
  }
  function clampPan() {
    const pw = port.clientWidth, ph = port.clientHeight;
    const iw = img.naturalWidth || pw, ih = img.naturalHeight || ph;
    const sw = iw * scale, sh = ih * scale;
    const maxX = Math.max(0, (sw - pw) / 2), maxY = Math.max(0, (sh - ph) / 2);
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }
  function fitScale() {
    const pw = port.clientWidth, ph = port.clientHeight;
    return Math.min(pw / (img.naturalWidth || pw), ph / (img.naturalHeight || ph), 1);
  }
  function doZoom(f) {
    const ns = Math.max(minScale, Math.min(maxScale, scale * f));
    panX = (panX - 0) * (ns / scale);
    panY = (panY - 0) * (ns / scale);
    scale = ns; clampPan(); applyTransform();
  }
  img.onload = () => { scale = Math.max(0.5, fitScale()); panX = 0; panY = 0; applyTransform(); };
  if (img.complete && img.naturalWidth) img.onload();
  port.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = port.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    const ns = Math.max(minScale, Math.min(maxScale, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
    panX = mx - (mx - panX) * (ns / scale);
    panY = my - (my - panY) * (ns / scale);
    scale = ns; clampPan(); applyTransform();
  }, { passive: false });
  const onMove = e => {
    if (!dragging) return;
    panX = startPanX + (e.clientX - startX);
    panY = startPanY + (e.clientY - startY);
    clampPan(); applyTransform();
  };
  const onUp = () => { dragging = false; };
  port.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      dragging = true;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      startPanX = panX; startPanY = panY; lastPinchDist = 0;
    } else if (e.touches.length === 2) {
      dragging = false;
      const t = e.touches;
      lastPinchDist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      lastPinchScale = scale;
    }
  }, { passive: true });
  port.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging) {
      panX = startPanX + (e.touches[0].clientX - startX);
      panY = startPanY + (e.touches[0].clientY - startY);
      clampPan(); applyTransform();
    } else if (e.touches.length === 2) {
      const t = e.touches;
      const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      if (lastPinchDist > 0) { scale = Math.max(minScale, Math.min(maxScale, lastPinchScale * (d / lastPinchDist))); clampPan(); applyTransform(); }
    }
  }, { passive: false });
  port.addEventListener('mousedown', e => {
    e.preventDefault(); dragging = true;
    startX = e.clientX; startY = e.clientY; startPanX = panX; startPanY = panY;
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.__pvZoomFn = dir => doZoom(dir > 0 ? 1.25 : 0.8);
  window.__pvResetFn = () => { scale = Math.max(0.5, fitScale()); panX = 0; panY = 0; applyTransform(); };
  window.__photoCleanup = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.__pvZoomFn = null; window.__pvResetFn = null;
  };
}
window.pvZoom = (dir) => { if (typeof window.__pvZoomFn === 'function') window.__pvZoomFn(+dir); };
window.pvReset = () => { if (typeof window.__pvResetFn === 'function') window.__pvResetFn(); };
window.delPhoto = (arg) => {
  const [kind, id] = String(arg).split(',');
  DB.sched[kind] = DB.sched[kind].filter(x => x.id != id);
  // Само фото лежит в отдельном хранилище (medshift_media) — иначе после
  // удаления записи оно осталось бы там навсегда и съедало квоту.
  mediaDrop(id);
  const t = (DB.schedTomb = DB.schedTomb || {});
  if (!t[id] || Date.now() > t[id]) t[id] = Date.now();
  purgeSched();
  save(); closeDlg(); render(); toast('Удалено');
  if (window.__fbToken) { restPut('schedtomb/' + id, { ts: t[id] }).then(() => bumpSchedMeta()).catch(() => { window.__schedDirty = true; }); }
  else window.__schedDirty = true;
};

// ---------- График смен ----------
window.openShiftDlg = (idx) => {
  DB.shiftGrid = DB.shiftGrid || [];
  const s = idx < 0 ? {} : DB.shiftGrid[+idx];
  // Дата в графике хранится ровно та, что была в импорте, — хоть «01.10.2026»,
  // хоть «1 октября». Поле типа date понимает только ГГГГ-ММ-ДД и на всём
  // остальном показывает пустоту: человек правит бригаду, жмёт «Сохранить» —
  // а смена уже без даты, и сохранение её отбрасывает. Для таких дат ставим
  // обычное текстовое поле, чтобы показать и вернуть строку как есть.
  // Ничего не переводим в другой формат намеренно: смена опознаётся по
  // ключу «дата|бригада|машина», и смена формата даты выглядела бы как
  // удаление старой строки и появление новой.
  const d = s.date || '';
  const dateField = isIsoDate(d)
    ? '<input id="shDate" type="date" value="' + esc(d) + '">'
    : '<input id="shDate" type="text" value="' + esc(d) + '" placeholder="ДД.ММ.ГГГГ" inputmode="numeric">'
      + '<small style="display:block;color:var(--mut)">Дата в графике записана как есть — в формате ГГГГ-ММ-ДД её можно выбрать в календаре.</small>';
  openDlg('<h3>Смена</h3><label>Дата</label>' + dateField + '<label>Бригада</label><input id="shBrig" value="' + esc(s.brigade || '') + '"><label>Машина</label><input id="shCar" value="' + esc(s.car || '') + '"><label>Сотрудники</label><input id="shStaff" value="' + esc(s.staff || '') + '"><label>Примечание</label><input id="shNote" value="' + esc(s.note || '') + '"><p><button class="btn" data-act="saveShiftDlg" data-arg="' + idx + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.saveShiftDlg = (idx) => {
  DB.shiftGrid = DB.shiftGrid || [];
  const o = {
    date: document.getElementById('shDate').value,
    brigade: document.getElementById('shBrig').value.trim(),
    car: document.getElementById('shCar').value.trim(),
    staff: document.getElementById('shStaff').value.trim(),
    note: document.getElementById('shNote').value.trim(),
    upd: Date.now()
  };
  if (!o.date) return toast('Укажите дату');
  if (idx < 0) DB.shiftGrid.push(o); else DB.shiftGrid[+idx] = o;
  save(); closeDlg(); render(); toast('Смена сохранена');
};
/* Ключ строки графика — дата+бригада+машина. Им же помечаем удаление,
   иначе удалённая строка возвращается с сервера ближайшим adoptState. */
/* shiftKeyOf() живёт в logic.js: от него зависят и импорт CSV, и очистка
   графика, и слияние на сервере. Держать его здесь было значило держать
   копию, которая однажды разойдётся с настоящей. */
window.delShiftRow = (idx) => {
  ask('Удалить строку?', () => {
    const r = (DB.shiftGrid || [])[+idx]; if (!r) return;
    DB.shiftTomb = DB.shiftTomb || [];
    const k = shiftKeyOf(r);
    if (!DB.shiftTomb.includes(k)) DB.shiftTomb.push(k);
    DB.shiftGrid.splice(+idx, 1); save(); render(); toast('Удалено');
  });
};
window.clearShiftGrid = () => {
  // Очистка стирает весь график станции и ставит могилы на каждую строку,
  // то есть запись не вернётся ни с одного телефона, пока её не введут
  // заново. Такое действие доступно руководителю — как удаление отчёта и
  // правка машин. Проверка стоит именно здесь, в обработчике: спрятать
  // кнопку мало, вызов можно сделать и вручную.
  if (!isBoss()) return toast('Очистка графика доступна только руководителю');
  if (!DB.shiftGrid || !DB.shiftGrid.length) return toast('Уже пусто');
  const сколько = DB.shiftGrid.length;
  ask('Удалить все записи? Пропадёт ' + сколько + ' ' + (сколько === 1 ? 'смена' : сколько < 5 ? 'смены' : 'смен') + ' из графика станции, вернуть их будет нельзя.', () => {
    DB.shiftTomb = DB.shiftTomb || [];
    DB.shiftGrid.forEach(r => { const k = shiftKeyOf(r); if (!DB.shiftTomb.includes(k)) DB.shiftTomb.push(k); });
    DB.shiftGrid = []; save(); render(); toast('Очищено');
  });
};
window.__importShiftGrid = (inp) => {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    DB.shiftGrid = DB.shiftGrid || [];
    const added = parseShiftCsv(r.result, DB.shiftGrid);
    DB.shiftGrid.push(...added);
    save(); render(); toast(added.length ? 'Импортировано: ' + added.length : 'Новых строк нет (уже импортировано)');
  };
  r.onerror = () => toast('Не удалось прочитать файл');
  r.readAsText(f);
};
window.schedDays = () => { schedSub = 'days'; render(); };
window.schedMonths = () => { schedSub = 'months'; render(); };
window.schedGrid = () => { schedSub = 'grid'; render(); };

// ---------- Профиль / настройки ----------
window.setName = (el) => { me().name = (el.value || '').trim(); save(); };
window.setPhone = (el) => { me().phone = (el.value || '').trim(); save(); };
window.setBday = () => {
  const d = document.getElementById('bdD').value, m = document.getElementById('bdM').value, y = document.getElementById('bdY').value;
  me().bday = (y === '0' || m === '0' || d === '0') ? '' : (y + '-' + m + '-' + d); save(); toast('Сохранено');
};
window.changePinDlg = () => {
  const u = me(); if (!u) return;
  openDlg('<h3>🔑 Сменить PIN</h3><label>Текущий PIN (тот, что сейчас)</label><input id="cpOld" type="password" inputmode="numeric"><label>Новый PIN</label><input id="cpNew" type="password" inputmode="numeric" maxlength="4"><label>Повторите</label><input id="cpNew2" type="password" inputmode="numeric" maxlength="4"><p><button class="btn" data-act="changePinDo">Сменить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.changePinDo = async () => {
  try {
    const u = me(); if (!u) return;
    const old = document.getElementById('cpOld').value;
    const n1 = document.getElementById('cpNew').value, n2 = document.getElementById('cpNew2').value;
    if (!(await verifyPin(u, old))) return toast('Неверный текущий PIN');
    if (!/^[0-9]{4}$/.test(n1)) return toast('Новый PIN: 4 цифры');
    if (n1 !== n2) return toast('Не совпадает');
    await setPin(u, n1); closeDlg(); render(); toast('✅ PIN изменён');
  } catch (err) {
    toast(err.message || 'Ошибка');
    try { closeDlg(); } catch (_) {}
  }
};
window.addResp = (kind) => {
  const u = me(); u[kind] = u[kind] || [];
  const list = kind === 'cars' ? DB.cars : DB.bags;
  const free = list.find(o => !u[kind].includes(o.id));
  if (!free) return toast('Сначала создайте объект');
  u[kind].push(free.id); save(); render();
};
window.setRespSel = (arg) => {
  const [kind, i] = String(arg).split(','); const u = me();
  const el = document.querySelector(`[data-act="setRespSel"][data-arg="${arg}"]`);
  u[kind][+i] = +el.value; save();
};
window.rmResp = (arg) => {
  const [kind, i] = String(arg).split(','); const u = me();
  u[kind].splice(+i, 1); save(); render();
};
window.toggleBiometric = async (el) => {
  try {
    if (el.checked) await enableBiometric(); else disableBiometric();
    render();
  } catch (err) { toast(err.message || 'Ошибка'); render(); }
};
window.setFontSize = (el) => {
  const v = +el.value; DB.settings.fontSize = v;
  document.getElementById('fsLabel').textContent = v + 'px';
  // Подпись «на этом экране» обязана ехать за ползунком, иначе она врёт:
  // стоит сдвинуть ползунок, а надпись продолжает показывать старое число.
  const hint = document.getElementById('fsHint');
  if (hint) hint.textContent = fsHintText(v, window.innerWidth);
  applyFontSize(); save();
};
window.setWarnDays = (el) => { DB.settings.warnDays = +el.value || 10; save(); };
window.setCity = (el) => { DB.settings.city = (el.value || '').trim(); clearWeatherCache(); save(); render(); };
window.setAccent = (a, el) => {
  const v = (typeof a === 'string' && /^#[0-9a-f]{6}$/i.test(a)) ? a : (el && el.value);
  if (!v || !/^#[0-9a-f]{6}$/i.test(String(v))) return;
  DB.settings.accent = String(v); save(); applyTheme(); render();
};
function hexRgb(hex) {
  let h = String(hex || '#0b5394').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) h = '0b5394';
  const i = parseInt(h, 16);
  return [i >> 16 & 255, i >> 8 & 255, i & 255];
}
window.setAccRGB = (ch, el) => {
  const rgb = hexRgb(DB.settings.accent);
  rgb[+ch] = Math.max(0, Math.min(255, Math.round(+el.value)));
  const v = '#' + rgb.map(x => ('0' + x.toString(16)).slice(-2)).join('');
  DB.settings.accent = v; save(); applyTheme();
  const lab = document.getElementById('acHex'); if (lab) lab.textContent = v;
  const cp = document.getElementById('acColor'); if (cp) cp.value = v;
  const vv = el.parentNode && el.parentNode.querySelector('.rgbVal'); if (vv) vv.textContent = el.value;
};
window.setDark = (el) => { DB.settings.dark = el.value; save(); applyTheme(); };
window.msToggleLeaves = (on) => { DB.settings.leaves = !!on; save(); if (on) startLeaves(); else stopLeaves(); };
window.manualAccentDlg = () => {
  const c = DB.settings.accent || '#0b5394';
  const rgb = hexRgb(c);
  const _cn = ['R', 'G', 'B'];
  let h = '<h3>🎨 Ручная настройка цвета</h3>';
  h += '<label>Цвет темы</label><div class="swRow" style="align-items:center;gap:8px">' +
    '<input type="color" id="acColor" value="' + c + '" data-act="setAccent" title="Открыть палитру целиком" style="flex:1 1 auto;width:auto;height:42px;min-height:42px;border:1px solid var(--bd);border-radius:10px;padding:4px;background:var(--card);cursor:pointer">' +
    '<span id="acHex" style="font-size:calc(var(--fs) - 2px);color:var(--mut);white-space:nowrap;font-family:monospace">' + c.toLowerCase() + '</span></div>';
  _cn.forEach((nm, ci) => {
    h += '<div class="swRow" style="align-items:center;gap:6px;margin:2px 0"><span style="width:16px;font-weight:700;flex-shrink:0">' + nm + '</span><input type="range" min="0" max="255" step="1" value="' + rgb[ci] + '" data-act="setAccRGB" data-arg="' + ci + '" style="flex:1"><span class="rgbVal" style="min-width:28px;text-align:right;font-family:monospace;color:var(--mut)">' + rgb[ci] + '</span></div>';
  });
  h += '<p><button class="btn" data-act="accOk">Готово</button></p>';
  openDlg(h);
  window.__dlgActions = {
    setAccent: (a, el) => window.setAccent(a, el),
    setAccRGB: (ch, el) => window.setAccRGB(ch, el),
    accOk: () => closeDlg()
  };
};
window.toggleLeaves = (el) => window.msToggleLeaves(!!el.checked);

// ---------- Сотрудники (админ) ----------
window.openRespDlg = (uid) => {
  const u = DB.users.find(x => x.id == uid); if (!u) return;
  let h = '<h3>Ответственность: ' + esc(u.name) + '</h3><label>Роль</label><select id="rsRole"><option value="user"' + (u.role === 'user' ? ' selected' : '') + '>сотрудник</option><option value="lead"' + (u.role === 'lead' ? ' selected' : '') + '>руководитель</option><option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>админ</option></select><label>Машины</label>';
  DB.cars.forEach(c => h += '<label><input type="checkbox" style="width:auto"' + ((u.cars || []).includes(c.id) ? ' checked' : '') + ' data-k="cars" data-id="' + c.id + '"> ' + esc(c.name) + '</label>');
  h += '<label>Сумки</label>';
  DB.bags.forEach(b => h += '<label><input type="checkbox" style="width:auto"' + ((u.bags || []).includes(b.id) ? ' checked' : '') + ' data-k="bags" data-id="' + b.id + '"> ' + esc(b.name) + '</label>');
  h += '<p><button class="btn" data-act="saveRespDlg" data-arg="' + uid + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>';
  openDlg(h);
};
window.saveRespDlg = (uid) => {
  const u = DB.users.find(x => x.id == uid);
  u.role = document.getElementById('rsRole').value; u.cars = []; u.bags = [];
  document.getElementById('dlgBody').querySelectorAll('input[type=checkbox]').forEach(b => {
    if (!b.checked) return; const id = +b.getAttribute('data-id');
    if (b.getAttribute('data-k') === 'cars') u.cars.push(id); else u.bags.push(id);
  });
  save(); closeDlg(); render(); toast('Сохранено');
};
window.adminPinDlg = (id) => {
  if (!isBoss()) return toast('Только руководитель');
  const u = DB.users.find(x => x.id == id); if (!u) return;
  openDlg('<h3>🔑 PIN</h3><p><b>' + esc(u.name) + '</b></p><label>Новый PIN (4 цифры)</label><input id="apPin" type="password" inputmode="numeric" maxlength="4"><label>Повторите</label><input id="apPin2" type="password" inputmode="numeric" maxlength="4"><p><button class="btn" data-act="adminPinDo" data-arg="' + id + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.adminPinDo = async (id) => {
  if (!isBoss()) return toast('Только руководитель');
  const u = DB.users.find(x => x.id == id); if (!u) return;
  const n1 = document.getElementById('apPin').value, n2 = document.getElementById('apPin2').value;
  if (!/^[0-9]{4}$/.test(n1)) return toast('PIN: 4 цифры');
  if (n1 !== n2) return toast('Не совпадает');
  await setPin(u, n1); save(); closeDlg(); render(); toast('PIN изменён');
};
window.addUserDlg = () => {
  if (!isBoss()) return toast('Добавлять сотрудников может только руководитель или админ');
  openDlg('<h3>Новый сотрудник</h3><label>ФИО</label><input id="aName"><label>PIN (4 цифры)</label><input id="aPin" type="password" inputmode="numeric" maxlength="4"><label>Роль</label><select id="aRole"><option value="user">сотрудник</option><option value="lead">руководитель</option><option value="admin">админ</option></select><p><button class="btn" data-act="addUserDo">Создать</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.addUserDo = async () => {
  // Проверка повторяется здесь, а не только в открытии окна: роль
  // выбирается в самой форме, и без этой проверки сотрудник создавал себе
  // учётную запись с ролью «админ» — то есть полностью перехватывал станцию.
  if (!isBoss()) return toast('Добавлять сотрудников может только руководитель или админ');
  const n = document.getElementById('aName').value.trim();
  const p = document.getElementById('aPin').value;
  if (!n) return toast('Введите ФИО');
  if (!/^[0-9]{4}$/.test(p)) return toast('PIN: 4 цифры');
  if (isBannedName(n)) return toast('🚫 Забанено');
  const u = { id: uid(), name: n, pin: '', role: document.getElementById('aRole').value, cars: [], bags: [], phone: '', bday: '' };
  await setPin(u, p);
  DB.users.push(u); save(); closeDlg(); render(); toast('Сотрудник создан');
};
window.doneTask = (id) => {
  const t = DB.tasks.find(x => x.id == id); t.done = true; save(); render(); toast('Задача закрыта');
};
window.delUser = (id) => {
  // Удаление сотрудника необратимо: id уходит в могилу, и с других
  // телефонов человек не вернётся. Делает это только руководитель или админ.
  // Проверка в обработчике: кнопка у сотрудника и так скрыта, но вызов
  // доступен из консоли — и в проверке я именно так его и вызвал.
  if (!isBoss()) return toast('Удалить сотрудника может только руководитель или админ');
  const u = DB.users.find(x => x.id == id); if (!u) return;
  ask('Удалить сотрудника «' + esc(u.name) + '» из списка?', () => {
    // +u.id, а не id из data-arg: id приходит строкой, а фильтр могил в
    // sync сравнивал строго — удалённый сотрудник возвращался с сервера
    // вместе со своим PIN-хэшем.
    DB.tomb = DB.tomb || []; if (!DB.tomb.some(x => String(x) === String(u.id))) DB.tomb.push(u.id);
    DB.users = DB.users.filter(x => x.id != id); save(); render(); toast('Сотрудник удалён');
  });
};

// ---------- Ключ склада (Firebase) ----------
window.fbCredDlg = () => {
  openDlg('<h3>🔑 Ключ склада</h3><p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Логин и пароль учётной записи Google-проекта склада.</p><label>Email</label><input id="fbEmail" type="email"><label>Пароль</label><input id="fbPass" type="password"><p><button class="btn" data-act="fbCredDo">Подключить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.fbCredDo = async () => {
  try {
    const email = document.getElementById('fbEmail').value.trim();
    const pass = document.getElementById('fbPass').value;
    if (!email || !pass) return toast('Заполните оба поля');
    const ok = await signIn(email, pass);
    if (ok) { closeDlg(); toast('✅ Склад подключён'); presBeat(); setTimeout(() => syncTest(), 500); }
    else toast('❌ ' + errText('invalid'));
  } catch (err) {
    toast('❌ ' + errText(err.message || 'NETWORK'));
  }
};

// ---------- Данные ----------
const saveFile = (name, obj) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
  a.download = name; a.click();
  // Ссылку надо отпустить: иначе blob держится в памяти до перезагрузки,
  // а на телефоне это десятки мегабайт при выгрузке фото.
  setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 30000);
};
window.exportDB = () => {
  const n = Object.keys(mediaAll()).length;
  saveFile('medshift-' + todayStr() + '.json', exportSlim());
  toast(n ? 'База сохранена. Фото и файлы смен (' + n + ') — отдельной кнопкой, они большие' : 'Файл сохранён');
};
window.exportMedia = () => {
  const photos = mediaAll(), n = Object.keys(photos).length;
  if (!n) return toast('Загруженных фото и файлов смен нет');
  saveFile('medshift-' + todayStr() + '-photo.json', { kind: 'medshift-media', photos });
  toast('Фото выгружены: ' + n);
};
window.__importDB = (inp) => {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      adoptDB(JSON.parse(r.result));
      save(); saveNow(); location.reload();
    } catch (e) { toast('Ошибка файла: ' + (e && e.message ? e.message : 'неизвестно')); }
  };
  r.onerror = () => toast('Не удалось прочитать файл');
  r.readAsText(f);
};
window.__importMedia = (inp) => {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const raw = JSON.parse(r.result);
      const photos = (raw && raw.photos) ? raw.photos : raw;
      const n = mediaRestore(photos);
      if (!n) return toast('В файле не нашлось фото');
      if (window.render) render();
      toast('Фото восстановлены: ' + n);
    } catch (e) { toast('Ошибка файла: ' + (e && e.message ? e.message : 'неизвестно')); }
  };
  r.onerror = () => toast('Не удалось прочитать файл');
  r.readAsText(f);
};
window.deleteMyAccountDlg = () => {
  const u = me(); if (!u) return toast('Не вошли');
  openDlg('<h3>🗑 Удалить аккаунт</h3><p style="color:var(--mut)">Аккаунт «<b>' + esc(u.name) + '</b>» будет удалён навсегда.</p><label>PIN для подтверждения</label><input id="delPin" type="password" inputmode="numeric" maxlength="4"><p><button class="btn del" data-act="doDeleteMyAccount">Удалить</button><button class="btn sec" data-act="close">Отмена</button></p>');
};
window.doDeleteMyAccount = async () => {
  const u = me(); if (!u) return;
  const pin = document.getElementById('delPin').value;
  if (!(await verifyPin(u, pin))) return toast('❌ Неверный PIN');
  ask('Точно удалить «' + esc(u.name) + '»?', async () => {
    DB.tomb = DB.tomb || []; if (!DB.tomb.includes(u.id)) DB.tomb.push(u.id);
    DB.users = DB.users.filter(x => x.id !== u.id);
    DB.session = null; localStorage.removeItem('medshift_my'); localStorage.removeItem('medshift_rem');
    save(); closeDlg(); go('home'); toast('🗑 Удалён');
  });
};
window.safeResetDlg = () => {
  const u = me(); if (!u) return toast('Сначала войдите');
  openDlg('<h3>♻️ Сброс устройства</h3><p style="color:var(--mut)">Очистит кэш <b>только на этом устройстве</b>. База на сервере сохранится.</p><label>PIN</label><input id="resetPin" type="password" inputmode="numeric" maxlength="4"><p><button class="btn del" data-act="doSafeReset">Сбросить</button><button class="btn sec" data-act="close">Отмена</button></p>');
};
window.doSafeReset = async () => {
  const u = me(); if (!u) return;
  const pin = document.getElementById('resetPin').value;
  if (!(await verifyPin(u, pin))) return toast('❌ Неверный PIN');
  localStorage.removeItem('medshift_v3'); localStorage.removeItem('medshift_my');
  localStorage.removeItem('medshift_rem'); localStorage.removeItem('medshift_rem_ts');
  localStorage.removeItem('medshift_tab');
  try { localStorage.removeItem('medshift_bio'); } catch {}
  DB.session = null; closeDlg();
  toast('♻️ Сброшено'); saveNow(); setTimeout(() => location.reload(), 800);
};

// ---------- Логин ----------
window.loginPick = (id) => {
  const u = DB.users.find(x => x.id == id); if (!u || isDead(u.id)) return;
  if (!u.pin && !u.pinSalt) { loginAs(u); announceLogin(u); go('home'); return; }
  loginFor = +id; render();
};
window.loginDo = async () => {
  const u = DB.users.find(x => x.id == loginFor);
  const v = document.getElementById('pinIn').value;
  const bad = await pinCheck(u, v); if (bad) return toast(bad);
  const rm = document.getElementById('remMe');
  localStorage.setItem('medshift_rem', rm && rm.checked ? '1' : '0');
  if (rm && rm.checked) localStorage.setItem('medshift_rem_ts', String(Date.now()));
  loginAs(u); announceLogin(u); presBeat(); go('home'); toast('Смена начата 👋');
};
window.toggleByName = () => { loginFor = loginFor === -2 ? 0 : -2; render(); };
window.loginByName = async () => {
  const n = normName(document.getElementById('lnName').value);
  const p = document.getElementById('lnPin').value;
  if (isBannedName(n)) return toast('🚫 Забанен');
  let u = DB.users.find(x => normName(x.name) === n);
  if (!u) {
    toast('🔍 Ищем на складе…');
    try {
      if (window.__fbToken) {
        const m = await restGet('meta');
        if (m && +m.rev > (DB.rev || 0)) {
          const v = await restGet('state');
          if (v && v.data) adoptState(v.data, v.rev || 0);
        }
      }
    } catch {}
    u = DB.users.find(x => normName(x.name) === n);
  }
  if (!u) {
    if (!window.__fbToken) {
      window.__kpAfter = async () => {
        const u2 = DB.users.find(x => normName(x.name) === n);
        if (!u2) return toast('Сотрудник не найден на складе — проверьте, что аккаунт создан');
        const bad2 = await pinCheck(u2, p); if (bad2) return toast(bad2);
        loginAs(u2); announceLogin(u2); presBeat(); go('home'); toast('Смена начата 👋');
      };
      return openKeyDlg();
    }
    return toast('Сотрудник не найден на складе');
  }
  const bad = await pinCheck(u, p); if (bad) return toast(bad);
  loginAs(u); announceLogin(u); presBeat(); go('home'); toast('Смена начата 👋');
};
window.openKeyDlg = () => {
  openDlg('<h3>🔑 Ключ склада</h3><p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Этот браузер ещё не подключён к складу. Введите логин и пароль учётной записи Google-проекта — после синхронизации вход продолжится автоматически.</p><label>Email склада</label><input id="kpEmail" type="email"><label>Пароль склада</label><input id="kpPass" type="password"><p><button class="btn" data-act="keyPromptDo">🔐 Подключить и войти</button><button class="btn sec" data-act="close">Отмена</button></p>');
};
window.keyPromptDo = async () => {
  const emEl = document.getElementById('kpEmail'), psEl = document.getElementById('kpPass');
  const em = emEl ? emEl.value.trim() : '', ps = psEl ? psEl.value : '';
  if (!em || !ps) return toast('Введите логин и пароль склада');
  toast('🔐 Подключаю склад…');
  try {
    const ok = await signIn(em, ps);
    if (!ok) return toast('❌ ' + errText('invalid'));
  } catch (err) { return toast('❌ ' + errText(err.message || 'NETWORK')); }
  toast('✅ Склад подключён, синхронизирую…');
  try {
    const m = await restGet('meta');
    if (m && +m.rev > (DB.rev || 0)) {
      const v = await restGet('state');
      if (v && v.data) adoptState(v.data, v.rev || 0);
    }
  } catch (e) { toast('⚠ Не удалось получить состояние: ' + (e && e.message ? e.message : 'сеть')); }
  presBeat(); setTimeout(() => syncTest(), 500);
  const after = window.__kpAfter; window.__kpAfter = null;
  closeDlg();
  if (typeof after === 'function') await after();
};
window.regView = () => {
  const needKey = !window.__fbToken;
  openDlg('<h3>Анкета</h3><label>ФИО</label><input id="rName"><label>PIN (4 цифры)</label><input id="rPin" type="password" inputmode="numeric" maxlength="4"><label>Повторите PIN</label><input id="rPin2" type="password" inputmode="numeric" maxlength="4">' + (needKey ? '<hr><p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">🔐 Для первого запуска необходимо подключить склад (логин и пароль учётной записи Google-проекта)</p><label>Email склада</label><input id="fbdEmail" type="email"><label>Пароль склада</label><input id="fbdPass" type="password">' : '') + '<p><button class="btn" data-act="regDo">Создать</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.regDo = async () => {
  const n = document.getElementById('rName').value.trim();
  const p1 = document.getElementById('rPin').value, p2 = document.getElementById('rPin2').value;
  if (!n) return toast('Введите ФИО');
  if (!/^[0-9]{4}$/.test(p1)) return toast('PIN: 4 цифры');
  if (p1 !== p2) return toast('Не совпадает');
  if (isBannedName(n)) return toast('🚫 Забанен');
  if (!window.__fbToken) {
    const emEl = document.getElementById('fbdEmail'), psEl = document.getElementById('fbdPass');
    const em = emEl ? emEl.value.trim() : '', ps = psEl ? psEl.value : '';
    if (!em || !ps) return toast('Введите логин и пароль склада');
    toast('🔐 Подключаю склад…');
    try {
      const ok = await signIn(em, ps);
      if (!ok) return toast('❌ ' + errText('invalid'));
    } catch (err) { return toast('❌ ' + errText(err.message || 'NETWORK')); }
    toast('✅ Склад подключён');
    presBeat(); setTimeout(() => syncTest(), 500);
  }
  // Роль при регистрации: владелец станции — всегда админ, остальные — нет.
  // Права больше не зависят от того, кто первым нажал кнопку: владелец
  // запоминается в DB.ownerId при первом заходе (см. normalizeDB в db.js).
  const first = DB.users.length === 0;
  const u = { id: uid(), name: n, pin: '', role: first ? 'admin' : 'user', cars: [], bags: [], phone: '', bday: '' };
  if (first) DB.ownerId = u.id;
  await setPin(u, p1);
  DB.users.push(u); loginAs(u); save(); closeDlg(); presBeat(); go('home');
  toast(u.role === 'admin' ? 'Вы админ 👑' : '✅ Регистрация');
};
window.qrDlg = () => {
  openDlg('<h3>📲 Установка</h3><img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=https%3A%2F%2Ffeldsherikydze-dot.github.io%2Fmedshift%2F" style="width:70%;display:block;margin:0 auto;border-radius:8px"><p style="text-align:center;font-size:calc(var(--fs) - 2px);color:var(--mut)">feldsherikydze-dot.github.io/medshift</p><p style="font-size:calc(var(--fs) - 1px)">1. Наведите камеру на код<br>2. Откройте ссылку<br>3. ⋮ → «Добавить на главный экран»<br>4. Запустите ярлык и зарегистрируйтесь</p><p><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.installApp = () => {
  if (window.__medshiftInstallPrompt) {
    window.__medshiftInstallPrompt.prompt();
    window.__medshiftInstallPrompt.userChoice.then(() => { window.__medshiftInstallPrompt = null; });
  } else toast('Меню браузера → «Добавить на главный экран»');
};

// ---------- Тревоги / статистика ----------
window.navigateToAlert = (item) => {
  closeDlg();
  if (item && item.type === 'pot') {
    curPot = true; curPotKit = item.potId; go('bags');
  } else if (item && item.type === 'bag') {
    curBag = item.bagId; highlightItem = item.item.name; go('bags');
  } else if (item && item.type === 'kit') {
    curCar = item.carId; curKit = item.kitId; highlightItem = item.item.name; go('cars');
  } else {
    render(); return;
  }
  setTimeout(() => {
    const rows = document.querySelectorAll('tr[data-item]');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-item') === item.item.name) {
        rows[i].classList.add('highlight');
        rows[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
        break;
      }
    }
  }, 120);
};
window.alertCount = (a) => (a || []).reduce((n, al) => n + (al.items && al.items.length ? al.items.length : 1), 0);
window.showAlertsDlg = () => {
  const a = alerts(); if (!a.length) return toast('✅ Тревог нет');
  let h = '<h3>🔔 Тревоги (' + alertCount(a) + ')</h3>';
  a.forEach((al, ai) => {
    const col = al.l === 'bExp' || al.l === 'bR' ? '#c62828' : al.l === 'bSoon' || al.l === 'bY' ? '#ef6c00' : al.l === 'bNoDate' ? '#5e35b1' : '#2e7d32';
    h += '<div class="card" style="margin-bottom:8px;border-left:6px solid ' + col + ';overflow:visible"><div style="overflow-wrap:anywhere"><span class="badge ' + al.l + '">!</span> <b>' + esc(al.t) + '</b></div>';
    if (al.items && al.items.length) {
      h += '<table style="margin-top:6px;width:100%;table-layout:fixed"><tr><th>Позиция</th><th style="width:38px"></th></tr>';
      al.items.forEach((it, i) => {
        const label = it.type === 'bag' || it.type === 'pot' ? it.name : it.carName + ' / ' + it.kitName;
        h += '<tr><td style="vertical-align:middle">' + esc(label) + ' — <b>' + esc(it.item.name) + '</b><br><small>' + badgeExp(it.item.expiry) + '</small></td><td style="text-align:right;vertical-align:middle;width:38px"><button class="btn sec mini" style="max-width:100%;overflow:hidden" data-act="navAlert" data-arg="' + ai + ',' + i + '">→</button></td></tr>';
      });
      h += '</table>';
    } else if (al.reportId) {
      h += '<br><button class="btn sec mini" style="margin-top:6px" data-act="viewReport" data-arg="' + al.reportId + '">👁 Открыть отчёт</button>';
    } else if (al.carId) {
      h += '<br><button class="btn sec mini" style="margin-top:6px" data-act="navCar" data-arg="' + al.carId + '">🚑 Перейти к машине</button>';
    }
    h += '</div>';
  });
  h += '<p><button class="btn sec wide" data-act="close">Закрыть</button></p>';
  window.__dlgAlerts = a;
  openDlg(h);
};
window.navCar = (carId) => {
  closeDlg(); curCar = +carId; curKit = null; go('cars');
};
window.navAlert = (aii) => {
  const [ai, i] = String(aii).split(',').map(Number);
  const it = window.__dlgAlerts && window.__dlgAlerts[ai] && window.__dlgAlerts[ai].items[i];
  if (it) navigateToAlert(it);
};
window.showStatsDetail = () => {
  let tot = 0, expN = 0, soonN = 0;
  const bagStats = [], carStats = [];
  DB.bags.forEach(b => {
    let bc = 0, be = 0, bs = 0;
    (b.items || []).forEach(it => { bc++; const c = expClass(it && it.expiry); if (c === 'exp') be++; else if (c === 'soon') bs++; });
    tot += bc; expN += be; soonN += bs;
    bagStats.push({ name: b.name, total: bc, expired: be, soon: bs });
  });
  DB.cars.forEach(c => (c.kits || []).forEach(k => {
    let kc = 0, ke = 0, ks = 0;
    (k.items || []).forEach(it => { kc++; const c = expClass(it && it.expiry); if (c === 'exp') ke++; else if (c === 'soon') ks++; });
    tot += kc; expN += ke; soonN += ks;
    carStats.push({ car: c.name, kit: k.name, total: kc, expired: ke, soon: ks });
  }));
  let h = '<h3>📊 Подробная статистика</h3><p><b>Всего позиций:</b> ' + tot + ' · <b>Просрочено:</b> ' + expN + ' · <b>Истекает:</b> ' + soonN + '</p>';
  h += '<h4>👜 Сумки</h4><table><tr><th>Название</th><th>Поз.</th><th>Проср.</th><th>Истек.</th></tr>';
  bagStats.forEach(s => h += '<tr' + (s.expired > 0 ? ' class="exp"' : s.soon > 0 ? ' class="soon"' : '') + '><td>' + esc(s.name) + '</td><td>' + s.total + '</td><td>' + (s.expired || '—') + '</td><td>' + (s.soon || '—') + '</td></tr>');
  h += '</table>';
  if (carStats.length) {
    h += '<h4>🚑 Машины / Укладки</h4><table><tr><th>Машина</th><th>Укладка</th><th>Поз.</th><th>Проср.</th><th>Истек.</th></tr>';
    carStats.forEach(s => h += '<tr' + (s.expired > 0 ? ' class="exp"' : s.soon > 0 ? ' class="soon"' : '') + '><td>' + esc(s.car) + '</td><td>' + esc(s.kit) + '</td><td>' + s.total + '</td><td>' + (s.expired || '—') + '</td><td>' + (s.soon || '—') + '</td></tr>');
    h += '</table>';
  }
  h += '<p><button class="btn sec" data-act="close">Закрыть</button></p>';
  openDlg(h);
};
window.showAlerts = window.showAlertsDlg;
window.showStats = window.showStatsDetail;
window.goReports = () => go('reports');
window.goChat = () => go('chat');
window.clearRef = () => { refSearch = ''; const i = document.getElementById('refInput'); if (i) i.value = ''; if (window.renderRefResults) window.renderRefResults(); };
window.__refSearchInput = (v) => { refSearch = v; if (window.renderRefResults) window.renderRefResults(); };

// ---------- Отлов ошибок (помощник отладки) ----------
let __errAt = 0;
function __errToast(m) {
  const n = Date.now();
  if (n - __errAt < 3000) return;
  __errAt = n;
  try { if (window.toast) toast('⚠ Ошибка: ' + String(m).slice(0, 120)); } catch {}
}
window.addEventListener('error', e => { console.error('[err]', e.error || e.message); __errToast((e.message || 'JS error')); });
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  console.error('[rej]', r);
  __errToast((r && r.message) || r || 'promise'); 
});

// ---------- Event delegation ----------
document.addEventListener('click', e => {
  const el = e.target;
  const tag = el && el.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const act = btn.dataset.act, arg = btn.dataset.arg || '';
  if (act === 'close' || act === 'cancel') { e.preventDefault(); closeDlg(); return; }
  const fn = Object.prototype.hasOwnProperty.call(window, act) && window[act];
  if (typeof fn === 'function') {
    e.preventDefault();
    try { fn(arg, btn, e); } catch (err) { console.error('[act]', act, err); toast('Ошибка: ' + err.message); }
  }
});
document.addEventListener('change', e => {
  const el = e.target; if (!el.dataset || !el.dataset.act) return;
  const act = el.dataset.act;
  const fn = Object.prototype.hasOwnProperty.call(window, act) && window[act];
  if (typeof fn !== 'function') return;
  try {
    const arg = el.dataset.arg;
    if (arg != null && arg !== '') fn(arg, el); else fn(el);
  } catch (err) { console.error('[change]', act, err); }
});
document.addEventListener('input', e => {
  const el = e.target; if (!el.dataset || !el.dataset.act) return;
  const act = el.dataset.act;
  if (['editBagItem', 'editEquipItem', 'editKitItem', 'setRespSel', 'setAccRGB'].includes(act)) {
    const fn = window[act]; if (fn) try { fn(el.dataset.arg, el); } catch (err) { console.error(err); }
  }
});

// ---------- Старт ----------
restoreToken();
setInterval(checkSessionExpiry, 60000);
applyTheme();
purgeSched();

(function waitToken() {
  let t = 0;
  const iv = setInterval(() => {
    if (window.__fbToken || ++t * 250 >= 8000) { clearInterval(iv); syncInit(); }
  }, 250);
})();

renderNav();
// tab из ui.js, а не localStorage: именно там разбирается '?tab=' из
// ярлыков манифеста. Чтение localStorage здесь перетирало его, и все три
// ярлыка открывали последнюю запомненную вкладку.
if (DB.session) go(tab); else render();

// drugs.js (73 КБ) больше не мешает первой отрисовке: он подтягивается сам,
// когда человек ищет препарат, плюс один раз в фоне. Раньше здесь стоял
// самовосстанавливающийся загрузчик — он инициировал скачивание 73 КБ на
// каждом запуске и ругался тостом, если файл не нашёлся.
// updateFoot() — не полный render(): подвал просто дописывает число препаратов,
// когда файл догрузился. Полная перерисовка сбила бы открытый диалог.
preloadDrugs().then(ok => { if (ok) updateFoot(); });

if ('serviceWorker' in navigator) {
  const reg = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__medshiftInstallPrompt = e; });

import('./background.js').then(() => {
  console.log('[MedShift] ✅ Фон загружен');
}).catch(e => {
  try { console.error('[MedShift] Фон недоступен (интерфейс продолжит работу):', e); } catch (_) {}
});

console.log('[MedShift] ✅ Модульная архитектура загружена');
window.bootReady = true;