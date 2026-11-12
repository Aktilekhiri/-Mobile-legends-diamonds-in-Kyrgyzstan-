// Клиент FazerCards REST API (https://api.fzr.cards/public/docs, OpenAPI 0.1.0).
// Авторизация: заголовок X-API-Key: fc_... (секрет FAZERCARDS_API_KEY в Cloudflare).
// Создание заказа: POST /api/v2/topups/order, тело { category_id, offer_id, fields }, заголовок Idempotency-Key.
// Статус заказа: GET /api/v2/orders/{orderId}. Ответы: { ok, order: {...} }.
export const FZ_READY = true;
const BASE = 'https://api.fzr.cards';

import { GAMES } from './catalog.js';
const CATEGORY = { global: 'mobile_legends_global', russia: 'mobile_legends_ru', indonesia: 'mobile_legends_indonesia', turkey: 'mobile_legends_turkey', malaysia: 'mobile_legends_malaysia', philippines: 'mobile_legends_philippines', singapore: 'mobile_legends_singapore', brazil: 'mobile_legends_brazil', usa: 'mobile_legends_united_states', ...Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, g.category])) };

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
  // Telegram Stars / Premium: FazerCards сам отправляет на @username клиента (асинхронно), кода нет
  if (g && g.direct) {
    const uname = String(playerId || '').replace(/^@/, '');
    const isStars = g.direct === 'stars';
    const body = isStars ? { telegram_username: uname, quantity: Number(offerId) } : { telegram_username: uname, months: parseInt(offerId, 10) };
    const d = await call(env, 'POST', isStars ? '/api/v2/telegram/stars/buy' : '/api/v2/telegram/premium/buy', body, { 'Idempotency-Key': String(idempotencyKey) });
    const o = normalize(d.order);
    if (!o.id) throw new Error('FazerCards не вернул номер заказа');
    return o;
  }
  // Коды (Roblox, Telegram): покупаем один код; игрок ничего не вводит, код показываем ему после выдачи
  if (g && g.type === 'gift_cards') {
    let d, lastErr;
    // Путь из документации FazerCards: POST /api/v2/giftcards/order (в предложениях номинал называется card_id = offer_id)
    for (const path of ['/api/v2/giftcards/order']) {
      try {
        const body = { category_id, offer_id: String(offerId), card_id: String(offerId), quantity: 1 };
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
  else if (g.serverText) fields.server_id = String(serverId);
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

// ---------- каталог предложений (для автопроверки наличия паков) ----------
// Для topups рабочий путь найден: GET /api/v2/topups/{category}. Для giftcards точный путь в документации не зафиксирован,
// поэтому пробуем несколько вариантов (включая список всего типа) и запоминаем рабочий (индекс tplIdx).
export function fzCategoryOf(key) { return CATEGORY[key] || ''; }
export function fzTypeOf(key) { const g = GAMES[key]; return g && g.type === 'gift_cards' ? 'giftcards' : 'topups'; }
const TYPE_NAMES = { topups: ['topups'], giftcards: ['giftcards', 'gift-cards', 'gift_cards'] };
const PATTERNS = [c => '/' + c, c => '/' + c + '/offers', c => '?category_id=' + c, c => '/offers?category_id=' + c, () => ''];
function candidates(type, category) {
  const out = [];
  if (type === 'giftcards') out.push({ path: '/api/v2/giftcards/cards?category_id=' + category, whole: false }); // по документации FazerCards
  for (const t of TYPE_NAMES[type] || [type]) for (let k = 0; k < PATTERNS.length; k++) out.push({ path: '/api/v2/' + t + PATTERNS[k](category), whole: k === PATTERNS.length - 1 });
  return out;
}
function collectOfferIds(node, out, depth) {
  if (!node || depth > 6) return out;
  if (Array.isArray(node)) { for (const x of node) collectOfferIds(x, out, depth + 1); return out; }
  if (typeof node === 'object') {
    for (const k of ['offer_id', 'card_id', 'offerId', 'cardId', 'sku']) if (typeof node[k] === 'string' || typeof node[k] === 'number') out.add(String(node[k]));
    for (const v of Object.values(node)) if (v && typeof v === 'object') collectOfferIds(v, out, depth + 1);
  }
  return out;
}
// найти в общем списке узел нужной категории (category_id / id / slug совпадают) и собрать офферы только из него
function findCategoryNode(node, category, depth) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) { for (const x of node) { const r = findCategoryNode(x, category, depth + 1); if (r) return r; } return null; }
  if (typeof node === 'object') {
    if ([node.category_id, node.id, node.slug].some(v => v === category)) return node;
    for (const v of Object.values(node)) { const r = v && typeof v === 'object' ? findCategoryNode(v, category, depth + 1) : null; if (r) return r; }
  }
  return null;
}
// tplIdx — индекс найденного рабочего варианта (или -1). Возвращает { ids:Set, tplIdx }.
export async function fzListOffers(env, type, category, tplIdx) {
  const all = candidates(type, category);
  const order = tplIdx >= 0 && tplIdx < all.length ? [tplIdx] : all.map((_, i) => i);
  const tried = [];
  for (const i of order) {
    try {
      const d = await call(env, 'GET', all[i].path);
      const root = all[i].whole ? findCategoryNode(d, category, 0) : d;
      const ids = root ? collectOfferIds(root, new Set(), 0) : new Set();
      if (ids.size) return { ids, tplIdx: i };
      const arr = d && (d.items || d.offers || d.data || d.cards);
      const first = Array.isArray(arr) ? arr[0] : null;
      tried.push(all[i].path + ' → без офферов (' + (Array.isArray(arr) ? 'элементов: ' + arr.length + ', первый: ' + JSON.stringify(first || {}).slice(0, 260) : 'поля: ' + Object.keys(d || {}).slice(0, 6).join(',')) + ')');
    } catch (e) { tried.push(all[i].path + ' → ' + (e.status || String(e.message || e).slice(0, 30))); }
  }
  throw new Error(category + ': ' + tried.join('; ').slice(0, 900));
}
