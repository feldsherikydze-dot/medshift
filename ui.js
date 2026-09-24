import { DB, save, me, isBoss, esc, todayStr } from './db.js';
import { onlineN } from './sync.js';
export let tab = localStorage.getItem('medshift_tab') || 'home';
const VALID_TABS = ['home','bags','cars','ref','sched','chat','set','reports'];
if (!VALID_TABS.includes(tab)) tab = 'home';
let toastTimer = null;
export function toast(msg) { let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.className = 'toast show'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000); }
export function openDlg(html) { const body = document.getElementById('dlgBody'); body.innerHTML = html; document.getElementById('dlg').showModal(); body.onclick = e => { const btn = e.target.closest('[data-act]'); if (!btn) return; const fn = window.__dlgActions && window.__dlgActions[btn.dataset.act]; if (fn) fn(btn.dataset.arg, btn, e); }; }
export function closeDlg() { document.getElementById('dlg').close(); if (window.__photoCleanup) { window.__photoCleanup(); window.__photoCleanup = null; } }
export function ask(msg, cb) { openDlg('<h3>Подтверждение</h3><p>' + esc(msg) + '</p><p><button class="btn" data-act="askY">Да</button><button class="btn sec" data-act="askN">Отмена</button></p>'); window.__dlgActions = { askY: () => { closeDlg(); cb(); }, askN: () => closeDlg() }; }
export function askText(title, def, cb) { openDlg('<h3>' + esc(title) + '</h3><input id="askV" value="' + esc(def || '') + '"><p><button class="btn" data-act="ok">Создать</button><button class="btn sec" data-act="cancel">Отмена</button></p>'); window.__dlgActions = { ok: () => { const v = document.getElementById('askV').value.trim(); closeDlg(); if (v) cb(v); }, cancel: () => closeDlg() }; }
export function applyTheme() { let d = DB.settings.dark; if (!d || d === 'auto') d = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '1' : '0'; document.body.classList.toggle('dark', d === '1'); document.documentElement.style.setProperty('--ac', DB.settings.accent || '#0b5394'); applyFontSize(); }
export function applyFontSize() { document.documentElement.style.setProperty('--fs', (DB.settings.fontSize || 14) + 'px'); }
if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', applyTheme); }
function setVH() { document.documentElement.style.setProperty('--vh', window.innerHeight * 0.01 + 'px'); }
function setKb() { let kb = 0; if (window.visualViewport) kb = Math.max(0, window.innerHeight - window.visualViewport.height); document.documentElement.style.setProperty('--kb', kb + 'px'); }
setVH(); setKb();
window.addEventListener('resize', () => { setVH(); setKb(); });
window.addEventListener('orientationchange', () => { setTimeout(setVH, 100); setTimeout(setKb, 150); });
if (window.visualViewport) { window.visualViewport.addEventListener('resize', () => { setVH(); setKb(); }); window.visualViewport.addEventListener('scroll', () => { setVH(); setKb(); }); }
document.addEventListener('focusin', e => { const t = e.target; if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') setTimeout(() => { setKb(); const kb = window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) : 0; const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight; const rect = t.getBoundingClientRect(); if (rect.bottom + kb >= vh) window.scrollBy({ top: rect.bottom - vh + 20, behavior: 'smooth' }); const box = document.getElementById('cbox'); if (box) box.scrollTop = box.scrollHeight; }, 300); });
export function updHead() { const e = document.getElementById('headcount'); if (e) e.textContent = '👥 ' + DB.users.length + (onlineN == null ? '' : ' · 🟢 ' + onlineN); const u = me(), hu = document.getElementById('hdrUser'); if (!hu) return; if (!u) { hu.textContent = ''; return; } const n = u.name.trim().split(/\s+/); hu.textContent = n.length >= 3 ? n[0] + ' ' + n[1][0] + '.' + n[2][0] + '.' : n.length === 2 ? n[0] + ' ' + n[1][0] + '.' : n[0] || ''; }
export function renderNav() { const nav = document.getElementById('nav'), u = me(); nav.innerHTML = ''; if (!u) return; const tabs = [['home','Главная'],['bags','Сумки'],['cars','Машины'],['ref','💊'],['sched','Смены'],['chat','Чат'],['set','Ещё']]; if (DB.reports && DB.reports.length) tabs.splice(4, 0, ['reports','Отчёты']); tabs.forEach(([k, label]) => { const b = document.createElement('button'); if (tab === k) b.className = 'on'; b.textContent = label; b.onclick = () => go(k); nav.appendChild(b); }); }
export function go(t) { tab = t; localStorage.setItem('medshift_tab', t); if (t !== 'bags') { window.curTpl = false; window.curPot = false; window.curPotKit = null; window.openTplId = null; window.tplSearch = ''; } if (t !== 'ref') window.refSearch = ''; renderNav(); render(); }
export function render() {
  const u = me(), main = document.getElementById('main');
  if (!u) { main.innerHTML = window.loginView ? window.loginView() : ''; document.getElementById('alarm').innerHTML = ''; updHead(); return; }
  const views = { home: window.homeView, bags: () => window.curPot ? (window.curPotKit ? window.potKitView() : window.potentView()) : (window.curTpl ? window.tplView() : window.bagsView()), cars: window.carsView, ref: window.refView, sched: window.schedView, chat: window.chatView, set: window.setView, reports: window.reportsView };
  const fn = views[tab]; main.innerHTML = fn ? fn() : '';
  const a = window.alerts ? window.alerts() : []; document.getElementById('alarm').innerHTML = a.length ? '<span class="badge bExp">! ' + a.length + '</span>' : ''; updHead();
  if (tab === 'home') { if (window.startClock) window.startClock(); if (window.loadWeather) window.loadWeather(); }
  if (window.decorateChat) window.decorateChat(); if (window.injectTplDeleteButtons) window.injectTplDeleteButtons(); if (window.injectTplPotentButtons) window.injectTplPotentButtons(); if (window.startLeaves && me()) window.startLeaves();
}
window.addEventListener('error', e => toast('⚠ Ошибка: ' + e.message + ' (стр. ' + e.lineno + ')'));
window.addEventListener('unhandledrejection', e => toast('⚠ Ошибка: ' + (e && e.reason && e.reason.message ? e.reason.message : 'неизвестная')));
window.__onSync = () => { updHead(); if (tab === 'set') render(); };
window.__onAdopt = () => { applyTheme(); render(); toast('🔄 Синхронизировано'); };
window.toast = toast; window.openDlg = openDlg; window.closeDlg = closeDlg; window.ask = ask; window.askText = askText; window.applyTheme = applyTheme; window.applyFontSize = applyFontSize; window.updHead = updHead; window.renderNav = renderNav; window.render = render; window.go = go; window.esc = esc; window.tab = tab;