// Чат по заказу (клиент ↔ владелец) и общий баннер сайта.
// Клиент: только вошедший (Google) и только по своему заказу. Владелец отвечает из Telegram (реплаем) или из админки.
import { notify } from './notify.js';

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS order_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, side TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER NOT NULL DEFAULT 0)").run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_order_msgs_order ON order_msgs (order_id, id)').run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS site_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL DEFAULT 0)").run();
  ready = true;
}
const clean = (v, n) => String(v == null ? '' : v).replace(/\s+\n/g, '\n').trim().slice(0, n);
const ID_RE = /^DK[A-Z0-9]{8}$/;

async function ownOrder(env, sub, id) {
  if (!ID_RE.test(String(id))) return null;
  return await env.DB.prepare('SELECT id, pkg_label, status FROM orders WHERE id = ? AND user_id = ?').bind(String(id), String(sub)).first();
}

// ----- клиент -----
export async function clientThread(env, sub, id) {
  await ensure(env);
  const o = await ownOrder(env, sub, id); if (!o) return { error: 'Заказ не найден', status: 404 };
  const { results } = await env.DB.prepare('SELECT id, side, text, created_at FROM order_msgs WHERE order_id = ? ORDER BY id ASC LIMIT 200').bind(o.id).all();
  await env.DB.prepare("UPDATE order_msgs SET read_at = ? WHERE order_id = ? AND side = 'a' AND read_at = 0").bind(Date.now(), o.id).run();
  return { order: { id: o.id, pkg_label: o.pkg_label, status: o.status }, msgs: results };
}
export async function clientSend(env, sub, id, text) {
  await ensure(env);
  const o = await ownOrder(env, sub, id); if (!o) return { error: 'Заказ не найден', status: 404 };
  const t = clean(text, 500); if (!t) return { error: 'Пустое сообщение' };
  const r = await env.DB.prepare("SELECT COUNT(*) AS c FROM order_msgs WHERE order_id = ? AND side = 'c' AND created_at > ?").bind(o.id, Date.now() - 600000).first();
  if (r && r.c >= 10) return { error: 'Слишком много сообщений, подождите немного', status: 429 };
  const now = Date.now();
  const ins = await env.DB.prepare("INSERT INTO order_msgs (order_id, side, text, created_at) VALUES (?, 'c', ?, ?)").bind(o.id, t, now).run();
  notify(env, `💬 ${o.id} · ${o.pkg_label}\n\n${t}\n\nОтветьте реплаем на это сообщение.`);
  return { ok: true, msg: { id: ins.meta.last_row_id, side: 'c', text: t, created_at: now } };
}
// непрочитанные ответы владельца по всем заказам клиента
export async function clientUnread(env, sub) {
  await ensure(env);
  const { results } = await env.DB.prepare("SELECT m.order_id AS order_id, COUNT(*) AS n, MAX(m.id) AS last_id FROM order_msgs m JOIN orders o ON o.id = m.order_id WHERE o.user_id = ? AND m.side = 'a' AND m.read_at = 0 GROUP BY m.order_id").bind(String(sub)).all();
  for (const r of results) { const x = await env.DB.prepare('SELECT text FROM order_msgs WHERE id = ?').bind(r.last_id).first(); r.text = x ? x.text : ''; }
  return { unread: results, total: results.reduce((s, x) => s + x.n, 0) };
}

// ----- владелец -----
export async function adminSend(env, id, text) {
  await ensure(env);
  if (!ID_RE.test(String(id))) return { error: 'Неверный номер заказа' };
  const o = await env.DB.prepare('SELECT id FROM orders WHERE id = ?').bind(String(id)).first(); if (!o) return { error: 'Заказ не найден', status: 404 };
  const t = clean(text, 1000); if (!t) return { error: 'Пустое сообщение' };
  const now = Date.now();
  const ins = await env.DB.prepare("INSERT INTO order_msgs (order_id, side, text, created_at) VALUES (?, 'a', ?, ?)").bind(o.id, t, now).run();
  await env.DB.prepare("UPDATE order_msgs SET read_at = ? WHERE order_id = ? AND side = 'c' AND read_at = 0").bind(now, o.id).run();
  return { ok: true, msg: { id: ins.meta.last_row_id, side: 'a', text: t, created_at: now } };
}
export async function adminThreads(env) {
  await ensure(env);
  const { results } = await env.DB.prepare(`SELECT m.order_id AS order_id, o.pkg_label AS pkg_label, o.status AS status, MAX(m.created_at) AS last_at,
      SUM(CASE WHEN m.side = 'c' AND m.read_at = 0 THEN 1 ELSE 0 END) AS unread,
      (SELECT text FROM order_msgs x WHERE x.order_id = m.order_id ORDER BY x.id DESC LIMIT 1) AS last_text,
      (SELECT side FROM order_msgs x WHERE x.order_id = m.order_id ORDER BY x.id DESC LIMIT 1) AS last_side
    FROM order_msgs m LEFT JOIN orders o ON o.id = m.order_id GROUP BY m.order_id ORDER BY last_at DESC LIMIT 50`).all();
  return { threads: results, unread: results.reduce((s, x) => s + (x.unread || 0), 0) };
}
export async function adminThread(env, id) {
  await ensure(env);
  if (!ID_RE.test(String(id))) return { error: 'Неверный номер заказа' };
  const { results } = await env.DB.prepare('SELECT id, side, text, created_at FROM order_msgs WHERE order_id = ? ORDER BY id ASC LIMIT 200').bind(String(id)).all();
  await env.DB.prepare("UPDATE order_msgs SET read_at = ? WHERE order_id = ? AND side = 'c' AND read_at = 0").bind(Date.now(), String(id)).run();
  return { msgs: results };
}

// ----- баннер сайта -----
export async function getBanner(env) {
  await ensure(env);
  const r = await env.DB.prepare("SELECT v, updated_at FROM site_kv WHERE k = 'banner'").first();
  return { text: r ? r.v : '', updated_at: r ? r.updated_at : 0 };
}
export async function setBanner(env, text) {
  await ensure(env);
  const t = clean(text, 200);
  await env.DB.prepare("INSERT INTO site_kv (k, v, updated_at) VALUES ('banner', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(t, Date.now()).run();
  return { ok: true, text: t };
}
