// Клиент FazerCards REST API.
// ВАЖНО: адрес, заголовок авторизации и формат тела нужно сверить с документацией
// (https://api.fzr.cards/public/docs). Всё, что зависит от документации, собрано в этом файле.
// Станет true, когда запросы ниже сверены с документацией и проверены тестовым заказом.
export const FZ_READY = false;
const BASE = 'https://api.fzr.cards'; // TODO: сверить с документацией

async function call(env, method, path, body, extraHeaders) {
  if (!env.FAZERCARDS_API_KEY) throw new Error('FAZERCARDS_API_KEY не задан в Cloudflare');
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.FAZERCARDS_API_KEY, ...(extraHeaders || {}) }, // TODO: сверить схему авторизации
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = {}; try { data = JSON.parse(text); } catch (e) {}
  if (!r.ok) throw new Error('FazerCards ' + r.status + ': ' + (data.error || data.message || text.slice(0, 160)));
  return data;
}

// Возвращает { id, status, fail_reason }
export async function fzCreateOrder(env, { offerId, playerId, serverId, idempotencyKey }) {
  throw new Error('Подключение к FazerCards ещё не настроено (нужны данные из документации API)');
}
export async function fzGetOrder(env, fzOrderId) {
  throw new Error('Подключение к FazerCards ещё не настроено (нужны данные из документации API)');
}
export { call as _call };
