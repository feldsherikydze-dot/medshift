import { DB, save, uid, me, isBoss, esc, todayStr, daysLeft, normName, isDead, isBannedName, purgeSched } from './db.js';
import { LIMITS, VERSION } from './config.js';
import { onlineN } from './sync.js';

export function loginView() {
  let h = '<div class="loginwrap"><div class="card">';
  h += '<svg class="msLogo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="60" height="60" rx="14" fill="#17528f"/><rect x="26" y="9" width="12" height="46" rx="3" fill="#fff"/><rect x="9" y="26" width="46" height="12" rx="3" fill="#fff"/><path d="M11.3,33.5 18.8,33.5 21,33.5 22.3,33 23.3,33 24.3,33.5 29,33.5 30.5,33.5 31.5,24.5 33,15 34.8,11.3 36.5,24.5 37.5,33.5 38.3,33.5 42,33.5 43.5,31.8 45,31.8 46.3,33.5 53,33.5" fill="none" stroke="#ff3a30" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  h += '<h2>ООО «КрасНЕО»</h2>';
  h += '<p style="margin:2px 0 8px;font-size:calc(var(--fs) - 2px);color:var(--mut)">первая частная скорая помощь<br>Красноярск · 203-03-03</p>';
  h += '<p>Вход по PIN</p>';
  const _bio = localStorage.getItem('medshift_bio');
  if (_bio) {
    try {
      const b = JSON.parse(_bio);
      const bu = DB.users.find(x => x.id === b.userId);
      if (bu && !isDead(bu.id)) h += '<button class="bigbtn" data-act="biometricLogin" style="background:var(--ac);color:#fff;border-color:var(--ac)">🔓 <b>Вход по отпечатку</b> · <small>' + esc(bu.name) + '</small></button><hr style="border:0;border-top:1px solid var(--bd);margin:10px 0">';
    } catch {}
  }
  const myId = +localStorage.getItem('medshift_my') || 0;
  const myu = DB.users.find(x => x.id === myId);
  if (myu && !isDead(myu.id)) {
    h += '<button class="bigbtn" data-act="loginPick" data-arg="' + myu.id + '">👤 <b>' + esc(myu.name) + '</b></button>';
    if (window.loginFor === myu.id) {
      h += '<p><input id="pinIn" type="password" placeholder="PIN" inputmode="numeric"></p>';
      h += '<p><label style="font-size:calc(var(--fs) - 1px)"><input type="checkbox" id="remMe" style="width:auto"' + (localStorage.getItem('medshift_rem') === '1' ? ' checked' : '') + '> запомнить меня (24 ч)</label></p>';
      h += '<p><button class="btn wide" data-act="loginDo">Войти</button></p>';
    }
  }
  h += '<button class="btn sec wide" data-act="toggleByName">👤 У меня уже есть учётная запись</button>';
  if (window.loginFor === -2) {
    h += '<p><label>ФИО</label><input id="lnName"><label>PIN</label><input id="lnPin" type="password" inputmode="numeric"></p>';
    h += '<p><button class="btn wide" data-act="loginByName">Войти</button></p>';
  }
  h += '<button class="btn sec wide" data-act="regView">➕ Зарегистрироваться</button>';
  h += '<button class="btn sec wide" data-act="openKeyDlg">🔑 Ключ склада</button>';
  h += '<button class="btn sec wide" data-act="installApp">📲 Установить приложение</button>';
  h += '<button class="btn sec wide" data-act="qrDlg">📲 QR-код и инструкция</button>';
  h += '</div></div>';
  h += '<div style="text-align:center;font-size:calc(var(--fs) - 3px);color:var(--mut);margin-top:12px">v' + VERSION + '</div>';
  return h;
}

export function homeView() {
  const a = window.alerts ? window.alerts() : [];
  let tot = 0, expN = 0;
  DB.bags.forEach(b => (b.items || []).forEach(it => { tot++; if (it.expiry && daysLeft(it.expiry) < 0) expN++; }));
  DB.cars.forEach(c => (c.kits || []).forEach(k => (k.items || []).forEach(it => { tot++; if (it.expiry && daysLeft(it.expiry) < 0) expN++; })));
  let h = '<div class="clockWeather" data-act="showForecast"><div class="cwLeft"><span class="cwTime" id="cwTime">--:--</span><span class="cwDate" id="cwDate">—</span></div><div class="cwSeason" id="cwSeason">' + (window.seasonHtml ? window.seasonHtml() : '') + '</div><div class="cwRight" id="cwWeather"><span class="cwDesc">…</span></div></div>';
  h += '<div class="wgrid"><div class="card span2">' + calGrid() + '</div></div>';
  h += '<div class="card clickable" data-act="showStats"><b>📊 Статистика подстанции</b> · позиций: ' + tot + ' · просрочено: ' + expN + ' · сумок: ' + DB.bags.length + ' · машин: ' + DB.cars.length + ' · сотрудников: ' + DB.users.length + '<br><small style="color:var(--mut)">нажмите для подробностей</small></div>';
  const bd = bdayToday();
  if (bd.length) h += '<div class="card">🎉 <b>Сегодня день рождения: ' + bd.map(esc).join(', ') + '!</b></div>';
  h += '<div class="card clickable" data-act="showAlerts"><b>🔔 Тревоги</b>' + (a.length ? ' <span class="badge bExp">' + a.length + '</span>' : '') + '<br><small style="color:var(--mut)">' + (a.length ? 'нажмите, чтобы открыть список' : '✅ Всё в порядке') + '</small></div>';
  h += '<div class="card"><b>📨 Последние отчёты</b> <button class="btn sec mini" data-act="goReports">Все отчёты</button>';
  const reps = DB.reports.slice(-6).reverse();
  if (reps.length) {
    h += '<table>';
    reps.forEach(r => {
      const st = r.status === 'green' ? 'bG' : r.status === 'yellow' ? 'bY' : 'bR';
      const lbl = r.status === 'green' ? 'без замечаний' : r.status === 'yellow' ? 'с замечаниями' : 'КРАСНЫЙ';
      h += '<tr><td><span class="badge ' + st + '">' + lbl + '</span> ' + esc(r.car) + ' · ' + esc(r.user) + '<br><small>' + new Date(r.ts).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) + (r.remarks ? ' · ' + esc(r.remarks) : '') + (r.potentBag ? ' · ⚕ ' + esc(r.potentBag) : '') + '</small>' + (isBoss() ? ' <button class="btn sec mini" data-act="viewReport" data-arg="' + r.id + '">👁</button> <button class="btn del" data-act="delReport" data-arg="' + r.id + '">🗑</button>' : '') + '</td></tr>';
    });
    h += '</table>';
  } else h += '<p>Отчётов пока нет</p>';
  h += '</div>';
  const cm = DB.chat.filter(m => m.room === 'общая').slice(-3);
  h += '<div class="card"><b>💬 Оперативный чат</b>';
  if (cm.length) { h += '<table>'; cm.forEach(m => h += '<tr><td><b>' + esc(m.author) + ':</b> ' + esc(m.text) + '</td></tr>'); h += '</table>'; }
  h += '<button class="btn sec mini" data-act="goChat">Перейти в чат</button></div>';
  return h;
}

function calGrid() {
  const n = new Date(), y = n.getFullYear(), mo = n.getMonth();
  const first = (new Date(y, mo, 1).getDay() + 6) % 7;
  const days = new Date(y, mo + 1, 0).getDate();
  let h = '<div class="cal">';
  ['пн','вт','ср','чт','пт','сб','вс'].forEach((d, i) => h += '<div class="hd' + (i >= 5 ? ' wkh' : '') + '">' + d + '</div>');
  for (let i = 0; i < first; i++) h += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const dd = new Date(y, mo, d);
    const wk = (dd.getDay() === 0 || dd.getDay() === 6);
    const hol = window.holOf ? window.holOf(dd) : '';
    const cls = (d === n.getDate() ? 'td' : '') + (wk ? ' wd' : '') + (hol ? ' hol' : '');
    h += '<div class="' + cls.trim() + '"' + (hol ? ' title="' + esc(hol) + '"' : '') + '>' + d + (hol ? '<i>' + hol + '</i>' : '') + '</div>';
  }
  return h + '</div>';
}

function bdayToday() {
  const t = todayStr().slice(5);
  const r = [];
  DB.users.forEach(u => { if (u.bday && u.bday.slice(5) === t) r.push(u.name); });
  return r;
}

export function bagsView() {
  if (window.curBag) return bagView();
  let h = '<button class="btn" data-act="openBagDlg">+ Сумка</button>';
  h += '<button class="btn sec" data-act="newBagFromTpl">📋 Из шаблона</button>';
  h += '<button class="btn sec" data-act="goTpl">📑 Шаблоны</button>';
  h += '<button class="btn sec" data-act="goPot">⚕️ НС/ПВ/СД</button>';
  if (!DB.bags.length) h += '<p>Сумок пока нет</p>';
  DB.bags.forEach(b => {
    let bad = 0, pc = 0;
    (b.items || []).forEach(it => { if (it.expiry && daysLeft(it.expiry) <= DB.settings.warnDays) bad++; if (it.potent) pc++; });
    h += '<div class="card"><b>👜 ' + esc(b.name) + '</b><br>' + (b.items || []).length + ' поз.' + (bad ? ' <span class="badge bSoon">⚠ ' + bad + '</span>' : '') + (pc ? ' <span class="badge bWarn">⚕ ' + pc + '</span>' : '') + '<br><button class="btn sec mini" data-act="openBag" data-arg="' + b.id + '">Открыть</button> <button class="btn sec mini" data-act="renameBag" data-arg="' + b.id + '">✏️</button> <button class="btn del" data-act="delBag" data-arg="' + b.id + '">🗑</button></div>';
  });
  return h;
}

export function bagView() {
  const b = DB.bags.find(x => x.id === window.curBag);
  if (!b) { window.curBag = null; return bagsView(); }
  const em = window.editBag === window.curBag;
  let h = '<button class="btn sec" data-act="backBags">← Сумки</button><h3>👜 ' + esc(b.name) + ' <button class="btn sec mini" data-act="renameBag" data-arg="' + b.id + '">✏️</button></h3>';
  h += '<button class="btn" data-act="openItemDlg" data-arg="' + b.id + ',-1">+ Позиция</button>';
  h += '<button class="btn sec" data-act="fillBagFromTpl" data-arg="' + b.id + '">📋 Шаблон</button>';
  h += '<button class="btn sec" data-act="openImportDlg" data-arg="' + b.id + '">📥 Импорт .txt</button>';
  if (isBoss()) h += '<button class="btn sec" data-act="toggleEditBag" data-arg="' + b.id + '">' + (em ? '💾 Сохранить' : '✏️ Редактировать') + '</button>';
  h += '<table class="' + (em ? 'editMode' : '') + '"><thead><tr><th class="col-name">Наименование</th><th class="col-spec">Форма</th><th class="col-qty">Кол-во</th><th class="col-exp">Срок</th><th class="col-act"></th></tr></thead><tbody>';
  (b.items || []).forEach((it, i) => {
    const hl = window.highlightItem && it.name === window.highlightItem ? ' highlight' : '';
    const rc = rowCls(it.expiry);
    if (em) {
      h += '<tr class="' + rc + hl + '" data-item="' + esc(it.name) + '"><td><input value="' + esc(it.name) + '" data-act="editBagItem" data-arg="' + b.id + ',' + i + ',name"></td><td><input value="' + esc(it.spec || '') + '" data-act="editBagItem" data-arg="' + b.id + ',' + i + ',spec"></td><td><input type="number" value="' + it.qty + '" data-act="editBagItem" data-arg="' + b.id + ',' + i + ',qty"></td><td><input type="date" value="' + (it.expiry || '') + '" data-act="editBagItem" data-arg="' + b.id + ',' + i + ',expiry"></td><td><button class="btn del" data-act="delBagItemEdit" data-arg="' + b.id + ',' + i + '">🗑</button></td></tr>';
    } else {
      h += '<tr class="' + rc + hl + '" data-item="' + esc(it.name) + '"><td>' + (it.potent ? '⚕ ' : '') + esc(it.name) + '</td><td>' + esc(it.spec || '') + '</td><td>' + it.qty + ' ' + esc(it.unit) + '</td><td><input type="date" value="' + (it.expiry || '') + '" data-act="setExp" data-arg="' + window.curBag + ',' + i + '"></td><td><button class="btn del" data-act="delItem" data-arg="' + window.curBag + ',' + i + '">🗑</button></td></tr>';
    }
  });
  h += '</tbody></table>';
  if (window.highlightItem) setTimeout(() => window.highlightItem = null, 4500);
  return h;
}

function rowCls(iso) {
  if (!iso) return '';
  const d = daysLeft(iso);
  if (d < 0) return 'exp';
  if (d <= DB.settings.warnDays) return 'soon';
  return '';
}

export function carsView() {
  if (window.curCar) return carView();
  let h = isBoss() ? '<button class="btn" data-act="openCarDlg">+ Машина</button>' : '';
  if (isBoss()) {
    const tasks = DB.tasks.filter(t => !t.done);
    if (tasks.length) {
      h += '<div class="card"><b>📌 Задачи</b><table>';
      tasks.forEach(t => h += '<tr><td>' + esc(t.text) + '</td><td><button class="btn sec mini" data-act="doneTask" data-arg="' + t.id + '">✔</button></td></tr>');
      h += '</table></div>';
    }
  }
  if (!DB.cars.length) h += '<p>Машин пока нет</p>';
  DB.cars.forEach(c => {
    let df = 0;
    (c.equip || []).forEach(e => { if (e.status === 'def') df++; });
    h += '<div class="card"><b>🚑 ' + esc(c.name) + '</b>' + (c.plates ? ' · ' + esc(c.plates) : '') + ' · оборуд. ' + (c.equip || []).length + (df ? ' <span class="badge bExp">дефекты: ' + df + '</span>' : '') + ' · укладок: ' + (c.kits || []).length + '<br><button class="btn sec mini" data-act="openCar" data-arg="' + c.id + '">Открыть</button>';
    if (isBoss()) h += ' <button class="btn sec mini" data-act="editCar" data-arg="' + c.id + '">✏️</button> <button class="btn del" data-act="delCar" data-arg="' + c.id + '">🗑</button>';
    h += '</div>';
  });
  return h;
}

export function carView() {
  const c = DB.cars.find(x => x.id === window.curCar);
  if (!c) { window.curCar = null; return carsView(); }
  const em = window.editEquip === window.curCar;
  let h = '<button class="btn sec" data-act="backCars">← Машины</button><h3>🚑 ' + esc(c.name) + (c.plates ? ' · ' + esc(c.plates) : '') + '</h3>';
  h += '<button class="btn" data-act="openRep" data-arg="' + c.id + '">📨 Отчёт по смене</button>';
  if (isBoss()) h += ' <button class="btn sec" data-act="addKitDlg" data-arg="' + c.id + '">➕ Укладка</button>';
  if (window.curKit) return h + kitView(c);
  if (isBoss()) h += '<button class="btn sec" data-act="toggleEditEquip" data-arg="' + c.id + '">' + (em ? '💾 Сохранить' : '✏️ Редактировать оборудование') + '</button>';
  h += '<div class="card"><b>Оборудование (ОВМ)</b><table class="' + (em ? 'editMode' : '') + '"><thead><tr><th class="col-ovm">Инв. №</th><th class="col-eqname">Наименование</th><th class="col-status">Статус</th><th class="col-notes">Отметки</th><th class="col-mark">Пометка</th>' + (em ? '<th class="col-act"></th>' : '') + '</tr></thead><tbody>';
  (c.equip || []).forEach((e, i) => {
    if (em) {
      h += '<tr><td><input value="' + esc(e.ovm || '') + '" data-act="editEquipItem" data-arg="' + c.id + ',' + i + ',ovm"></td><td><input value="' + esc(e.name) + '" data-act="editEquipItem" data-arg="' + c.id + ',' + i + ',name"></td><td><select data-act="editEquipItem" data-arg="' + c.id + ',' + i + ',status"><option value="ok"' + (e.status === 'ok' ? ' selected' : '') + '>исправен</option><option value="def"' + (e.status === 'def' ? ' selected' : '') + '>дефект</option><option value="miss"' + (e.status === 'miss' ? ' selected' : '') + '>нет</option></select></td><td><input value="' + esc(e.charge || '') + '" data-act="editEquipItem" data-arg="' + c.id + ',' + i + ',charge"></td><td><input value="' + esc(e.defect || '') + '" data-act="editEquipItem" data-arg="' + c.id + ',' + i + ',defect"></td><td><button class="btn del" data-act="delEquipItem" data-arg="' + c.id + ',' + i + '">🗑</button></td></tr>';
    } else {
      h += '<tr class="' + (e.status === 'def' ? 'exp' : '') + '"><td>' + (e.ovm ? esc(e.ovm) : '<small>—</small>') + '</td><td>' + esc(e.name) + '</td><td>' + (isBoss() ? '<select data-act="setEq" data-arg="' + c.id + ',' + e.id + '"><option value="ok"' + (e.status === 'ok' ? ' selected' : '') + '>исправен</option><option value="def"' + (e.status === 'def' ? ' selected' : '') + '>дефект</option><option value="miss"' + (e.status === 'miss' ? ' selected' : '') + '>нет</option></select>' : (e.status === 'ok' ? '<span class="badge bOk">исправен</span>' : '<span class="badge bExp">' + e.status + '</span>')) + '</td><td><input value="' + esc(e.charge || '') + '" data-act="setCh" data-arg="' + c.id + ',' + e.id + '" placeholder="заряд…"></td><td><input value="' + esc(e.defect || '') + '" data-act="setDef" data-arg="' + c.id + ',' + e.id + '" placeholder="недочёт"></td></tr>';
    }
  });
  h += '</tbody></table>';
  if (em) h += '<p><button class="btn sec mini" data-act="addEquipItem" data-arg="' + c.id + '">+ Добавить оборудование</button></p>';
  h += '</div><div class="card"><b>Укладки</b>';
  (c.kits || []).forEach(k => {
    let bad = 0, pc = 0;
    (k.items || []).forEach(it => { if (it.expiry && daysLeft(it.expiry) <= DB.settings.warnDays) bad++; if (it.potent) pc++; });
    h += '<p>🧰 <b>' + esc(k.name) + '</b> · ' + (k.items || []).length + ' поз.' + (bad ? ' <span class="badge bSoon">⚠ ' + bad + '</span>' : '') + (pc ? ' <span class="badge bWarn">⚕ ' + pc + '</span>' : '') + ' <button class="btn sec mini" data-act="openKit" data-arg="' + k.id + '">Открыть</button></p>';
  });
  h += '</div><div class="card"><b>Отчёты по машине</b>';
  const reps = DB.reports.filter(r => r.carId === c.id).slice(-10).reverse();
  if (reps.length) {
    h += '<table>';
    reps.forEach(r => {
      const st = r.status === 'green' ? 'bG' : r.status === 'yellow' ? 'bY' : 'bR';
      h += '<tr><td><span class="badge ' + st + '">' + r.status + '</span> ' + new Date(r.ts).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) + ' · ' + esc(r.user) + (r.potentBag ? ' · ⚕ ' + esc(r.potentBag) : '') + (isBoss() ? ' <button class="btn sec mini" data-act="viewReport" data-arg="' + r.id + '">👁</button> <button class="btn del" data-act="delReport" data-arg="' + r.id + '">🗑</button>' : '') + '</td></tr>';
    });
    h += '</table>';
  } else h += '<p>Нет отчётов</p>';
  h += '</div>';
  return h;
}

function kitView(c) {
  const k = c.kits.find(x => x.id === window.curKit);
  if (!k) { window.curKit = null; return carView(c); }
  const em = window.editKit === window.curKit;
  let h = '<button class="btn sec" data-act="backKits">← Укладки</button><h4>🧰 ' + esc(k.name) + '</h4>';
  h += '<button class="btn" data-act="openKitItem" data-arg="' + c.id + ',' + k.id + ',-1">+ Позиция</button>';
  if (isBoss()) h += '<button class="btn sec" data-act="toggleEditKit" data-arg="' + k.id + '">' + (em ? '💾 Сохранить' : '✏️ Редактировать') + '</button>';
  h += '<table class="' + (em ? 'editMode' : '') + '"><thead><tr><th class="col-name">Наименование</th><th class="col-qty">Кол-во</th><th class="col-exp">Срок</th><th class="col-act"></th></tr></thead><tbody>';
  (k.items || []).forEach((it, i) => {
    const hl = window.highlightItem && it.name === window.highlightItem ? ' highlight' : '';
    const rc = rowCls(it.expiry);
    if (em) {
      h += '<tr class="' + rc + hl + '"><td><input value="' + esc(it.name) + '" data-act="editKitItem" data-arg="' + c.id + ',' + k.id + ',' + i + ',name"></td><td><input type="number" value="' + it.qty + '" data-act="editKitItem" data-arg="' + c.id + ',' + k.id + ',' + i + ',qty"></td><td><input type="date" value="' + (it.expiry || '') + '" data-act="editKitItem" data-arg="' + c.id + ',' + k.id + ',' + i + ',expiry"></td><td><button class="btn del" data-act="delKitItemEdit" data-arg="' + c.id + ',' + k.id + ',' + i + '">🗑</button></td></tr>';
    } else {
      h += '<tr class="' + rc + hl + '"><td>' + (it.potent ? '⚕ ' : '') + esc(it.name) + '</td><td>' + it.qty + ' ' + esc(it.unit) + '</td><td><input type="date" value="' + (it.expiry || '') + '" data-act="setExpKit" data-arg="' + c.id + ',' + k.id + ',' + i + '"></td><td><button class="btn del" data-act="delKitItem" data-arg="' + c.id + ',' + k.id + ',' + i + '">🗑</button></td></tr>';
    }
  });
  h += '</tbody></table>';
  if (window.highlightItem) setTimeout(() => window.highlightItem = null, 4500);
  return h;
}

export function refView() {
  let h = '<h3>💊 Справочник лекарственных средств</h3>';
  h += '<div class="refSearch"><input type="text" id="refInput" placeholder="🔍 Поиск препарата…" value="' + esc(window.refSearch) + '" oninput="window.__refSearchInput(this.value)" autofocus>';
  h += '<button class="searchClear" data-act="clearRef">✕</button></div>';
  h += '<div id="refResults"></div>';
  setTimeout(() => { if (window.renderRefResults) window.renderRefResults(); }, 0);
  return h;
}

export function schedView() {
  purgeSched();
  const th = (p, k) => p.doc
    ? '<span class="thumb doc" data-act="openPhoto" data-arg="' + k + ',' + p.id + '">📄 <em>' + esc(p.name || 'файл') + '</em></span>'
    : '<img loading="lazy" decoding="async" src="' + p.img + '" data-act="openPhoto" data-arg="' + k + ',' + p.id + '">';
  let h = '<div class="schedTabs">';
  h += '<button class="btn ' + (window.schedSub === 'days' ? '' : 'sec') + '" data-act="schedDays">📷 Журнал смены</button>';
  h += '<button class="btn ' + (window.schedSub === 'months' ? '' : 'sec') + '" data-act="schedMonths">📅 График месяца</button>';
  h += '<button class="btn ' + (window.schedSub === 'grid' ? '' : 'sec') + '" data-act="schedGrid">🗓 Смены</button>';
  h += '</div>';
  if (window.schedSub === 'grid') return h + shiftGridView();
  if (window.schedSub === 'days') {
    h += '<p><label class="btn sec" style="display:inline-block">📷 Фото<input type="file" hidden accept="image/*" data-kind="days" onchange="window.__addSchedPhoto(this,\'days\')"></label> ';
    h += '<label class="btn sec" style="display:inline-block">📄 Файл<input type="file" hidden accept=".txt,.csv,.xls,.xlsx,.doc,.docx,.pdf,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onchange="window.__addSchedDoc(this,\'days\')"></label></p>';
    h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Фото и файлы журнала хранятся 2 дня.</p>';
    if (DB.sched.days.length) {
      h += '<div class="thumbs">' + DB.sched.days.map(p => th(p, 'days')).join('') + '</div>';
    } else h += '<p>Фото и файлов журнала пока нет.</p>';
    return h;
  }
  h += '<p><label class="btn sec" style="display:inline-block">📷 Фото<input type="file" hidden accept="image/*" onchange="window.__addSchedPhoto(this,\'months\')"></label> ';
  h += '<label class="btn sec" style="display:inline-block">📄 Файл<input type="file" hidden accept=".txt,.csv,.xls,.xlsx,.doc,.docx,.pdf,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onchange="window.__addSchedDoc(this,\'months\')"></label></p>';
  h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">График удаляется на 3-й день следующего месяца.</p>';
  if (DB.sched.months.length) {
    h += '<div class="thumbs">' + DB.sched.months.map(p => th(p, 'months')).join('') + '</div>';
  } else h += '<p>Графиков пока нет.</p>';
  return h;
}

function shiftGridView() {
  if (!DB.shiftGrid) DB.shiftGrid = [];
  let h = '<div class="card"><b>🗓 График смен</b>';
  h += '<p style="margin-top:6px"><button class="btn mini" data-act="openShiftDlg" data-arg="-1">+ Добавить смену</button> ';
  h += '<label class="btn sec mini" style="display:inline-block">📥 Импорт CSV<input type="file" hidden accept=".csv,.txt,text/csv" onchange="window.__importShiftGrid(this)"></label> ';
  h += '<button class="btn del mini" data-act="clearShiftGrid">🗑 Очистить</button></p>';
  h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Формат CSV: Дата;Бригада;Машина;Сотрудники;Примечание</p>';
  if (!DB.shiftGrid.length) { h += '<p class="shiftEmpty">Смен пока нет</p></div>'; return h; }
  const sorted = DB.shiftGrid.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  h += '<table><thead><tr><th>Дата</th><th>Бригада</th><th>Машина</th><th>Сотрудники</th><th>Прим.</th><th></th></tr></thead><tbody>';
  sorted.forEach(s => {
    const realIdx = DB.shiftGrid.indexOf(s);
    h += '<tr><td>' + esc(s.date || '') + '</td><td>' + esc(s.brigade || '') + '</td><td>' + esc(s.car || '') + '</td><td>' + esc(s.staff || '') + '</td><td>' + esc(s.note || '') + '</td><td style="white-space:nowrap"><button class="btn sec mini" data-act="openShiftDlg" data-arg="' + realIdx + '">✏️</button> <button class="btn del mini" data-act="delShiftRow" data-arg="' + realIdx + '">🗑</button></td></tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

function _rgbOf(hex) {
  let h = String(hex || '#0b5394').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) h = '0b5394';
  const i = parseInt(h, 16);
  return [i >> 16 & 255, i >> 8 & 255, i & 255];
}
export function setView() {
  const u = me();
  if (u && window.FB_CONF && window.FB_CONF.databaseURL && window.presBeat) window.presBeat();
  let h = '<div class="card"><h3>Профиль и зоны ответственности</h3>';
  h += '<label>ФИО</label><input value="' + esc(u.name) + '" data-act="setName">';
  h += '<label>Телефон</label><input type="tel" value="' + esc(u.phone || '') + '" data-act="setPhone">';
  const b = u.bday || '';
  const bd = b ? +b.slice(8, 10) : 0, bm = b ? +b.slice(5, 7) : 0, by = b ? +b.slice(0, 4) : 0;
  h += '<label>Дата рождения</label><div class="row"><select id="bdD" data-act="setBday"><option value="0">день</option>';
  for (let d = 1; d <= 31; d++) { const dv = (d < 10 ? '0' : '') + d; h += '<option value="' + dv + '"' + (d === bd ? ' selected' : '') + '>' + d + '</option>'; }
  h += '</select><select id="bdM" data-act="setBday"><option value="0">месяц</option>';
  const MN = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  for (let mo = 1; mo <= 12; mo++) { const mv = (mo < 10 ? '0' : '') + mo; h += '<option value="' + mv + '"' + (mo === bm ? ' selected' : '') + '>' + MN[mo - 1] + '</option>'; }
  h += '</select><select id="bdY" data-act="setBday"><option value="0">год</option>';
  for (let y = 2010; y >= 1940; y--) h += '<option value="' + y + '"' + (y === by ? ' selected' : '') + '>' + y + '</option>';
  h += '</select></div>';
  h += '<p><button class="btn sec" data-act="changePinDlg">🔑 Сменить PIN</button></p>';
  h += '<label>Ответственные машины</label>' + respRows(u, 'cars') + '<p><button class="btn sec mini" data-act="addResp" data-arg="cars">+ добавить машину</button></p>';
  h += '<label>Ответственные сумки</label>' + respRows(u, 'bags') + '<p><button class="btn sec mini" data-act="addResp" data-arg="bags">+ добавить сумку</button></p>';
  if (window.PublicKeyCredential && u.pin) {
    const _bio = localStorage.getItem('medshift_bio');
    let _has = false;
    if (_bio) { try { _has = JSON.parse(_bio).userId === u.id; } catch {} }
    h += '<label><input type="checkbox" style="width:auto"' + (_has ? ' checked' : '') + ' data-act="toggleBiometric"> 🔓 Вход по отпечатку пальца</label>';
    if (_has) h += '<p style="font-size:calc(var(--fs) - 3px);color:var(--mut)">Биометрия привязана для: ' + esc(u.name) + '</p>';
  }
  h += '</div>';
  h += '<div class="card"><h3>📡 Синхронизация</h3>';
  const SYNCSTAT = window.SYNCSTAT || {};
  h += '<p style="font-size:calc(var(--fs) - 1px)">Склад: ' + (window.FB_CONF && window.FB_CONF.databaseURL ? 'подключён' : 'не задан') + '<br>Онлайн сейчас: ' + (onlineN == null ? '—' : onlineN) + '<br>🔑 Ключ склада: ' + (window.__fbToken ? '✅ задан' : '⚠ НЕ задан') + '<br>Отправка: ' + (SYNCSTAT.pushOk ? '✅' : '⚠') + ' ' + (SYNCSTAT.lastPush ? new Date(SYNCSTAT.lastPush).toLocaleTimeString('ru-RU') : '—') + '<br>Приём: ' + (SYNCSTAT.lastPull ? new Date(SYNCSTAT.lastPull).toLocaleTimeString('ru-RU') : '—') + (SYNCSTAT.lastErr ? '<br>Ошибка: ' + esc(SYNCSTAT.lastErr) : '') + '</p>';
  h += '<p><button class="btn sec mini" data-act="syncTest">🔍 Проверить связь</button> <button class="btn sec mini" data-act="fbCredDlg">🔑 Ключ склада</button></p></div>';
  h += '<div class="card"><h3>Правила и уведомления</h3>';
  h += '<label>Размер шрифта</label><div class="row" style="align-items:center"><input type="range" min="10" max="22" step="1" value="' + (DB.settings.fontSize || 14) + '" data-act="setFontSize" style="flex:1"><span id="fsLabel" style="min-width:40px;text-align:center;font-weight:700">' + (DB.settings.fontSize || 14) + 'px</span></div>';
  h += '<label>Предупреждать за дней</label><input type="number" value="' + DB.settings.warnDays + '" data-act="setWarnDays">';
  h += '<label>Город (погода)</label><input value="' + esc(DB.settings.city || '') + '" data-act="setCity">';
  h += '<label>Цвет темы</label><div class="swRow">';
  const ACCENTS = ['#0b5394', '#1565c0', '#00838f', '#2e7d32', '#558b2f', '#f9a825', '#ef6c00', '#c62828', '#6a1b9a', '#4e342e'];
  const _acc = DB.settings.accent || '#0b5394';
  ACCENTS.forEach(c => { h += '<span class="sw' + (String(c).toLowerCase() === String(_acc).toLowerCase() ? ' on' : '') + '" style="background:' + c + '" data-act="setAccent" data-arg="' + c + '" title="' + c + '"></span>'; });
  h += '<span class="swPickLabel" style="font-size:calc(var(--fs) - 2px);color:var(--mut)">быстрые цвета</span></div>';
  h += '<label style="margin-top:8px">Свой цвет (палитра или R/G/B-слайдеры)</label><div class="swRow" style="align-items:center;gap:8px"><input type="color" id="acColor" value="' + esc(_acc) + '" data-act="setAccent" title="Открыть палитру целиком" style="flex:1 1 auto;width:auto;height:42px;min-height:42px;border:1px solid var(--bd);border-radius:10px;padding:4px;background:var(--card);cursor:pointer"><span id="acHex" style="font-size:calc(var(--fs) - 2px);color:var(--mut);white-space:nowrap;font-family:monospace">' + esc(_acc).toLowerCase() + '</span></div>';
  const _rub = _rgbOf(_acc);
  const _cn = ['R', 'G', 'B'];
  _rub.forEach((vv, ci) => {
    h += '<div class="swRow" style="align-items:center;gap:6px;margin:2px 0"><span style="width:16px;font-weight:700;flex-shrink:0">' + _cn[ci] + '</span><input type="range" min="0" max="255" step="1" value="' + vv + '" data-act="setAccRGB" data-arg="' + ci + '" style="flex:1"><span class="rgbVal" style="min-width:28px;text-align:right;font-family:monospace;color:var(--mut)">' + vv + '</span></div>';
  });
  h += '<label>Режим оформления</label><select data-act="setDark"><option value="0"' + (DB.settings.dark === '0' ? ' selected' : '') + '>Светлый</option><option value="1"' + (DB.settings.dark === '1' ? ' selected' : '') + '>Тёмный</option><option value="auto"' + (DB.settings.dark === 'auto' ? ' selected' : '') + '>Авто</option></select>';
  h += '<label><input type="checkbox" style="width:auto"' + (DB.settings.leaves === false ? '' : ' checked') + ' data-act="toggleLeaves"> 🍂 Сезонные атрибуты (листопад, снег)</label>';
  h += '</div>';
  h += (window.bgCard ? window.bgCard() : '');
  if (isBoss()) {
    h += '<div class="card"><h3>👑 Сотрудники</h3>';
    const onlineMap = {};
    try {
      const _olRaw = localStorage.getItem('medshift_online_cache');
      if (_olRaw) {
        const _olParsed = JSON.parse(_olRaw);
        for (const _ok in _olParsed) {
          if (_olParsed[_ok] && _olParsed[_ok].t && (Date.now() - _olParsed[_ok].t < 70000)) onlineMap[_olParsed[_ok].n] = true;
        }
      }
    } catch {}
    DB.users.forEach(x => {
      const isOnline = !!onlineMap[x.name];
      h += '<div class="empCard"><div class="erHead">';
      h += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;flex-shrink:0;background:' + (isOnline ? '#4caf50' : 'transparent') + ';box-shadow:' + (isOnline ? '0 0 4px rgba(76,175,80,.6)' : 'none') + '"></span>';
      h += '<b>' + esc(x.name) + '</b>';
      h += '<span style="font-size:calc(var(--fs) - 2px);color:var(--mut);white-space:nowrap">' + x.role + (x.phone ? ' · ' + esc(x.phone) : '') + '</span>';
      h += '</div><div class="erBtns">';
      h += '<button class="btn sec mini" data-act="openRespDlg" data-arg="' + x.id + '">ответственность</button>';
      if (x.id !== u.id) {
        h += ' <button class="btn sec mini" data-act="adminPinDlg" data-arg="' + x.id + '">🔑 PIN</button>';
        h += ' <button class="btn sec mini" data-act="banUser" data-arg="' + x.id + '">🚫</button>';
        h += ' <button class="btn del" data-act="delUser" data-arg="' + x.id + '">🗑</button>';
      }
      h += '</div></div>';
    });
    h += '<p><button class="btn sec mini" data-act="addUserDlg">+ сотрудник</button></p>';
    if ((DB.bans || []).length) {
      h += '<p><b>🚫 Забаненные:</b></p>';
      DB.bans.forEach(b => h += '<p>' + esc(b.name) + ' <button class="btn sec mini" data-act="unbanUser" data-arg="' + b.id + '">✅ разбанить</button></p>');
    }
    h += '</div>';
  }
  h += '<div class="card"><h3>Данные</h3>';
  h += '<p><button class="btn sec" data-act="exportDB">⬇ Экспорт</button> <label class="btn sec" style="display:inline-block">⬆ Импорт<input type="file" hidden accept=".json" onchange="window.__importDB(this)"></label></p>';
  h += '<p><button class="btn sec" data-act="qrDlg">📲 QR-код для сотрудников</button></p>';
  h += '<p style="margin-top:12px"><button class="btn del" style="width:100%;margin-bottom:8px" data-act="deleteMyAccountDlg">🗑 Удалить мой аккаунт</button></p>';
  h += '<p><button class="btn del" style="width:100%;margin-bottom:8px" data-act="safeResetDlg">♻️ Сброс устройства</button></p>';
  h += '<p><button class="btn sec" style="width:100%" data-act="logout">🚪 Выйти</button></p>';
  h += '</div>';
  h += '<p style="text-align:center;font-size:calc(var(--fs) - 3px);color:var(--mut);margin-top:12px">v' + VERSION + '</p>';
  return h;
}

function respRows(u, kind) {
  const list = kind === 'cars' ? DB.cars : DB.bags;
  const arr = u[kind] || [];
  if (!arr.length) return '<p style="color:var(--mut)">не назначено</p>';
  let h = '';
  arr.forEach((id, i) => {
    h += '<div class="row"><select data-act="setRespSel" data-arg="' + kind + ',' + i + '">';
    list.forEach(o => h += '<option value="' + o.id + '"' + (o.id === id ? ' selected' : '') + '>' + esc(o.name) + '</option>');
    h += '</select><button class="btn del" data-act="rmResp" data-arg="' + kind + ',' + i + '">×</button></div>';
  });
  return h;
}

export function tplView() {
  let h = '<button class="btn sec" data-act="backBagsViews">← Сумки</button><h3>📑 Шаблоны оснащения</h3>';
  h += '<p><button class="btn mini" data-act="newTplDlg">➕ Новый шаблон</button> <button class="btn sec mini" data-act="tplImportDlg">📥 Импорт шаблона</button></p>';
  h += '<div class="searchBox"><input id="tplSearch" placeholder="🔍 Поиск позиции…" value="' + esc(window.tplSearch) + '" oninput="window.__tplSearch(this.value)"><button class="searchClear" data-act="clearTpl">✕</button></div>';
  const q = (window.tplSearch || '').toLowerCase();
  const match = it => (it.name || '').toLowerCase().indexOf(q) >= 0 || (it.spec || '').toLowerCase().indexOf(q) >= 0;
  if (DB.bagTypes && DB.bagTypes[0]) {
    h += tplCard('bag', '👜 ' + (DB.bagTypes[0].name || 'Шаблон сумки'), DB.bagTypes[0].items || [], q, match);
  }
  (DB.kitTemplates || []).forEach((kt, i) => {
    h += tplCard('kit_' + i, '🧰 ' + (kt.name || ('Укладка ' + (i + 1))), kt.items || [], q, match);
  });
  if (!DB.bagTypes || !DB.bagTypes.length) h += '<p>Шаблон сумки не создан. <button class="btn mini" data-act="addBagTpl">➕ Создать шаблон сумки</button></p>';
  if (!(DB.kitTemplates || []).length) h += '<p>Шаблонов укладок нет. Добавляются через «Машины» → «➕ Укладка» (Из шаблона).</p>';
  return h;
}

function tplCard(id, title, items, q, match) {
  const open = window.openTplId === id;
  const em = window.editTpl === id;
  let h = '<div class="card"><div class="tplHeader" data-act="toggleTplOpen" data-arg="' + id + '"><b>' + esc(title) + '</b><span class="tplCount">' + items.length + ' поз.</span></div>';
  h += '<div class="tplBody' + (open ? ' open' : '') + '"><table><thead><tr><th>Наименование</th><th>Форма</th><th>Кол-во</th><th class="col-act"></th></tr></thead><tbody>';
  const rows = q ? items.filter(match) : items;
  if (!rows.length) h += '<tr><td colspan="4"><small style="color:var(--mut)">—</small></td></tr>';
  rows.forEach((it, i) => {
    const oi = items.indexOf(it);
    if (em) {
      h += '<tr><td><input value="' + esc(it.name) + '" data-act="editTplPos" data-arg="' + id + ',' + oi + ',name"></td><td><input value="' + esc(it.spec || '') + '" data-act="editTplPos" data-arg="' + id + ',' + oi + ',spec"></td><td><input type="number" value="' + it.qty + '" data-act="editTplPos" data-arg="' + id + ',' + oi + ',qty"></td><td><button class="btn del" data-act="delTplPos" data-arg="' + id + ',' + oi + '">🗑</button></td></tr>';
    } else {
      h += '<tr><td>' + (it.potent ? '⚕ ' : '') + esc(it.name) + '</td><td>' + esc(it.spec || '') + '</td><td>' + it.qty + ' ' + esc(it.unit || 'шт') + '</td><td></td></tr>';
    }
  });
  h += '</tbody></table>';
  if (open && isBoss()) h += '<div class="tplDrugs">➕ <b>Поиск по справочнику:</b>' + (window.drugSearchHtml ? window.drugSearchHtml('tpl_' + id) : '') + '</div>';
  if (isBoss()) h += '<p><button class="btn mini" data-act="addTplPos" data-arg="' + id + '">+ Позиция</button><button class="btn sec mini" data-act="toggleEditTpl" data-arg="' + id + '">' + (em ? '💾 Сохранить' : '✏️ Редактировать') + '</button> <button class="btn sec mini" data-act="renameTpl" data-arg="' + id + '">✏️ Имя</button> <button class="btn sec mini" data-act="delTpl" data-arg="' + id + '">🗑 Удалить шаблон</button></p>';
  if (isBoss() && /НС\/ПВ\/СД|Сильнодействующие/i.test(title)) h += '<p><button class="btn mini" data-act="createPotentFromTpl" data-arg="' + id + '">📦 Создать комплект из этого шаблона</button></p>';
  h += '</div></div>';
  return h;
}

export function potentView() {
  let h = '<button class="btn sec" data-act="backBagsViews">← Сумки</button><h3>⚕️ Комплекты НС/ПВ/СД</h3>';
  h += '<p><button class="btn" data-act="potNewDlg">➕ Создать комплект (вручную / из шаблона)</button></p>';
  if (!(DB.potents || []).length) { h += '<p>Комплектов пока нет.</p>'; return h; }
  (DB.potents || []).forEach(k => {
    let bad = 0;
    (k.items || []).forEach(it => { if (it.expiry && daysLeft(it.expiry) <= DB.settings.warnDays) bad++; });
    h += '<div class="card"><b>⚕ ' + esc(k.name) + '</b> · ' + (k.items || []).length + ' поз.' + (bad ? ' <span class="badge bSoon">⚠ ' + bad + '</span>' : '') + '<br><button class="btn sec mini" data-act="openPotKit" data-arg="' + k.id + '">Открыть</button> <button class="btn sec mini" data-act="renamePotKit" data-arg="' + k.id + '">✏️</button> <button class="btn del" data-act="delPotKit" data-arg="' + k.id + '">🗑</button></div>';
  });
  return h;
}

export function potKitView() {
  const k = (DB.potents || []).find(x => x.id == window.curPotKit);
  if (!k) { window.curPotKit = null; return potentView(); }
  const em = window.editKit === k.id;
  let h = '<button class="btn sec" data-act="backPotents">← Комплекты</button><h3>⚕ ' + esc(k.name) + '</h3>';
  h += '<button class="btn" data-act="openPotItem" data-arg="' + k.id + ',-1">+ Позиция</button>';
  if (isBoss()) h += '<button class="btn sec" data-act="toggleEditKit" data-arg="' + k.id + '">' + (em ? '💾 Сохранить' : '✏️ Редактировать') + '</button>';
  h += '<table class="' + (em ? 'editMode' : '') + '"><thead><tr><th class="col-name">Наименование</th><th class="col-spec">Форма</th><th class="col-qty">Кол-во</th><th class="col-exp">Срок</th><th class="col-act"></th></tr></thead><tbody>';
  (k.items || []).forEach((it, i) => {
    const rc = rowCls(it.expiry);
    h += '<tr class="' + rc + '"><td>⚕ ' + esc(it.name) + '</td><td>' + esc(it.spec || '') + '</td><td>' + it.qty + ' ' + esc(it.unit || 'шт') + '</td><td><input type="date" value="' + (it.expiry || '') + '" data-act="setExpPot" data-arg="' + k.id + ',' + i + '"></td><td><button class="btn sec mini" data-act="openPotItem" data-arg="' + k.id + ',' + i + '">✏️</button> <button class="btn del" data-act="delPotItem" data-arg="' + k.id + ',' + i + '">🗑</button></td></tr>';
  });
  h += '</tbody></table>';
  if (isBoss()) h += '<div class="card"><b>➕ Добавить из справочника</b>' + (window.drugSearchHtml ? window.drugSearchHtml('potkit_item') : '') + '</div>';
  return h;
}

export function renderRefResults() {
  const q = (window.refSearch || '').trim().toLowerCase();
  const box = document.getElementById('refResults');
  if (!box) return;
  if (!q) { box.innerHTML = '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Введите название препарата. (' + (window.DRUG_DB || []).length + ' позиций в базе)</p>'; return; }
  const F = window.DRUG_DB || [];
  const found = [];
  for (let i = 0; i < F.length && found.length < (window.LIMITS && window.LIMITS.DRUG_SEARCH_LIMIT || 15); i++) {
    const d = F[i];
    if ((d.n || '').toLowerCase().indexOf(q) >= 0 || (d.s || '').toLowerCase().indexOf(q) >= 0 || (d.g || '').toLowerCase().indexOf(q) >= 0 || (d.a || []).some(a => (a || '').toLowerCase().indexOf(q) >= 0)) found.push({ i, d });
  }
  if (!found.length) { box.innerHTML = '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Ничего не найдено.</p>'; return; }
  let h = '';
  found.forEach(({ i, d }) => {
    h += '<div class="refCard" data-act="refDrugDlg" data-arg="' + i + '"><h4>' + esc(d.n) + ' <small style="color:var(--mut)">' + esc(d.s || '') + (d.u ? ' · ' + esc(d.u) : '') + '</small></h4>';
    if (d.g) h += '<div class="refRow"><span class="refLabel">Группа</span><span class="refVal">' + esc(d.g) + '</span></div>';
    if (d.a && d.a.length) h += '<div class="refAnalogs">Аналоги: ' + d.a.map(a => '<span>' + esc(a) + '</span>').join('') + '</div>';
    if (d.rx) h += '<div class="refRx">' + esc(d.rx) + '</div>';
    h += '</div>';
  });
  box.innerHTML = h;
}

export function refDrugDlg(i) {
  const d = (window.DRUG_DB || [])[+i];
  if (!d) return;
  let h = '<div class="reportDetail"><h3>💊 ' + esc(d.n) + '</h3>';
  h += '<div class="refRow"><span class="refLabel">Форма</span><span class="refVal">' + esc(d.s || '—') + (d.u ? ' · ' + esc(d.u) : '') + '</span></div>';
  if (d.g) h += '<div class="refRow"><span class="refLabel">Группа</span><span class="refVal">' + esc(d.g) + '</span></div>';
  if (d.a && d.a.length) h += '<div class="refAnalogs">Аналоги: ' + d.a.map(a => '<span>' + esc(a) + '</span>').join('') + '</div>';
  if (d.rx) h += '<div class="refRx">' + esc(d.rx) + '</div>';
  h += '<p><button class="btn sec" data-act="close">Закрыть</button></p></div>';
  if (window.openDlg) window.openDlg(h);
}

export function injectTplDeleteButtons() {}
export function injectTplPotentButtons() {}

window.loginView = loginView;
window.homeView = homeView;
window.bagsView = bagsView;
window.bagView = bagView;
window.carsView = carsView;
window.carView = carView;
window.refView = refView;
window.schedView = schedView;
window.setView = setView;
window.tplView = tplView;
window.potentView = potentView;
window.potKitView = potKitView;
window.renderRefResults = renderRefResults;
window.refDrugDlg = refDrugDlg;
window.injectTplDeleteButtons = injectTplDeleteButtons;
window.injectTplPotentButtons = injectTplPotentButtons;