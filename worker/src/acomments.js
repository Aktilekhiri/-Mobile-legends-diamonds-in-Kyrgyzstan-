// Комментарии покупателей к объявлениям в разделе «Аккаунты».
// Публикуются после одобрения владельцем (status: pending -> approved | hidden), как отзывы.
import { notify } from './notify.js';

const clean = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// ссылки и контакты в комментариях запрещены: иначе обойдут гаранта и увезут покупателя
const BAD = /(https?:|www\.|t\.me|wa\.me|@\w{4,}|\+?\d[\d\s().-]{8,}|\.(com|ru|kg|net|org|io|me)\b)/i;
let ready = false;

export async function ensureCommentsTable(env) {
  if (ready) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS account_comments (id TEXT PRIMARY KEY, account_id INTEGER NOT NULL, created_at INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', ip_hash TEXT NOT NULL DEFAULT '')").run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_acomments_acc ON account_comments (account_id, status, created_at)').run();
  ready = true;
}

async function hashIp(ip) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('acm:' + String(ip || 'x')));
  return [...new Uint8Array(d)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('');
}

// POST /api/accounts/:id/comments  { name, text, website }  (website — приманка для ботов, должна быть пустой)
export async function postComment(env, accountId, b, ip) {
  b = b || {};
  if (b.website) return { ok: true }; // бот: молча «принимаем»
  const text = clean(b.text, 500);
  if (text.length < 5) return { error: 'Напишите хотя бы пару слов (от 5 символов)', status: 400 };
  if (BAD.test(text) || BAD.test(clean(b.name, 30))) return { error: 'Ссылки и контакты в комментариях нельзя. Свяжитесь с нами через кнопки WhatsApp или Telegram.', status: 400 };
  const name = clean(b.name, 30) || 'Гость';
  await ensureCommentsTable(env);
  const acc = await env.DB.prepare("SELECT id, title, status FROM accounts WHERE id = ? AND status != 'hidden'").bind(Number(accountId) || 0).first();
  if (!acc) return { error: 'Объявление не найдено', status: 404 };
  const h = await hashIp(ip), now = Date.now();
  const rl = await env.DB.prepare('SELECT COUNT(*) AS hr, MAX(created_at) AS last FROM account_comments WHERE ip_hash = ? AND created_at > ?').bind(h, now - 3600000).first();
  if (rl && rl.last && now - rl.last < 20000) return { error: 'Подождите немного перед следующим комментарием', status: 429 };
  if (rl && rl.hr >= 4) return { error: 'Слишком много комментариев за час. Попробуйте позже.', status: 429 };
  const dup = await env.DB.prepare('SELECT 1 AS x FROM account_comments WHERE account_id = ? AND text = ?').bind(acc.id, text).first();
  if (dup) return { ok: true }; // тот же текст уже есть
  const id = 'CM' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  await env.DB.prepare('INSERT INTO account_comments (id, account_id, created_at, name, text, status, ip_hash) VALUES (?,?,?,?,?,?,?)').bind(id, acc.id, now, name, text, 'pending', h).run();
  await notify(env, `💬 Новый комментарий к аккаунту №${acc.id} «${String(acc.title).slice(0, 60)}»\n«${text.slice(0, 300)}»\n— ${name}\nОдобрите или скройте в админке → Аккаунты → Комментарии.`);
  return { ok: true, id, pending: true };
}

// GET /api/accounts/:id/comments — только одобренные
export async function listComments(env, accountId) {
  await ensureCommentsTable(env);
  const { results } = await env.DB.prepare("SELECT name, text, created_at FROM account_comments WHERE account_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50").bind(Number(accountId) || 0).all();
  return { comments: results };
}

export async function adminListComments(env, status) {
  await ensureCommentsTable(env);
  const ok = ['pending', 'approved', 'hidden'].includes(status);
  const sql = 'SELECT c.id, c.account_id, c.created_at, c.name, c.text, c.status, a.title AS account_title FROM account_comments c LEFT JOIN accounts a ON a.id = c.account_id' + (ok ? ' WHERE c.status = ?' : '') + ' ORDER BY c.created_at DESC LIMIT 200';
  const { results } = await (ok ? env.DB.prepare(sql).bind(status) : env.DB.prepare(sql)).all();
  return { comments: results };
}

export async function adminSetComment(env, id, action) {
  await ensureCommentsTable(env);
  id = String(id).slice(0, 40);
  if (action === 'delete') {
    const r = await env.DB.prepare('DELETE FROM account_comments WHERE id = ?').bind(id).run();
    return r.meta && r.meta.changes ? { ok: true } : { error: 'Комментарий не найден', status: 404 };
  }
  const status = { approve: 'approved', hide: 'hidden', pending: 'pending' }[action];
  if (!status) return { error: 'Неизвестное действие', status: 400 };
  const r = await env.DB.prepare('UPDATE account_comments SET status = ? WHERE id = ?').bind(status, id).run();
  return r.meta && r.meta.changes ? { ok: true } : { error: 'Комментарий не найден', status: 404 };
}

export async function deleteAccountComments(env, accountId) {
  try { await ensureCommentsTable(env); await env.DB.prepare('DELETE FROM account_comments WHERE account_id = ?').bind(Number(accountId)).run(); } catch (e) { /* не критично */ }
}
