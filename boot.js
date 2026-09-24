import './db.js';
import './sync.js';
import './auth.js';
import './ui.js';
import './weather.js';
import './seasons.js';
import './chat.js';
import './reports.js';
import './views.js';

import { DB, save, uid, me, isBoss, esc, todayStr, daysLeft, normName, isDead, isBannedName, purgeSched, myBags, myCars, soonList, alerts, bdayToday, mkKit } from './db.js';
import { syncInit, syncTest, presBeat, fbUrl, restGet, restPut, restDelete, adoptState, SYNCSTAT } from './sync.js';
import { restoreToken, verifyPin, setPin, loginAs, logout, checkSessionExpiry, enableBiometric, disableBiometric, biometricLogin, banUser, unbanUser, signIn, errText } from './auth.js';
import { toast, openDlg, closeDlg, ask, askText, applyTheme, applyFontSize, updHead, renderNav, render, go, tab } from './ui.js';
import { loadWeather, showForecast, startClock, wIcon } from './weather.js';
import { seasonHtml, startLeaves, stopLeaves } from './seasons.js';
import { chatView, sendMsg, clearChat, botJoke, decorateChat, announceLogin } from './chat.js';
import { reportsView, openRep, submitRep, delReport, viewReport, resolveReport, unresolveReport, downloadReport, printReport, reportBadge, expiredItemText } from './reports.js';

// ---------- Экспорт в window (для onclick из views.js) ----------
Object.assign(window, {
  DB, save, uid, me, isBoss, esc, todayStr, daysLeft, normName, isDead, isBannedName,
  purgeSched, myBags, myCars, soonList, alerts, bdayToday, mkKit,
  syncInit, syncTest, presBeat, fbUrl, restGet, restPut, restDelete, adoptState, SYNCSTAT,
  restoreToken, verifyPin, setPin, loginAs, logout, checkSessionExpiry,
  enableBiometric, disableBiometric, biometricLogin, banUser, unbanUser, signIn, errText,
  toast, openDlg, closeDlg, ask, askText, applyTheme, applyFontSize, updHead, renderNav, render, go,
  loadWeather, showForecast, startClock, wIcon,
  seasonHtml, startLeaves, stopLeaves,
  chatView, sendMsg, clearChat, botJoke, decorateChat, announceLogin,
  reportsView, openRep, submitRep, delReport, viewReport, resolveReport, unresolveReport,
  downloadReport, printReport, reportBadge, expiredItemText
});

// ---------- Недостающие функции (из оригинального кода) ----------
let curBag = null, curCar = null, curKit = null;
let curTpl = false, curPot = false, curPotKit = null;
let openTplId = null, tplSearch = '', refSearch = '';
let schedSub = 'days';
let highlightItem = null;
let editBag = null, editKit = null, editEquip = null, editTpl = null;
let loginFor = null, repCar = null, room = 'общая';
Object.assign(window, {
  get curBag() { return curBag; }, set curBag(v) { curBag = v; },
  get curCar() { return curCar; }, set curCar(v) { curCar = v; },
  get curKit() { return curKit; }, set curKit(v) { curKit = v; },
  get curTpl() { return curTpl; }, set curTpl(v) { curTpl = v; },
  get curPot() { return curPot; }, set curPot(v) { curPot = v; },
  get curPotKit() { return curPotKit; }, set curPotKit(v) { curPotKit = v; },
  get openTplId() { return openTplId; }, set openTplId(v) { openTplId = v; },
  get tplSearch() { return tplSearch; }, set tplSearch(v) { tplSearch = v; },
  get refSearch() { return refSearch; }, set refSearch(v) { refSearch = v; },
  get schedSub() { return schedSub; }, set schedSub(v) { schedSub = v; },
  get highlightItem() { return highlightItem; }, set highlightItem(v) { highlightItem = v; },
  get editBag() { return editBag; }, set editBag(v) { editBag = v; },
  get editKit() { return editKit; }, set editKit(v) { editKit = v; },
  get editEquip() { return editEquip; }, set editEquip(v) { editEquip = v; },
  get editTpl() { return editTpl; }, set editTpl(v) { editTpl = v; },
  get loginFor() { return loginFor; }, set loginFor(v) { loginFor = v; },
  get repCar() { return repCar; }, set repCar(v) { repCar = v; },
  get room() { return room; }, set room(v) { room = v; }
});

// ---------- Сумки ----------
window.openBagDlg = () => {
  openDlg('<h3>Новая сумка</h3><label>Название</label><input id="bName"><p><button class="btn" data-act="saveBagDlg">Создать</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.saveBagDlg = () => {
  const n = document.getElementById('bName').value.trim();
  if (!n) return toast('Введите название');
  DB.bags.push({ id: uid(), name: n, items: [], kits: [] });
  save(); closeDlg(); render(); toast('Сумка создана');
};
window.renameBag = (id) => {
  const b = DB.bags.find(x => x.id == id); if (!b) return;
  askText('Переименовать сумку', b.name, n => { b.name = n; save(); render(); toast('Сумка переименована'); });
};
window.delBag = (id) => {
  ask('Удалить сумку со всеми позициями?', () => {
    DB.bagTomb = DB.bagTomb || []; if (!DB.bagTomb.includes(id)) DB.bagTomb.push(id);
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
  openDlg('<h3>Позиция</h3><label>Название</label><input id="item_name" value="' + esc(it.name || '') + '"><label>Форма</label><input id="item_spec" value="' + esc(it.spec || '') + '"><div class="row"><div><label>Кол-во</label><input id="iQty" type="number" value="' + (it.qty || 1) + '"></div><div><label>Ед.</label><input id="item_unit" value="' + esc(it.unit || 'шт') + '"></div></div><label>Срок годности</label><input id="iExp" type="date" value="' + (it.expiry || '') + '"><label><input type="checkbox" style="width:auto" id="iPot"' + (it.potent ? ' checked' : '') + '> Сильнодействующий препарат</label><p><button class="btn" data-act="saveItemDlg" data-arg="' + bid + ',' + idx + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
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
  const b = DB.bags.find(x => x.id == bid); const t = document.getElementById('impTa').value; let n = 0;
  t.split(/\r?\n/).forEach(line => {
    line = line.trim(); if (!line) return;
    line = line.replace(/^\s*\d{1,3}\s*[.)]\s*/, '');
    let qty = 1, unit = 'шт';
    const m = line.match(/^(.*?)\s+([0-9]{1,4})\s*(амп|фл|шт|пар|уп|таб|капс|компл|блистер|пакет)?\.?$/i);
    if (m) { line = m[1]; qty = +m[2]; if (m[3]) unit = m[3].toLowerCase(); }
    b.items.push({ name: line, spec: '', unit, qty, expiry: '', potent: false }); n++;
  });
  save(); closeDlg(); render(); toast('Добавлено позиций: ' + n);
};

// ---------- Машины ----------
window.openCarDlg = (id) => {
  const c = id ? DB.cars.find(x => x.id == id) : null;
  let h = '<h3>' + (c ? 'Машина' : 'Новый автомобиль СМП') + '</h3><label>Бортовой номер</label><input id="cName" value="' + (c ? esc(c.name) : '') + '"><label>Госномер</label><input id="cPlates" value="' + (c ? esc(c.plates || '') : '') + '">';
  if (!c) h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">После создания откройте машину и добавьте укладки через «➕ Укладка»</p>';
  h += '<p><button class="btn" data-act="saveCarDlg" data-arg="' + (id || 'null') + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>';
  openDlg(h);
};
window.saveCarDlg = (id) => {
  const n = document.getElementById('cName').value.trim(); if (!n) return toast('Введите номер');
  const pl = document.getElementById('cPlates').value.trim();
  if (id && id !== 'null') {
    const c = DB.cars.find(x => x.id == id); c.name = n; c.plates = pl;
  } else {
    DB.cars.push({ id: uid(), name: n, plates: pl, equip: [], kits: [] });
  }
  save(); closeDlg(); render(); toast('Машина сохранена');
};
window.openCar = (id) => { curCar = +id; curKit = null; render(); };
window.editCar = (id) => window.openCarDlg(id);
window.delCar = (id) => {
  ask('Удалить машину?', () => {
    DB.carTomb = DB.carTomb || []; if (!DB.carTomb.includes(+id)) DB.carTomb.push(+id);
    DB.cars = DB.cars.filter(c => c.id != id); save(); render(); toast('Машина удалена');
  });
};
window.backCars = () => { curCar = null; curKit = null; highlightItem = null; editEquip = false; render(); };
window.addKitDlg = (cid) => {
  if (!isBoss()) return toast('Только руководитель');
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
  if (editEquip === cid) { editEquip = false; save(); toast('Сохранено'); } else editEquip = cid;
  render();
};
window.editEquipItem = (arg) => {
  const [cid, i, field] = String(arg).split(','); const c = DB.cars.find(x => x.id == cid);
  const el = document.querySelector(`[data-act="editEquipItem"][data-arg="${arg}"]`);
  if (!el) return; c.equip[+i][field] = el.value;
};
window.delEquipItem = (arg) => {
  const [cid, i] = String(arg).split(','); const c = DB.cars.find(x => x.id == cid);
  c.equip.splice(+i, 1); render();
};
window.addEquipItem = (cid) => {
  const c = DB.cars.find(x => x.id == cid);
  c.equip.push({ id: uid(), ovm: '', name: 'Новое оборудование', status: 'ok', charge: '', defect: '' });
  render();
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
  openDlg('<h3>Позиция укладки</h3><label>Название</label><input id="kit_item_name" value="' + esc(it.name || '') + '"><div class="row"><div><label>Кол-во</label><input id="kQty" type="number" value="' + (it.qty || 1) + '"></div><div><label>Ед.</label><input id="kit_item_unit" value="' + esc(it.unit || 'шт') + '"></div></div><label>Форма</label><input id="kit_item_spec" value="' + esc(it.spec || '') + '"><label>Срок</label><input id="kExp" type="date" value="' + (it.expiry || '') + '"><label><input type="checkbox" style="width:auto" id="kPot"' + (it.potent ? ' checked' : '') + '> Сильнодействующий</label><p><button class="btn" data-act="saveKitItem" data-arg="' + cid + ',' + kid + ',' + idx + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
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
window.toggleTplOpen = (id) => { openTplId = openTplId === id ? null : id; tplSearch = ''; render(); };
window.toggleEditTpl = (id) => {
  if (editTpl === id) { editTpl = null; save(); toast('Сохранено'); } else editTpl = id;
  render();
};
window.addTplPos = (id) => {
  if (id === 'bag') DB.bagTypes[0].items.push({ name: 'Новая позиция', spec: '', unit: 'шт', qty: 1, potent: false });
  else { const ki = parseInt(id.replace('kit_', '')); DB.kitTemplates[ki].items.push({ name: 'Новая позиция', spec: '', unit: 'шт', qty: 1, potent: id.indexOf('kit_4') === 0 }); }
  render();
};
window.editTplPos = (arg) => {
  const parts = String(arg).split(','); const id = parts[0], i = +parts[1], field = parts[2];
  const el = document.querySelector(`[data-act="editTplPos"][data-arg="${arg}"]`);
  if (!el) return; const val = el.value;
  if (id === 'bag') { if (field === 'qty') DB.bagTypes[0].items[i].qty = +val; else DB.bagTypes[0].items[i][field] = val; }
  else { const ki = parseInt(id.replace('kit_', '')); if (field === 'qty') DB.kitTemplates[ki].items[i].qty = +val; else DB.kitTemplates[ki].items[i][field] = val; }
};
window.delTplPos = (arg) => {
  const parts = String(arg).split(','); const id = parts[0], i = +parts[1];
  if (id === 'bag') DB.bagTypes[0].items.splice(i, 1);
  else { const ki = parseInt(id.replace('kit_', '')); DB.kitTemplates[ki].items.splice(i, 1); }
  render();
};
window.createPotentBag = () => {
  const kt = DB.kitTemplates.find(k => k.name.indexOf('НС/ПВ/СД') >= 0 || k.name.indexOf('Сильнодействующие') >= 0);
  if (!kt) { curPot = false; curTpl = true; render(); return toast('Откройте шаблон НС/ПВ/СД'); }
  askText('Название комплекта', '⚕ НС/ПВ/СД', n => {
    if (!n.trim()) return;
    DB.potents = DB.potents || [];
    DB.potents.push({ id: uid(), name: n.trim(), items: kt.items.filter(i => i.name && i.name !== 'Новая позиция').map(i => ({ name: i.name, spec: i.spec, unit: i.unit, qty: i.qty, expiry: '', potent: true })) });
    save(); curPotKit = DB.potents[DB.potents.length - 1].id; render(); toast('Комплект создан');
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
  openDlg('<h3>Позиция</h3><label>Название</label><input id="pot_name" value="' + esc(it.name || '') + '"><label>Форма</label><input id="pot_spec" value="' + esc(it.spec || '') + '"><div class="row"><div><label>Кол-во</label><input id="pQty" type="number" value="' + (it.qty || 1) + '"></div><div><label>Ед.</label><input id="pot_unit" value="' + esc(it.unit || 'шт') + '"></div></div><label>Срок</label><input id="pExp" type="date" value="' + (it.expiry || '') + '"><p><button class="btn" data-act="savePotItem" data-arg="' + kid + ',' + idx + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
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

// ---------- Смены (фото) ----------
window.__addSchedPhoto = (inp, kind) => {
  const f = inp.files[0]; if (!f) return;
  compressImage(f, img => {
    try {
      DB.sched[kind].push({ id: uid(), ts: Date.now(), month: todayStr().slice(0, 7), img });
      save(); render(); toast('Фото добавлено');
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
window.openPhoto = (arg) => {
  const [kind, id] = String(arg).split(',');
  const p = DB.sched[kind].find(x => x.id == id); if (!p) return;
  openDlg('<div class="photoDlgBody"><div class="photoViewport" id="pvPort"><img id="pvImg" src="' + p.img + '"></div><div class="photoBtns"><button class="btn del" data-act="delPhoto" data-arg="' + kind + ',' + id + '">🗑 Удалить</button><button class="btn sec" data-act="close">Закрыть</button></div></div>');
};
window.delPhoto = (arg) => {
  const [kind, id] = String(arg).split(',');
  DB.sched[kind] = DB.sched[kind].filter(x => x.id != id);
  save(); closeDlg(); render(); toast('Фото удалено');
};

// ---------- График смен ----------
window.openShiftDlg = (idx) => {
  DB.shiftGrid = DB.shiftGrid || [];
  const s = idx < 0 ? {} : DB.shiftGrid[+idx];
  openDlg('<h3>Смена</h3><label>Дата</label><input id="shDate" type="date" value="' + esc(s.date || '') + '"><label>Бригада</label><input id="shBrig" value="' + esc(s.brigade || '') + '"><label>Машина</label><input id="shCar" value="' + esc(s.car || '') + '"><label>Сотрудники</label><input id="shStaff" value="' + esc(s.staff || '') + '"><label>Примечание</label><input id="shNote" value="' + esc(s.note || '') + '"><p><button class="btn" data-act="saveShiftDlg" data-arg="' + idx + '">Сохранить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.saveShiftDlg = (idx) => {
  DB.shiftGrid = DB.shiftGrid || [];
  const o = {
    date: document.getElementById('shDate').value,
    brigade: document.getElementById('shBrig').value.trim(),
    car: document.getElementById('shCar').value.trim(),
    staff: document.getElementById('shStaff').value.trim(),
    note: document.getElementById('shNote').value.trim()
  };
  if (!o.date) return toast('Укажите дату');
  if (idx < 0) DB.shiftGrid.push(o); else DB.shiftGrid[+idx] = o;
  save(); closeDlg(); render(); toast('Смена сохранена');
};
window.delShiftRow = (idx) => {
  ask('Удалить строку?', () => { DB.shiftGrid.splice(+idx, 1); save(); render(); toast('Удалено'); });
};
window.clearShiftGrid = () => {
  if (!DB.shiftGrid || !DB.shiftGrid.length) return toast('Уже пусто');
  ask('Удалить все записи?', () => { DB.shiftGrid = []; save(); render(); toast('Очищено'); });
};
window.__importShiftGrid = (inp) => {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    DB.shiftGrid = DB.shiftGrid || []; let added = 0;
    String(r.result).split(/\r?\n/).forEach((line, ix) => {
      line = line.trim(); if (!line) return;
      const parts = line.split(/[;,\t]/).map(x => x.trim().replace(/^"|"$/g, ''));
      if (ix === 0 && /дата|date/i.test(parts[0])) return;
      DB.shiftGrid.push({ date: parts[0] || '', brigade: parts[1] || '', car: parts[2] || '', staff: parts[3] || '', note: parts[4] || '' });
      added++;
    });
    save(); render(); toast('Импортировано: ' + added);
  };
  r.readAsText(f);
};
window.schedDays = () => { schedSub = 'days'; render(); };
window.schedMonths = () => { schedSub = 'months'; render(); };
window.schedGrid = () => { schedSub = 'grid'; render(); };

// ---------- Профиль / настройки ----------
window.setName = (e) => { me().name = e.target.value; save(); };
window.setPhone = (e) => { me().phone = e.target.value; save(); };
window.setBday = () => {
  const d = document.getElementById('bdD').value, m = document.getElementById('bdM').value, y = document.getElementById('bdY').value;
  me().bday = (y === '0' || m === '0' || d === '0') ? '' : (y + '-' + m + '-' + d); save(); toast('Сохранено');
};
window.changePinDlg = () => {
  const u = me(); if (!u) return;
  openDlg('<h3>🔑 Сменить PIN</h3><label>Текущий PIN</label><input id="cpOld" type="password" inputmode="numeric" maxlength="4"><label>Новый PIN</label><input id="cpNew" type="password" inputmode="numeric" maxlength="4"><label>Повторите</label><input id="cpNew2" type="password" inputmode="numeric" maxlength="4"><p><button class="btn" data-act="changePinDo">Сменить</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.changePinDo = async () => {
  const u = me(); if (!u) return;
  const old = document.getElementById('cpOld').value;
  const n1 = document.getElementById('cpNew').value, n2 = document.getElementById('cpNew2').value;
  if (!(await verifyPin(u, old))) return toast('Неверный текущий PIN');
  if (!/^[0-9]{4}$/.test(n1)) return toast('Новый PIN: 4 цифры');
  if (n1 !== n2) return toast('Не совпадает');
  await setPin(u, n1); closeDlg(); render(); toast('✅ PIN изменён');
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
window.toggleBiometric = async (e) => {
  try {
    if (e.target.checked) await enableBiometric(); else disableBiometric();
    render();
  } catch (err) { toast(err.message || 'Ошибка'); render(); }
};
window.setFontSize = (e) => {
  const v = +e.target.value; DB.settings.fontSize = v;
  document.getElementById('fsLabel').textContent = v + 'px';
  applyFontSize(); save();
};
window.setWarnDays = (e) => { DB.settings.warnDays = +e.value || 10; save(); };
window.setCity = (e) => { DB.settings.city = e.target.value; DB.settings.geo = null; save(); render(); };
window.setAccent = (e) => { DB.settings.accent = e.target.value; save(); applyTheme(); };
window.setDark = (e) => { DB.settings.dark = e.target.value; save(); applyTheme(); };
window.msToggleLeaves = (on) => { DB.settings.leaves = !!on; save(); if (on) startLeaves(); else stopLeaves(); };
window.toggleLeaves = (e) => window.msToggleLeaves(e.target.checked);

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
  openDlg('<h3>Новый сотрудник</h3><label>ФИО</label><input id="aName"><label>PIN (4 цифры)</label><input id="aPin" type="password" inputmode="numeric" maxlength="4"><label>Роль</label><select id="aRole"><option value="user">сотрудник</option><option value="lead">руководитель</option><option value="admin">админ</option></select><p><button class="btn" data-act="addUserDo">Создать</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.addUserDo = async () => {
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

// ---------- Данные ----------
window.exportDB = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(DB)], { type: 'application/json' }));
  a.download = 'medshift-' + todayStr() + '.json'; a.click();
  toast('Файл сохранён');
};
window.__importDB = (inp) => {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try { Object.assign(DB, JSON.parse(r.result)); save(); location.reload(); }
    catch (e) { toast('Ошибка файла'); }
  };
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
  toast('♻️ Сброшено'); setTimeout(() => location.reload(), 800);
};

// ---------- Логин ----------
window.loginPick = (id) => {
  const u = DB.users.find(x => x.id == id); if (!u || isDead(u.id)) return;
  if (!u.pin && !u.pinSalt) { loginAs(u); announceLogin(u); go(tab); return; }
  loginFor = +id; render();
};
window.loginDo = async () => {
  const u = DB.users.find(x => x.id == loginFor);
  const v = document.getElementById('pinIn').value;
  if (!(await verifyPin(u, v))) return toast('Неверный PIN');
  const rm = document.getElementById('remMe');
  localStorage.setItem('medshift_rem', rm && rm.checked ? '1' : '0');
  if (rm && rm.checked) localStorage.setItem('medshift_rem_ts', String(Date.now()));
  loginAs(u); announceLogin(u); presBeat(); go(tab); toast('Смена начата 👋');
};
window.toggleByName = () => { loginFor = loginFor === -2 ? 0 : -2; render(); };
window.loginByName = async () => {
  const n = normName(document.getElementById('lnName').value);
  const p = document.getElementById('lnPin').value;
  if (isBannedName(n)) return toast('🚫 Забанен');
  let u = DB.users.find(x => normName(x.name) === n);
  if (!u && window.__fbToken) {
    toast('🔍 Ищем на складе…');
    const v = await restGet('state');
    if (v && v.data) adoptState(v.data, v.rev || 0);
    u = DB.users.find(x => normName(x.name) === n);
  }
  if (!u) return toast('Не найден');
  if (!(await verifyPin(u, p))) return toast('Неверный PIN');
  loginAs(u); announceLogin(u); presBeat(); go(tab); toast('Смена начата 👋');
};
window.regView = () => {
  openDlg('<h3>Анкета</h3><label>ФИО</label><input id="rName"><label>PIN (4 цифры)</label><input id="rPin" type="password" inputmode="numeric" maxlength="4"><label>Повторите PIN</label><input id="rPin2" type="password" inputmode="numeric" maxlength="4"><p><button class="btn" data-act="regDo">Создать</button><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.regDo = async () => {
  const n = document.getElementById('rName').value.trim();
  const p1 = document.getElementById('rPin').value, p2 = document.getElementById('rPin2').value;
  if (!n) return toast('Введите ФИО');
  if (!/^[0-9]{4}$/.test(p1)) return toast('PIN: 4 цифры');
  if (p1 !== p2) return toast('Не совпадает');
  if (isBannedName(n)) return toast('🚫 Забанен');
  const u = { id: uid(), name: n, pin: '', role: DB.users.length === 0 ? 'admin' : 'user', cars: [], bags: [], phone: '', bday: '' };
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
window.showAlerts = () => {
  const a = alerts(); if (!a.length) return toast('✅ Тревог нет');
  let h = '<h3>🔔 Тревоги (' + a.length + ')</h3>';
  a.forEach(al => {
    h += '<div class="card" style="margin-bottom:8px"><span class="badge ' + al.l + '">!</span> <b>' + esc(al.t) + '</b></div>';
  });
  h += '<p><button class="btn sec wide" data-act="close">Закрыть</button></p>';
  openDlg(h);
};
window.showStats = () => {
  let tot = 0, expN = 0, soonN = 0;
  DB.bags.forEach(b => (b.items || []).forEach(it => { tot++; if (it.expiry && daysLeft(it.expiry) < 0) expN++; else if (it.expiry && daysLeft(it.expiry) <= DB.settings.warnDays) soonN++; }));
  DB.cars.forEach(c => (c.kits || []).forEach(k => (k.items || []).forEach(it => { tot++; if (it.expiry && daysLeft(it.expiry) < 0) expN++; else if (it.expiry && daysLeft(it.expiry) <= DB.settings.warnDays) soonN++; })));
  openDlg('<h3>📊 Статистика</h3><p><b>Всего:</b> ' + tot + '<br><b>Просрочено:</b> ' + expN + '<br><b>Истекает:</b> ' + soonN + '</p><p><button class="btn sec" data-act="close">Закрыть</button></p>');
};
window.goReports = () => go('reports');
window.goChat = () => go('chat');
window.clearRef = () => { refSearch = ''; const i = document.getElementById('refInput'); if (i) i.value = ''; if (window.renderRefResults) window.renderRefResults(); };
window.__refSearchInput = (v) => { refSearch = v; if (window.renderRefResults) window.renderRefResults(); };

// ---------- Event delegation ----------
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const act = btn.dataset.act, arg = btn.dataset.arg || '';
  const fn = window[act];
  if (typeof fn === 'function') {
    e.preventDefault();
    try { fn(arg, btn, e); } catch (err) { console.error('[act]', act, err); toast('Ошибка: ' + err.message); }
  }
});
document.addEventListener('change', e => {
  const el = e.target; if (!el.dataset || !el.dataset.act) return;
  const fn = window[el.dataset.act];
  if (typeof fn === 'function') {
    try { fn(el); } catch (err) { console.error('[change]', el.dataset.act, err); }
  }
});
document.addEventListener('input', e => {
  const el = e.target; if (!el.dataset || !el.dataset.act) return;
  const act = el.dataset.act;
  if (['editBagItem', 'editEquipItem', 'editKitItem', 'editTplPos', 'setRespSel'].includes(act)) {
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
if (DB.session) go(localStorage.getItem('medshift_tab') || 'home'); else render();

if ('serviceWorker' in navigator) {
  const reg = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__medshiftInstallPrompt = e; });

console.log('[MedShift] ✅ Модульная архитектура загружена');