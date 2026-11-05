// Баланс клиента (в сомах, целые числа). Кошелёк принадлежит владельцу:
//   'g:<id Google>'  — вошёл через Google на сайте (и/или привязал Telegram)
//   'tg:<chat_id>'   — клиент только в Telegram-боте, без привязки
// Каждое изменение записывается в wallet_tx. Пара (kind, ref) уникальна, поэтому один и тот же возврат или
// пополнение невозможно зачислить дважды (повтор вебхука, повторный опрос).
import { notify } from './notify.js';
import { send, esc } from './tgapi.js';

let ready = false;
export async function ensureWallet(env) {
  if (ready) return;
  const run = sql => env.DB.prepare(sql).run();
  await run('CREATE TABLE IF NOT EXISTS wallets (owner TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT \'\', updated_at INTEGER NOT NULL DEFAULT 0)');
  await run('CREATE TABLE IF NOT EXISTS wallet_tx (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, amount INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT NOT NULL DEFAULT \'\', note TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL)');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_uq ON wallet_tx(kind, ref) WHERE ref != \'\'');
  await run('CREATE INDEX IF NOT EXISTS wallet_tx_owner ON wallet_tx(owner, id)');
  await run('CREATE TABLE IF NOT EXISTS tg_links (tg_chat INTEGER PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL)');
  await run('CREATE TABLE IF NOT EXISTS tg_link_codes (code TEXT PRIMARY KEY, user_id TEXT NOT NULL, exp INTEGER NOT NULL)');
  await run('CREATE TABLE IF NOT EXISTS wallet_topups (id TEXT PRIMARY KEY, owner TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT \'new\', tg_chat INTEGER, created_at INTEGER NOT NULL)');
  ready = true;
}

// Telegram-чат → владелец кошелька: привязан к Google-аккаунту — общий кошелёк, иначе свой
export async function ownerForTg(env, chat) {
  await ensureWallet(env);
  const l = await env.DB.prepare('SELECT user_id FROM tg_links WHERE tg_chat = ?').bind(chat).first();
  return l ? 'g:' + l.user_id : 'tg:' + chat;
}
// Владелец кошелька для заказа: вошедший на сайте клиент, иначе Telegram-клиент. Гостю баланс не положен (null).
export async function ownerForOrder(env, o) {
  if (o && o.user_id) return 'g:' + o.user_id;
  if (o && o.tg_chat) return ownerForTg(env, o.tg_chat);
  return null;
}

export async function balanceOf(env, owner) {
  await ensureWallet(env);
  const w = await env.DB.prepare('SELECT balance FROM wallets WHERE owner = ?').bind(owner).first();
  return w ? Number(w.balance) : 0;
}

// Зачисление. Повтор с теми же (kind, ref) игнорируется: { ok:true, dup:true }.
export async function credit(env, owner, amount, kind, ref = '', note = '', label = '') {
  amount = Math.round(Number(amount));
  if (!(amount > 0)) return { ok: false };
  await ensureWallet(env);
  const now = Date.now();
  const r = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO wallet_tx (owner, amount, kind, ref, note, created_at) VALUES (?,?,?,?,?,?)').bind(owner, amount, kind, String(ref || ''), String(note || '').slice(0, 200), now),
    env.DB.prepare('INSERT INTO wallets (owner, balance, label, updated_at) SELECT ?,?,?,? WHERE changes() > 0 ON CONFLICT(owner) DO UPDATE SET balance = balance + excluded.balance, label = CASE WHEN excluded.label != \'\' THEN excluded.label ELSE label END, updated_at = excluded.updated_at').bind(owner, amount, String(label || ''), now),
  ]);
  const inserted = r[0] && r[0].meta && r[0].meta.changes > 0;
  return { ok: true, dup: !inserted, balance: await balanceOf(env, owner) };
}

// Списание: атомарно и только если хватает денег. { ok:false } — недостаточно средств.
export async function debit(env, owner, amount, kind, ref = '', note = '') {
  amount = Math.round(Number(amount));
  if (!(amount > 0)) return { ok: false };
  await ensureWallet(env);
  const now = Date.now();
  const r = await env.DB.batch([
    env.DB.prepare('UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE owner = ? AND balance >= ?').bind(amount, now, owner, amount),
    env.DB.prepare('INSERT INTO wallet_tx (owner, amount, kind, ref, note, created_at) SELECT ?,?,?,?,?,? WHERE changes() > 0').bind(owner, -amount, kind, String(ref || ''), String(note || '').slice(0, 200), now),
  ]);
  const ok = r[0] && r[0].meta && r[0].meta.changes > 0;
  return ok ? { ok: true, balance: await balanceOf(env, owner) } : { ok: false, balance: await balanceOf(env, owner) };
}

export async function history(env, owner, limit = 20) {
  await ensureWallet(env);
  const { results } = await env.DB.prepare('SELECT amount, kind, ref, note, created_at FROM wallet_tx WHERE owner = ? ORDER BY id DESC LIMIT ?').bind(owner, limit).all();
  return results;
}

// Человекочитаемое имя владельца для админки и уведомлений
export async function ownerLabel(env, owner) {
  if (owner.startsWith('g:')) {
    const u = await env.DB.prepare('SELECT email, name FROM users WHERE id = ?').bind(owner.slice(2)).first();
    return u ? (u.email || u.name || owner) : owner;
  }
  const chat = Number(owner.slice(3));
  const w = await env.DB.prepare('SELECT label FROM wallets WHERE owner = ?').bind(owner).first();
  const o = chat ? await env.DB.prepare('SELECT tg_user FROM orders WHERE tg_chat = ? AND tg_user IS NOT NULL ORDER BY created_at DESC LIMIT 1').bind(chat).first() : null;
  return (w && w.label) || (o && o.tg_user) || ('Telegram ' + chat);
}

// Сообщение клиенту в Telegram (если у владельца есть чат: свой или привязанный)
export async function tellOwner(env, owner, text, markup) {
  try {
    let chat = null;
    if (owner.startsWith('tg:')) chat = Number(owner.slice(3));
    else { const l = await env.DB.prepare('SELECT tg_chat FROM tg_links WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(owner.slice(2)).first(); chat = l ? l.tg_chat : null; }
    if (chat) await send(env, chat, text, markup ? { reply_markup: markup } : {});
  } catch (e) { /* не критично */ }
}

// Возврат за невыполненный заказ на баланс клиента. true — зачислено (или уже было зачислено), false — у заказа нет владельца кошелька.
export async function refundOrderToWallet(env, o) {
  const owner = await ownerForOrder(env, o);
  if (!owner) return false;
  const amount = Math.round(Number(o.price_kgs));
  const r = await credit(env, owner, amount, 'refund', o.id, (o.pkg_label || '') + ' · заказ ' + o.id);
  if (!r.ok) return false;
  if (!r.dup) {
    const who = await ownerLabel(env, owner);
    await notify(env, `↩️ Заказ ${o.id} не выполнен. ${amount} сом зачислено на баланс клиента (${who}). Баланс: ${r.balance} сом.`);
    await tellOwner(env, owner, `↩️ <b>Заказ ${esc(o.id)} не удалось выполнить</b>\n${amount} сом возвращены на ваш баланс (сейчас ${r.balance} сом). Можно заказать заново: нажмите «💰 Баланс» или выберите игру.`);
  }
  return true;
}
