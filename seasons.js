import { DB, save, esc, todayStr, bdayToday } from './db.js';
import { LIMITS } from './config.js';

const SEASONS = [
  { name: 'Зима',  icons: '❄️⛄❄️', side: '❄️', fall: ['❄️','🌨','❄️','⛄'] },
  { name: 'Весна', icons: '🌸🐦🌷', side: '🌷', fall: ['🌸','','','🍃'] },
  { name: 'Лето',  icons: '☀️🍓',   side: '🌻', fall: ['🌻','','','🌼'] },
  { name: 'Осень', icons: '🍂🍁🍂', side: '🍁', fall: ['🍂','🍁','🍃',''] }
];
const MONTH_SOUL = [
  'серебряный снег и тепло дома','метели дорисовывают зиму',
  'капель и первые проталины','скворцы вернулись, лёд тронулся',
  'черёмуха, тёплые вечера и салюты','начало долгих светлых сумерек',
  'макушка лета, запах трав и гроз','тёплые ночи и звездопад',
  'золото листьев и бабье лето','багрянец, листопад и зонты',
  'последние листья и первый лёд','мандарины, гирлянды и ожидание чуда'
];
const HOLS = {
  '01-01':'🎄 Новый год','01-07':'⭐ Рождество','02-14':'💘 День влюблённых',
  '02-23':'🎖 23 февраля','03-08':'💐 8 Марта','04-01':'🤡 День смеха',
  '05-01':'🌷 Первомай','05-09':'🎉 День Победы','06-01':'🧸 День защиты детей',
  '06-12':'🇷 День России','09-01':'🎓 День знаний','11-04':'🤝 Народное единства',
  '12-31':'🎆 Канун Нового года'
};

function seasonIdx(m) { return (m === 11 || m <= 1) ? 0 : (m <= 4 ? 1 : (m <= 7 ? 2 : 3)); }
function fallSet() { return SEASONS[seasonIdx(new Date().getMonth())].fall; }

export function seasonHtml() {
  const d = new Date(), m = d.getMonth();
  const s = SEASONS[seasonIdx(m)];
  const key = ('0' + (m + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  let hol = HOLS[key];
  if (m === 5 && d.getDay() === 0 && d.getDate() >= 15 && d.getDate() <= 21) hol = '💚 День медицинского работника';
  const bd = (window.bdayToday ? bdayToday() : []);
  let h = '<div class="seasonBox">';
  h += '<div class="seasonIcons">' + s.icons + '</div>';
  h += '<div class="seasonName"><span class="sdTop tL">' + s.side + '</span>' +
       '<span class="sdSide">' + s.side + '</span>' + s.name +
       '<span class="sdSide r">' + s.side + '</span>' +
       '<span class="sdTop tR">' + s.side + '</span></div>';
  h += '<div class="seasonSoul">' + MONTH_SOUL[m] + '</div>';
  if (hol) h += '<div class="seasonHoliday">' + hol + '</div>';
  if (bd.length) h += '<div class="seasonBday">🎉 День рождения: ' + bd.map(esc).join(', ') + '!</div>';
  h += '</div>';
  return h;
}

let leavesBox = null, parts = [], rafId = null, lastTs = 0;
let tilt = 0, hasTilt = false;

function ensureBox() {
  if (!leavesBox) {
    leavesBox = document.createElement('div');
    leavesBox.className = 'msLeaves';
    document.body.appendChild(leavesBox);
  }
  return leavesBox;
}

export function stopLeaves() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null; lastTs = 0;
  if (leavesBox) leavesBox.innerHTML = '';
  parts = [];
}

function newPart(stagger) {
  const set = fallSet();
  const el = document.createElement('span');
  el.className = 'msLeaf';
  el.textContent = set[Math.floor(Math.random() * set.length)];
  const r = 10 + Math.random() * 8;
  el.style.fontSize = (r * 1.6) + 'px';
  ensureBox().appendChild(el);
  return {
    el, r,
    x: Math.random() * window.innerWidth,
    y: stagger ? Math.random() * window.innerHeight : -40 - Math.random() * 80,
    vy: 0.25 + Math.random() * 0.35,
    phase: Math.random() * 6.28,
    vr: Math.random() * 1.2 - 0.6,
    rot: Math.random() * 360
  };
}

function loop(ts) {
  if (document.hidden) { rafId = null; return; }
  rafId = requestAnimationFrame(loop);
  if (!lastTs) lastTs = ts;
  const dt = Math.min(50, ts - lastTs); lastTs = ts;
  const f = dt / 16.667;
  const W = window.innerWidth, H = window.innerHeight;
  const wind = (hasTilt ? tilt * 0.8 : 0) + Math.sin(ts / 1000 * 0.5) * 0.15;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.y += p.vy * f;
    p.x += (Math.sin(p.y * 0.02 + p.phase) * 0.45 + wind) * f;
    p.rot += p.vr * f;
    if (p.x < -30) p.x = W + 20;
    if (p.x > W + 30) p.x = -20;
    if (p.y > H + 30) {
      p.y = -40 - Math.random() * 80;
      p.x = Math.random() * W;
      p.vy = 0.25 + Math.random() * 0.35;
      const set = fallSet();
      p.el.textContent = set[Math.floor(Math.random() * set.length)];
    }
    p.el.style.transform = 'translate(' + (p.x - p.r) + 'px,' + (p.y - p.r) + 'px) rotate(' + p.rot + 'deg)';
  }
}

export function startLeaves() {
  stopLeaves();
  if (!window.me || !window.me()) return;
  if (DB.settings.leaves === false) return;
  const n = window.innerWidth < 480 ? LIMITS.LEAVES_COUNT_MOBILE : LIMITS.LEAVES_COUNT_DESKTOP;
  for (let i = 0; i < n; i++) parts.push(newPart(true));
  rafId = requestAnimationFrame(loop);
}

window.addEventListener('deviceorientation', e => {
  if (e.gamma == null) return;
  hasTilt = true;
  tilt = Math.max(-1, Math.min(1, e.gamma / 30));
});
window.addEventListener('mousemove', e => {
  if (hasTilt) return;
  tilt = (e.clientX / window.innerWidth - 0.5) * 1.2;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLeaves();
  else if (window.me && window.me() && DB.settings.leaves !== false) startLeaves();
});

window.msToggleLeaves = function(on) {
  DB.settings.leaves = !!on;
  save();
  if (on) startLeaves(); else stopLeaves();
};

window.seasonHtml = seasonHtml;
window.startLeaves = startLeaves;
window.stopLeaves = stopLeaves;