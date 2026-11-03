// Сделки по аккаунтам через гаранта.
// wait_pay → (покупатель «Я оплатил») pay_check → (владелец «Оплата пришла») paid: покупатель видит данные для входа →
// (покупатель «Зашёл») confirmed: через 72 ч владельцу приходит напоминание перевести деньги продавцу → paid_out.
// Проблема со входом → disputed: владелец решает сам (вернуть деньги покупателю или заплатить продавцу).
import { notify, defer } from './notify.js';
import { send, esc } from './tgapi.js';
import { decryptJson } from './crypt.js';
import { ensureMarket } from './market.js';

const HOLD_MS = 72 * 3600 * 1000, REMIND_MS = 48 * 3600 * 1000;
export const PAY_NUM = '+996 702 097 127', PAY_NAME = 'Актилек К.';
const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const money = n => Number(n).toLocaleString('ru-RU').replace(/ /g, ' ');
const rand = (n, al) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map(x => al[x % al.length]).join(''); };
function safeEq(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
let ready = false;
async function ensure(env) {
  if (ready) return; await ensureMarket(env);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS market_deals (code TEXT PRIMARY KEY, offer_code TEXT NOT NULL, account_id INTEGER NOT NULL, secret TEXT NOT NULL, contact TEXT NOT NULL, tg_chat INTEGER, ip TEXT, price INTEGER NOT NULL, seller_price INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'wait_pay', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, paid_at INTEGER, confirmed_at INTEGER, payout_due_at INTEGER, payout_notified INTEGER NOT NULL DEFAULT 0, remind_sent INTEGER NOT NULL DEFAULT 0)").run();
  ready = true;
}
const dealButtons = (kind, code) => ({ inline_keyboard: kind === 'pay'
  ? [[{ text: '✅ Оплата пришла', callback_data: 'dp:' + code }, { text: '❌ Оплаты нет', callback_data: 'dn:' + code }]]
  : [[{ text: '💸 Выплатил продавцу', callback_data: 'dd:' + code }, { text: '↩️ Вернуть покупателю', callback_data: 'dr:' + code }]] });

async function load(env, code, secret) {
  await ensure(env);
  const d = await env.DB.prepare('SELECT * FROM market_deals WHERE code = ?').bind(clean(code, 20)).first();
  if (!d || !safeEq(d.secret, secret || '')) return null; return d;
}
const setStatus = (env, code, from, to, extra = '', args = []) =>
  env.DB.prepare(`UPDATE market_deals SET status = ?, updated_at = ?${extra} WHERE code = ? AND status IN (${from.map(() => '?').join(',')})`).bind(to, Date.now(), ...args, code, ...from).run();

// Покупатель создаёт сделку (сайт или бот). who: { ip } | { tg_chat }
export async function createDeal(env, who, b) {
  await ensure(env);
  const id = Number(b.account_id) || 0, contact = clean(b.contact, 80);
  if (contact.length < 5) return { error: 'Укажите контакт: номер WhatsApp или @username в Telegram', status: 400 };
  const a = await env.DB.prepare("SELECT id, title, price FROM accounts WHERE id = ? AND status = 'available'").bind(id).first();
  if (!a) return { error: 'Этот аккаунт уже недоступен', status: 409 };
  const o = await env.DB.prepare("SELECT code, seller_price, creds_enc FROM market_offers WHERE account_id = ? AND status = 'published'").bind(id).first();
  if (!o || !o.creds_enc) return { error: 'Для этого аккаунта покупка через сайт недоступна, напишите нам в WhatsApp', status: 400 };
  const act = await env.DB.prepare("SELECT code FROM market_deals WHERE account_id = ? AND status IN ('pay_check','paid','confirmed','disputed') LIMIT 1").bind(id).first();
  if (act) return { error: 'Этот аккаунт уже покупает другой человек', status: 409 };
  const key = who.tg_chat ? ['tg_chat', who.tg_chat] : ['ip', who.ip || 'x'];
  const c = await env.DB.prepare(`SELECT COUNT(*) AS c FROM market_deals WHERE ${key[0]} = ? AND created_at > ?`).bind(key[1], Date.now() - 3600000).first();
  if (c && c.c >= 5) return { error: 'Слишком много попыток, попробуйте позже', status: 429 };
  const now = Date.now(), code = 'DL' + rand(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'), secret = rand(20, 'abcdef0123456789');
  await env.DB.prepare('INSERT INTO market_deals (code,offer_code,account_id,secret,contact,tg_chat,ip,price,seller_price,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(code, o.code, id, secret, contact, who.tg_chat || null, who.ip || '', a.price, o.seller_price || 0, now, now).run();
  return { ok: true, code, secret };
}

// Что видит покупатель на странице сделки
export async function viewDeal(env, code, secret) {
  const d = await load(env, code, secret); if (!d) return { error: 'Сделка не найдена', status: 404 };
  const a = await env.DB.prepare('SELECT title FROM accounts WHERE id = ?').bind(d.account_id).first();
  const out = { code: d.code, status: d.status, title: a ? a.title : '', price: d.price, pay: { num: PAY_NUM, name: PAY_NAME }, payout_due_at: d.payout_due_at || 0 };
  if (['paid', 'confirmed', 'disputed'].includes(d.status)) {
    const o = await env.DB.prepare('SELECT creds_enc FROM market_offers WHERE code = ?').bind(d.offer_code).first();
    const cr = o && o.creds_enc ? await decryptJson(env, o.creds_enc) : null;
    out.creds = cr ? { method: cr.method, login: cr.login, password: cr.password, bindings: cr.bindings } : null;
  }
  return out;
}

export async function dealPaid(env, code, secret) {
  const d = await load(env, code, secret); if (!d) return { error: 'Сделка не найдена', status: 404 };
  if (d.status === 'pay_check') return { ok: true };
  const r = await setStatus(env, d.code, ['wait_pay'], 'pay_check');
  if (!r.meta.changes) return { error: 'Сделка уже обработана', status: 409 };
  const a = await env.DB.prepare('SELECT title FROM accounts WHERE id = ?').bind(d.account_id).first();
  await defer(env, notify(env, `💳 Сделка ${d.code}: покупатель нажал «Я оплатил»\n${a ? a.title : ''}\nСумма: ${money(d.price)} сом (комментарий к платежу: ${d.code})\nПокупатель: ${d.contact}\nПроверьте поступление в Mbank/O!Банк.`, dealButtons('pay', d.code)));
  return { ok: true };
}
export async function dealConfirm(env, code, secret) {
  const d = await load(env, code, secret); if (!d) return { error: 'Сделка не найдена', status: 404 };
  const due = Date.now() + HOLD_MS;
  const r = await setStatus(env, d.code, ['paid'], 'confirmed', ', confirmed_at = ?, payout_due_at = ?', [Date.now(), due]);
  if (!r.meta.changes) return d.status === 'confirmed' ? { ok: true } : { error: 'Подтвердить можно только после выдачи данных', status: 409 };
  await defer(env, notify(env, `✅ Сделка ${d.code}: покупатель подтвердил вход. Деньги продавцу (${money(d.seller_price)} сом) можно переводить через 72 часа; напомню.`));
  return { ok: true };
}
export async function dealProblem(env, code, secret) {
  const d = await load(env, code, secret); if (!d) return { error: 'Сделка не найдена', status: 404 };
  const r = await setStatus(env, d.code, ['paid'], 'disputed');
  if (!r.meta.changes) return d.status === 'disputed' ? { ok: true } : { error: 'Недоступно на этом этапе', status: 409 };
  await defer(env, notify(env, `⚠️ Сделка ${d.code}: покупатель пишет, что не может войти в аккаунт.\nПокупатель: ${d.contact}\nПродавец получит ${money(d.seller_price)} сом. Разберитесь и выберите:`, dealButtons('payout', d.code)));
  return { ok: true };
}

// Кнопки владельца: dp / dn / dd / dr
export async function adminDeal(env, act, code) {
  await ensure(env);
  const d = await env.DB.prepare('SELECT * FROM market_deals WHERE code = ?').bind(clean(code, 20)).first();
  if (!d) return { error: 'Сделка не найдена', status: 404 };
  const o = await env.DB.prepare('SELECT tg_chat, contact FROM market_offers WHERE code = ?').bind(d.offer_code).first();
  if (act === 'dp') {
    if (d.status !== 'pay_check') return { error: 'Уже обработано (' + d.status + ')', status: 409 };
    const sold = await env.DB.prepare("UPDATE accounts SET status = 'sold', updated_at = ? WHERE id = ? AND status = 'available'").bind(Date.now(), d.account_id).run();
    if (!sold.meta.changes) return { error: 'Аккаунт уже продан другому: верните деньги этому покупателю', status: 409 };
    const r = await setStatus(env, d.code, ['pay_check'], 'paid', ', paid_at = ?', [Date.now()]);
    if (!r.meta.changes) return { error: 'Уже обработано', status: 409 };
    if (o && o.tg_chat) await send(env, o.tg_chat, `🎉 <b>Ваш аккаунт куплен</b> (сделка ${esc(d.code)}). Покупатель проверяет вход. Не меняйте пароль и привязки, пока сделка не закрыта. Выплата ${money(d.seller_price)} сом придёт после подтверждения покупателя (до 72 часов).`);
    return { ok: true };
  }
  if (act === 'dn') {
    const r = await setStatus(env, d.code, ['pay_check', 'wait_pay'], 'cancelled');
    return r.meta.changes ? { ok: true } : { error: 'Уже обработано (' + d.status + ')', status: 409 };
  }
  if (act === 'dd') {
    const r = await setStatus(env, d.code, ['confirmed', 'disputed', 'paid'], 'paid_out');
    if (!r.meta.changes) return { error: 'Уже обработано (' + d.status + ')', status: 409 };
    await env.DB.prepare("UPDATE market_offers SET creds_enc = '', status = 'sold', updated_at = ? WHERE code = ?").bind(Date.now(), d.offer_code).run();
    if (o && o.tg_chat) await send(env, o.tg_chat, `💸 <b>Деньги отправлены</b> (сделка ${esc(d.code)}): ${money(d.seller_price)} сом. Спасибо, что продаёте через Diamond.kg!`);
    return { ok: true };
  }
  if (act === 'dr') {
    const r = await setStatus(env, d.code, ['pay_check', 'paid', 'confirmed', 'disputed'], 'refunded');
    if (!r.meta.changes) return { error: 'Уже обработано (' + d.status + ')', status: 409 };
    await env.DB.prepare("UPDATE accounts SET status = 'hidden', updated_at = ? WHERE id = ?").bind(Date.now(), d.account_id).run();
    return { ok: true };
  }
  return { error: 'Неизвестное действие', status: 400 };
}

// Из cron: напоминания владельцу (выплата через 72 ч; покупатель не подтверждает больше 48 ч)
export async function remindDeals(env) {
  await ensure(env); const now = Date.now();
  const { results: due } = await env.DB.prepare("SELECT * FROM market_deals WHERE status = 'confirmed' AND payout_notified = 0 AND payout_due_at <= ?").bind(now).all();
  for (const d of due) {
    const l = await env.DB.prepare("UPDATE market_deals SET payout_notified = 1 WHERE code = ? AND payout_notified = 0").bind(d.code).run();
    if (!l.meta.changes) continue;
    const o = await env.DB.prepare('SELECT payout_to, contact FROM market_offers WHERE code = ?').bind(d.offer_code).first();
    await notify(env, `💸 Сделка ${d.code}: прошло 72 часа. Переведите продавцу ${money(d.seller_price)} сом\nКуда: ${o ? o.payout_to : '?'}\nКонтакт: ${o ? o.contact : '?'}\nЕсли аккаунт у покупателя в порядке, нажмите «Выплатил».`, dealButtons('payout', d.code));
  }
  const { results: stale } = await env.DB.prepare("SELECT * FROM market_deals WHERE status = 'paid' AND remind_sent = 0 AND paid_at <= ?").bind(now - REMIND_MS).all();
  for (const d of stale) {
    const l = await env.DB.prepare("UPDATE market_deals SET remind_sent = 1 WHERE code = ? AND remind_sent = 0").bind(d.code).run();
    if (l.meta.changes) await notify(env, `⏳ Сделка ${d.code}: 48 часов покупатель не подтверждает вход. Напишите ему: ${d.contact}`, dealButtons('payout', d.code));
  }
}
