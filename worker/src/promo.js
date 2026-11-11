// Промокоды розыгрыша: бесплатный Weekly Diamond Pass (MLBB Global).
// Каждый код одноразовый, действует до expires_at, коды лежат в таблице promo_codes (создаются в D1).
// Заказ создаётся без оплаты и сразу уходит на выдачу в FazerCards; владельцу приходит уведомление.
import { createOrder, confirmOrder } from './orders.js';
import { notify } from './notify.js';

export const PROMO_REGION = 'global';
export const PROMO_PKG = 'Weekly Diamond Pass';
const TRY_LIMIT = 10; // попыток ввода кода с одного адреса в час (защита от перебора)

export const normCode = c => String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
const showCode = c => (c.length > 3 ? c.slice(0, 3) + '-' + c.slice(3) : c);

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS promo_codes (code TEXT PRIMARY KEY, pkg TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER NOT NULL DEFAULT 0, order_id TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)").run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS promo_tries (who TEXT NOT NULL, at INTEGER NOT NULL)').run();
  ready = true;
}

// Проверка кода без траты: считает попытку (защита от перебора), смотрит, что код существует, не использован и не истёк
async function gate(env, who, rawCode) {
  await ensure(env);
  const now = Date.now();
  const key = String(who || 'anon').slice(0, 60);
  const t = await env.DB.prepare('SELECT COUNT(*) AS c FROM promo_tries WHERE who = ? AND at > ?').bind(key, now - 3600000).first();
  if (t && t.c >= TRY_LIMIT) return { error: 'Слишком много попыток. Попробуйте через час.', status: 429 };
  await env.DB.prepare('INSERT INTO promo_tries (who, at) VALUES (?, ?)').bind(key, now).run();
  await env.DB.prepare('DELETE FROM promo_tries WHERE at < ?').bind(now - 86400000).run();
  const code = normCode(rawCode);
  if (code.length < 6) return { error: 'Введите промокод полностью', status: 400 };
  const row = await env.DB.prepare('SELECT * FROM promo_codes WHERE code = ?').bind(code).first();
  if (!row) return { error: 'Промокод не найден. Проверьте, нет ли опечатки.', status: 404 };
  if (row.used_at > 0) return { error: 'Этот промокод уже использован.', status: 409 };
  if (row.expires_at <= now) return { error: 'Срок действия промокода истёк.', status: 410 };
  return { code, row };
}
export async function checkPromo(env, who, rawCode) {
  const g = await gate(env, who, rawCode);
  return g.error ? g : { ok: true };
}

// who: IP клиента (сайт) или 'tg:<chat>' (бот). b: { code, playerId, serverId }. extra: { tgChat, tgUser }
export async function redeemPromo(env, who, b, userId = null, extra = {}) {
  const g = await gate(env, who, b.code);
  if (g.error) return g;
  const { code, row } = g, now = Date.now();

  // один человек — один промокод: тот же ID игрока, тот же вход на сайте или тот же Telegram-аккаунт уже получал промо-заказ
  const pid = String(b.playerId == null ? '' : b.playerId).replace(/\D+/g, '').slice(0, 25);
  const conds = ['player_id = ?'], args = [pid];
  if (userId) { conds.push('user_id = ?'); args.push(userId); }
  if (extra.tgChat) { conds.push('tg_chat = ?'); args.push(extra.tgChat); }
  let dup = null;
  try { dup = await env.DB.prepare(`SELECT id FROM orders WHERE method = 'promo' AND status NOT IN ('cancelled','refunded','refund_due') AND (${conds.join(' OR ')}) LIMIT 1`).bind(...args).first(); } catch (e) { /* без проверки не блокируем */ }
  if (dup) return { error: 'С этого аккаунта промокод уже активирован. Один аккаунт, один промокод.', status: 409 };

  // атомарно занимаем код: два одновременных запроса не пройдут оба
  const claim = await env.DB.prepare('UPDATE promo_codes SET used_at = ? WHERE code = ? AND used_at = 0 AND expires_at > ?').bind(now, code, now).run();
  if (!claim.meta.changes) return { error: 'Этот промокод уже использован.', status: 409 };

  let r;
  try {
    r = await createOrder(env, '', {
      region: PROMO_REGION, pkg: row.pkg || PROMO_PKG, pkgLabel: (row.pkg || PROMO_PKG) + ' (промокод ' + showCode(code) + ')', price: 0,
      method: 'promo', phone: '000promo', playerId: b.playerId, serverId: b.serverId, deferNotify: true,
    }, userId, { promo: true });
  } catch (e) { r = { error: 'Не удалось создать заказ, попробуйте ещё раз', status: 502 }; }
  if (r.error) {
    // неверный ID и т.п.: возвращаем код, чтобы человек мог исправить ввод
    await env.DB.prepare("UPDATE promo_codes SET used_at = 0 WHERE code = ? AND order_id = ''").bind(code).run();
    return { error: r.error, status: r.status || 400 };
  }
  await env.DB.prepare('UPDATE promo_codes SET order_id = ? WHERE code = ?').bind(r.id, code).run();
  if (extra.tgChat) { try { await env.DB.prepare('UPDATE orders SET tg_chat = ?, tg_user = ? WHERE id = ?').bind(extra.tgChat, extra.tgUser || '', r.id).run(); } catch (e) {} }

  const o = await env.DB.prepare('SELECT player_id, server_id FROM orders WHERE id = ?').bind(r.id).first();
  await notify(env, `🎁 Промокод ${showCode(code)} использован: заказ ${r.id}, Weekly Diamond Pass, ID ${o ? o.player_id : '?'} (${o ? o.server_id : '?'}). Отправляю на выдачу.`);
  // сразу выдаём: заказ бесплатный, проверять оплату не нужно (ошибки FazerCards придут владельцу уведомлением)
  let res = null;
  try { res = await confirmOrder(env, r.id); } catch (e) { /* заказ остаётся в «Ждёт оплаты», владелец подтвердит вручную */ }
  return { id: r.id, secret: r.secret, status: res && res.ok ? 'processing' : r.status };
}
