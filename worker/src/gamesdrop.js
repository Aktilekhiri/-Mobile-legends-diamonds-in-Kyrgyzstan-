// GamesDrop Partner API (https://gamesdrop.io/en/docs/partner-api). Хост: https://partner.gamesdrop.io
// Авторизация: заголовок Authorization: <Shop Token> (без "Bearer"). Секрет GAMESDROP_TOKEN в Cloudflare.
// Пока только проверка связи (баланс, поиск в каталоге, цена, тестовый заказ на оффер 999 «Steam US»). Реальные покупки не делаются.
const BASE = 'https://partner.gamesdrop.io';

async function gd(env, method, path, body) {
  if (!env.GAMESDROP_TOKEN) throw new Error('GAMESDROP_TOKEN не задан в Cloudflare');
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(BASE + path, { method, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: env.GAMESDROP_TOKEN }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let d = {}; try { d = JSON.parse(t); } catch (e) { d = { raw: t.slice(0, 300) }; }
    return { http: r.status, data: d };
  } finally { clearTimeout(tm); }
}

// Безопасная проверка: ничего не покупает, кроме тестового оффера 999 (только если test_order=true).
export async function gamesdropProbe(env, { search, test_order } = {}) {
  const out = {};
  try {
    const b = await gd(env, 'GET', '/api/v1/offers/balance');
    out.balance = { http: b.http, balance: b.data.balance, currency: b.data.currency, postpaid: b.data.isPostpaid, profile: b.data.balanceProfile, error: b.data.code || b.data.error || undefined };
    const q = String(search || 'standoff').slice(0, 40);
    const s = await gd(env, 'POST', '/api/v1/offers/sync', { search: q, page: 1, limit: 30 });
    const rows = (s.data.rows || s.data.data || []);
    out.catalog = { http: s.http, query: q, count: rows.length, items: rows.slice(0, 30).map(r => ({ offerId: r.offerGroupId, name: [r.productName, r.offerGroupName].filter(Boolean).join(' · '), price: r.price, currency: r.currency, inStock: r.inStock, needUserId: r.isRequiredGameUserId, needServer: r.isRequiredGameServerId })), error: s.data.code || undefined };
    if (test_order) {
      const f = await gd(env, 'POST', '/api/v1/offers/find-one', { offerId: 999 });
      const price = f.data.price != null ? f.data.price : (f.data.offer && f.data.offer.price);
      out.test_find = { http: f.http, price, raw: f.http === 200 ? undefined : f.data };
      if (price != null) {
        const o = await gd(env, 'POST', '/api/v1/offers/create-order', { offerId: 999, price, transactionId: 'DKTEST-' + Date.now(), quantity: 1 });
        out.test_order = { http: o.http, data: o.data };
      }
    }
  } catch (e) { out.error = String(e.message || e); }
  return out;
}
