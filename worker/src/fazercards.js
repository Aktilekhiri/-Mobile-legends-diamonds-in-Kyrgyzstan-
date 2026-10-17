// Клиент FazerCards REST API (https://api.fzr.cards/public/docs, OpenAPI 0.1.0).
// Авторизация: заголовок X-API-Key: fc_... (секрет FAZERCARDS_API_KEY в Cloudflare).
// Создание заказа: POST /api/v2/topups/order, тело { category_id, offer_id, fields }, заголовок Idempotency-Key.
// Статус заказа: GET /api/v2/orders/{orderId}. Ответы: { ok, order: {...} }.
export const FZ_READY = true;
const BASE = 'https://api.fzr.cards';

import { GAMES } from './catalog.js';
const CATEGORY = { global: 'mobile_legends_global', russia: 'mobile_legends_ru', ...Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, g.category])) };

async function call(env, method, path, body, extraHeaders) {
  if (!env.FAZERCARDS_API_KEY) throw new Error('FAZERCARDS_API_KEY не задан в Cloudflare');
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), 20000);
  let r;
  try {
    r = await fetch(BASE + path, {
      method, signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': env.FAZERCARDS_API_KEY, ...(extraHeaders || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally { clearTimeout(tm); }
  const text = await r.text();
  let data = {}; try { data = JSON.parse(text); } catch (e) {}
  if (!r.ok || data.ok === false) {
    const e = new Error('FazerCards ' + r.status + ': ' + (data.error || data.code || text.slice(0, 160)));
    e.status = r.status; e.code = data.code; throw e;
  }
  return data;
}

function normalize(o) {
  if (!o || typeof o !== 'object') return {};
  return { id: o.id || '', status: o.status || '', fail_reason: o.fail_reason || '' };
}

// Создать заказ. Один и тот же idempotencyKey безопасно повторять: вернётся тот же заказ, повторного списания не будет.
export async function fzCreateOrder(env, { region, offerId, playerId, serverId, idempotencyKey }) {
  const category_id = CATEGORY[region || 'global'];
  if (!category_id) throw new Error('Регион не поддерживается для авто-выдачи');
  const g = GAMES[region];
  const fields = { player_id: String(playerId) };
  if (!g) fields.server_id = String(serverId);              // MLBB
  else if (g.serverField) fields[g.serverField] = String(serverId); // Genshin / WuWa: значение из списка серверов
  const d = await call(env, 'POST', '/api/v2/topups/order',
    { category_id, offer_id: offerId, fields },
    { 'Idempotency-Key': String(idempotencyKey) });
  const o = normalize(d.order);
  if (!o.id) throw new Error('FazerCards не вернул номер заказа');
  return o;
}

export async function fzGetOrder(env, fzOrderId) {
  const d = await call(env, 'GET', '/api/v2/orders/' + encodeURIComponent(fzOrderId));
  const o = normalize(d.order);
  if (!o.id) o.id = fzOrderId;
  return o;
}
