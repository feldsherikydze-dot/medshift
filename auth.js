import { FB_CONF, LS_KEYS, LIMITS } from './config.js';
import { DB, save, uid, me, isDead, isBannedName, normName, hashPin, genSalt } from './db.js';
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
export async function setPin(user, pin) { user.pinSalt = genSalt(); user.pin = await hashPin(pin, user.pinSalt); save(); }
export function loginAs(user) { DB.session = user.id; localStorage.setItem(LS_KEYS.MY_ID, String(user.id)); localStorage.setItem(LS_KEYS.REM, '1'); localStorage.setItem(LS_KEYS.REM_TS, String(Date.now())); save(); }
export function logout() { DB.session = null; localStorage.setItem(LS_KEYS.REM, '0'); localStorage.removeItem(LS_KEYS.REM_TS); save(); }
export function checkSessionExpiry() {
  if (!DB.session) return;
  if (localStorage.getItem(LS_KEYS.REM) !== '1' || Date.now() - (+localStorage.getItem(LS_KEYS.REM_TS) || 0) > LIMITS.SESSION_TTL_MS) {
    window.loginFor = DB.session; DB.session = null; localStorage.setItem(LS_KEYS.REM, '0'); localStorage.setItem(LS_KEYS.DB, JSON.stringify(DB));
    if (window.toast) window.toast('Сессия истекла (24 ч)'); if (window.render) window.render();
  }
}
export async function enableBiometric() {
  const u = me(); if (!u || !u.pin) throw new Error('Нет PIN');
  const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
  const cred = await navigator.credentials.create({ publicKey: { challenge, rp: { name: 'МедСмена' }, user: { id: new TextEncoder().encode(String(u.id)), name: u.name, displayName: u.name }, pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }, timeout: 60000, attestation: 'none' } });
  if (!cred) throw new Error('Отменено');
  localStorage.setItem(LS_KEYS.BIO, JSON.stringify({ userId: u.id, credentialId: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(cred.rawId)))) }));
}
export function disableBiometric() { localStorage.removeItem(LS_KEYS.BIO); }
export async function biometricLogin() {
  const raw = localStorage.getItem(LS_KEYS.BIO); if (!raw) throw new Error('Не настроена');
  const b = JSON.parse(raw), u = DB.users.find(x => x.id === b.userId);
  if (!u || isDead(u.id)) { localStorage.removeItem(LS_KEYS.BIO); throw new Error('Недоступна'); }
  const challenge = new Uint8Array(32); crypto.getRandomValues(challenge);
  const cred = await navigator.credentials.get({ publicKey: { challenge, allowCredentials: [{ id: Uint8Array.from(atob(b.credentialId), c => c.charCodeAt(0)), type: 'public-key' }], userVerification: 'required', timeout: 60000 } });
  if (!cred) throw new Error('Отменено');
  loginAs(u); return u;
}
export function banUser(id) { if (id === DB.session) throw new Error('Нельзя себя'); const u = DB.users.find(x => x.id === id); if (!u) throw new Error('Не найден'); DB.bans = DB.bans || []; DB.bans.push(u); DB.users = DB.users.filter(x => x.id !== id); save(); }
export function unbanUser(id) { DB.bans = DB.bans || []; const u = DB.bans.find(x => x.id === id); if (!u) throw new Error('Не найден'); DB.bans = DB.bans.filter(x => x.id !== id); DB.users.push(u); save(); }
window.signIn = signIn; window.restoreToken = restoreToken; window.verifyPin = verifyPin; window.setPin = setPin; window.loginAs = loginAs; window.logout = logout; window.enableBiometric = enableBiometric; window.disableBiometric = disableBiometric; window.biometricLogin = biometricLogin; window.banUser = banUser; window.unbanUser = unbanUser;