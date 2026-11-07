// Баланс клиента: пополнение через Finik, оплата заказа с баланса, привязка Telegram к аккаунту сайта, операции админа.
// Низкоуровневые операции (зачисление/списание/возврат) — в ledger.js.
import { notify } from './notify.js';
import { createOrder, confirmOrder, orderCard } from './orders.js';
import { createFinikPayment, finikReady } from './finik.js';
import { ensureWallet, balanceOf, credit, debit, history, ownerLabel, ownerForTg, tellOwner } from './ledger.js';
import { esc } from './tgapi.js';

const SITE = 'https://diamond.kg/';
const BOT = 'diamond_kg_bot';
export const TOPUP_MIN = 5, TOPUP_MAX = 20000;
const rnd = (n, abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') => { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map(x => abc[x % abc.length]).join(''); };

// Данные для кабинета на сайте
export async function walletInfo(env, sub) {
  const owner = 'g:' + sub;
  await ensureWallet(env);
  const l = await env.DB.prepare('SELECT 1 AS x FROM tg_links WHERE user_id = ? LIMIT 1').bind(sub).first();
  return { balance: await balanceOf(env, owner), history: await history(env, owner, 15), tg_linked: !!l, min: TOPUP_MIN, max: TOPUP_MAX, finik: finikReady(env) };
}

// ---------- пополнение через Finik ----------
export async function startTopup(env, owner, amount, tgChat) {
  if (!finikReady(env)) return { error: 'Пополнение пока недоступно', status: 503 };
  amount = Math.floor(Number(amount) || 0);
  if (amount < TOPUP_MIN || amount > TOPUP_MAX) return { error: `Сумма пополнения: от ${TOPUP_MIN} до ${TOPUP_MAX} сом`, status: 400 };
  await ensureWallet(env);
  const id = 'TU' + rnd(8);
  await env.DB.prepare('INSERT INTO wallet_topups (id, owner, amount, status, tg_chat, created_at) VALUES (?,?,?,?,?,?)').bind(id, owner, amount, 'new', tgChat || null, Date.now()).run();
  const back = tgChat ? 'https://t.me/' + BOT : SITE + '?wallet=1';
  const p = await createFinikPayment(env, { id, price_kgs: amount, pkg_label: 'Пополнение баланса' }, back);
  if (p.error) { await env.DB.prepare("UPDATE wallet_topups SET status = 'failed' WHERE id = ?").bind(id).run(); return p; }
  return { id, url: p.url };
}

// Вызывается из вебхука Finik, когда paymentId — это пополнение (TU…). Возвращает true, если платёж был пополнением.
export async function handleTopupPayment(env, paymentId, paid, txId) {
  if (!/^TU[A-Z0-9]{8}$/.test(paymentId)) return false;
  await ensureWallet(env);
  const t = await env.DB.prepare('SELECT * FROM wallet_topups WHERE id = ?').bind(paymentId).first();
  if (!t) { await notify(env, `⚠️ Finik: пришла оплата ${paid} сом по неизвестному пополнению ${paymentId} (транзакция ${txId}). Проверьте в кабинете Finik.`); return true; }
  if (paid + 0.001 < t.amount) { await notify(env, `⚠️ Finik: пополнение ${t.id} оплачено не полностью: ${paid} из ${t.amount} сом. Баланс не пополнен, разберитесь вручную.`); return true; }
  const r = await credit(env, t.owner, t.amount, 'topup', t.id, 'Пополнение через Finik');
  if (r.ok && !r.dup) {
    await env.DB.prepare("UPDATE wallet_topups SET status = 'paid' WHERE id = ?").bind(t.id).run();
    await notify(env, `💰 Пополнение баланса +${t.amount} сом (${await ownerLabel(env, t.owner)}). Баланс клиента: ${r.balance} сом.`);
    await tellOwner(env, t.owner, `💰 <b>Баланс пополнен на ${t.amount} сом</b>\nСейчас на балансе ${r.balance} сом.`);
  }
  return true;
}

// ---------- оплата заказа с баланса ----------
export async function startWalletOrder(env, ip, b, owner, userId, tg) {
  await ensureWallet(env);
  const r = await createOrder(env, ip, { ...b, method: 'Баланс', deferNotify: true }, userId);
  if (r.error) return r;
  // заказ из Telegram: чат записываем до выдачи, чтобы сообщение о выдаче дошло
  if (tg && tg.chat) await env.DB.prepare('UPDATE orders SET tg_chat = ?, tg_user = ? WHERE id = ?').bind(tg.chat, tg.user || '', r.id).run();
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(r.id).first();
  const d = await debit(env, owner, Math.round(o.price_kgs), 'spend', o.id, (o.pkg_label || '') + ' · заказ ' + o.id);
  if (!d.ok) {
    await env.DB.prepare("UPDATE orders SET status = 'cancelled', fail_reason = ?, updated_at = ? WHERE id = ? AND status IN ('new','manual')").bind('Недостаточно средств на балансе', Date.now(), o.id).run();
    return { error: `Недостаточно средств на балансе (${d.balance || 0} сом)`, status: 402 };
  }
  const who = await ownerLabel(env, owner);
  await notify(env, `💰 Заказ ${o.id} оплачен с баланса (${who})\n${orderCard(o)}\n⏳ Выдаю автоматически.`);
  const c = await confirmOrder(env, o.id);
  if (c.error) await notify(env, `⚠️ Заказ ${o.id} оплачен с баланса, но авто-выдача не удалась: ${c.error}. Выдайте вручную в админке (или верните деньги на баланс кнопкой «Начислить»).`);
  return { id: r.id, secret: r.secret, balance: d.balance };
}

// ---------- привязка Telegram к аккаунту сайта ----------
export async function makeLinkCode(env, sub) {
  await ensureWallet(env);
  const code = rnd(8);
  await env.DB.prepare('DELETE FROM tg_link_codes WHERE user_id = ? OR exp < ?').bind(sub, Date.now()).run();
  await env.DB.prepare('INSERT INTO tg_link_codes (code, user_id, exp) VALUES (?,?,?)').bind(code, sub, Date.now() + 15 * 60000).run();
  return { code, url: `https://t.me/${BOT}?start=link_${code}` };
}

export async function linkTelegram(env, chat, code) {
  await ensureWallet(env);
  const row = await env.DB.prepare('SELECT user_id, exp FROM tg_link_codes WHERE code = ?').bind(String(code || '').toUpperCase()).first();
  if (!row || row.exp < Date.now()) return { error: 'Код не подошёл или устарел. Получите новый на сайте: Профиль → «Привязать Telegram».' };
  await env.DB.prepare('INSERT INTO tg_links (tg_chat, user_id, created_at) VALUES (?,?,?) ON CONFLICT(tg_chat) DO UPDATE SET user_id = excluded.user_id, created_at = excluded.created_at').bind(chat, row.user_id, Date.now()).run();
  await env.DB.prepare('DELETE FROM tg_link_codes WHERE code = ?').bind(String(code).toUpperCase()).run();
  // баланс, накопленный в боте до привязки, переносим в общий кошелёк
  const old = await balanceOf(env, 'tg:' + chat);
  if (old > 0) {
    const ref = 'L' + chat + '-' + Date.now();
    const d = await debit(env, 'tg:' + chat, old, 'link-out', ref, 'Перенос в аккаунт сайта');
    if (d.ok) await credit(env, 'g:' + row.user_id, old, 'link-in', ref, 'Перенос из Telegram');
  }
  return { ok: true, label: await ownerLabel(env, 'g:' + row.user_id), balance: await balanceOf(env, 'g:' + row.user_id) };
}

export { ownerForTg };

// ---------- админка ----------
export async function adminWallets(env, q) {
  await ensureWallet(env);
  q = String(q || '').trim().toLowerCase();
  const { results: ws } = await env.DB.prepare('SELECT owner, balance, updated_at FROM wallets ORDER BY balance DESC, updated_at DESC LIMIT 300').all();
  const map = new Map();
  for (const w of ws) map.set(w.owner, { owner: w.owner, balance: Number(w.balance), updated_at: w.updated_at });
  if (q) {
    const like = '%' + q.replace(/[%_]/g, '') + '%';
    const { results: us } = await env.DB.prepare('SELECT id FROM users WHERE lower(email) LIKE ? OR lower(name) LIKE ? LIMIT 30').bind(like, like).all();
    for (const u of us) if (!map.has('g:' + u.id)) map.set('g:' + u.id, { owner: 'g:' + u.id, balance: 0, updated_at: 0 });
  }
  const out = [];
  for (const w of map.values()) {
    w.label = await ownerLabel(env, w.owner);
    if (q && !w.label.toLowerCase().includes(q) && !w.owner.toLowerCase().includes(q)) continue;
    out.push(w);
  }
  return { wallets: out.slice(0, 100) };
}

export async function adminWalletHistory(env, owner) {
  await ensureWallet(env);
  if (!/^(g:\d{5,40}|tg:\d{3,20})$/.test(owner)) return { error: 'Неверный владелец', status: 400 };
  return { owner, label: await ownerLabel(env, owner), balance: await balanceOf(env, owner), history: await history(env, owner, 50) };
}

// op: withdraw (вывод: списать и записать, куда перевести) | credit (начислить) | debit (списать)
export async function adminWalletOp(env, b) {
  const owner = String(b.owner || ''), op = String(b.op || ''), amount = Math.floor(Number(b.amount) || 0), note = String(b.note || '').slice(0, 200);
  if (!/^(g:\d{5,40}|tg:\d{3,20})$/.test(owner)) return { error: 'Неверный владелец', status: 400 };
  if (!(amount > 0) || amount > 1000000) return { error: 'Укажите сумму', status: 400 };
  if (!['withdraw', 'credit', 'debit'].includes(op)) return { error: 'Неверная операция', status: 400 };
  await ensureWallet(env);
  const who = await ownerLabel(env, owner), ref = 'A' + Date.now() + rnd(4);
  if (op === 'credit') {
    const r = await credit(env, owner, amount, 'admin', ref, note || 'Начисление администратором');
    await tellOwner(env, owner, `💰 <b>На ваш баланс зачислено ${amount} сом</b>${note ? '\n' + esc(note) : ''}\nСейчас на балансе ${r.balance} сом.`);
    return { ok: true, balance: r.balance };
  }
  const d = await debit(env, owner, amount, op === 'withdraw' ? 'withdraw' : 'admin', ref, note || (op === 'withdraw' ? 'Вывод' : 'Списание администратором'));
  if (!d.ok) return { error: `Недостаточно средств на балансе (${d.balance} сом)`, status: 409 };
  if (op === 'withdraw') {
    await notify(env, `💸 Вывод с баланса: ${amount} сом, клиент ${who}.\nКуда перевести: ${note || '—'}\nОстаток на балансе: ${d.balance} сом.`);
    await tellOwner(env, owner, `💸 <b>Вывод ${amount} сом оформлен</b>\nДеньги отправим на указанные вами реквизиты. Остаток на балансе: ${d.balance} сом.`);
  }
  return { ok: true, balance: d.balance };
}
