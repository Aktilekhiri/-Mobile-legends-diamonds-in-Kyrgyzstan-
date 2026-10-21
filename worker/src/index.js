// diamond.kg — API каталога аккаунтов (Cloudflare Worker + D1)
// Публично: список/карточки/фото. Админ (по паролю): добавить, изменить, удалить аккаунт и фото.

const ALLOWED_ORIGINS = ['https://diamond.kg', 'https://www.diamond.kg', 'http://localhost:8765', 'http://127.0.0.1:8765'];
const STATUSES = ['available', 'sold', 'hidden'];
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 450 * 1024;
const TOKEN_DAYS = 30;
const enc = new TextEncoder();
import { checkBalance } from './balance.js';
import { createOrder, saveReceipt, notifyWithoutReceipt, getReceipt, getOrderPublic, listOrders, confirmOrder, refreshOrder, markRefunded, markManualDone, cancelOrder, pollProcessing, handleWebhook } from './orders.js';

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
  async fetch(req, env) {
    const url = new URL(req.url);
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
        const r = await createOrder(env, req.headers.get('CF-Connecting-IP') || '', b);
        return r.error ? err(req, r.error, r.status || 400) : json(req, r, 201);
      }
      mm = path.match(/^\/api\/orders\/([A-Z0-9]{4,20})\/receipt$/);
      if (mm && m === 'POST') {
        const len = Number(req.headers.get('Content-Length') || 0);
        if (len > 1600 * 1024) return err(req, 'Файл слишком большой (макс. 1,5 МБ)', 413);
        const r = await saveReceipt(env, mm[1], await req.arrayBuffer());
        return r.error ? err(req, r.error, r.status || 400) : json(req, r);
      }
      mm = path.match(/^\/api\/orders\/([A-Z0-9]{4,20})\/notify$/);
      if (mm && m === 'POST') {
        const r = await notifyWithoutReceipt(env, mm[1]);
        return r.error ? err(req, r.error, r.status || 400) : json(req, r);
      }
      mm = path.match(/^\/api\/orders\/([A-Z0-9]{4,20})$/);
      if (mm && m === 'GET') {
        const o = await getOrderPublic(env, mm[1]);
        return o ? json(req, o) : err(req, 'Заказ не найден', 404);
      }
      // вебхук FazerCards (подпись проверяется внутри)
      if (path === '/api/fz/webhook' && m === 'POST') {
        const raw = await req.text();
        const r = await handleWebhook(env, raw, req.headers.get('X-Webhook-Signature'));
        return r.error ? err(req, r.error, r.status || 400) : json(req, { ok: true });
      }

      // публичный список
      if (path === '/api/accounts' && m === 'GET') {
        const { results } = await env.DB.prepare(
          "SELECT * FROM accounts WHERE status != 'hidden' ORDER BY (status = 'sold'), sort DESC, id DESC"
        ).all();
        return json(req, { accounts: await withPhotos(env, results) }, 200, { 'Cache-Control': 'public, max-age=20' });
      }

      // ----- админ -----
      if (path.startsWith('/api/admin')) {
        if (!(await isAdmin(req, env))) return err(req, 'Нужен вход', 401);

        // заказы
        if (path === '/api/admin/orders' && m === 'GET') {
          return json(req, { orders: await listOrders(env, url.searchParams.get('status') || 'all') });
        }
        mm = path.match(/^\/api\/admin\/orders\/([A-Z0-9]{4,20})\/receipt$/);
        if (mm && m === 'GET') {
          const rc = await getReceipt(env, mm[1]);
          if (!rc) return err(req, 'Чека нет', 404);
          return new Response(rc.bytes, { headers: { 'Content-Type': rc.mime, 'Cache-Control': 'private, max-age=3600', ...cors(req) } });
        }
        mm = path.match(/^\/api\/admin\/orders\/([A-Z0-9]{4,20})\/(confirm|refresh|refunded|manual-done|cancel)$/);
        if (mm && m === 'POST') {
          const fn = { confirm: confirmOrder, refresh: refreshOrder, refunded: markRefunded, 'manual-done': markManualDone, cancel: cancelOrder }[mm[2]];
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
  },
};
