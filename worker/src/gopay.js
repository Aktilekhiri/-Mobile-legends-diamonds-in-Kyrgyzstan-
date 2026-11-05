// Оплата через GoPay (ELQR: оплата в приложении любого банка КР или по QR). Документация: https://doc.gopay.kg/v1
// Секреты Cloudflare: GOPAY_API_KEY, GOPAY_SECRET_KEY (ключ + секрет из кабинета, Test или Live), GOPAY_WEBHOOK_SECRET (из Developer → Webhooks).
// Необязательно: GOPAY_PUBLIC=1 (показывать кнопку оплаты клиентам; пока пусто, кнопка скрыта, тест по ссылке ?gopaytest=1),
// GOPAY_FEE_PCT (комиссия, по умолчанию 0.02), GOPAY_BASE (по умолчанию https://api.gopay.kg).
// В кабинете GoPay: Developer → Webhooks → events_url = https://<воркер>/api/gopay/webhook, событие payment.committed.
import { createOrder, confirmOrder } from './orders.js';
import { notify } from './notify.js';

const BASE = 'https://api.gopay.kg';
const SITE = 'https://diamond.kg/';
const enc = new TextEncoder();
export const gopayReady = env => !!(env.GOPAY_API_KEY && env.GOPAY_SECRET_KEY && env.GOPAY_WEBHOOK_SECRET);
export const gopayPublic = env => gopayReady(env) && String(env.GOPAY_PUBLIC || '') === '1';

// ---------- подпись: HMAC-SHA512(secret, nonce + "\n" + тело + "\n"), hex в верхнем регистре ----------
export async function hmacHex(secret, nonce, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(nonce + '\n' + body + '\n')));
  return Array.from(sig, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
function safeEq(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

async function call(env, path, data) {
  const body = JSON.stringify(data), n = nonce();
  const res = await fetch((env.GOPAY_BASE || BASE).replace(/\/+$/, '') + path, {
    method: 'POST', body, signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', 'GoPay-Api-Key': env.GOPAY_API_KEY, 'GoPay-Nonce': n, 'GoPay-Signature': await hmacHex(env.GOPAY_SECRET_KEY, n, body) },
  });
  let j = null; try { j = await res.json(); } catch (e) { /* не JSON */ }
  if (!j) return { error: 'GoPay: ошибка ' + res.status };
  if (j.status !== 'OK') return { error: 'GoPay: ' + String(j.error_message || j.code || 'ошибка').slice(0, 150), code: j.code };
  return { data: j.data || {} };
}

// Телефон для чека ГНС (необязательно): только настоящий номер КР
const buyerPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 9 && !String(p).startsWith('000') ? '+996' + d.slice(-9) : ''; };

export async function createGopayPayment(env, o) {
  const body = {
    order_id: o.id, amount: Number(o.price_kgs).toFixed(2), lifetime: 3600,
    description: (String(o.pkg_label || o.pkg || 'Заказ').slice(0, 60) + ' · ' + o.id).slice(0, 255),
    success_url: SITE + '?paid=' + encodeURIComponent(o.id), failure_url: SITE,
  };
  const ph = buyerPhone(o.phone); if (ph) body.buyer = { phone: ph };
  const r = await call(env, '/v1/payments', body);
  if (r.error) return { error: r.error, status: 502 };
  if (!r.data.checkout_url) return { error: 'GoPay: нет ссылки на оплату', status: 502 };
  return { url: r.data.checkout_url, paymentId: r.data.payment_id, testing: !!r.data.testing_mode };
}

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS gopay_payments (payment_id TEXT PRIMARY KEY, order_id TEXT NOT NULL, amount REAL NOT NULL, status TEXT, created_at INTEGER NOT NULL)').run();
  try { await env.DB.prepare('ALTER TABLE orders ADD COLUMN fee_kgs REAL NOT NULL DEFAULT 0').run(); } catch (e) { /* уже есть */ }
  ready = true;
}

// POST /api/orders/gopay — как обычный заказ, но сразу возвращает ссылку на оплату
export async function startGopayOrder(env, ip, b, userId) {
  if (!gopayReady(env)) return { error: 'Оплата по QR пока не включена', status: 503 };
  await ensure(env);
  const r = await createOrder(env, ip, { ...b, method: 'GoPay', deferNotify: true }, userId);
  if (r.error) return r;
  const o = await env.DB.prepare('SELECT id, pkg, pkg_label, price_kgs, phone FROM orders WHERE id = ?').bind(r.id).first();
  const p = await createGopayPayment(env, o);
  if (p.error) {
    await env.DB.prepare("UPDATE orders SET status = 'cancelled', fail_reason = ?, updated_at = ? WHERE id = ? AND status IN ('new','manual')").bind(p.error, Date.now(), r.id).run();
    return p;
  }
  return { id: r.id, secret: r.secret, url: p.url };
}

// Общая обработка успешной оплаты (вебхук и сверка по cron)
async function applyCommitted(env, orderId, paymentId, amount, testing) {
  await ensure(env);
  const ins = await env.DB.prepare('INSERT OR IGNORE INTO gopay_payments (payment_id, order_id, amount, status, created_at) VALUES (?,?,?,?,?)').bind(paymentId, orderId, Number(amount) || 0, testing ? 'test' : 'committed', Date.now()).run();
  if (!ins.meta.changes) return 'duplicate';
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (testing) {   // тестовый платёж: деньги не списывались, алмазы НЕ выдаём
    await notify(env, `🧪 GoPay: тестовая оплата ${amount} сом по заказу ${orderId} дошла, подпись верна. Заказ не выдан (это тест).`);
    if (o) await env.DB.prepare("UPDATE orders SET status = 'cancelled', fail_reason = 'Тест GoPay', updated_at = ? WHERE id = ? AND status IN ('new','manual')").bind(Date.now(), orderId).run();
    return 'test';
  }
  if (!o) { await notify(env, `⚠️ GoPay: пришла оплата ${amount} сом по неизвестному заказу ${orderId} (платёж ${paymentId}). Проверьте в кабинете GoPay.`); return 'unknown'; }
  const paid = Number(amount) || 0;
  if (paid + 0.001 < o.price_kgs) { await notify(env, `⚠️ GoPay: заказ ${o.id} оплачен не полностью: ${paid} из ${o.price_kgs} сом. Заказ НЕ выдан, разберитесь вручную.`); return 'partial'; }
  const fee = Math.round(o.price_kgs * Number(env.GOPAY_FEE_PCT || 0.02) * 100) / 100;
  await env.DB.prepare('UPDATE orders SET fee_kgs = ?, updated_at = ? WHERE id = ?').bind(fee, Date.now(), o.id).run();
  if (o.status === 'new') {
    await notify(env, `💳 GoPay: заказ ${o.id} оплачен (${o.pkg_label}, ${o.price_kgs} сом). Выдаю автоматически.`);
    const r = await confirmOrder(env, o.id);
    if (r.error) await notify(env, `⚠️ Заказ ${o.id} оплачен, но авто-выдача не удалась: ${r.error}. Выдайте вручную в админке.`);
  } else {
    await notify(env, `💳 GoPay: заказ ${o.id} оплачен (${o.pkg_label}, ${o.price_kgs} сом), но он в статусе «${o.status}», авто-выдача невозможна. Выдайте вручную в админке или верните деньги.`);
  }
  return 'ok';
}

// POST /api/gopay/webhook: типизированные события (events_url). Подпись в заголовках gopay-nonce / gopay-signature
export async function gopayWebhook(env, req) {
  if (!gopayReady(env)) return { status: 503, body: 'off' };
  const raw = await req.text();
  const n = req.headers.get('gopay-nonce') || '', sig = req.headers.get('gopay-signature') || '';
  if (!n || !sig || !safeEq(await hmacHex(env.GOPAY_WEBHOOK_SECRET, n, raw), sig.toUpperCase())) { console.log('gopay webhook: bad signature'); return { status: 401, body: 'bad signature' }; }
  let ev; try { ev = JSON.parse(raw); } catch (e) { return { status: 400, body: 'bad json' }; }
  if (ev.event !== 'payment.committed') {
    // провал/истечение/отмена: ждём новую попытку оплаты, заказ сам отменится по cron
    return { status: 200, body: 'ignored' };
  }
  const d = ev.data || {}, orderId = String(d.order_id || '').slice(0, 32), pid = String(d.payment_id || '');
  if (!orderId || !pid) return { status: 200, body: 'no ids' };
  const res = await applyCommitted(env, orderId, pid, d.amount, d.testing_mode === true);
  return { status: 200, body: res };
}

// Из cron: страховка на случай потерянного вебхука + отмена неоплаченных заказов старше 2 часов
export async function cleanupGopay(env) {
  if (!gopayReady(env)) return;
  await ensure(env);
  const { results } = await env.DB.prepare("SELECT id FROM orders WHERE method = 'GoPay' AND status = 'new' AND created_at > ? AND created_at < ? AND NOT EXISTS (SELECT 1 FROM gopay_payments p WHERE p.order_id = orders.id) ORDER BY created_at LIMIT 8").bind(Date.now() - 2 * 3600 * 1000, Date.now() - 90 * 1000).all();
  for (const o of results) {
    const r = await call(env, '/v1/payments/query', { order_id: o.id }).catch(() => null);
    const d = r && r.data;
    if (d && d.status === 'COMMITTED') await applyCommitted(env, o.id, String(d.payment_id), d.amount, d.testing_mode === true).catch(() => {});
  }
  await env.DB.prepare("UPDATE orders SET status = 'cancelled', fail_reason = 'Не оплачен в GoPay', updated_at = ? WHERE method = 'GoPay' AND status IN ('new','manual') AND created_at < ? AND NOT EXISTS (SELECT 1 FROM gopay_payments p WHERE p.order_id = orders.id)")
    .bind(Date.now(), Date.now() - 2 * 3600 * 1000).run();
}
