// diamond.kg — API каталога аккаунтов (Cloudflare Worker + D1)
// Публично: список/карточки/фото. Админ (по паролю): добавить, изменить, удалить аккаунт и фото.

const ALLOWED_ORIGINS = ['https://diamond.kg', 'https://www.diamond.kg', 'http://localhost:8765', 'http://127.0.0.1:8765'];
const STATUSES = ['available', 'sold', 'hidden'];
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 450 * 1024;
const TOKEN_DAYS = 30;
const enc = new TextEncoder();
import { checkBalance } from './balance.js';
import { loginWithGoogle, getMe, listMyOrders, userFromRequest, adminListUsers } from './auth.js';
import { maybeSendReport } from './report.js';
import { financeSummary, maybeSendWeekly, maybeRemindTaxes } from './finance.js';
import { handleTgUpdate, handleOrdersBotUpdate } from './tgbot.js';
import { clientThread, clientSend, clientUnread, adminSend, adminThreads, adminThread, getBanner, setBanner } from './msgs.js';
import { tgApi, webhookSecret } from './tgapi.js';
import { defer } from './notify.js';
import { ensureMarket, createOffer, addOfferPhoto, submitOffer, submitOfferReceipt } from './market.js';
import { createDeal, viewDeal, dealPaid, dealConfirm, dealProblem, remindDeals } from './deals.js';
import { startFinikOrder, finikWebhook, cleanupFinik, finikReady } from './finik.js';
import { walletInfo, startTopup, startWalletOrder, makeLinkCode, adminWallets, adminWalletHistory, adminWalletOp } from './wallet.js';
import { startGopayOrder, gopayWebhook, cleanupGopay, gopayReady, gopayPublic } from './gopay.js';
import { redeemPromo } from './promo.js';
import { aiChat, aiReady } from './aichat.js';
import { SHOP } from './shop_data.js';
import { hasReview, submitReview, listPublicReviews, adminListReviews, adminSetReview } from './reviews.js';
import { createOrder, saveReceipt, notifyWithoutReceipt, getReceipt, getOrderPublic, listOrders, confirmOrder, refreshOrder, markRefunded, refundToBalance, selfOrder, selfOrders, markManualDone, cancelOrder, blacklistOrder, pollProcessing, handleWebhook, listRecentDeliveries, requestRefund } from './orders.js';

function cors(req) {
  const o = req.headers.get('Origin') || '';
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (ALLOWED_ORIGINS.includes(o)) h['Access-Control-Allow-Origin'] = o;
  return h;
}
function json(req, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(req), ...extra },
  });
}
const err = (req, msg, status = 400) => json(req, { error: msg }, status);

// ---------- токены (HMAC, ключ = ADMIN_PASSWORD) ----------
function b64url(buf) {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function makeToken(env) {
  const exp = String(Date.now() + TOKEN_DAYS * 86400000);
  return exp + '.' + (await hmac(env.ADMIN_PASSWORD, exp));
}
async function isAdmin(req, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const t = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(env.ADMIN_PASSWORD, exp));
}

// ---------- помощники ----------
const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
function fields(b) {
  return {
    title: clean(b.title, 120),
    title_ky: clean(b.title_ky, 120),
    price: num(b.price, 100000000),
    rank: clean(b.rank, 60),
    level: num(b.level, 1000),
    heroes: num(b.heroes, 1000),
    skins: num(b.skins, 10000),
    description: clean(b.description, 4000),
    description_ky: clean(b.description_ky, 4000),
    seo_ru: clean(b.seo_ru, 2000),
    seo_ky: clean(b.seo_ky, 2000),
    status: STATUSES.includes(b.status) ? b.status : 'available',
  };
}
async function withPhotos(env, rows) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const { results } = await env.DB.prepare(
    `SELECT id, account_id FROM photos WHERE account_id IN (${ids.map(() => '?').join(',')}) ORDER BY pos, id`
  ).bind(...ids).all();
  const map = {};
  for (const p of results) (map[p.account_id] ||= []).push(p.id);
  return rows.map(r => ({ ...r, photos: map[r.id] || [] }));
}
function toBase64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---------- роутер ----------
export default {
  async fetch(req, env0, ctx) {
    const env = Object.create(env0); env.ctx = ctx; // ctx нужен для фоновой отправки уведомлений
    const url = new URL(req.url);
    env.origin = url.origin; // нужен для публикации фото в канал
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const m = req.method;
    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

    try {
      // фото (публично, кэшируется навсегда — id не меняется)
      let mm = path.match(/^\/img\/(\d+)$/);
      if (mm && m === 'GET') {
        const p = await env.DB.prepare('SELECT mime, data FROM photos WHERE id = ?').bind(Number(mm[1])).first();
        if (!p) return new Response('Not found', { status: 404, headers: cors(req) });
        return new Response(fromBase64(p.data), {
          headers: { 'Content-Type': p.mime, 'Cache-Control': 'public, max-age=31536000, immutable', ...cors(req) },
        });
      }

      // вход клиентов через Google
      if (path === '/api/auth/google' && m === 'POST') {
        const b = await req.json().catch(() => ({}));
        const r = await loginWithGoogle(env, b.credential);
        return r.error ? err(req, r.error, r.status || 400) : json(req, r);
      }
      if (path === '/api/me' && m === 'GET') {
        const sub = await userFromRequest(req, env);
        if (!sub) return err(req, 'Нужен вход', 401);
        const r = await getMe(env, sub);
        return r.error ? err(req, r.error, r.status || 400) : json(req, r);
      }
      if (path === '/api/my/orders' && m === 'GET') {
        const sub = await userFromRequest(req, env);
        if (!sub) return err(req, 'Нужен вход', 401);
        return json(req, await listMyOrders(env, sub));
      }

      // ----- баннер сайта и чат по заказу -----
      if (path === '/api/banner' && m === 'GET') return json(req, await getBanner(env), 200, { 'Cache-Control': 'public, max-age=20' });
      if (path === '/api/my/msgs/unread' && m === 'GET') {
        const sub = await userFromRequest(req, env);
        if (!sub) return err(req, 'Нужен вход', 401);
        return json(req, await clientUnread(env, sub));
      }
      let mq = path.match(/^\/api\/orders\/(DK[A-Z0-9]{8})\/msgs$/);
      if (mq) {
        const sub = await userFromRequest(req, env);
        if (!sub) return err(req, 'Нужен вход', 401);
        if (m === 'GET') { const r = await clientThread(env, sub, mq[1]); return r.error ? err(req, r.error, r.status || 400) : json(req, r); }
        if (m === 'POST') { const b = await req.json().catch(() => ({})); const r = await clientSend(env, sub, mq[1], b.text); return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201); }
      }

      // ----- баланс клиента (нужен вход через Google) -----
      if (path === '/api/wallet' && m === 'GET') {
        const sub = await userFromRequest(req, env);
        if (!sub) return err(req, 'Нужен вход', 401);
        return json(req, await walletInfo(env, sub));
      }
      if (path === '/api/wallet/topup' && m === 'POST') {
        const sub = await userFromRequest(req, env);
        if (!sub) return err(req, 'Нужен вход', 401);
        const b = await req.json().catch(() => ({}));
        const r = await startTopup(env, 'g:' + sub, b.amount, null);
        return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201);
      }
      if (path === '/api/wallet/tg-code' && m === 'POST') {
        const sub = await userFromRequest(req, env);
        if (!sub) return err(req, 'Нужен вход', 401);
        return json(req, await makeLinkCode(env, sub));
      }
      if (path === '/api/orders/wallet' && m === 'POST') {
        const sub = await userFromRequest(req, env);
        if (!sub) return err(req, 'Нужен вход', 401);
        const b = await req.json().catch(() => ({}));
        const r = await startWalletOrder(env, req.headers.get('CF-Connecting-IP') || '', b, 'g:' + sub, sub);
        return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201);
      }

      // вход
      if (path === '/api/login' && m === 'POST') {
        if (!env.ADMIN_PASSWORD) return err(req, 'ADMIN_PASSWORD не задан в Cloudflare', 500);
        const b = await req.json().catch(() => ({}));
        const ok = safeEqual(String(b.password || ''), String(env.ADMIN_PASSWORD));
        if (!ok) { await new Promise(r => setTimeout(r, 1000)); return err(req, 'Неверный пароль', 401); }
        return json(req, { token: await makeToken(env) });
      }

      // ----- заказы (публично) -----
      if (path === '/api/orders' && m === 'POST') {
        const b = await req.json().catch(() => ({}));
        const r = await createOrder(env, req.headers.get('CF-Connecting-IP') || '', b, await userFromRequest(req, env));
        return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201);
      }
      // оплата через Finik: создаём заказ и возвращаем ссылку на страницу оплаты; вебхук подтверждает оплату сам
      if (path === '/api/orders/finik' && m === 'POST') {
        const b = await req.json().catch(() => ({}));
        const r = await startFinikOrder(env, req.headers.get('CF-Connecting-IP') || '', b, await userFromRequest(req, env));
        return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201);
      }
      // оплата через GoPay (ELQR): то же самое, вебхук events_url подтверждает оплату сам
      if (path === '/api/orders/gopay' && m === 'POST') {
        const b = await req.json().catch(() => ({}));
        const r = await startGopayOrder(env, req.headers.get('CF-Connecting-IP') || '', b, await userFromRequest(req, env));
        return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201);
      }
      // ИИ-чат: приём заказа в диалоге (история приходит с клиента, цены и оплата считаются на сервере)
      if (path === '/api/chat/status' && m === 'GET') return json(req, { enabled: aiReady(env), ai: aiReady(env), pay: gopayPublic(env) ? 'gopay' : (finikReady(env) ? 'finik' : '') }, 200, { 'Cache-Control': 'public, max-age=60' });
      if (path === '/api/chat/catalog' && m === 'GET') return json(req, { shop: SHOP }, 200, { 'Cache-Control': 'public, max-age=300' });
      if (path === '/api/chat' && m === 'POST') {
        const b = await req.json().catch(() => ({}));
        const ip = req.headers.get('CF-Connecting-IP') || '';
        const r = await aiChat(env, { history: b.messages, ip, userId: await userFromRequest(req, env), channel: 'web', sid: String(b.sid || '').slice(0, 40), qa: true });
        return r.error ? err(req, r.error, r.status || 400) : json(req, r);
      }
      if (path === '/api/gopay/status' && m === 'GET') return json(req, { enabled: gopayPublic(env), ready: gopayReady(env) }, 200, { 'Cache-Control': 'public, max-age=60' });
      if (path === '/api/gopay/webhook' && m === 'POST') {
        const r = await gopayWebhook(env, req);
        return new Response(r.body, { status: r.status });
      }
      if (path === '/api/finik/status' && m === 'GET') return json(req, { enabled: finikReady(env) }, 200, { 'Cache-Control': 'public, max-age=60' });
      if (path === '/api/finik/webhook' && m === 'POST') {
        const r = await finikWebhook(env, req);
        return new Response(r.body, { status: r.status });
      }
      // промокод розыгрыша: бесплатный Weekly Diamond Pass (одноразовые коды, срок в таблице promo_codes)
      if (path === '/api/promo/redeem' && m === 'POST') {
        const b = await req.json().catch(() => ({}));
        const r = await redeemPromo(env, req.headers.get('CF-Connecting-IP') || 'anon', b, await userFromRequest(req, env));
        return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201);
      }
      mm = path.match(/^\/api\/orders\/([A-Z0-9]{4,20})\/receipt$/);
      if (mm && m === 'POST') {
        const len = Number(req.headers.get('Content-Length') || 0);
        if (len > 1600 * 1024) return err(req, 'Файл слишком большой (макс. 1,5 МБ)', 413);
        const r = await saveReceipt(env, mm[1], await req.arrayBuffer());
        return r.error ? err(req, r.error, r.status || 400) : json(req, r);
      }
      mm = path.match(/^\/api\/orders\/([A-Z0-9]{4,20})\/refund-request$/);
      if (mm && m === 'POST') {
        const b = await req.json().catch(() => ({}));
        const r = await requestRefund(env, mm[1], String(b.s || ''), await userFromRequest(req, env), String(b.choice || ''));
        return r.error ? err(req, r.error, r.status || 400) : json(req, r);
      }
      mm = path.match(/^\/api\/orders\/([A-Z0-9]{4,20})\/review$/);
      if (mm && m === 'POST') {
        const b = await req.json().catch(() => ({}));
        const r = await submitReview(env, mm[1], b, await userFromRequest(req, env));
        return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201);
      }
      if (path === '/api/recent' && m === 'GET') {
        return json(req, await listRecentDeliveries(env, url.searchParams.get('game') || ''), 200, { 'Cache-Control': 'public, max-age=30' });
      }
      if (path === '/api/reviews' && m === 'GET') {
        return json(req, await listPublicReviews(env, url.searchParams.get('game') || '', url.searchParams.get('limit')), 200, { 'Cache-Control': 'public, max-age=60' });
      }
      mm = path.match(/^\/api\/orders\/([A-Z0-9]{4,20})\/notify$/);
      if (mm && m === 'POST') {
        const r = await notifyWithoutReceipt(env, mm[1]);
        return r.error ? err(req, r.error, r.status || 400) : json(req, r);
      }
      mm = path.match(/^\/api\/orders\/([A-Z0-9]{4,20})$/);
      if (mm && m === 'GET') {
        const o = await getOrderPublic(env, mm[1], url.searchParams.get('s'));
        if (o) o.reviewed = await hasReview(env, mm[1]);
        return o ? json(req, o) : err(req, 'Заказ не найден', 404);
      }
      // вебхук FazerCards (подпись проверяется внутри)
      if (path === '/api/fz/webhook' && m === 'POST') {
        const raw = await req.text();
        const r = await handleWebhook(env, raw, req.headers.get('X-Webhook-Signature'));
        return r.error ? err(req, r.error, r.status || 400) : json(req, { ok: true });
      }

      // вебхук Telegram-бота магазина (секрет проверяется по заголовку)
      if (path === '/api/tg/webhook' && m === 'POST') {
        if (!env.TG_SHOP_BOT_TOKEN || !safeEqual(req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '', await webhookSecret(env))) return new Response('forbidden', { status: 403 });
        const u = await req.json().catch(() => null);
        if (u) await defer(env, handleTgUpdate(env, u));
        return new Response('ok');
      }

      // вебхук бота уведомлений (кнопки «Подтвердить/Отказать» под заказами)
      if (path === '/api/tg/orders-webhook' && m === 'POST') {
        if (!env.TELEGRAM_BOT_TOKEN || !safeEqual(req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '', await webhookSecret(env))) return new Response('forbidden', { status: 403 });
        const u = await req.json().catch(() => null);
        if (u) await defer(env, handleOrdersBotUpdate(env, u));
        return new Response('ok');
      }

      // продажа аккаунтов через гаранта (публично; доступ к своему объявлению по секрету)
      if (path === '/api/market/offers' && m === 'POST') {
        const b = await req.json().catch(() => ({}));
        const r = await createOffer(env, { ip: req.headers.get('CF-Connecting-IP') || '' }, b);
        return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201);
      }
      mm = path.match(/^\/api\/market\/offers\/(AC[A-Z0-9]{8})\/submit$/);
      if (mm && m === 'POST') {
        const r = await submitOffer(env, mm[1], url.searchParams.get('s') || '');
        return r.error ? err(req, r.error, r.status || 400) : json(req, r);
      }
      mm = path.match(/^\/api\/market\/offers\/(AC[A-Z0-9]{8})\/(photos|receipt)$/);
      if (mm && m === 'POST') {
        const len = Number(req.headers.get('Content-Length') || 0);
        if (len > 1600 * 1024) return err(req, 'Файл слишком большой', 413);
        const mime = (req.headers.get('Content-Type') || '').split(';')[0];
        const buf = await req.arrayBuffer(), sec = url.searchParams.get('s') || '';
        const r = mm[2] === 'photos' ? await addOfferPhoto(env, mm[1], sec, mime, buf) : await submitOfferReceipt(env, mm[1], sec, mime, buf);
        return r.error ? err(req, r.error, r.status || 400) : json(req, r);
      }

      // сделки по аккаунтам (покупатель; доступ по секрету)
      if (path === '/api/market/deals' && m === 'POST') {
        const b = await req.json().catch(() => ({}));
        const r = await createDeal(env, { ip: req.headers.get('CF-Connecting-IP') || '' }, b);
        return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201);
      }
      mm = path.match(/^\/api\/market\/deals\/(DL[A-Z0-9]{8})(?:\/(paid|confirm|problem))?$/);
      if (mm) {
        const sec = url.searchParams.get('s') || '';
        let r = null;
        if (m === 'GET' && !mm[2]) r = await viewDeal(env, mm[1], sec);
        else if (m === 'POST' && mm[2] === 'paid') r = await dealPaid(env, mm[1], sec);
        else if (m === 'POST' && mm[2] === 'confirm') r = await dealConfirm(env, mm[1], sec);
        else if (m === 'POST' && mm[2] === 'problem') r = await dealProblem(env, mm[1], sec);
        if (r) return r.error ? err(req, r.error, r.status || 400) : json(req, r, 200, { 'Cache-Control': 'no-store' });
      }

      // публичный список
      if (path === '/api/accounts' && m === 'GET') {
        const { results } = await env.DB.prepare(
          "SELECT * FROM accounts WHERE status != 'hidden' ORDER BY (status = 'sold'), sort DESC, id DESC"
        ).all();
        let gd = new Set(); try { await ensureMarket(env); const g = await env.DB.prepare("SELECT account_id FROM market_offers WHERE creds_enc IS NOT NULL AND creds_enc != '' AND status = 'published'").all(); gd = new Set(g.results.map(x => x.account_id)); } catch (e) { /* без флага */ }
        for (const a of results) a.gd = gd.has(a.id) ? 1 : 0;
        return json(req, { accounts: await withPhotos(env, results) }, 200, { 'Cache-Control': 'public, max-age=20' });
      }

      // ----- админ -----
      if (path.startsWith('/api/admin')) {
        if (!(await isAdmin(req, env))) return err(req, 'Нужен вход', 401);

        // заказы
        if (path === '/api/admin/orders' && m === 'GET') {
          return json(req, { orders: await listOrders(env, url.searchParams.get('status') || 'all') });
        }
        if (path === '/api/admin/chats' && m === 'GET') return json(req, await adminThreads(env));
        if (path === '/api/admin/banner' && m === 'GET') return json(req, await getBanner(env));
        if (path === '/api/admin/banner' && m === 'POST') { const b = await req.json().catch(() => ({})); return json(req, await setBanner(env, b.text)); }
        { const ma = path.match(/^\/api\/admin\/chats\/(DK[A-Z0-9]{8})$/);
          if (ma && m === 'GET') { const r = await adminThread(env, ma[1]); return r.error ? err(req, r.error, 400) : json(req, r); }
          if (ma && m === 'POST') { const b = await req.json().catch(() => ({})); const r = await adminSend(env, ma[1], b.text); return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201); } }
        if (path === '/api/admin/finance' && m === 'GET') return json(req, await financeSummary(env));
        if (path === '/api/admin/tg' && m === 'GET') {
          let orders = null;
          if (env.TELEGRAM_BOT_TOKEN) {
            const om = await tgApi(env, 'getMe', {}, 10000, env.TELEGRAM_BOT_TOKEN), ow = await tgApi(env, 'getWebhookInfo', {}, 10000, env.TELEGRAM_BOT_TOKEN);
            orders = { bot: om && om.result && om.result.username, webhook: ow && ow.result && ow.result.url || '', lastError: ow && ow.result && ow.result.last_error_message || '' };
          }
          if (!env.TG_SHOP_BOT_TOKEN) return json(req, { configured: false, orders });
          const me = await tgApi(env, 'getMe'), wh = await tgApi(env, 'getWebhookInfo');
          return json(req, { orders, configured: true, bot: me && me.result && me.result.username, webhook: wh && wh.result && wh.result.url || '', pending: wh && wh.result && wh.result.pending_update_count, lastError: wh && wh.result && wh.result.last_error_message || '' });
        }
        if (path === '/api/admin/tg/setup' && m === 'POST') {
          if (!env.TG_SHOP_BOT_TOKEN) return err(req, 'Секрет TG_SHOP_BOT_TOKEN не задан в Cloudflare', 400);
          const r = await tgApi(env, 'setWebhook', { url: url.origin + '/api/tg/webhook', secret_token: await webhookSecret(env), allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });
          await tgApi(env, 'setChatMenuButton', { menu_button: { type: 'commands' } }); // убираем кнопку «Открыть сайт» старого сервиса
          await tgApi(env, 'setMyCommands', { commands: [{ command: 'start', description: 'Меню' }, { command: 'orders', description: 'Мои заказы' }, { command: 'help', description: 'Поддержка' }] });
          return r && r.ok ? json(req, { ok: true }) : err(req, (r && r.description) || 'Не удалось подключить', 400);
        }
        if (path === '/api/admin/tg/orders-setup' && m === 'POST') {
          if (!env.TELEGRAM_BOT_TOKEN) return err(req, 'Секрет TELEGRAM_BOT_TOKEN не задан', 400);
          const r = await tgApi(env, 'setWebhook', { url: url.origin + '/api/tg/orders-webhook', secret_token: await webhookSecret(env), allowed_updates: ['message', 'callback_query'] }, 10000, env.TELEGRAM_BOT_TOKEN);
          return r && r.ok ? json(req, { ok: true }) : err(req, (r && r.description) || 'Не удалось подключить', 400);
        }
        if (path === '/api/admin/tg/orders-remove' && m === 'POST') {
          const r = await tgApi(env, 'deleteWebhook', {}, 10000, env.TELEGRAM_BOT_TOKEN);
          return r && r.ok ? json(req, { ok: true }) : err(req, (r && r.description) || 'Не удалось отключить', 400);
        }
        if (path === '/api/admin/tg/remove' && m === 'POST') {
          const r = await tgApi(env, 'deleteWebhook', {});
          return r && r.ok ? json(req, { ok: true }) : err(req, (r && r.description) || 'Не удалось отключить', 400);
        }
        if (path === '/api/admin/users' && m === 'GET') return json(req, await adminListUsers(env));
        if (path === '/api/admin/wallets' && m === 'GET') return json(req, await adminWallets(env, url.searchParams.get('q') || ''));
        if (path === '/api/admin/wallet' && m === 'GET') {
          const r = await adminWalletHistory(env, url.searchParams.get('owner') || '');
          return r.error ? err(req, r.error, r.status || 400) : json(req, r);
        }
        if (path === '/api/admin/self-catalog' && m === 'GET') {
          return json(req, { games: SHOP.map(g => ({ id: g.id, name: g.name, hint: g.hint || '', none: !!g.none, user: !!g.user, mlbb: !!g.mlbb, zone: !!g.zone, servers: g.servers || null, packs: g.packs.map(p => ({ k: p.k, l: p.l })) })) });
        }
        if (path === '/api/admin/self-orders' && m === 'GET') return json(req, await selfOrders(env));
        if (path === '/api/admin/self-order' && m === 'POST') {
          const r = await selfOrder(env, await req.json().catch(() => ({})));
          return r.error ? err(req, r.error, r.status || 400) : json(req, r);
        }
        if (path === '/api/admin/wallet' && m === 'POST') {
          const r = await adminWalletOp(env, await req.json().catch(() => ({})));
          return r.error ? err(req, r.error, r.status || 400) : json(req, r);
        }
        if (path === '/api/admin/reviews' && m === 'GET') return json(req, await adminListReviews(env, url.searchParams.get('status') || 'all'));
        mm = path.match(/^\/api\/admin\/reviews\/([A-Za-z0-9]{4,40})\/(approve|hide|pending)$/);
        if (mm && m === 'POST') {
          const r = await adminSetReview(env, mm[1], mm[2]);
          return r.error ? err(req, r.error, r.status || 400) : json(req, r);
        }
        mm = path.match(/^\/api\/admin\/orders\/([A-Z0-9]{4,20})\/receipt$/);
        if (mm && m === 'GET') {
          const rc = await getReceipt(env, mm[1]);
          if (!rc) return err(req, 'Чека нет', 404);
          return new Response(rc.bytes, { headers: { 'Content-Type': rc.mime, 'Cache-Control': 'private, max-age=3600', ...cors(req) } });
        }
        mm = path.match(/^\/api\/admin\/orders\/([A-Z0-9]{4,20})\/(confirm|refresh|refunded|to-balance|manual-done|cancel|blacklist)$/);
        if (mm && m === 'POST') {
          const fn = { confirm: confirmOrder, refresh: refreshOrder, refunded: markRefunded, 'to-balance': refundToBalance, 'manual-done': markManualDone, cancel: cancelOrder, blacklist: blacklistOrder }[mm[2]];
          const r = await fn(env, mm[1]);
          return r.error ? err(req, r.error, r.status || 400) : json(req, r);
        }

        if (path === '/api/admin/accounts' && m === 'GET') {
          const { results } = await env.DB.prepare('SELECT * FROM accounts ORDER BY sort DESC, id DESC').all();
          return json(req, { accounts: await withPhotos(env, results) });
        }
        if (path === '/api/admin/accounts' && m === 'POST') {
          const f = fields(await req.json().catch(() => ({})));
          if (!f.title) return err(req, 'Укажите название');
          const now = Date.now();
          const r = await env.DB.prepare(
            `INSERT INTO accounts (title,title_ky,price,rank,level,heroes,skins,description,description_ky,seo_ru,seo_ky,status,sort,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(f.title, f.title_ky, f.price, f.rank, f.level, f.heroes, f.skins, f.description, f.description_ky, f.seo_ru, f.seo_ky, f.status, now, now, now).run();
          return json(req, { id: r.meta.last_row_id }, 201);
        }

        mm = path.match(/^\/api\/admin\/accounts\/(\d+)$/);
        if (mm && m === 'PUT') {
          const id = Number(mm[1]);
          const f = fields(await req.json().catch(() => ({})));
          if (!f.title) return err(req, 'Укажите название');
          await env.DB.prepare(
            `UPDATE accounts SET title=?,title_ky=?,price=?,rank=?,level=?,heroes=?,skins=?,description=?,description_ky=?,seo_ru=?,seo_ky=?,status=?,updated_at=? WHERE id=?`
          ).bind(f.title, f.title_ky, f.price, f.rank, f.level, f.heroes, f.skins, f.description, f.description_ky, f.seo_ru, f.seo_ky, f.status, Date.now(), id).run();
          return json(req, { ok: true });
        }
        if (mm && m === 'DELETE') {
          const id = Number(mm[1]);
          await env.DB.batch([
            env.DB.prepare('DELETE FROM photos WHERE account_id = ?').bind(id),
            env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(id),
          ]);
          return json(req, { ok: true });
        }

        mm = path.match(/^\/api\/admin\/accounts\/(\d+)\/photos$/);
        if (mm && m === 'POST') {
          const id = Number(mm[1]);
          const mime = (req.headers.get('Content-Type') || '').split(';')[0];
          if (!['image/jpeg', 'image/webp', 'image/png'].includes(mime)) return err(req, 'Только JPEG, WebP или PNG');
          const buf = await req.arrayBuffer();
          if (!buf.byteLength) return err(req, 'Пустой файл');
          if (buf.byteLength > MAX_PHOTO_BYTES) return err(req, 'Фото слишком большое (макс. 450 КБ после сжатия)', 413);
          const acc = await env.DB.prepare('SELECT id FROM accounts WHERE id = ?').bind(id).first();
          if (!acc) return err(req, 'Аккаунт не найден', 404);
          const cnt = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(MAX(pos),-1) AS mx FROM photos WHERE account_id = ?').bind(id).first();
          if (cnt.c >= MAX_PHOTOS) return err(req, 'Максимум ' + MAX_PHOTOS + ' фото');
          const r = await env.DB.prepare('INSERT INTO photos (account_id,pos,mime,data,created_at) VALUES (?,?,?,?,?)')
            .bind(id, cnt.mx + 1, mime, toBase64(buf), Date.now()).run();
          return json(req, { id: r.meta.last_row_id }, 201);
        }

        mm = path.match(/^\/api\/admin\/accounts\/(\d+)\/photo-order$/);
        if (mm && m === 'PUT') {
          const id = Number(mm[1]);
          const b = await req.json().catch(() => ({}));
          const order = Array.isArray(b.order) ? b.order.map(Number).filter(Boolean).slice(0, MAX_PHOTOS) : [];
          if (order.length) await env.DB.batch(order.map((pid, i) => env.DB.prepare('UPDATE photos SET pos = ? WHERE id = ? AND account_id = ?').bind(i, pid, id)));
          return json(req, { ok: true });
        }

        mm = path.match(/^\/api\/admin\/photos\/(\d+)$/);
        if (mm && m === 'DELETE') {
          await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(Number(mm[1])).run();
          return json(req, { ok: true });
        }
      }

      if (path === '/' && m === 'GET') return json(req, { ok: true, service: 'diamond-kg-api' });
      return err(req, 'Not found', 404);
    } catch (e) {
      return err(req, 'Ошибка сервера: ' + (e && e.message ? e.message : e), 500);
    }
  },
  // раз в минуту опрашиваем FazerCards по заказам, которые ещё в обработке
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pollProcessing(env).catch(() => {}));
    ctx.waitUntil(checkBalance(env).catch(() => {}));
    ctx.waitUntil(maybeSendReport(env).catch(() => {}));
    ctx.waitUntil(maybeSendWeekly(env).catch(() => {}));
    ctx.waitUntil(maybeRemindTaxes(env).catch(() => {}));
    ctx.waitUntil(remindDeals(env).catch(() => {}));
    ctx.waitUntil(cleanupFinik(env).catch(() => {}));
    ctx.waitUntil(cleanupGopay(env).catch(() => {}));
  },
};
