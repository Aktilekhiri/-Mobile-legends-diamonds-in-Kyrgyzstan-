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

// Коды (gift_cards) в ответе FazerCards: формат точно не задокументирован, поэтому ищем по типичным полям.
function extractCodes(o) {
  const out = [];
  const take = v => {
    if (v == null) return;
    if (typeof v === 'string' || typeof v === 'number') { const t = String(v).trim(); if (t) out.push(t); return; }
    if (Array.isArray(v)) { v.forEach(take); return; }
    if (typeof v === 'object') {
      for (const k of ['code', 'pin', 'serial', 'key', 'value', 'redeem_code', 'gift_code']) if (v[k] != null && typeof v[k] !== 'object') { take(v[k]); return; }
      for (const k of ['codes', 'cards', 'keys', 'items', 'products']) if (v[k] != null) { take(v[k]); return; }
    }
  };
  for (const k of ['codes', 'cards', 'keys', 'items', 'code', 'delivery', 'products']) if (o && o[k] != null) { take(o[k]); if (out.length) break; }
  return [...new Set(out)].slice(0, 20);
}
function normalize(o) {
  if (!o || typeof o !== 'object') return {};
  return { id: o.id || '', status: o.status || '', fail_reason: o.fail_reason || '', codes: extractCodes(o) };
}

// Создать заказ. Один и тот же idempotencyKey безопасно повторять: вернётся тот же заказ, повторного списания не будет.
// offerId вида 'a|b' = составной пакет: несколько заказов FazerCards подряд (ключи key, key-2, ...), id склеиваются через запятую.
export async function fzCreateOrder(env, { region, offerId, playerId, serverId, idempotencyKey }) {
  const category_id = CATEGORY[region || 'global'];
  if (!category_id) throw new Error('Регион не поддерживается для авто-выдачи');
  const g = GAMES[region];
  // Коды (Roblox, Telegram): покупаем один код; игрок ничего не вводит, код показываем ему после выдачи
  if (g && g.type === 'gift_cards') {
    let d, lastErr;
    // Точный путь в документации не найден: пробуем вероятные варианты, 404 = заказ не создан и деньги не списаны
    for (const path of ['/api/v2/gift_cards/order', '/api/v2/gift-cards/order', '/api/v2/giftcards/order', '/api/v2/cards/order', '/api/v2/codes/order', '/api/v2/orders']) {
      try {
        const body = { category_id, offer_id: String(offerId), quantity: 1 };
        if (path === '/api/v2/orders') body.type = 'gift_cards';
        d = await call(env, 'POST', path, body, { 'Idempotency-Key': String(idempotencyKey) });
        break;
      } catch (e) { lastErr = e; if (e.status !== 404 && e.status !== 405) throw e; }
    }
    if (!d) throw lastErr;
    const o = normalize(d.order);
    if (!o.id) throw new Error('FazerCards не вернул номер заказа');
    return o;
  }
  const fields = { player_id: String(playerId) };
  if (!g) fields.server_id = String(serverId);              // MLBB
  else if (g.serverField) fields[g.serverField] = String(serverId); // Genshin / WuWa: значение из списка серверов
  const offers = String(offerId).split('|');
  const parts = [];
  for (let i = 0; i < offers.length; i++) {
    const d = await call(env, 'POST', '/api/v2/topups/order',
      { category_id, offer_id: offers[i], fields },
      { 'Idempotency-Key': String(idempotencyKey) + (i ? '-' + (i + 1) : '') });
    const o = normalize(d.order);
    if (!o.id) throw new Error('FazerCards не вернул номер заказа');
    parts.push(o);
  }
  return combine(parts);
}

// Объединяем статусы частей: все completed -> completed; все refund -> refund; смесь финальных -> partial; иначе processing
function combine(parts) {
  if (parts.length === 1) return parts[0];
  const st = parts.map(p => p.status);
  let status = 'processing';
  if (st.every(x => x === 'completed')) status = 'completed';
  else if (st.every(x => x === 'refund')) status = 'refund';
  else if (st.every(x => x === 'completed' || x === 'refund') ) status = 'partial';
  else if (st.some(x => x === 'failed')) status = 'failed';
  else if (st.every(x => x === 'created')) status = 'created';
  return { id: parts.map(p => p.id).join(','), status, fail_reason: parts.map(p => p.fail_reason).filter(Boolean).join('; '), codes: parts.flatMap(p => p.codes || []) };
}

export async function fzGetOrder(env, fzOrderId) {
  const ids = String(fzOrderId).split(',').filter(Boolean);
  const parts = [];
  for (const id of ids) {
    const d = await call(env, 'GET', '/api/v2/orders/' + encodeURIComponent(id));
    const o = normalize(d.order);
    if (!o.id) o.id = id;
    parts.push(o);
  }
  return combine(parts);
}

// Баланс аккаунта в USD (GET /api/v2/balance). Возвращает число или null, если формат неожиданный.
export async function fzGetBalance(env) {
  const d = await call(env, 'GET', '/api/v2/balance');
  const raw = d.balance ?? (d.data && d.data.balance) ?? d.available ?? d.balance_usd;
  const v = typeof raw === 'object' && raw ? (raw.available ?? raw.usd ?? raw.amount) : raw;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
