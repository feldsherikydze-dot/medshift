import { LS_KEYS, LIMITS } from './config.js';
import { DB, save } from './db.js';

const PRESETS = {
  med: {
    name: 'Медицинский',
    css: 'linear-gradient(135deg,#e3f2fd 0%,#f8fbfd 45%,#bbdefb 100%)'
  },
  dawn: {
    name: 'Рассвет',
    css: 'linear-gradient(135deg,#ffe3d6 0%,#fff7f0 50%,#ffd0c4 100%)'
  },
  night: {
    name: 'Ночь',
    css: 'linear-gradient(135deg,#0b1026 0%,#141b38 50%,#0e2a4a 100%)'
  },
  ocean: {
    name: 'Океан',
    css: 'linear-gradient(135deg,#e0f7fa 0%,#f2fbfd 45%,#b2ebf2 100%)'
  },
  aurora: {
    name: 'Аврора',
    css: 'linear-gradient(135deg,#dbeafe 0%,#f4f6ff 40%,#e6dcf7 75%,#fdeef8 100%)'
  },
  sunset: {
    name: 'Закат',
    css: 'linear-gradient(135deg,#fff1eb 0%,#ffe9f0 50%,#ffe3cc 100%)'
  },
  mint: {
    name: 'Мята',
    css: 'linear-gradient(135deg,#e0f2f1 0%,#f2fbf9 50%,#c8e6d7 100%)'
  },
  sand: {
    name: 'Песок',
    css: 'linear-gradient(135deg,#fff8e1 0%,#fff6e0 50%,#ffe8c9 100%)'
  },
  slate: {
    name: 'Графит',
    css: 'linear-gradient(135deg,#20242e 0%,#2b3040 55%,#1f2530 100%)'
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
    bgPreview = null;
    DB.settings.bg = 'custom'; save(); applyBg();
    if (window.render) window.render();
    window.toast('📷 Свой фон установлен');
  });
}

function bgCard() {
  const cur = DB.settings.bg || '';
  let h = '<div class="card"><h3>🖼 Фон приложения</h3><p style="font-size:calc(var(--fs) - 2px);color:var(--mut);margin:2px 0 8px">Цвет/картинка позади карточек интерфейса.</p><div class="bgRow">';
  h += '<button class="btn mini' + (cur === '' ? ' on' : '') + '" data-act="previewBg" data-arg="">Обычный</button>';
  Object.keys(PRESETS).forEach(k => {
    const p = PRESETS[k];
    const bg = p.css.split('"').join('&quot;');
    h += '<button class="btn mini sb' + (cur === k ? ' on' : '') + '" style="background:' + bg + ';border-color:' + (cur === k ? 'var(--ac)' : 'transparent') + '" data-act="previewBg" data-arg="' + k + '">' + esc(p.name) + '</button>';
  });
  h += '<label class="btn sec mini" style="display:inline-flex;align-items:center">📷 Своя<input type="file" hidden accept="image/*" id="bgFile" onchange="window.setBgCustom(this)"></label>';
  h += '</div><p><button class="btn" data-act="saveBg">💾 Сохранить фон</button><button class="btn sec" data-act="cancelBg">Отмена</button></p></div>';
  return h;
}

let bgPreview = null;
window.previewBg = (k) => {
  k = String(k);
  bgPreview = { t: k };
  const layer = document.getElementById('msBg');
  if (!layer) return;
  const cur = DB.settings.bg === 'custom' ? '' : (PRESETS[DB.settings.bg] ? DB.settings.bg : '');
  layer.style.backgroundImage = k === '' ? (PRESETS[cur] ? PRESETS[cur].css : 'none') : (PRESETS[k] ? PRESETS[k].css : 'none');
};
window.saveBg = () => {
  if (bgPreview) { DB.settings.bg = bgPreview.t; bgPreview = null; save(); window.toast('✅ Фон сохранён'); }
  applyBg(); if (window.render) window.render();
};
window.cancelBg = () => { bgPreview = null; applyBg(); if (window.render) window.render(); };

function esc(s) { s = s == null ? '' : String(s); return s.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;'); }

window.applyBg = applyBg;
window.bgCard = bgCard;
window.setBg = setBg;
window.setBgCustom = setBgCustom;

applyBg();