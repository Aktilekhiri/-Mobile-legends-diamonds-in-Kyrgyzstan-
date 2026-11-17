// Долги клиентов: заказ выдан вручную, а поставщик потом выполнил его тоже (клиент получил товар дважды).
// manual_done — заказы, которые владелец выдал вручную, пока они «висели» у поставщика.
// debts — долг клиента: кошелёк уходит в минус, пока баланс < 0, клиент не может оформлять заказы.
import { ensureWallet, ownerForOrder, tellOwner } from './ledger.js';
import { notify } from './notify.js';
import { esc } from './tgapi.js';

let ready = false;
async function ensure(env) {
  if (ready) return;
  await ensureWallet(env);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS manual_done (order_id TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS debts (order_id TEXT PRIMARY KEY, owner TEXT NOT NULL, player_id TEXT NOT NULL DEFAULT \'\', amount INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL)').run();
  ready = true;
}

export async function isManualDone(env, id) {
  try { await ensure(env); return !!(await env.DB.prepare('SELECT 1 AS x FROM manual_done WHERE order_id = ?').bind(id).first()); } catch (e) { return false; }
}

// Поставщик выполнил заказ, который уже выдан вручную: списываем сумму заказа в минус и блокируем покупки до погашения
export async function chargeDoubleDelivery(env, o) {
  await ensure(env);
  const owner = await ownerForOrder(env, o);
  const amount = Math.round(Number(o.price_kgs) || 0);
  const reason = `Заказ ${o.id} (${o.pkg_label}) выдан дважды`;
  if (!owner) { await notify(env, `⚠️ ${o.id}: поставщик выполнил заказ, выданный вручную, но у клиента нет аккаунта/Telegram — списать нечего. Долг ${amount} сом: ID игрока ${o.player_id}.`); return; }
  const now = Date.now();
  const r = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO wallet_tx (owner, amount, kind, ref, note, created_at) VALUES (?,?,?,?,?,?)').bind(owner, -amount, 'debt', o.id, reason, now),
    env.DB.prepare('INSERT INTO wallets (owner, balance, label, updated_at) SELECT ?,?,?,? WHERE changes() > 0 ON CONFLICT(owner) DO UPDATE SET balance = balance + excluded.balance, updated_at = excluded.updated_at').bind(owner, -amount, '', now),
    env.DB.prepare('INSERT OR IGNORE INTO debts (order_id, owner, player_id, amount, reason, created_at) VALUES (?,?,?,?,?,?)').bind(o.id, owner, String(o.player_id || ''), amount, reason, now),
  ]);
  if (!(r[0].meta.changes > 0)) return; // повтор вебхука
  const w = await env.DB.prepare('SELECT balance FROM wallets WHERE owner = ?').bind(owner).first();
  await tellOwner(env, owner, `⚠️ <b>Заказ ${esc(o.id)} (${esc(o.pkg_label)}) выдан вам дважды</b>\nМы выдали ${esc(o.pkg_label)} вручную, а затем заказ выполнился ещё раз автоматически. На вашем балансе: ${w ? w.balance : -amount} сом.\nЧтобы продолжить покупки, пополните баланс на ${amount} сом.`);
  await notify(env, `⚖️ ${o.id}: поставщик выполнил заказ, который вы выдали вручную. Клиенту списано ${amount} сом (баланс ${w ? w.balance : '?'}), покупки заблокированы до пополнения.`);
}

// Проверка при создании заказа: у клиента есть непогашенный долг?
export async function debtBlock(env, { userId, tgChat, player }) {
  try {
    await ensure(env);
    const owners = [];
    if (userId) owners.push('g:' + userId);
    if (tgChat) owners.push('tg:' + tgChat);
    const conds = [], bind = [];
    if (owners.length) { conds.push('d.owner IN (' + owners.map(() => '?').join(',') + ')'); bind.push(...owners); }
    if (player && player !== '-') { conds.push('d.player_id = ?'); bind.push(String(player)); }
    if (!conds.length) return null;
    return await env.DB.prepare('SELECT d.reason, d.amount, w.balance FROM debts d JOIN wallets w ON w.owner = d.owner WHERE w.balance < 0 AND (' + conds.join(' OR ') + ') LIMIT 1').bind(...bind).first();
  } catch (e) { return null; }
}
