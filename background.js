import { LS_KEYS, LIMITS } from './config.js';
import { DB, save, esc } from './db.js';

const PRESETS = {
  dawn: {
    name: 'Рассвет', txt: '#fff',
    css: 'linear-gradient(165deg,#0b5394 0%,#3f8fd0 35%,#bcdcf5 70%,#eef7ff 100%)'
  },
  night: {
    name: 'Ночная смена', txt: '#fff',
    css: 'radial-gradient(2px 2px at 20% 30%,#fff 50%,transparent 51%),' +
      'radial-gradient(1.5px 1.5px at 70% 18%,#dfe9ff 50%,transparent 51%),' +
      'radial-gradient(1.5px 1.5px at 42% 68%,#fff 50%,transparent 51%),' +
      'radial-gradient(2px 2px at 85% 55%,#cfd8ff 50%,transparent 51%),' +
      'radial-gradient(1.5px 1.5px at 10% 80%,#fff 50%,transparent 51%),' +
      'linear-gradient(180deg,#0a1030 0%,#141b3f 55%,#1c2340 100%)'
  },
  med: {
    name: 'Закат 🌇', txt: '#fff',
    css: 'linear-gradient(180deg,#233a63 0%,#5d4a7e 26%,#9c6288 48%,#d98274 70%,#f2b06b 88%,#f9d38a 100%)'
  }
};

function applyBg() {
  const layer = document.getElementById('msBg');
  if (!layer) return;
  const t = DB.settings.bg || '';
  let bi = 'none';
  if (t === 'custom') {
    const img = localStorage.getItem(LS_KEYS.BG_CUSTOM);
    if (img) bi = 'linear-gradient(rgba(244,246,248,.28),rgba(244,246,248,.42)), url("' + img + '")';
    else t = '';
  } else if (PRESETS[t]) {
    bi = PRESETS[t].css;
  }
  layer.style.backgroundImage = bi;
}

function setBg(key) {
  DB.settings.bg = key; save(); applyBg();
  if (window.render) window.render();
  window.toast(key === '' ? 'Фон убран' : '🖼 Фон: ' + (PRESETS[key] ? PRESETS[key].name : 'свой'));
}

function compressBg(f, cb) {
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      let w = im.width, h = im.height;
      const max = LIMITS.BG_MAX_DIM;
      if (w > max || h > max) { const k = Math.min(max / w, max / h); w = Math.round(w * k); h = Math.round(h * k); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(im, 0, 0, w, h);
      cb(cv.toDataURL('image/jpeg', LIMITS.BG_QUALITY));
    };
    im.onerror = () => cb(null);
    im.src = r.result;
  };
  r.onerror = () => cb(null);
  r.readAsDataURL(f);
}

function setBgCustom(inp) {
  const f = inp.files && inp.files[0];
  inp.value = '';
  if (!f) return;
  compressBg(f, data => {
    if (!data) return window.toast('Не удалось прочитать картинку');
    if (data.length > LIMITS.BG_MAX_BYTES) return window.toast('Картинка слишком тяжёлая — возьмите поменьше');
    try { localStorage.setItem(LS_KEYS.BG_CUSTOM, data); } catch { return window.toast('Не хватает памяти устройства'); }
    DB.settings.bg = 'custom'; save(); applyBg();
    if (window.render) window.render();
    window.toast('📷 Свой фон установлен');
  });
}

function bgCard() {
  const cur = DB.settings.bg || '';
  let h = '<div class="card"><h3>🖼 Фон приложения</h3>';
  h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Настройка личная для этого устройства: выбери готовый фон или загрузи свою картинку.</p>';
  h += '<div class="bgRow">';
  h += '<button class="btn sec mini" style="' + (cur === '' ? 'border-width:2px;' : '') + '" onclick="setBg(\'\')">✕ Без фона</button>';
  Object.keys(PRESETS).forEach(k => {
    const p = PRESETS[k];
    const bg = p.css.split('"').join('&quot;');
    h += '<button class="btn mini" style="background:' + bg + ';color:' + p.txt + ';' +
      (cur === k ? 'outline:2px solid var(--ac);outline-offset:1px;' : '') + '" onclick="setBg(\'' + k + '\')">' + esc(p.name) + '</button>';
  });
  h += '<label class="btn sec mini" style="display:inline-block;margin:3px 3px 3px 0">📷 Своя картинка<input type="file" hidden accept="image/*" onchange="window.setBgCustom(this)"></label>';
  if (cur === 'custom' && localStorage.getItem(LS_KEYS.BG_CUSTOM)) {
    h += '<img src="' + localStorage.getItem(LS_KEYS.BG_CUSTOM) + '" style="width:40px;height:28px;object-fit:cover;border-radius:4px;border:1px solid var(--bd)">';
  }
  h += '</div></div>';
  return h;
}

window.applyBg = applyBg;
window.bgCard = bgCard;
window.setBg = setBg;
window.setBgCustom = setBgCustom;

applyBg();