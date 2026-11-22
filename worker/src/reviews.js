// Отзывы клиентов: оставить можно только к выданному заказу (по секрету заказа или из аккаунта), один отзыв на заказ.
// Публикуются после одобрения в админке (status: pending -> approved | hidden).
import { notify } from './notify.js';
import { MLBB_REGIONS } from './catalog.js';

const clean = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const GAME_TITLE = { mlbb: 'Mobile Legends', pubg: 'PUBG Mobile', freefire: 'Free Fire', hok: 'Honor of Kings', genshin: 'Genshin Impact', wuwa: 'Wuthering Waves',
  mchess: 'Magic Chess Go Go', oxide: 'Oxide Survival Island', hi3: 'Honkai Impact 3rd (Asia)', supersus: 'Super Sus', minecraft: 'Minecraft (Minecoins)', standoff2: 'Standoff 2', whiteout: 'Whiteout Survival', lords: 'Lords Mobile', identityv: 'Identity V', fortnite: 'Fortnite Gift Card (ЕС)', deltaforce: 'Delta Force', marvel: 'Marvel Rivals', arena: 'Arena Breakout', hsr: 'Honkai: Star Rail', zzz: 'Zenless Zone Zero', bloodstrike: 'Blood Strike', tgstars: 'Telegram Stars', tgpremium: 'Telegram Premium', pubgcode: 'PUBG Mobile (код UC)', ffcode: 'Free Fire (код алмазов)', mlbbcode: 'Mobile Legends (код алмазов)', gplay_tr: 'Google Play (Турция)', gplay_de: 'Google Play (Германия)', gplay_uk: 'Google Play (Великобритания)', gplay_ae: 'Google Play (ОАЭ)',  roblox: 'Roblox Gift Card', steam: 'Steam Gift Card (СНГ)', discord: 'Discord Nitro', netflix: 'Netflix Gift Card (США)', psn: 'PlayStation Gift Card (США)', gplay: 'Google Play Gift Card (США)', apple_us: 'App Store & iTunes (США)', apple_tr: 'App Store & iTunes (Турция)', apple_ru: 'App Store & iTunes (Россия)', nintendo: 'Nintendo eShop Card (США)', valorant: 'Valorant VP (регион RU)' };
const gameOf = region => (!region || MLBB_REGIONS.includes(region)) ? 'mlbb' : region;

function safeEq(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

let _rvReady = false;
export async function ensureReviewsTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, rating INTEGER NOT NULL, text TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', game TEXT NOT NULL DEFAULT '', pkg_label TEXT NOT NULL DEFAULT '', user_id TEXT, status TEXT NOT NULL DEFAULT 'pending')").run();
  if (!_rvReady) {
    // ответ владельца и реакции (идемпотентно; ALTER падает, если колонка уже есть)
    try { await env.DB.prepare('ALTER TABLE reviews ADD COLUMN reply TEXT').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE reviews ADD COLUMN reply_at INTEGER').run(); } catch (e) {}
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS review_reactions (review_id TEXT NOT NULL, emoji TEXT NOT NULL, voter TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (review_id, emoji, voter))').run();
    _rvReady = true;
  }
}

// POST /api/orders/:id/review  { rating, text, name, s }
export async function submitReview(env, orderId, b, userId) {
  const rating = Math.floor(Number(b.rating));
  if (!(rating >= 1 && rating <= 5)) return { error: 'Поставьте оценку от 1 до 5' };
  const text = clean(b.text, 600);
  if (text.length < 5) return { error: 'Напишите хотя бы пару слов (от 5 символов)' };
  const name = clean(b.name, 30) || 'Клиент';
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(clean(orderId, 20)).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  const mine = safeEq(b.s, o.secret) || (userId && o.user_id && userId === o.user_id);
  if (!mine) return { error: 'Отзыв можно оставить только с того устройства или аккаунта, где оформлен заказ', status: 403 };
  if (o.status !== 'delivered') return { error: 'Отзыв можно оставить после выдачи заказа', status: 409 };
  await ensureReviewsTable(env);
  const id = 'RV' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  try {
    await env.DB.prepare('INSERT INTO reviews (id, order_id, created_at, rating, text, name, game, pkg_label, user_id, status) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id, o.id, Date.now(), rating, text, name, gameOf(o.region), clean(o.pkg_label, 100), o.user_id || null, 'pending').run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) return { error: 'Отзыв на этот заказ уже оставлен', status: 409 };
    throw e;
  }
  await notify(env, `⭐ Новый отзыв ${rating}/5 (заказ ${o.id}, ${GAME_TITLE[gameOf(o.region)] || o.region})\n«${text.slice(0, 300)}»\n— ${name}\nОдобрите или скройте в админке → Отзывы.`);
  return { ok: true, id };
}

// GET /api/reviews?game=&limit=  — только одобренные
export async function listPublicReviews(env, game, limit) {
  await ensureReviewsTable(env);
  const n = Math.max(1, Math.min(50, Number(limit) || 12));
  const g = clean(game, 20);
  const where = g ? "status = 'approved' AND game = ?" : "status = 'approved'";
  const q = (sel, tail) => env.DB.prepare(`SELECT ${sel} FROM reviews WHERE ${where}${tail || ''}`);
  const bind = st => (g ? st.bind(g) : st);
  const stats = await bind(q('COUNT(*) AS c, AVG(rating) AS a')).first();
  const { results } = await (g ? q('id, rating, text, name, game, pkg_label, created_at, reply, reply_at', ' ORDER BY created_at DESC LIMIT ' + n).bind(g) : q('id, rating, text, name, game, pkg_label, created_at, reply, reply_at', ' ORDER BY created_at DESC LIMIT ' + n)).all();
  const rx = await reactionsOf(env, results.map(r => r.id));
  return { reviews: results.map(r => ({ ...r, reactions: rx[r.id] || {}, game_title: GAME_TITLE[r.game] || '' })), count: (stats && stats.c) || 0, avg: stats && stats.a ? Math.round(stats.a * 10) / 10 : 0 };
}

export async function adminListReviews(env, status) {
  await ensureReviewsTable(env);
  const ok = ['pending', 'approved', 'hidden'].includes(status);
  const st = ok ? env.DB.prepare('SELECT * FROM reviews WHERE status = ? ORDER BY created_at DESC LIMIT 200').bind(status) : env.DB.prepare('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 200');
  const { results } = await st.all();
  return { reviews: results.map(({ user_id, ...r }) => ({ ...r, game_title: GAME_TITLE[r.game] || r.game })) };
}

export async function adminSetReview(env, id, action) {
  const status = { approve: 'approved', hide: 'hidden', pending: 'pending' }[action];
  if (!status) return { error: 'Неизвестное действие' };
  const r = await env.DB.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind(status, String(id).slice(0, 40)).run();
  return r.meta && r.meta.changes ? { ok: true } : { error: 'Отзыв не найден', status: 404 };
}

// Есть ли отзыв на заказ (для кнопки «Оставить отзыв»)
export async function hasReview(env, orderId) {
  try { await ensureReviewsTable(env); return !!(await env.DB.prepare('SELECT 1 AS x FROM reviews WHERE order_id = ?').bind(orderId).first()); } catch (e) { return false; }
}

// ── Реакции на отзывы. Ключи вместо эмодзи (без проблем с кодировкой); один голос на (отзыв, реакция, устройство); повторный клик снимает.
export const REACTIONS = ['heart', 'like', 'fire', 'lol', 'wow', 'pray', 'clap'];
async function reactionsOf(env, ids) {
  const out = {};
  if (!ids.length) return out;
  const { results } = await env.DB.prepare(`SELECT review_id, emoji, COUNT(*) AS c FROM review_reactions WHERE review_id IN (${ids.map(() => '?').join(',')}) GROUP BY review_id, emoji`).bind(...ids).all();
  for (const r of results) (out[r.review_id] = out[r.review_id] || {})[r.emoji] = r.c;
  return out;
}
const _rrl = new Map();
// POST /api/reviews/:id/react  { emoji, v }  v = случайный id устройства (из localStorage браузера)
export async function reactToReview(env, ip, id, b) {
  const emoji = String(b.emoji || ''), voter = String(b.v || '');
  if (!REACTIONS.includes(emoji) || !/^[A-Za-z0-9]{16,40}$/.test(voter)) return { error: 'Некорректная реакция', status: 400 };
  const now = Date.now(), rl = _rrl.get(ip);
  if (rl && rl.exp > now) { if (++rl.n > 60) return { error: 'Слишком часто, попробуйте позже', status: 429 }; } else _rrl.set(ip, { n: 1, exp: now + 600e3 });
  if (_rrl.size > 5000) _rrl.clear();
  await ensureReviewsTable(env);
  const rid = clean(id, 40);
  const rv = await env.DB.prepare("SELECT 1 AS x FROM reviews WHERE id = ? AND status = 'approved'").bind(rid).first();
  if (!rv) return { error: 'Отзыв не найден', status: 404 };
  const del = await env.DB.prepare('DELETE FROM review_reactions WHERE review_id = ? AND emoji = ? AND voter = ?').bind(rid, emoji, voter).run();
  let on = false;
  if (!(del.meta && del.meta.changes)) { await env.DB.prepare('INSERT OR IGNORE INTO review_reactions (review_id, emoji, voter, created_at) VALUES (?,?,?,?)').bind(rid, emoji, voter, now).run(); on = true; }
  return { ok: true, on, reactions: (await reactionsOf(env, [rid]))[rid] || {} };
}

// Ответ владельца под отзывом (пустой текст = удалить ответ)
export async function adminReplyReview(env, id, text) {
  await ensureReviewsTable(env);
  const t = clean(text, 500);
  const r = await env.DB.prepare('UPDATE reviews SET reply = ?, reply_at = ? WHERE id = ?').bind(t || null, t ? Date.now() : null, String(id).slice(0, 40)).run();
  return r.meta && r.meta.changes ? { ok: true } : { error: 'Отзыв не найден', status: 404 };
}
