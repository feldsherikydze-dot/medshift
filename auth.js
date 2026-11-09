import { FB_CONF, LS_KEYS, LIMITS } from './config.js';
import { DB, save, uid, me, isBoss, isDead, isBannedName, normName, hashPin, genSalt } from './db.js';
const LS_AUTH = LS_KEYS.FB_AUTH, API_KEY = FB_CONF.apiKey;
let refreshTimer = null;
function loadAuth() { try { return JSON.parse(localStorage.getItem(LS_AUTH) || 'null'); } catch { return null; } }
function saveAuth(a) { if (a) localStorage.setItem(LS_AUTH, JSON.stringify(a)); else localStorage.removeItem(LS_AUTH); }
function scheduleRefresh(a) { clearTimeout(refreshTimer); if (!a || !a.rt) return; refreshTimer = setTimeout(() => refreshToken(a.rt), Math.max(30000, (a.exp - Date.now()) - 300000)); }
function refreshToken(rt) {
  if (!rt || !API_KEY) return;
  fetch('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt) }).then(r => r.json()).then(j => {
    if (j && j.id_token) { const a = loadAuth() || {}; a.rt = j.refresh_token || a.rt; a.id = j.id_token; a.exp = Date.now() + (+j.expires_in || 3600) * 1000; saveAuth(a); window.__fbToken = j.id_token; scheduleRefresh(a); if (window.__onToken) window.__onToken(); } else window.__fbToken = null;
  }).catch(() => { window.__fbToken = null; });
}
export function signIn(email, pass) {
  return fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass, returnSecureToken: true }) }).then(r => r.json()).then(j => {
    if (j && j.idToken) { const a = { email, rt: j.refreshToken, id: j.idToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 }; saveAuth(a); window.__fbToken = j.idToken; scheduleRefresh(a); if (window.__onToken) window.__onToken(); return true; }
    throw new Error((j && j.error && j.error.message) || 'UNKNOWN');
  });
}
export function errText(m) {
  if (!m) return 'Неизвестная ошибка';
  if (m.indexOf('INVALID_PASSWORD') >= 0 || m.indexOf('INVALID_LOGIN_CREDENTIALS') >= 0) return 'Неверный email или пароль';
  if (m.indexOf('USER_NOT_FOUND') >= 0) return 'Пользователь не создан';
  if (m.indexOf('TOO_MANY_ATTEMPTS') >= 0) return 'Слишком много попыток';
  if (m === 'NETWORK') return 'Нет связи';
  return m;
}
export function restoreToken() { const a = loadAuth(); if (!a) return; if (a.id && a.exp && Date.now() < a.exp - 60000) { window.__fbToken = a.id; scheduleRefresh(a); if (window.__onToken) window.__onToken(); } else if (a.rt) refreshToken(a.rt); }
export async function verifyPin(user, pin) {
  if (!user) return false;
  if (user.pin && user.pin.length === 4 && !user.pinSalt) { if (user.pin === pin) { user.pinSalt = genSalt(); user.pin = await hashPin(pin, user.pinSalt); save(); return true; } return false; }
  if (user.pinSalt) return (await hashPin(pin, user.pinSalt)) === user.pin;
  return false;
}
export async function setPin(user, pin) { user.pinSalt = genSalt(); user.pin = await hashPin(pin, user.pinSalt); pinOk(user); save(); }
/* ---------- Защита от перебора PIN ----------
   verifyPin() намеренно остаётся чистой проверкой: её зовёт и вход, и
   смена своего PIN, где счётчик неуместен (легитимный промах самому
   себе не должен приводить к блокировке). Ограничение живёт в pinCheck
   на точках входа. */
export function pinLockedMs(user) { return user && user.pinLockedUntil ? Math.max(0, +user.pinLockedUntil - Date.now()) : 0; }
export function pinFail(user) {
  if (!user) return 0;
  const n = (+user.pinFails || 0) + 1;
  if (n >= LIMITS.PIN_MAX_FAILS) { user.pinFails = 0; user.pinLockedUntil = Date.now() + LIMITS.PIN_LOCK_MS; save(); return 0; }
  user.pinFails = n; save();
  return LIMITS.PIN_MAX_FAILS - n;
}
export function pinOk(user) {
  if (user && (user.pinFails || user.pinLockedUntil)) { user.pinFails = 0; delete user.pinLockedUntil; save(); }
}
/** Проверка PIN на входе. Возвращает текст ошибки или null, если всё в порядке. */
export async function pinCheck(user, pin) {
  if (!user) return 'Сотрудник не найден';
  const locked = pinLockedMs(user);
  if (locked) return '⏳ Слишком много попыток. Подождите ' + Math.ceil(locked / 60000) + ' мин';
  if (await verifyPin(user, pin)) { pinOk(user); return null; }
  const left = pinFail(user);
  return left > 0
    ? '❌ Неверный PIN. Осталось попыток: ' + left
    : '⏳ Слишком много попыток. Подождите ' + Math.ceil(LIMITS.PIN_LOCK_MS / 60000) + ' мин';
}
/* remember=true — «запомнить меня»: сессия живёт до ручного выхода.
   remember=false — обычная сессия: через LIMITS.SESSION_TTL_MS (24 ч) таймер
   разлогинит. Раньше аргумента не было и флаг REM всегда ставился в '1',
   поэтому галочка на экране входа ни на что не влияла — приложение
   «запоминало» максимум на сутки, а потом выкидывало. */
export function loginAs(user, remember = true) {
  DB.session = user.id;
  localStorage.setItem(LS_KEYS.MY_ID, String(user.id));
  localStorage.setItem(LS_KEYS.REM, remember ? '1' : '0');
  localStorage.setItem(LS_KEYS.REM_TS, String(Date.now()));
  save();
}
export function logout() {
  DB.session = null;
  localStorage.setItem(LS_KEYS.REM, '0');
  localStorage.removeItem(LS_KEYS.REM_TS);
  // Выбор галочки (REM_PREF) не трогаем: после выхода она должна остаться
  // такой, какой её оставил человек.
  save();
}
export function checkSessionExpiry() {
  if (!DB.session) return;
  // «Запомнить меня» — не выходим сами вообще.
  if (localStorage.getItem(LS_KEYS.REM) === '1') return;
  const started = +localStorage.getItem(LS_KEYS.REM_TS) || 0;
  if (started && Date.now() - started <= LIMITS.SESSION_TTL_MS) return;
  window.loginFor = DB.session; DB.session = null; localStorage.setItem(LS_KEYS.REM, '0');
  // Писать надо штатным сохранением, а не прямой записью в хранилище:
  // прямая запись утаскивала base64-фото обратно в главный ключ (их
  // отцепляет только _write) и падала без try/catch при переполнении
  // квоты — исключение из таймера заливало экран ошибкой.
  save();
  if (window.toast) window.toast('Сессия истекла (24 ч)'); if (window.renderNav) window.renderNav(); if (window.render) window.render();
}
/* ---------- Вход по отпечатку (WebAuthn) ----------
   Привязка живёт в localStorage: { userId, userName, credentialId, rpId }.
   Отпечаток умеет «умирать» сам по себе: человек сменил телефон, почистил
   данные сайта, Android сбросил ключи, или приложение открыли с другого
   адреса (у credential своя привязка к домену). Поэтому:
   — привязку НЕ удаляем молча, если профиль просто не нашёлся в базе
     (он мог ещё не приехать с сервера) — раньше именно это и убивало вход;
   — запоминаем домен и говорим прямо, если отпечаток привязан к другому;
   — ошибки переводим в понятный текст, а не в «NotAllowedError». */
function bioHost() {
  try { return (typeof location !== 'undefined' && location.hostname) ? location.hostname : ''; }
  catch { return ''; }
}
/** rp.id обязан быть доменом: IP-адрес и file:// браузер отвергнет. */
function bioRpId() {
  const h = bioHost();
  if (!h || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.indexOf(':') >= 0) return null;
  return h;
}
/** Сохранённая привязка или null. Битые/чужие данные не должны ронять экран. */
export function bioInfo() {
  try {
    const b = JSON.parse(localStorage.getItem(LS_KEYS.BIO) || 'null');
    // credentialId обязан быть непустой строкой: число/объект от старой
    // версии или битой записи иначе уронит atob уже на входе.
    return (b && typeof b.credentialId === 'string' && b.credentialId) ? b : null;
  } catch { return null; }
}
/** Человеческий текст ошибки WebAuthn. */
export function bioErrText(e) {
  const n = (e && e.name) || '', m = String((e && e.message) || '');
  if (n === 'NotAllowedError') return 'Отпечаток не подтверждён: отмена или время вышло. Попробуйте ещё раз или войдите по PIN';
  if (n === 'SecurityError') return 'Браузер запрещает отпечаток на этом адресе. Нужен https:// и тот же домен, где привязывали';
  if (n === 'NotSupportedError') return 'На этом устройстве нет датчика отпечатка или он не настроен в системе';
  if (n === 'InvalidStateError') return 'Отпечаток уже привязан на этом устройстве';
  if (n === 'AbortError') return 'Окно отпечатка закрылось. Попробуйте ещё раз';
  if (n === 'ConstraintError') return 'Устройство не поддерживает проверку отпечатком';
  if (n === 'QuotaExceededError' || /quota/i.test(m)) return 'Память браузера переполнена — освободите место и повторите';
  return m || 'Отпечаток не сработал';
}
export async function enableBiometric() {
  const u = me(); if (!u || (!u.pin && !u.pinSalt)) throw new Error('Сначала задайте PIN');
  if (!window.PublicKeyCredential || !navigator.credentials || !navigator.credentials.create) throw new Error('Браузер не поддерживает вход по отпечатку');
  if (!window.isSecureContext) throw new Error('Отпечаток работает только по https:// (или на localhost)');
  const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
  const rpId = bioRpId();
  const cred = await navigator.credentials.create({ publicKey: {
    challenge,
    rp: rpId ? { id: rpId, name: 'МедСмена' } : { name: 'МедСмена' },
    user: { id: new TextEncoder().encode(String(u.id)), name: u.email || u.name || String(u.id), displayName: u.name || 'Сотрудник' },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
    // residentKey: 'preferred' — на Android/Chrome такая привязка уходит
    // в менеджер паролей и переживает чистку данных сайта. Для старых
    // authenticator'ов это лишь подсказка, отказом не является.
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
    timeout: 60000, attestation: 'none'
  } });
  if (!cred) throw new Error('Отменено');
  const data = {
    v: 2, userId: u.id, userName: u.name || '',
    credentialId: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(cred.rawId)))),
    rpId: rpId, createdAt: Date.now()
  };
  try { localStorage.setItem(LS_KEYS.BIO, JSON.stringify(data)); }
  catch (e) { throw new Error('Не удалось сохранить привязку: ' + bioErrText(e)); }
}
export function disableBiometric() { localStorage.removeItem(LS_KEYS.BIO); }
export async function biometricLogin() {
  const b = bioInfo(); if (!b) throw new Error('Отпечаток не привязан');
  // Старые записи (до 2.6.3) домен не хранили — тогда проверку пропускаем.
  // rp.id по спецификации WebAuthn может быть родительским доменом
  // (привязка на example.com работает и на www.example.com), поэтому
  // сравниваем не только на равенство, но и на суффикс.
  const host = bioRpId();
  const sameHost = !b.rpId || !host || host === b.rpId || host.endsWith('.' + b.rpId);
  if (!sameHost) {
    throw new Error('Отпечаток привязан к другому адресу (' + b.rpId + '). Войдите по PIN и включите его заново в «Ещё»');
  }
  const u = DB.users.find(x => String(x.id) === String(b.userId));
  if (!u) throw new Error('Профиль для отпечатка не найден в базе. Войдите по PIN и включите отпечаток заново в «Ещё»');
  if (isDead(u.id)) { localStorage.removeItem(LS_KEYS.BIO); throw new Error('Профиль заблокирован'); }
  if (!navigator.credentials || !navigator.credentials.get) throw new Error('Браузер не поддерживает вход по отпечатку');
  let rawId;
  try { rawId = Uint8Array.from(atob(b.credentialId), c => c.charCodeAt(0)); }
  catch { throw new Error('Привязка отпечатка повреждена. Войдите по PIN и включите отпечаток заново в «Ещё»'); }
  const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
  const cred = await navigator.credentials.get({ publicKey: { challenge, allowCredentials: [{ id: rawId, type: 'public-key' }], userVerification: 'required', timeout: 60000 } });
  if (!cred) throw new Error('Отменено');
  // Отпечаток — доверенное устройство: сессия не должна сама истекать
  // через сутки, иначе «вход по отпечатку» выглядит сломанным.
  loginAs(u, true); return u;
}
export function banUser(id) {
  // Блокировка равносильна удалению: человека вычеркивают из списка и
  // запрещают регистрацию снова. Делать это должен только руководитель.
  // Проверка именно здесь, а не только скрытием кнопки: вызов доступен
  // из консоли, и кнопку скрыть недостаточно.
  if (!isBoss()) throw new Error('Блокировка доступна только руководителю');
  if (String(id) === String(DB.session)) throw new Error('Нельзя себя');
  const u = DB.users.find(x => String(x.id) === String(id)); if (!u) throw new Error('Не найден');
  DB.bans = DB.bans || []; DB.bans.push(u); DB.users = DB.users.filter(x => String(x.id) !== String(id));
  // Снятие бана на другом телефоне не должно вернуть человека в список.
  // Если этот же человек банится заново — снятие забываем, иначе бан
  // перестал бы работать сразу после одного раза.
  DB.banTomb = (DB.banTomb || []).filter(x => String(x) !== String(id));
  save();
}
export function unbanUser(id) {
  if (!isBoss()) throw new Error('Снятие блокировки доступно только руководителю');
  DB.bans = DB.bans || []; const u = DB.bans.find(x => String(x.id) === String(id)); if (!u) throw new Error('Не найден');
  DB.bans = DB.bans.filter(x => String(x.id) !== String(id));
  // Снятие должно пережить синхронизацию: иначе следующий же забор
  // вернул бы бан с сервера, и человек не смог бы зарегистрироваться.
  DB.banTomb = (DB.banTomb || []); if (!DB.banTomb.some(x => String(x) === String(id))) DB.banTomb.push(id);
  DB.users.push(u); save();
}
window.signIn = signIn; window.restoreToken = restoreToken; window.verifyPin = verifyPin; window.setPin = setPin; window.pinCheck = pinCheck; window.pinLockedMs = pinLockedMs; window.loginAs = loginAs; window.logout = logout; window.enableBiometric = enableBiometric; window.disableBiometric = disableBiometric; window.biometricLogin = biometricLogin; window.bioInfo = bioInfo; window.bioErrText = bioErrText; window.banUser = banUser; window.unbanUser = unbanUser;
