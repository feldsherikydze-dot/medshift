import { DB, save, uid, me, isBoss, esc } from './db.js';
import { LIMITS } from './config.js';

export const BOT_JOKES = [
  '— Доктор, у меня проблемы с памятью. — «И давно это у вас?» — «И давно что?»',
  '— Доктор, меня все игнорируют. — «Следующий!»',
  '— Я буду жить? — «А смысл?»',
  'Скорая помощь: мы уже едем. Даже когда вы ещё только думаете, стоит ли вызывать.',
  'В нашей сумке есть всё, кроме запасных нервов. Они просрочились ещё в феврале.',
  'У фельдшера три состояния: в пути, на вызове и пью чай стоя.',
  'ЭКГ — это автобиография сердца. У нашего почерк ещё тот.',
  'Если смена прошла тихо — значит, вы ещё не открыли чат.',
  'Термосумка хранит растворы холодными, а нас — в боевом настроении.',
  'Любимая фраза дефибриллятора: «Ну ещё разок, с чувством».',
  'Срок годности — единственный дедлайн в медицине, который нельзя подвинуть.',
  '— Алло, это скорая? — «Да, слушаем.» — «А когда приедете?» — «Мы уже приехали. Открывайте, мы с чаем».',
  'Хорошая смена — это когда отчёт зелёный, а чай горячий.',
  'Чат — дело хорошее. Но сумку всё равно проверять руками.',
  '— На что жалуетесь? — «На жизнь.» — «Так, пишем: общее недомогание».'
];

export let room = 'общая';

export function chatView() {
  const rooms = ['общая'];
  DB.cars.forEach(c => rooms.push(c.name));
  if (rooms.indexOf(room) < 0) room = 'общая';
  let h = '<select onchange="window.__setRoom(this.value)">';
  rooms.forEach(r => h += '<option' + (r === room ? ' selected' : '') + '>' + esc(r) + '</option>');
  h += '</select>';
  h += '<div class="chatbox" id="cbox">';
  const msgs = DB.chat.filter(m => m.room === room).slice(-LIMITS.CHAT_SHOW);
  if (msgs.length) {
    msgs.forEach(m => {
      h += '<div class="msg"><b>' + esc(m.author) + '</b> <small>' +
           new Date(m.ts).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) +
           '</small><br>' + esc(m.text) + '</div>';
    });
  } else h += '<p>Сообщений нет</p>';
  h += '</div>';
  h += '<div class="chatIn"><textarea id="cIn" rows="1" placeholder="Сообщение… (Enter — отправить)" onkeydown="window.__chatKey(event)" oninput="window.__chatResize(this)"></textarea><button class="btn" onclick="window.__sendMsg()">➤</button></div>';
  h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Позовите Феликса по имени или напишите !шутка — он расскажет медицинскую шутку.</p>';
  h += '<p><button class="btn sec mini" onclick="window.__botJoke()">😄 Попросить шутку у Феликса</button>';
  if (isBoss()) h += ' <button class="btn del" onclick="window.__clearChat()">🗑 Очистить чат</button>';
  h += '</p>';
  setTimeout(() => {
    const b = document.getElementById('cbox');
    if (b) b.scrollTop = b.scrollHeight;
    const e = document.getElementById('cIn');
    if (e) e.focus();
  }, 0);
  return h;
}

export function sendMsg() {
  const el = document.getElementById('cIn');
  if (!el) return;
  const v = el.value.trim();
  if (!v) return;
  const m = { id: uid(), ts: Date.now(), author: (me() || {}).name || 'аноним', room, text: v };
  DB.chat.push(m);
  if (DB.chat.length > LIMITS.CHAT_MAX) DB.chat = DB.chat.slice(-LIMITS.CHAT_MAX);
  save();
  botMaybe(v);
  el.value = '';
  el.style.height = 'auto';
  if (window.render) window.render();
  setTimeout(() => {
    const b = document.getElementById('cbox');
    if (b) b.scrollTop = b.scrollHeight;
    const c = document.getElementById('cIn');
    if (c) c.focus();
  }, 30);
}

export function clearChat() {
  if (window.ask) window.ask('Очистить весь чат? Сообщения будут удалены безвозвратно.', () => {
    DB.chat = [];
    save();
    if (window.render) window.render();
    if (window.toast) window.toast('Чат очищен');
  });
}

export function botJoke() {
  const j = BOT_JOKES[Math.floor(Math.random() * BOT_JOKES.length)];
  const m = { id: uid(), ts: Date.now(), author: '🤖 Феликс', room, text: j };
  DB.chat.push(m);
  save();
  if (window.render) window.render();
  if (window.toast) window.toast('🤖 Феликс шутит');
}

export function botMaybe(text) {
  const t = text.toLowerCase();
  if (t.indexOf('феликс') >= 0 || t.indexOf('!шутка') >= 0 || t.indexOf('/шутка') >= 0) {
    const _bn = Date.now();
    if (_bn - (window.__lastBotTs || 0) < 20000) return;
    window.__lastBotTs = _bn;
    setTimeout(() => {
      const j = BOT_JOKES[Math.floor(Math.random() * BOT_JOKES.length)];
      const m = { id: uid(), ts: Date.now(), author: '🤖 Феликс', room, text: j };
      DB.chat.push(m);
      save();
      if (window.tab === 'chat') { if (window.render) window.render(); }
      else if (window.toast) window.toast('🤖 Феликс ответил в чате');
    }, 900 + Math.random() * 1500);
  }
}

export function decorateChat() {
  if (window.tab !== 'chat') return;
  const u = window.me ? window.me() : null;
  if (!u) return;
  const box = document.getElementById('cbox');
  if (!box) return;
  const msgs = box.querySelectorAll('.msg');
  for (let i = 0; i < msgs.length; i++) {
    const b = msgs[i].querySelector('b');
    const author = b ? b.textContent : '';
    if (author === u.name) msgs[i].classList.add('mine');
    else if (author.indexOf('Система') >= 0 || author.indexOf('Феликс') >= 0) msgs[i].classList.add('sys');
  }
}

export function announceLogin(u) {
  if (!u || !u.name) return;
  DB.chat.push({ id: uid(), ts: Date.now(), author: '🔔 Система', room: 'общая', text: '🟢 ' + u.name + ' вошёл(ла) в чат' });
  DB.chat.push({ id: uid(), ts: Date.now(), author: '🐱 Феликс', room: 'общая', text: '👋 Привет, ' + u.name + '! Позови меня по имени или напиши «!шутка» — отвечу 🐱' });
  if (DB.chat.length > LIMITS.CHAT_MAX) DB.chat = DB.chat.slice(-LIMITS.CHAT_MAX);
  save();
}

window.__setRoom = v => { room = v; if (window.render) window.render(); };
window.__chatKey = ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendMsg(); } };
window.__chatResize = el => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 100) + 'px'; };
window.__sendMsg = sendMsg;
window.__clearChat = clearChat;
window.__botJoke = botJoke;
window.chatView = chatView;
window.sendMsg = sendMsg;
window.clearChat = clearChat;
window.botJoke = botJoke;
window.decorateChat = decorateChat;
window.announceLogin = announceLogin;