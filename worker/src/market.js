// Продажа аккаунтов: размещение бесплатное. Продавец указывает цену, которую хочет получить; покупатель видит цену + наценку магазина.
// Владелец проверяет и нажимает «Опубликовать» — объявление появляется в каталоге и в канале.
// Объявление хранится как скрытая строка accounts (status='hidden') + строка market_offers с контактами продавца
// (контакты НЕ в accounts, потому что /api/accounts публичный).
import { notify, notifyPhoto, defer } from './notify.js';
import { tgApi, send, esc } from './tgapi.js';

export const FEE = 0;
// Наценка магазина по ступеням цены продавца
export function markup(p) { return p <= 1000 ? 100 : p <= 5000 ? 200 : p <= 10000 ? 300 : 500; }
export const GAMES = ['MLBB', 'PUBG', 'Free Fire', 'Genshin', 'Brawl Stars', 'Другая игра'];
const MAX_PHOTOS = 6, MAX_PHOTO_BYTES = 450 * 1024, MAX_RECEIPT_BYTES = 1500 * 1024;
const MIMES = ['image/jpeg', 'image/webp', 'image/png'];
const SITE = 'https://diamond.kg/';
const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
let ready = false;

export async function ensureMarket(env) {
  if (ready) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS market_offers (code TEXT PRIMARY KEY, account_id INTEGER NOT NULL, secret TEXT NOT NULL, contact TEXT NOT NULL, tg_chat INTEGER, tg_user TEXT, ip TEXT, status TEXT NOT NULL DEFAULT 'draft', receipt_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)").run();
  try { await env.DB.prepare('ALTER TABLE market_offers ADD COLUMN seller_price INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* колонка уже есть */ }
  ready = true;
}

function rand(n, alphabet) {
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return [...b].map(x => alphabet[x % alphabet.length]).join('');
}
function b64(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function safeEq(a, b) {
  a = String(a); b = String(b); if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}

// ---------- подача объявления ----------
// b: { game, title, price, description, contact }; who: { ip } или { tg_chat, tg_user }
export async function createOffer(env, who, b) {
  await ensureMarket(env);
  const game = GAMES.includes(b.game) ? b.game : '';
  const title = clean(b.title, 80), contact = clean(b.contact, 80), description = clean(b.description, 1500);
  const price = Math.floor(Number(b.price) || 0);
  if (!game) return { error: 'Выберите игру', status: 400 };
  if (title.length < 3) return { error: 'Напишите название объявления (например, «Mythic Glory, 120 скинов»)', status: 400 };
  if (price < 100 || price > 10000000) return { error: 'Укажите, сколько хотите получить, в сомах (от 100)', status: 400 };
  if (contact.length < 5) return { error: 'Укажите контакт: номер WhatsApp или @username в Telegram', status: 400 };
  // защита от спама: не больше 5 объявлений в час с одного источника
  const key = who.tg_chat ? ['tg_chat', who.tg_chat] : ['ip', who.ip || 'x'];
  const since = Date.now() - 3600000;
  const c = await env.DB.prepare(`SELECT COUNT(*) AS c FROM market_offers WHERE ${key[0]} = ? AND created_at > ?`).bind(key[1], since).first();
  if (c && c.c >= 5) return { error: 'Слишком много объявлений за час. Попробуйте позже.', status: 429 };
  const now = Date.now();
  const fullTitle = game === 'MLBB' ? title : game + ' · ' + title;
  const acc = await env.DB.prepare(
    `INSERT INTO accounts (title,title_ky,price,rank,level,heroes,skins,description,description_ky,seo_ru,seo_ky,status,sort,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(fullTitle, '', price + markup(price), '', 0, 0, 0, description, '', '', '', 'hidden', now, now, now).run();
  const code = 'AC' + rand(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'), secret = rand(20, 'abcdef0123456789');
  await env.DB.prepare('INSERT INTO market_offers (code,account_id,secret,contact,tg_chat,tg_user,ip,status,created_at,updated_at,seller_price) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(code, acc.meta.last_row_id, secret, contact, who.tg_chat || null, who.tg_user || null, who.ip || '', 'draft', now, now, price).run();
  return { ok: true, code, secret, seller_price: price, markup: markup(price), price: price + markup(price) };
}

async function getOffer(env, code, secret) {
  await ensureMarket(env);
  const o = await env.DB.prepare('SELECT * FROM market_offers WHERE code = ?').bind(clean(code, 20)).first();
  if (!o || !safeEq(o.secret, secret || '')) return null;
  return o;
}

export async function addOfferPhoto(env, code, secret, mime, buf) {
  const o = await getOffer(env, code, secret);
  if (!o) return { error: 'Объявление не найдено', status: 404 };
  if (!['draft', 'review'].includes(o.status)) return { error: 'Объявление уже обработано', status: 409 };
  if (!MIMES.includes(mime)) return { error: 'Только JPEG, WebP или PNG', status: 400 };
  if (!buf.byteLength) return { error: 'Пустой файл', status: 400 };
  if (buf.byteLength > MAX_PHOTO_BYTES) return { error: 'Фото слишком большое (макс. 450 КБ)', status: 413 };
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(MAX(pos),-1) AS mx FROM photos WHERE account_id = ?').bind(o.account_id).first();
  if (cnt.c >= MAX_PHOTOS) return { error: 'Максимум ' + MAX_PHOTOS + ' фото', status: 400 };
  await env.DB.prepare('INSERT INTO photos (account_id,pos,mime,data,created_at) VALUES (?,?,?,?,?)').bind(o.account_id, cnt.mx + 1, mime, b64(buf), Date.now()).run();
  return { ok: true, count: cnt.c + 1 };
}

// Отправка объявления на проверку (без оплаты и чека) → владельцу с кнопками
export async function submitOffer(env, code, secret) {
  const o = await getOffer(env, code, secret);
  if (!o) return { error: 'Объявление не найдено', status: 404 };
  if (!['draft', 'review'].includes(o.status)) return { error: 'Объявление уже обработано', status: 409 };
  const ph = await env.DB.prepare('SELECT COUNT(*) AS c FROM photos WHERE account_id = ?').bind(o.account_id).first();
  if (!ph.c) return { error: 'Добавьте хотя бы одно фото аккаунта', status: 400 };
  const now = Date.now();
  const lock = await env.DB.prepare("UPDATE market_offers SET status = 'review', receipt_at = ?, updated_at = ? WHERE code = ? AND status = 'draft'").bind(now, now, o.code).run();
  if (lock.meta.changes) {
    const a = await env.DB.prepare('SELECT title, price, description FROM accounts WHERE id = ?').bind(o.account_id).first();
    const sp = o.seller_price || (a.price - markup(a.price));
    const text = `🆕 Объявление ${o.code} на проверку\n${a.title}\nПродавец хочет получить: ${sp} сом\nНаценка: +${a.price - sp} сом\nПокупатель увидит: ${a.price} сом\nПродавец: ${o.contact}${o.tg_user ? ' (' + o.tg_user + ')' : ''}\nФото: ${ph.c}. Открыть: админка → Аккаунты (скрытый).\n\n${a.description ? a.description.slice(0, 300) : ''}`;
    await defer(env, notify(env, text, offerButtons(o.code)));
  }
  return { ok: true };
}

// Старый маршрут чека (для закешированных страниц): принимает чек, но оплата больше не нужна
export async function submitOfferReceipt(env, code, secret) { return submitOffer(env, code, secret); }

export const offerButtons = code => ({ inline_keyboard: [[{ text: '✅ Опубликовать', callback_data: 'mp:' + code }, { text: '❌ Отклонить', callback_data: 'mr:' + code }]] });

// ---------- решение владельца ----------
export async function publishOffer(env, code) {
  await ensureMarket(env);
  const o = await env.DB.prepare('SELECT * FROM market_offers WHERE code = ?').bind(clean(code, 20)).first();
  if (!o) return { error: 'Объявление не найдено', status: 404 };
  if (o.status !== 'review') return { error: 'Уже обработано (' + o.status + ')', status: 409 };
  const now = Date.now();
  const lock = await env.DB.prepare("UPDATE market_offers SET status = 'published', updated_at = ? WHERE code = ? AND status = 'review'").bind(now, o.code).run();
  if (!lock.meta.changes) return { error: 'Уже обработано', status: 409 };
  await env.DB.prepare("UPDATE accounts SET status = 'available', sort = ?, updated_at = ? WHERE id = ?").bind(now, now, o.account_id).run();
  const ap = await env.DB.prepare('SELECT price FROM accounts WHERE id = ?').bind(o.account_id).first();
  const sp = o.seller_price || (ap ? ap.price - markup(ap.price) : 0);
  if (o.tg_chat) await send(env, o.tg_chat, `✅ <b>Ваше объявление ${esc(o.code)} опубликовано</b>\nОно в каталоге на diamond.kg и в нашем канале. Когда появится покупатель, мы свяжемся с вами. Размещение бесплатно: после сделки вы получите ${sp} сом.`);
  const ch = await postToChannel(env, o.account_id, o.code);
  if (!ch.ok) await notify(env, `⚠️ Объявление ${o.code} опубликовано на сайте, но в канал не ушло: ${ch.reason}. Проверьте, что бот добавлен администратором канала.`);
  return { ok: true };
}

export async function rejectOffer(env, code) {
  await ensureMarket(env);
  const o = await env.DB.prepare('SELECT * FROM market_offers WHERE code = ?').bind(clean(code, 20)).first();
  if (!o) return { error: 'Объявление не найдено', status: 404 };
  if (o.status !== 'review') return { error: 'Уже обработано (' + o.status + ')', status: 409 };
  const lock = await env.DB.prepare("UPDATE market_offers SET status = 'rejected', updated_at = ? WHERE code = ? AND status = 'review'").bind(Date.now(), o.code).run();
  if (!lock.meta.changes) return { error: 'Уже обработано', status: 409 };
  if (o.tg_chat) await send(env, o.tg_chat, `❌ <b>Объявление ${esc(o.code)} не опубликовано</b>\nНапишите нам в WhatsApp +996 555 920 204, подскажем, что исправить.`);
  return { ok: true };
}

// ---------- канал ----------
export async function postToChannel(env, accountId, code) {
  const channel = env.TG_CHANNEL || '@topupdiamondskg';
  const token = env.TG_SHOP_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, reason: 'нет токена бота' };
  const a = await env.DB.prepare('SELECT title, price, description FROM accounts WHERE id = ?').bind(accountId).first();
  const p = await env.DB.prepare('SELECT id FROM photos WHERE account_id = ? ORDER BY pos, id LIMIT 1').bind(accountId).first();
  if (!a) return { ok: false, reason: 'нет объявления' };
  const caption = `🎮 <b>${esc(a.title)}</b>\n💰 ${Number(a.price).toLocaleString('ru-RU').replace(/ /g, ' ')} сом\n\n${esc((a.description || '').slice(0, 600))}\n\n🛡 Сделка через гаранта Diamond.kg. Подробности и все фото: ${SITE}`.slice(0, 1020);
  const markup = { inline_keyboard: [[{ text: '🛒 Смотреть и купить', url: SITE }]] };
  const base = env.origin || '';
  let r = null;
  if (p && base) r = await tgApi(env, 'sendPhoto', { chat_id: channel, photo: `${base}/img/${p.id}`, caption, parse_mode: 'HTML', reply_markup: markup }, 15000, token);
  if (!r || !r.ok) r = await tgApi(env, 'sendMessage', { chat_id: channel, text: caption, parse_mode: 'HTML', reply_markup: markup, disable_web_page_preview: true }, 10000, token);
  return r && r.ok ? { ok: true } : { ok: false, reason: (r && r.description) || 'нет ответа Telegram' };
}
