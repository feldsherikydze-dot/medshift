import { DB, save, me, isBoss, esc, todayStr } from './db.js';
import { onlineN } from './sync.js';
import { fsEffective } from './logic.js';
const VALID_TABS = ['home','bags','cars','ref','sched','chat','set','reports'];
// Ярлыки в манифесте открывают index.html?tab=… — раньше параметр никто
// не читал, и все три ярлыка открывали последнюю запомненную вкладку.
function tabFromUrl() {
  try {
    const t = new URLSearchParams(location.search).get('tab');
    if (!t || !VALID_TABS.includes(t)) return null;
    history.replaceState(null, '', location.pathname);   // убрать ?tab= из адресной строки
    return t;
  } catch { return null; }
}
export let tab = tabFromUrl() || localStorage.getItem('medshift_tab') || 'home';
if (!VALID_TABS.includes(tab)) tab = 'home';
let toastTimer = null;
export function toast(msg) { let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.className = 'toast show'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000); }
export function openDlg(html) { const body = document.getElementById('dlgBody'); body.innerHTML = html; document.getElementById('dlg').showModal(); window.__dlgActions = null; body.onclick = e => { const btn = e.target.closest('[data-act]'); if (!btn) return; const fn = window.__dlgActions && window.__dlgActions[btn.dataset.act]; if (fn) try { fn(btn.dataset.arg, btn, e); } catch (err) { toast('Ошибка: ' + err.message); } }; }
export function closeDlg() { document.getElementById('dlg').close(); if (window.__photoCleanup) { window.__photoCleanup(); window.__photoCleanup = null; } }
export function ask(msg, cb) { openDlg('<h3>Подтверждение</h3><p>' + esc(msg) + '</p><p><button class="btn" data-act="askY">Да</button><button class="btn sec" data-act="askN">Отмена</button></p>'); window.__dlgActions = { askY: () => { closeDlg(); cb(); }, askN: () => closeDlg() }; }
export function askText(title, def, cb) { openDlg('<h3>' + esc(title) + '</h3><input id="askV" value="' + esc(def || '') + '"><p><button class="btn" data-act="ok">Создать</button><button class="btn sec" data-act="cancel">Отмена</button></p>'); window.__dlgActions = { ok: () => { const v = document.getElementById('askV').value.trim(); closeDlg(); if (v) cb(v); }, cancel: () => closeDlg() }; }
export function applyTheme() { let d = DB.settings.dark; if (!d || d === 'auto') d = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? '1' : '0'; document.body.classList.toggle('dark', d === '1'); document.documentElement.style.setProperty('--ac', DB.settings.accent || '#0b5394'); const _dark = d === '1'; const mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.setAttribute('content', _dark ? '#12161c' : '#f4f6f8'); try { document.documentElement.style.colorScheme = _dark ? 'dark' : 'light'; } catch {} applyFontSize(); }
/* ---------- Размер под экран ----------
   Сами формулы живут в logic.js (fsScaleFor/fsEffective) — там им место,
   потому что это чистый расчёт, который должен проверяться тестом, а
   ui.js при загрузке требует DOM и в тесты не берётся. */
export function applyFontSize() {
  const base = Number(DB.settings.fontSize) || 14;
  const w = (typeof window !== 'undefined' && window.innerWidth) || 360;
  document.documentElement.style.setProperty('--fs-user', base + 'px');
  document.documentElement.style.setProperty('--fs', fsEffective(base, w) + 'px');
}
if (window.matchMedia) { const mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', applyTheme); }
function setVH() { document.documentElement.style.setProperty('--vh', window.innerHeight * 0.01 + 'px'); }
function setKb() { let kb = 0; if (window.visualViewport) kb = Math.max(0, window.innerHeight - window.visualViewport.height); document.documentElement.style.setProperty('--kb', kb + 'px'); }
setVH(); setKb();
/* Шрифт пересчитываем не на каждое событие resize (их бывает сотня в
   секунду при перетаскивании окна), а один раз, когда перетаскивание
   закончилось: 150мс тишины. */
let _fsT = null;
window.addEventListener('resize', () => {
  setVH(); setKb();
  clearTimeout(_fsT); _fsT = setTimeout(applyFontSize, 150);
});
window.addEventListener('orientationchange', () => { setTimeout(setVH, 100); setTimeout(setKb, 150); });
if (window.visualViewport) { window.visualViewport.addEventListener('resize', () => { setVH(); setKb(); }); window.visualViewport.addEventListener('scroll', () => { setVH(); setKb(); }); }
document.addEventListener('focusin', e => { const t = e.target; if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') setTimeout(() => { setKb(); const kb = window.visualViewport ? Math.max(0, window.innerHeight - window.visualViewport.height) : 0; const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight; const rect = t.getBoundingClientRect(); if (rect.bottom + kb >= vh) window.scrollBy({ top: rect.bottom - vh + 20, behavior: 'smooth' }); const box = document.getElementById('cbox'); if (box) box.scrollTop = box.scrollHeight; }, 300); });
export function updHead() {
  const u = me();
  const e = document.getElementById('headcount');
  // До входа показываем только число сотрудников — новичку это ориентир,
  // а число онлайн-устройств до ввода PIN знать незачем (решение по п. 4.3).
  if (e) e.textContent = u
    ? '👥 ' + DB.users.length + (onlineN == null ? '' : ' · 🟢 ' + onlineN)
    : '👥 ' + DB.users.length;
  const hu = document.getElementById('hdrUser'); if (!hu) return; if (!u) { hu.textContent = ''; return; } const n = u.name.trim().split(/\s+/); hu.textContent = n.length >= 3 ? n[0] + ' ' + n[1][0] + '.' + n[2][0] + '.' : n.length === 2 ? n[0] + ' ' + n[1][0] + '.' : n[0] || '';
}
export function renderNav() { const nav = document.getElementById('nav'), u = me(); nav.innerHTML = ''; if (!u) return; const tabs = [['home','Главная'],['bags','Сумки'],['cars','Машины'],['sched','Смены'],['chat','Чат'],['ref','💊'],['set','Ещё']]; if (DB.reports) tabs.splice(3, 0, ['reports','Отчёты']); tabs.forEach(([k, label]) => { const b = document.createElement('button'); if (tab === k) b.className = 'on'; b.textContent = label; b.onclick = () => go(k); nav.appendChild(b); }); }
export function go(t) { tab = t; localStorage.setItem('medshift_tab', t); if (t !== 'bags') { window.curTpl = false; window.curPot = false; window.curPotKit = null; window.openTplId = null; window.tplSearch = ''; } if (t !== 'ref') window.refSearch = ''; renderNav(); render(); }
export function render() {
  const u = me(), main = document.getElementById('main');
  if (!u) {
    const a = document.activeElement;
    if (a && ['lnName', 'lnPin', 'pinIn'].includes(a.id)) return;
    main.innerHTML = window.loginView ? window.loginView() : ''; document.getElementById('alarm').innerHTML = ''; updHead(); return;
  }
  const views = { home: window.homeView, bags: () => window.curPot ? (window.curPotKit ? window.potKitView() : window.potentView()) : (window.curTpl ? window.tplView() : window.bagsView()), cars: window.carsView, ref: window.refView, sched: window.schedView, chat: window.chatView, set: window.setView, reports: window.reportsView };
  const fn = views[tab]; main.innerHTML = fn ? fn() : '';
  const a = window.alerts ? window.alerts() : [];
  const lamp = (on, c) => '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin:0 1px;vertical-align:middle;background:' + (on ? c : 'transparent') + ';border:1.5px solid ' + c + '"></span>';
  const aR = a.some(x => x.l === 'bR' || x.l === 'bExp'), aY = a.some(x => x.l === 'bY' || x.l === 'bSoon');
  document.getElementById('alarm').innerHTML = '<span data-act="showAlertsDlg" style="cursor:pointer;padding:2px 8px;border-radius:12px" title="Показать тревоги">' + lamp(!aR && !aY, '#2e7d32') + lamp(aY, '#f9a825') + lamp(aR, '#d32f2f') + ' ' + alertCount(a) + '</span>';
  updHead();
  if (tab === 'home') { if (window.startClock) window.startClock(); if (window.loadWeather) window.loadWeather(); }
  if (window.decorateChat) window.decorateChat(); if (window.startLeaves && me()) window.startLeaves();
}
window.addEventListener('error', e => toast('⚠ Ошибка: ' + e.message + ' (стр. ' + e.lineno + ')'));
window.addEventListener('unhandledrejection', e => toast('⚠ Ошибка: ' + (e && e.reason && e.reason.message ? e.reason.message : 'неизвестная')));
window.__onSync = () => { updHead(); if (tab === 'set') render(); };
window.__onAdopt = () => { applyTheme(); render(); toast('🔄 Синхронизировано'); };
window.toast = toast; window.openDlg = openDlg; window.closeDlg = closeDlg; window.ask = ask; window.askText = askText; window.applyTheme = applyTheme; window.applyFontSize = applyFontSize; window.updHead = updHead; window.renderNav = renderNav; window.render = render; window.go = go; window.esc = esc;
Object.defineProperty(window, 'tab', { get: () => tab, set: v => { tab = v; }, configurable: true });

/* Глазок показа/скрытия PIN и паролей во всех полях приложения (автооборачивание) */
(function () {
  if (!window.MutationObserver) return;
  let n = 0;
  function eyeify(root) {
    const els = root.querySelectorAll('input[type="password"]');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (el.dataset.eyed) continue;
      el.dataset.eyed = '1';
      if (!el.id) el.id = 'pw_' + (++n);
      const wrap = document.createElement('span');
      wrap.className = 'pwBox';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'eyeBtn';
      btn.setAttribute('aria-label', 'Показать или скрыть');
      btn.textContent = '👁️';
      btn.onclick = function () {
        if (el.type === 'password') { el.type = 'text'; btn.textContent = '🙈'; }
        else { el.type = 'password'; btn.textContent = '👁️'; }
      };
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      wrap.appendChild(btn);
    }
  }
  const mo = new MutationObserver(function (muts) {
    for (let i = 0; i < muts.length; i++) {
      const m = muts[i];
      for (let j = 0; j < m.addedNodes.length; j++) {
        const nd = m.addedNodes[j];
        if (nd.nodeType === 1) eyeify(nd);
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  eyeify(document.body);
})();
