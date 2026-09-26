import { DB, save, uid, me, isBoss, esc, daysLeft, soonList } from './db.js';
import { LIMITS } from './config.js';

function eqId(a, b) { return String(a) === String(b); }

export function reportStatus(r) {
  if (!r) return { cls: 'bY', label: '—' };
  if (r.resolved) return { cls: 'bG', label: '✅ исправлен' };
  if (r.status === 'green') return { cls: 'bG', label: 'без замечаний' };
  if (r.status === 'yellow') return { cls: 'bY', label: 'с замечаниями' };
  return { cls: 'bR', label: 'КРАСНЫЙ' };
}
export function reportBadge(r) {
  const s = reportStatus(r);
  return '<span class="badge ' + s.cls + '">' + s.label + '</span>';
}
export function expiredItemText(d) {
  if (typeof d === 'string') return d;
  if (d && d.item) {
    const place = d.type === 'kit' ? ((d.carName || '') + ' / ' + (d.kitName || '')) : (d.name || '');
    return place + ': ' + (d.item.name || '') + ' (' + (d.item.expiry || 'нет срока') + ')';
  }
  return 'неизвестная позиция';
}

export function reportsView() {
  let h = '<h3>📨 Отчёты</h3>';
  h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Просмотр доступен всем. Удалять и менять статус может только руководитель или админ.</p>';
  const reps = (DB.reports || []).slice().reverse().slice(0, LIMITS.REPORTS_SHOW);
  if (!reps.length) return h + '<p>Отчётов пока нет</p>';
  reps.forEach(r => {
    h += '<div class="card" style="display:flex;gap:8px;align-items:center">';
    h += '<div style="flex:1 1 auto;min-width:0;cursor:pointer" data-act="viewReport" data-arg="' + r.id + '">';
    h += reportBadge(r) + ' <b>' + esc(r.car || '') + '</b> · ' + esc(r.user || '');
    h += '<br><small>' + new Date(r.ts).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    if (r.remarks) h += ' · ' + esc(r.remarks);
    if (r.potentBag) h += ' · ⚕ ' + esc(r.potentBag);
    if (r.resolved) h += ' · ✅ исправлен';
    h += '</small></div>';
    h += '<div style="flex:0 0 auto;white-space:nowrap">';
    h += '<button class="btn sec mini" data-act="viewReport" data-arg="' + r.id + '">👁</button>';
    if (isBoss()) h += ' <button class="btn del" data-act="delReport" data-arg="' + r.id + '">🗑</button>';
    h += '</div></div>';
  });
  if ((DB.reports || []).length > LIMITS.REPORTS_SHOW) {
    h += '<p style="color:var(--mut);text-align:center;font-size:calc(var(--fs) - 2px)">Показано ' + LIMITS.REPORTS_SHOW + ' из ' + DB.reports.length + '</p>';
  }
  return h;
}

export let repCar = null;

export function openRep(cid) {
  repCar = cid;
  const c = DB.cars.find(x => eqId(x.id, cid));
  let h = '<h3>📨 Отчёт по смене · ' + esc(c.name) + '</h3>';
  h += '<p style="font-size:calc(var(--fs) - 1px);color:var(--mut)">Дата и время: <b>' + new Date().toLocaleString('ru-RU') + '</b> · Сотрудник: <b>' + esc((me() || {}).name || '') + '</b></p>';
  h += '<div class="row"><div><label>№ бригады</label><input id="rpBrig" inputmode="numeric"></div><div><label>Рабочая сумка</label><select id="rpBag">';
  DB.bags.forEach(b => h += '<option>' + esc(b.name) + '</option>');
  h += '</select></div></div>';
  h += '<div class="row"><div><label>ЭКГ с собой №</label><input id="rpEcg" inputmode="numeric" placeholder="цифра"></div><div><label>Заряд ЭКГ</label><input id="rpEcgCh" placeholder="100%"></div></div>';
  const po = DB.potents || [];
  h += '<label>⚕ Комплекты НС/ПВ/СД (были на смене)</label>';
  if (!po.length) h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Комплектов нет.</p>';
  else po.forEach(k => h += '<label><input type="checkbox" style="width:auto" data-pot="' + k.id + '"> ' + esc(k.name) + '</label>');
  h += '<label>Оборудование машины (отметьте дефекты)</label><div class="prev"><table><tr><th>Наименование</th><th>Статус</th><th>Недочёт</th></tr>';
  (c.equip || []).forEach(e => {
    h += '<tr><td>' + esc(e.name) + '</td><td><select id="re_' + e.id + '"><option value="ok"' + (e.status === 'ok' ? ' selected' : '') + '>исправен</option><option value="def"' + (e.status === 'def' ? ' selected' : '') + '>дефект</option><option value="miss"' + (e.status === 'miss' ? ' selected' : '') + '>нет</option></select></td><td><input id="rd_' + e.id + '" value="' + esc(e.defect || '') + '" placeholder="что не так"></td></tr>';
  });
  h += '</table></div>';
  h += '<label>Примечания</label><textarea id="rpRem"></textarea>';
  h += '<p><button class="btn wide" data-act="submitRep" data-arg="ok">✅ Проверил, без замечаний</button>';
  h += '<button class="btn sec wide" data-act="submitRep" data-arg="rem">⚠ Проверил, есть замечания</button>';
  h += '<button class="btn sec wide" data-act="close">Закрыть</button></p>';
  if (window.openDlg) window.openDlg(h);
}

export function submitRep(mode) {
  if (mode === 'rem' && !document.getElementById('rpRem').value.trim()) {
    if (window.toast) window.toast('Опишите замечания');
    return;
  }
  const c = DB.cars.find(x => eqId(x.id, repCar));
  const u = me();
  const expList = soonList();
  const hasExpired = expList.some(x => x.item && x.item.expiry && daysLeft(x.item.expiry) < 0);
  const exp = expList.map(x => {
    const place = x.type === 'kit' ? ((x.carName || '') + ' / ' + (x.kitName || '')) : (x.name || '');
    const itemName = x.item && x.item.name ? x.item.name : 'позиция';
    const itemExp = x.item && x.item.expiry ? x.item.expiry : 'нет срока';
    return place + ': ' + itemName + ' (' + itemExp + ')';
  });
  const defs = [], equip = [];
  (c.equip || []).forEach(e => {
    const st = (document.getElementById('re_' + e.id) || {}).value || 'ok';
    const df = (document.getElementById('rd_' + e.id) || {}).value || '';
    e.status = st; e.defect = df;
    if (st !== 'ok') defs.push(e.name + (df ? ' (' + df + ')' : ''));
    equip.push({ ovm: e.ovm, name: e.name, status: st, charge: e.charge, defect: df });
  });
  const body = document.getElementById('dlgBody');
  const pboxes = body ? body.querySelectorAll('input[data-pot]:checked') : [];
  const pbSel = [];
  for (let pi = 0; pi < pboxes.length; pi++) pbSel.push(+pboxes[pi].getAttribute('data-pot'));
  const potBag = (DB.potents || []).filter(k => pbSel.indexOf(k.id) >= 0).map(k => k.name).join(', ');
  const st = hasExpired ? 'red' : ((expList.length > 0 || mode === 'rem' || defs.length > 0) ? 'yellow' : 'green');
  DB.reports.push({
    id: uid(), ts: Date.now(), kind: 'shift', carId: c.id, car: c.name,
    userId: u.id, user: u.name,
    brigade: document.getElementById('rpBrig').value.trim(),
    bagNum: document.getElementById('rpBag').value,
    ecgNum: document.getElementById('rpEcg').value,
    ecgCharge: document.getElementById('rpEcgCh').value.trim(),
    potentBag: potBag, status: st,
    remarks: document.getElementById('rpRem').value.trim(),
    expired: exp, defects: defs, equip, viewed: false, resolved: false
  });
  save();
  if (window.closeDlg) window.closeDlg();
  if (window.render) window.render();
  if (window.toast) window.toast('Отчёт отправлен: ' + (st === 'green' ? '🟢 без замечаний' : st === 'yellow' ? '🟡 с замечаниями' : '🔴 красный'));
}

export function delReport(id) {
  if (!isBoss()) { if (window.toast) window.toast('Удаление доступно только руководителю'); return; }
  if (window.ask) window.ask('Удалить этот отчёт?', () => {
    DB.reports = DB.reports.filter(r => !eqId(r.id, id));
    save();
    if (window.render) window.render();
    if (window.toast) window.toast('Отчёт удалён');
  });
}

export function viewReport(id) {
  const r = DB.reports.find(x => eqId(x.id, id));
  if (!r) return;
  r.viewed = true; save();
  let h = '<div class="reportDetail">';
  h += '<h3>📨 Отчёт · ' + esc(r.car || '') + '</h3>';
  h += '<p><b>Статус:</b> ' + reportBadge(r) + '</p>';
  h += '<p><b>Дата:</b> ' + new Date(r.ts).toLocaleString('ru-RU') + '</p>';
  h += '<p><b>Сотрудник:</b> ' + esc(r.user || '') + '</p>';
  if (r.resolved) h += '<p><b>Исправлен:</b> ' + new Date(r.resolvedTs).toLocaleString('ru-RU') + ' · ' + esc(r.resolvedBy || '') + '</p>';
  h += '<div class="rdSection">';
  h += '<p><b>Бригада:</b> ' + esc(r.brigade || '—') + '</p>';
  h += '<p><b>Сумка:</b> ' + esc(r.bagNum || '—') + '</p>';
  h += '<p><b>ЭКГ №:</b> ' + esc(r.ecgNum || '—') + ' · заряд: ' + esc(r.ecgCharge || '—') + '</p>';
  if (r.potentBag) h += '<p><b>⚕ Комплекты НС/ПВ/СД:</b> ' + esc(r.potentBag) + '</p>';
  h += '</div>';
  if (r.defects && r.defects.length) {
    h += '<div class="rdSection"><b>Дефекты оборудования:</b>';
    r.defects.forEach(d => h += '<p class="rdDefect">• ' + esc(d) + '</p>');
    h += '</div>';
  }
  if (r.expired && r.expired.length) {
    h += '<div class="rdSection"><b>Просроченные / истекающие позиции:</b>';
    r.expired.forEach(d => h += '<p class="rdDefect">• ' + esc(expiredItemText(d)) + '</p>');
    h += '</div>';
  }
  if (r.remarks) h += '<div class="rdSection"><b>Примечания:</b><p>' + esc(r.remarks) + '</p></div>';
  if (isBoss()) {
    h += '<div class="rdSection">';
    if (!r.resolved && r.status !== 'green') h += '<button class="btn wide" data-act="resolveReport" data-arg="' + r.id + '">✅ Отметить исправленным</button>';
    if (r.resolved) h += '<button class="btn sec wide" data-act="unresolveReport" data-arg="' + r.id + '">↩ Вернуть в работу</button>';
    h += '</div>';
  }
  h += '<div class="rdSection">';
  h += '<button class="btn sec wide" data-act="printReport" data-arg="' + r.id + '">🖨 Печать</button>';
  h += '<button class="btn sec wide" data-act="downloadReport" data-arg="' + r.id + '">⬇ Скачать</button>';
  h += '</div>';
  h += '<p style="margin-top:12px"><button class="btn sec wide" data-act="close">Закрыть</button></p>';
  h += '</div>';
  if (window.openDlg) window.openDlg(h);
}

export function resolveReport(id) {
  if (!isBoss()) return;
  const r = DB.reports.find(x => eqId(x.id, id));
  if (!r) return;
  r.resolved = true; r.viewed = true;
  r.resolvedBy = (me() || {}).name || '';
  r.resolvedTs = Date.now();
  save();
  if (window.closeDlg) window.closeDlg();
  if (window.render) window.render();
  if (window.toast) window.toast('Отчёт отмечен как исправленный');
}

export function unresolveReport(id) {
  if (!isBoss()) return;
  const r = DB.reports.find(x => eqId(x.id, id));
  if (!r) return;
  r.resolved = false;
  delete r.resolvedBy; delete r.resolvedTs;
  save();
  if (window.closeDlg) window.closeDlg();
  if (window.render) window.render();
  if (window.toast) window.toast('Отчёт возвращён в работу');
}

export function reportText(r) {
  const s = reportStatus(r);
  const L = ['ОТЧЁТ ПО СМЕНЕ', '', 'Статус: ' + s.label, 'Дата: ' + new Date(r.ts).toLocaleString('ru-RU'),
    'Машина: ' + (r.car || ''), 'Сотрудник: ' + (r.user || ''), 'Бригада: ' + (r.brigade || '—'),
    'Рабочая сумка: ' + (r.bagNum || '—'), 'ЭКГ №: ' + (r.ecgNum || '—') + ' · заряд: ' + (r.ecgCharge || '—')];
  if (r.potentBag) L.push('Комплекты НС/ПВ/СД: ' + r.potentBag);
  if (r.defects && r.defects.length) { L.push('', 'Дефекты оборудования:'); r.defects.forEach(d => L.push('- ' + d)); }
  if (r.expired && r.expired.length) { L.push('', 'Просроченные / истекающие позиции:'); r.expired.forEach(d => L.push('- ' + expiredItemText(d))); }
  if (r.remarks) { L.push('', 'Примечания:', r.remarks); }
  if (r.resolved) { L.push('', 'Отчёт отмечен как исправленный:', new Date(r.resolvedTs).toLocaleString('ru-RU') + ' · ' + (r.resolvedBy || '')); }
  return L.join('\n');
}

export function downloadReport(id) {
  const r = DB.reports.find(x => eqId(x.id, id));
  if (!r) return;
  const blob = new Blob([reportText(r)], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'otchet-' + String(r.car || '').replace(/\s+/g, '_') + '-' + new Date(r.ts).toISOString().slice(0, 10) + '.txt';
  a.click();
  if (window.toast) window.toast('Отчёт сохранён в файл');
}

export function printReport(id) {
  const r = DB.reports.find(x => eqId(x.id, id));
  if (!r) return;
  const w = window.open('', '_blank');
  if (!w) { if (window.toast) window.toast('Браузер заблокировал окно печати'); return; }
  const s = reportStatus(r);
  let html = '<html lang="ru"><head><meta charset="utf-8"><title>Отчёт по смене</title><style>body{font-family:system-ui,Arial,sans-serif;padding:16px;color:#111}h1{font-size:22px;margin:0 0 12px}p{margin:6px 0}.section{margin-top:14px;padding-top:10px;border-top:1px solid #ccc}ul{margin:6px 0;padding-left:20px}li{margin:3px 0}</style></head><body>';
  html += '<h1>Отчёт по смене</h1>';
  html += '<p><b>Статус:</b> ' + s.label + '</p>';
  html += '<p><b>Дата:</b> ' + new Date(r.ts).toLocaleString('ru-RU') + '</p>';
  html += '<p><b>Машина:</b> ' + esc(r.car || '') + '</p>';
  html += '<p><b>Сотрудник:</b> ' + esc(r.user || '') + '</p>';
  html += '<p><b>Бригада:</b> ' + esc(r.brigade || '—') + '</p>';
  html += '<p><b>Рабочая сумка:</b> ' + esc(r.bagNum || '—') + '</p>';
  html += '<p><b>ЭКГ №:</b> ' + esc(r.ecgNum || '—') + ' · заряд: ' + esc(r.ecgCharge || '—') + '</p>';
  if (r.potentBag) html += '<p><b>Комплекты НС/ПВ/СД:</b> ' + esc(r.potentBag) + '</p>';
  if (r.defects && r.defects.length) { html += '<div class="section"><b>Дефекты оборудования:</b><ul>'; r.defects.forEach(d => html += '<li>' + esc(d) + '</li>'); html += '</ul></div>'; }
  if (r.expired && r.expired.length) { html += '<div class="section"><b>Просроченные / истекающие позиции:</b><ul>'; r.expired.forEach(d => html += '<li>' + esc(expiredItemText(d)) + '</li>'); html += '</ul></div>'; }
  if (r.remarks) html += '<div class="section"><b>Примечания:</b><p>' + esc(r.remarks) + '</p></div>';
  html += '</body></html>';
  w.document.write(html); w.document.close();
  setTimeout(() => w.print(), 300);
}

window.reportsView = reportsView;
window.openRep = openRep;
window.submitRep = submitRep;
window.delReport = delReport;
window.viewReport = viewReport;
window.resolveReport = resolveReport;
window.unresolveReport = unresolveReport;
window.downloadReport = downloadReport;
window.printReport = printReport;
window.reportBadge = reportBadge;