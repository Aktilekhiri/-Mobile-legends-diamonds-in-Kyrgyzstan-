// Вход через Google (Google Identity Services): проверяем ID-токен на сервере и выдаём свой токен сессии.
// Client ID публичный (не секрет). Секрет Google для этого способа входа не нужен.
import { ensureReviewsTable } from './reviews.js';
export const GOOGLE_CLIENT_ID = '98998507136-5eda7u7us7vv104dtaaajfnabk4ivaj4.apps.googleusercontent.com';
const SESSION_DAYS = 60;
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const enc = new TextEncoder();

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(buf) {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const parseJson = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

let jwksCache = { at: 0, keys: [] };
async function getJwks(force = false) {
  if (!force && jwksCache.keys.length && Date.now() - jwksCache.at < 3600000) return jwksCache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error('jwks');
  const d = await r.json();
  jwksCache = { at: Date.now(), keys: d.keys || [] };
  return jwksCache.keys;
}

// Возвращает { sub, email, name, picture } или null, если токен недействителен.
export async function verifyGoogleIdToken(idToken) {
  try {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) return null;
    const header = parseJson(b64urlToBytes(parts[0]));
    const payload = parseJson(b64urlToBytes(parts[1]));
    if (header.alg !== 'RS256' || !header.kid) return null;
    let jwk = (await getJwks()).find(k => k.kid === header.kid);
    if (!jwk) jwk = (await getJwks(true)).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    if (payload.aud !== GOOGLE_CLIENT_ID) return null;
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    if (!payload.sub || !/^\d{5,40}$/.test(String(payload.sub))) return null;
    if (payload.email && payload.email_verified === false) return null;
    return { sub: String(payload.sub), email: String(payload.email || '').slice(0, 200), name: String(payload.name || '').slice(0, 100), picture: String(payload.picture || '').slice(0, 500) };
  } catch (e) {
    return null;
  }
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToB64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Токен сессии: u1.<sub>.<exp>.<подпись>. Подписываем с префиксом, чтобы он не подошёл как токен админки.
export async function makeSession(env, sub) {
  const exp = String(Date.now() + SESSION_DAYS * 86400000);
  return ['u1', sub, exp, await hmac(env.ADMIN_PASSWORD, 'user:' + sub + ':' + exp)].join('.');
}
// Возвращает sub (id Google-пользователя) или null.
export async function userFromRequest(req, env) {
  if (!env.ADMIN_PASSWORD) return null;
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const [v, sub, exp, sig] = t.split('.');
  if (v !== 'u1' || !sub || !exp || !sig || !/^\d{5,40}$/.test(sub) || Number(exp) < Date.now()) return null;
  return safeEqual(sig, await hmac(env.ADMIN_PASSWORD, 'user:' + sub + ':' + exp)) ? sub : null;
}

export async function ensureUsersTable(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL DEFAULT \'\', name TEXT NOT NULL DEFAULT \'\', picture TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL, last_login INTEGER NOT NULL)').run();
}

export async function loginWithGoogle(env, credential) {
  const g = await verifyGoogleIdToken(credential);
  if (!g) return { error: 'Не удалось подтвердить вход через Google', status: 401 };
  await ensureUsersTable(env);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, picture, created_at, last_login) VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture, last_login = excluded.last_login`
  ).bind(g.sub, g.email, g.name, g.picture, now, now).run();
  return { token: await makeSession(env, g.sub), user: { name: g.name, email: g.email, picture: g.picture } };
}

export async function getMe(env, sub) {
  await ensureUsersTable(env);
  const u = await env.DB.prepare('SELECT name, email, picture FROM users WHERE id = ?').bind(sub).first();
  return u ? { user: u } : { error: 'Пользователь не найден', status: 401 };
}

// История заказов пользователя: только безопасные поля (без телефона, IP, чека и себестоимости).
export async function listMyOrders(env, sub) {
  await ensureReviewsTable(env);
  const { results } = await env.DB.prepare(
    'SELECT id, created_at, region, pkg_label, price_kgs, method, status, player_id, server_id, delivery, (SELECT 1 FROM reviews r WHERE r.order_id = orders.id) AS reviewed FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(sub).all();
  return { orders: results };
}
