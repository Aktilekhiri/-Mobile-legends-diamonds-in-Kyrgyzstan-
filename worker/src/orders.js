// Заказы: приём с сайта, подтверждение оплаты админом, выдача через FazerCards, возврат.
import { CATALOGS, GAMES, MAX_AUTO_COST_USD, USD_KGS, OFF_PKGS, MLBB_REGIONS } from './catalog.js';
import { fzCreateOrder, fzGetOrder, FZ_READY } from './fazercards.js';
import { notify, notifyPhoto, defer } from './notify.js';
import { sendOrderMail } from './mail.js';
import { tgNotifyOrder, send, esc } from './tgapi.js';
import { refundOrderToWallet, credit, ownerForOrder, tellOwner, ownerLabel } from './ledger.js';
import { SHOP } from './shop_data.js';

const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const digits = (v, n) => String(v == null ? '' : v).replace(/\D+/g, '').slice(0, n);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  let s = 'DK';
  for (const x of b) s += CODE_CHARS[x % CODE_CHARS.length];
  return s;
}
function newSecret() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  let s = '';
  for (const x of b) s += CODE_CHARS[x % CODE_CHARS.length];
  return s;
}
function safeEq(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const publicView = o => ({
  id: o.id, status: o.status, pkg_label: o.pkg_label, price_kgs: o.price_kgs, region: o.region,
  created_at: o.created_at, finished_at: o.finished_at,
  confirmed_at: o.confirmed_at || 0, refund_req: o.refund_req || '', can_balance: !!(o.user_id || o.tg_chat),
});

// Прибыль в скобках: цена − себестоимость по каталогу (USD × курс). Нет себестоимости в каталоге — ничего не пишем.
function profitText(price, cat) {
  if (!cat || !(cat.cost > 0)) return '';
  const p = Math.round(price - cat.cost * USD_KGS);
  return ` (${p >= 0 ? '+' : '−'}${Math.abs(p)} сом прибыль)`;
}

const GAME_TITLE = {  whiteout: 'Whiteout Survival', lords: 'Lords Mobile', identityv: 'Identity V', fortnite: 'Fortnite Gift Card (ЕС)',mchess: 'Magic Chess Go Go', deltaforce: 'Delta Force', marvel: 'Marvel Rivals', arena: 'Arena Breakout', bloodstrike: 'Blood Strike', hsr: 'Honkai: Star Rail', zzz: 'Zenless Zone Zero', tgstars: 'Telegram Stars', tgpremium: 'Telegram Premium', roblox: 'Roblox Gift Card', steam: 'Steam Gift Card (СНГ)', discord: 'Discord Nitro', netflix: 'Netflix Gift Card (США)', psn: 'PlayStation Gift Card (США)', gplay: 'Google Play Gift Card (США)', apple_us: 'App Store & iTunes (США)', apple_tr: 'App Store & iTunes (Турция)', apple_ru: 'App Store & iTunes (Россия)', nintendo: 'Nintendo eShop Card (США)', valorant: 'Valorant VP (регион RU)', pubg: 'PUBG Mobile', freefire: 'Free Fire', hok: 'Honor of Kings', genshin: 'Genshin Impact', wuwa: 'Wuthering Waves', russia: 'Mobile Legends (Россия)', indonesia: 'Mobile Legends (Индонезия)', turkey: 'Mobile Legends (Турция)', malaysia: 'Mobile Legends (Малайзия)', philippines: 'Mobile Legends (Филиппины)', singapore: 'Mobile Legends (Сингапур)', brazil: 'Mobile Legends (Бразилия)', usa: 'Mobile Legends (США)', global: 'Mobile Legends' };
const gameTitle = region => GAME_TITLE[region] || 'Mobile Legends';

// Карточка заказа для уведомлений владельцу: игра, пакет, ID, сумма и прибыль (с учётом комиссии оплаты, если она известна)
export function orderCard(o) {
  const cat = (CATALOGS[o.region] || {})[o.pkg] || null;
  const fee = Number(o.fee_kgs) || 0;
  const pr = cat && cat.cost > 0 ? Math.round(o.price_kgs - cat.cost * USD_KGS - fee) : null;
  return `🎮 ${gameTitle(o.region)} · ${o.pkg_label}\nID ${o.player_id}${!o.server_id || o.server_id === '-' ? '' : ' (' + o.server_id + ')'}\n💰 ${o.price_kgs} сом` + (pr === null ? '' : ` · прибыль ${pr >= 0 ? '+' : '−'}${Math.abs(pr)} сом`) + (fee ? ` (комиссия ${fee} сом)` : '');
}

// Кнопки под уведомлением: подтверждение/отказ прямо в Telegram (обрабатывает /api/tg/orders-webhook)
export function adminButtons(o) {
  const row = o.status === 'new' ? [{ text: '✅ Подтвердить и выдать', callback_data: 'ok:' + o.id }, { text: '❌ Отказать', callback_data: 'no:' + o.id }] : o.status === 'manual' ? [{ text: '✅ Выдано вручную', callback_data: 'mn:' + o.id }, { text: '❌ Отказать', callback_data: 'no:' + o.id }] : null;
  return row ? { inline_keyboard: [row] } : undefined;
}

export function alertText(o, cat, auto, withReceipt) {
  return `🆕 Новый заказ ${o.id}\n🎮 ${gameTitle(o.region)}\n${o.pkg_label} · ${o.price_kgs} сом${profitText(o.price_kgs, cat)} · ${o.method}\nID ${o.player_id}${o.server_id === '-' ? '' : ' (' + o.server_id + ')'}${auto ? '' : '\n⚠️ Выдача вручную (нет авто-оффера)'}${withReceipt ? '\n📎 Чек приложен' : ''}\nПроверьте оплату и подтвердите в админке.`;
}

// GET /api/recent — публично: последние выданные заказы без персональных данных (игра, пакет, время) + счётчики
export async function listRecentDeliveries(env, game = '') {
  game = String(game || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const cond = !game ? '' : game === 'mlbb' ? " AND region IN ('global','russia','indonesia','turkey','malaysia','philippines','singapore','brazil','usa')" : ' AND region = ?';
  const bind = game && game !== 'mlbb' ? [game] : [];
  const rows = (await env.DB.prepare("SELECT region, pkg_label, player_id, confirmed_at, finished_at FROM orders WHERE status = 'delivered' AND finished_at > 0" + cond + " ORDER BY finished_at DESC LIMIT 30").bind(...bind).all()).results || [];
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'delivered' AND finished_at > 0" + cond).bind(...bind).first()) || { n: 0 };
  const now = Date.now();
  const took = r => (r.confirmed_at > 0 ? Math.round((r.finished_at - r.confirmed_at) / 1000) : 0);
  const secs = rows.map(took).filter(x => x >= 1 && x <= 600).sort((a, b) => a - b);
  const items = rows.slice(0, 8).map(r => {
    const t = took(r);
    const pid = String(r.player_id || '').replace(/\D/g, ''); // получатель: только 2 первые и 2 последние цифры
    const who = pid.length >= 6 ? pid.slice(0, 2) + '•••' + pid.slice(-2) : '';
    return { who, game: MLBB_REGIONS.includes(r.region) ? 'mlbb' : r.region, title: gameTitle(r.region), pkg: String(r.pkg_label || '').replace(/\s*\(.*\)\s*$/, ''), ago: Math.max(0, Math.round((now - r.finished_at) / 1000)), took: t >= 1 && t <= 600 ? t : 0 };
  });
  return { items, total: total.n, median_sec: secs.length ? secs[Math.floor(secs.length / 2)] : 0 };
}

// POST /api/orders — публично (с сайта)
export async function createOrder(env, ip, b, userId = null, opts = {}) {
  const region = clean(b.region, 20) || 'global';
  const game = GAMES[region]; // undefined = Mobile Legends
  const kind = game && game.kind; // 'username' (Telegram) | 'none' (Roblox) | undefined
  let player, server;
  if (kind === 'none') { player = '-'; server = '-'; }
  else if (kind === 'username') {
    const u = clean(b.playerId, 40).replace(/^@/, '');
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(u)) return { error: 'Проверьте Telegram @username (5–32 символа: латиница, цифры, _)' };
    player = '@' + u; server = '-';
  } else {
    player = digits(b.playerId, 25); // у Honor of Kings ID из 20 цифр
    if (!game) server = digits(b.serverId, 8);
    else if (game.serverText) server = digits(b.serverId, 8);
    else if (game.servers) server = game.servers.includes(String(b.serverId)) ? String(b.serverId) : '';
    else server = '-';
    if (!game && region === 'global' && /^6\d{3}$/.test(server)) return { error: 'Сервер 6xxx — российский. Выберите регион «Россия»' };
    if (!game && (player.length < 6 || player.length > 10 || server.length < 3 || server.length > 5)) return { error: 'Проверьте ID (6–10 цифр) и Zone ID (4–5 цифр) — вводите их в отдельные поля' };
    if (player.length < 5 || !server || (game && game.serverText && server.length < 3)) return { error: game ? 'Проверьте ID и сервер' : 'Проверьте ID и Zone ID' };
  }
  const pkg = clean(b.pkg, 60);
  const price = Math.max(0, Math.min(10000000, Math.floor(Number(b.price) || 0)));
  if (!pkg || (!price && !opts.promo)) return { error: 'Не указан пакет или сумма' };
  // защита от мусорных заказов: телефон обязателен (до ИП), цена не ниже реальной стоимости пакета
  // номер телефона необязателен; если указан — проверяем по чёрному списку (последние 9 цифр)
  if (!opts.promo && String(b.phone || '').replace(/\D/g, '').length >= 9) {
    try {
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS blacklist (kind TEXT NOT NULL, value TEXT NOT NULL, reason TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL, PRIMARY KEY (kind, value))').run();
      const bl = await env.DB.prepare("SELECT 1 AS x FROM blacklist WHERE kind = 'phone' AND value = ?").bind(String(b.phone || '').replace(/\D/g, '').slice(-9)).first();
      if (bl) return { error: 'Заказ невозможен. Напишите в поддержку.', status: 403 };
    } catch (e) { /* без проверки не блокируем */ }
  }
  if (!opts.promo && OFF_PKGS.includes(region + ':' + pkg)) return { error: 'Этот пакет временно недоступен. Выберите другой или попробуйте позже.' };
  const cat0 = (CATALOGS[region] || {})[pkg] || null;
  if (!opts.promo && (cat0 ? price < Math.floor(cat0.cost * USD_KGS * 0.9) : price < 20)) return { error: 'Некорректная сумма заказа' };

  // защита от спама: не более 8 заказов с одного IP за час
  if (ip) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM orders WHERE ip = ? AND created_at > ?').bind(ip, Date.now() - 3600000).first();
    if (r && r.c >= 8) return { error: 'Слишком много заказов, попробуйте позже', status: 429 };
  }
  const cat = (CATALOGS[region] || {})[pkg] || null;
  const now = Date.now();
  let id = '';
  const secret = newSecret();
  const auto = !!(cat && (cat.cost <= MAX_AUTO_COST_USD || opts.forceAuto));
  // номер заказа: DK-1001, DK-1002… (по порядку; старые заказы с длинными кодами DKXXXXXXXX остаются как есть)
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt < 4) {
      const r = await env.DB.prepare("SELECT MAX(CAST(SUBSTR(id, 4) AS INTEGER)) AS n FROM orders WHERE id LIKE 'DK-%'").first();
      id = 'DK-' + (Math.max(1000, Number(r && r.n) || 0) + 1 + attempt);
    } else id = newCode();
    try {
      await env.DB.prepare(
        `INSERT INTO orders (id,created_at,updated_at,player_id,server_id,region,pkg,pkg_label,price_kgs,method,phone,offer_id,cost_usd,status,ip)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(id, now, now, player, server, region, pkg, clean(b.pkgLabel || pkg, 100), price, clean(b.method, 30), clean(b.phone, 30),
        auto ? cat.offer : '', auto ? cat.cost : 0, auto ? 'new' : 'manual', ip || '').run();
      break;
    } catch (e) { if (attempt === 5) throw e; }
  }
  // привязка к аккаунту (если клиент вошёл через Google); сбой не должен ломать заказ
  if (userId) { try { await env.DB.prepare('UPDATE orders SET user_id = ? WHERE id = ?').bind(userId, id).run(); } catch (e) {} }
  // секрет заказа: по нему клиент без входа может увидеть выданный код (колонка secret; сбой не должен ломать заказ)
  try { await env.DB.prepare('UPDATE orders SET secret = ? WHERE id = ?').bind(secret, id).run(); } catch (e) {}
  // Заказ «с чеком на сайте» (deferNotify): уведомляем позже, когда придёт чек, одним сообщением с фото.
  if (!b.deferNotify) await notify(env, alertText({ id, region, pkg, pkg_label: clean(b.pkgLabel || pkg, 100), price_kgs: price, method: clean(b.method, 30), player_id: player, server_id: server }, cat, auto));
  // письмо «заказ принят» отправляем только после подтверждения оплаты (confirmOrder), не при создании
  return { id, status: auto ? 'new' : 'manual', secret };
}

export async function getOrderPublic(env, id, secret) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(clean(id, 20)).first();
  if (!o) return null;
  const v = publicView(o);
  // выданный код видит только тот, у кого секрет заказа (его получает браузер, оформивший заказ)
  if (o.status === 'delivered' && o.delivery && safeEq(secret, o.secret)) v.delivery = o.delivery;
  return v;
}

export async function listOrders(env, status) {
  const q = status && status !== 'all'
    ? env.DB.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 200').bind(status)
    : env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200');
  const { results } = await q.all();
  return results.map(({ ip, ...o }) => o);
}

async function setStatus(env, id, patch) {
  const keys = Object.keys(patch);
  const sets = keys.map(k => k + ' = ?').join(', ');
  await env.DB.prepare(`UPDATE orders SET ${sets}, updated_at = ? WHERE id = ?`).bind(...keys.map(k => patch[k]), Date.now(), id).run();
}

// Подтверждение оплаты: отправляем заказ на FazerCards (один раз, ключ идемпотентности = код заказа)
export async function confirmOrder(env, id) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (o.status !== 'new') return { error: 'Заказ уже обработан (статус: ' + o.status + ')', status: 409 };
  if (!o.offer_id) return { error: 'Для этого пакета нет авто-выдачи, выдайте вручную', status: 409 };
  if (!FZ_READY) return { error: 'Авто-выдача ещё не включена. Выдайте заказ вручную и нажмите «Выдал вручную».', status: 503 };
  // сразу блокируем повторное нажатие
  const lock = await env.DB.prepare("UPDATE orders SET status='processing', confirmed_at=?, updated_at=? WHERE id=? AND status='new'")
    .bind(Date.now(), Date.now(), id).run();
  if (!lock.meta.changes) return { error: 'Заказ уже обработан', status: 409 };
  try {
    const fz = await fzCreateOrder(env, {
      region: o.region, offerId: o.offer_id, playerId: o.player_id, serverId: o.server_id, idempotencyKey: o.id,
    });
    await setStatus(env, id, { fz_order_id: fz.id || '', fz_status: fz.status || '' });
    await sendOrderMail(env, id, 'created', gameTitle);
    await syncFromFz(env, { ...o, fz_order_id: fz.id }, fz);
    return { ok: true, fz_status: fz.status };
  } catch (e) {
    // чёткий отказ FazerCards (4xx: нет денег на балансе, подписка, неверный пакет): заказ не создан, можно повторить
    if (e && e.status >= 400 && e.status < 500) {
      await setStatus(env, id, { status: 'new', fail_reason: String(e.message || e).slice(0, 250) });
      await notify(env, `⚠️ Заказ ${id}: FazerCards отказал (${String(e.message || e).slice(0, 150)}). Заказ остался в «Ждёт оплаты».`);
      return { error: 'FazerCards отказал: ' + (e.message || e), status: 502 };
    }
    // неизвестно, дошёл ли запрос (сеть/5xx): оставляем processing, cron повторит с тем же ключом (двойного списания не будет)
    await setStatus(env, id, { fail_reason: 'Ошибка связи с FazerCards: ' + String(e.message || e).slice(0, 200) });
    await notify(env, `⚠️ Заказ ${id}: не удалось связаться с FazerCards (${String(e.message || e).slice(0, 120)}). Проверьте статус в админке.`);
    return { error: 'Не удалось связаться с FazerCards: ' + (e.message || e), status: 502 };
  }
}

// ---------- Россия → Global: если аккаунт оказался Global, повторяем заказ там с равным пакетом, разницу возвращаем на баланс ----------
const ALT_SLACK_KGS = 0; // Global-аналог дороже пакета России — не заказываем, возврат как обычно
function globalEquivalent(o) {
  const ru = (SHOP.find(x => x.id === 'russia') || { packs: [] }).packs.find(p => p.k === o.pkg);
  const gl = (SHOP.find(x => x.id === 'global') || { packs: [] }).packs.filter(p => !p.first && (CATALOGS.global || {})[p.k]);
  let alt = null;
  if (/pass/i.test(o.pkg)) alt = gl.find(p => p.k === 'Weekly Diamond Pass');
  else if (ru) alt = gl.filter(p => p.t >= ru.t).sort((a, b) => a.p - b.p || a.t - b.t)[0];
  if (!alt) return null;
  const price = Number(o.price_kgs);
  if (alt.p > price + ALT_SLACK_KGS) return null;
  const cat = CATALOGS.global[alt.k];
  if (cat.cost * USD_KGS > price * 0.97) return null; // не уходим в убыток
  return { key: alt.k, label: alt.l, price: Math.min(alt.p, price), offer: cat.offer, cost: cat.cost };
}
async function retryInGlobal(env, o) {
  const alt = globalEquivalent(o);
  if (!alt) return false;
  const diff = Math.round(Number(o.price_kgs) - alt.price);
  const lock = await env.DB.prepare("UPDATE orders SET region='global', pkg=?, pkg_label=?, offer_id=?, cost_usd=?, price_kgs=?, fz_order_id='', fz_status='', fail_reason=?, updated_at=? WHERE id=? AND region='russia' AND status='processing'")
    .bind(alt.key, alt.label, alt.offer, alt.cost, alt.price, '[alt] Россия → Global (аккаунт не России)', Date.now(), o.id).run();
  if (!lock.meta.changes) return true; // уже перенёс другой обработчик
  const o2 = { ...o, region: 'global', pkg: alt.key, pkg_label: alt.label, offer_id: alt.offer, cost_usd: alt.cost, price_kgs: alt.price };
  let note = `🔁 Заказ ${o.id}: не подошёл регион «Россия», заказываем в Global: ${alt.label}.`;
  try {
    const f2 = await fzCreateOrder(env, { region: 'global', offerId: alt.offer, playerId: o.player_id, serverId: o.server_id, idempotencyKey: o.id + '-g' });
    await setStatus(env, o.id, { fz_order_id: f2.id || '', fz_status: f2.status || '' });
    await syncFromFz(env, { ...o2, fz_order_id: f2.id }, f2);
  } catch (e) { note += ' (ответ FazerCards пока не получен, повторим автоматически)'; }
  // разница между ценой России и Global: на баланс клиента, гостю — вручную
  if (diff >= 5) {
    const owner = await ownerForOrder(env, o);
    let done = false;
    if (owner) {
      const r = await credit(env, owner, diff, 'refund', o.id + '-diff', `Разница Россия→Global · заказ ${o.id}`);
      if (r.ok) {
        done = true;
        note += ` Разница ${diff} сом зачислена на баланс клиента (${await ownerLabel(env, owner)}).`;
        await tellOwner(env, owner, `🔁 <b>Заказ ${esc(o.id)}</b>: ваш аккаунт оказался Global, пополнили ${esc(alt.label)}. Разница ${diff} сом зачислена на ваш баланс.`);
      }
    }
    if (!done) note += ` ⚠️ Клиенту нужно вернуть разницу ${diff} сом (${o.method}, тел. ${o.phone || '—'}): аккаунта для баланса нет.`;
  }
  await notify(env, note);
  return true;
}

// Приводим наш статус к статусу FazerCards
export async function syncFromFz(env, o, fz) {
  const st = fz.status;
  if (st === 'completed') {
    const isCode = !!(GAMES[o.region] && GAMES[o.region].type === 'gift_cards' && !GAMES[o.region].direct);
    const codes = isCode ? (fz.codes || []) : [];
    if (isCode && !codes.length) {
      // заказ на коды выполнен, но кода в ответе нет: не говорим клиенту «выдан», владелец заберёт код в FazerCards
      await setStatus(env, o.id, { status: 'manual', fz_status: st, fz_order_id: fz.id || o.fz_order_id, finished_at: Date.now(), fail_reason: 'Код не найден в ответе FazerCards — возьмите его в заказе ' + (fz.id || o.fz_order_id) });
      await notify(env, `⚠️ Заказ ${o.id} (${o.pkg_label}): FazerCards выдал заказ ${fz.id || o.fz_order_id}, но код не удалось прочитать автоматически. Откройте заказ в FazerCards, скопируйте код и отправьте клиенту (${o.player_id}), затем нажмите «Выдал вручную».`);
      return;
    }
    // атомарно: уведомления уходят только при первом переходе в «выдан» (вебхук FazerCards и опрос приходят повторно)
    const patch = { status: 'delivered', fz_status: st, fz_order_id: fz.id || o.fz_order_id, finished_at: Date.now(), fail_reason: '', ...(isCode ? { delivery: codes.join('\n') } : {}) };
    const keys = Object.keys(patch);
    const upd = await env.DB.prepare(`UPDATE orders SET ${keys.map(k => k + ' = ?').join(', ')}, updated_at = ? WHERE id = ? AND status != 'delivered'`).bind(...keys.map(k => patch[k]), Date.now(), o.id).run();
    if (!upd.meta.changes) return;
    await sendOrderMail(env, o.id, 'delivered', gameTitle);
    await tgNotifyOrder(env, o.id, 'delivered');
    await notify(env, `✅ Заказ ${o.id} выдан\n${orderCard(o)}${isCode ? '\n🔑 Код показан клиенту на сайте.' : ''}`);
  } else if (st === 'partial') {
    // составной пакет: часть выдана, часть возвращена — разбирать вручную
    await setStatus(env, o.id, { status: 'manual', fz_status: st, fz_order_id: fz.id || o.fz_order_id, fail_reason: 'Частично выдан: ' + String(fz.fail_reason || '').slice(0, 200), finished_at: Date.now() });
    await notify(env, `⚠️ Заказ ${o.id}: составной пакет выдан частично (FazerCards ${fz.id}). Проверьте вручную, что получил клиент.`);
  } else if (st === 'refund' || st === 'failed') {
    if (st === 'refund' && o.region === 'russia' && o.method !== 'Для себя' && o.method !== 'promo' && /region/i.test(String(fz.fail_reason || '')) && !/\[alt\]/.test(o.fail_reason || '') && await retryInGlobal(env, o)) return;
    // failed: деньги гарантированно вернутся только при refund, поэтому клиенту возвращаем деньги только после refund
    if (st === 'refund' && o.method === 'Для себя') {
      await setStatus(env, o.id, { status: 'cancelled', fz_status: st, fail_reason: String(fz.fail_reason || '').slice(0, 300), finished_at: Date.now() });
      await notify(env, `↩️ Заказ для себя ${o.id} не выполнен (${String(fz.fail_reason || '—').slice(0, 150)}). Деньги вернулись на баланс FazerCards.`);
    } else if (st === 'refund' && o.method === 'promo') {
      await setStatus(env, o.id, { status: 'cancelled', fz_status: st, fail_reason: String(fz.fail_reason || '').slice(0, 300), finished_at: Date.now() });
      const back = await releasePromo(env, o.id);
      await notify(env, `↩️ Промо-заказ ${o.id} не выполнен (FazerCards вернул деньги на баланс).${back ? ' Промокод возвращён, клиент может ввести его снова.' : ' Промокод не найден, проверьте таблицу промокодов.'}\nПричина: ${String(fz.fail_reason || '—').slice(0, 150)}`);
    } else if (st === 'refund' && await refundOrderToWallet(env, o)) {
      // деньги сразу вернулись на баланс клиента (кошелёк по аккаунту сайта или Telegram), клиент может заказать заново
      await setStatus(env, o.id, { status: 'balance', fz_status: st, fail_reason: String(fz.fail_reason || '').slice(0, 300), finished_at: Date.now() });
    } else if (st === 'refund') {
      await setStatus(env, o.id, { status: 'refund_due', fz_status: st, fail_reason: String(fz.fail_reason || '').slice(0, 300), finished_at: Date.now() });
      await notify(env, `↩️ Заказ ${o.id} не выполнен (FazerCards вернул деньги на баланс).\nВерните клиенту ${o.price_kgs} сом (${o.method}, тел. ${o.phone || '—'}) и нажмите «Деньги возвращены» в админке.\nПричина: ${String(fz.fail_reason || '—').slice(0, 150)}`);
      await tgNotifyOrder(env, o.id, 'refund');
    } else {
      await setStatus(env, o.id, { fz_status: st, fail_reason: String(fz.fail_reason || '').slice(0, 300) });
      await notify(env, `⚠️ Заказ ${o.id}: FazerCards вернул failed. Ждём финальный статус (refund/completed), клиенту пока ничего не возвращайте.`);
    }
  } else if (st) {
    await setStatus(env, o.id, { fz_status: st });
  }
}

// Опрос FazerCards по зависшим заказам (cron раз в минуту + кнопка «Обновить»)
export async function pollProcessing(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM orders WHERE status='processing' AND confirmed_at > ? ORDER BY confirmed_at LIMIT 25"
  ).bind(Date.now() - 7 * 86400000).all();
  let n = 0;
  for (const o of results) {
    try {
      let fz;
      if (o.fz_order_id) fz = await fzGetOrder(env, o.fz_order_id);
      else {
        // запрос на создание мог оборваться: повтор с тем же ключом безопасен (вернёт тот же заказ, без второго списания)
        fz = await fzCreateOrder(env, { region: o.region, offerId: o.offer_id, playerId: o.player_id, serverId: o.server_id, idempotencyKey: o.id + (/\[alt\]/.test(o.fail_reason || '') ? '-g' : '') });
        await setStatus(env, o.id, { fz_order_id: fz.id });
        o.fz_order_id = fz.id;
      }
      await syncFromFz(env, o, fz); n++;
    } catch (e) { /* повторим на следующей минуте */ }
  }
  // долгие заказы (>10 мин) — сообщаем один раз
  const stale = await env.DB.prepare(
    "SELECT id, pkg_label FROM orders WHERE status='processing' AND confirmed_at < ? AND confirmed_at > ? AND fail_reason NOT LIKE '%[stale]%'"
  ).bind(Date.now() - 10 * 60000, Date.now() - 86400000).all();
  for (const s of stale.results) {
    await env.DB.prepare("UPDATE orders SET fail_reason = fail_reason || ' [stale]' WHERE id = ?").bind(s.id).run();
    await notify(env, `⏳ Заказ ${s.id} (${s.pkg_label}) обрабатывается дольше 10 минут. Проверьте в админке.`);
  }
  // заказы из Telegram-бота: через 30 минут пишем клиенту с кнопками возврата (один раз)
  try {
    const slow = await env.DB.prepare("SELECT id, pkg_label, tg_chat, user_id FROM orders WHERE status='processing' AND tg_chat IS NOT NULL AND tg_chat != 0 AND confirmed_at < ? AND confirmed_at > ? AND fail_reason NOT LIKE '%[wait30]%' AND method NOT IN ('promo','Для себя')").bind(Date.now() - REFUND_WAIT_MS, Date.now() - 86400000).all();
    for (const w of slow.results) {
      await env.DB.prepare("UPDATE orders SET fail_reason = fail_reason || ' [wait30]' WHERE id = ?").bind(w.id).run();
      await send(env, w.tg_chat, `⏳ <b>Заказ ${esc(w.id)} долго обрабатывается</b>\n${esc(w.pkg_label)}\n\nЗаказ долго обрабатывается у исполнителя из-за многочисленных заказов. С высокой вероятностью заказ будет выполнен, но это может занять до нескольких часов. Если не хотите ждать, выберите способ возврата средств. Спасибо за понимание!`,
        { reply_markup: { inline_keyboard: [[{ text: '💰 Вернуть на баланс', callback_data: 'rfb:' + w.id }], [{ text: '🏦 Вернуть на реквизиты оплаты', callback_data: 'rfq:' + w.id }]] } });
    }
  } catch (e) { /* не критично */ }
  return n;
}

export async function refreshOrder(env, id) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (!o.fz_order_id) return { error: 'У заказа нет номера FazerCards', status: 409 };
  const fz = await fzGetOrder(env, o.fz_order_id);
  await syncFromFz(env, o, fz);
  return { ok: true, fz_status: fz.status };
}

// Промокод освобождаем, когда промо-заказ не выдан (код снова можно использовать)
async function releasePromo(env, orderId) {
  try { const r = await env.DB.prepare("UPDATE promo_codes SET used_at = 0, order_id = '' WHERE order_id = ?").bind(orderId).run(); return r.meta.changes > 0; } catch (e) { return false; }
}
// Кнопка «В чёрный список» в админке: блокируем телефон заказа (последние 9 цифр), как проверяет createOrder
export async function blacklistOrder(env, id) {
  const o = await env.DB.prepare('SELECT phone FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  const v = String(o.phone || '').replace(/\D/g, '').slice(-9);
  if (v.length < 9) return { error: 'У заказа нет телефона', status: 409 };
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS blacklist (kind TEXT NOT NULL, value TEXT NOT NULL, reason TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL, PRIMARY KEY (kind, value))').run();
  await env.DB.prepare("INSERT OR IGNORE INTO blacklist (kind, value, reason, created_at) VALUES ('phone', ?, ?, ?)").bind(v, 'из админки, заказ ' + id, Date.now()).run();
  return { ok: true };
}

// ---------- чёрный список телефонов (админка: смотреть, проверять, добавлять, убирать) ----------
const BL_DDL = 'CREATE TABLE IF NOT EXISTS blacklist (kind TEXT NOT NULL, value TEXT NOT NULL, reason TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL, PRIMARY KEY (kind, value))';
const blPhone = v => String(v || '').replace(/\D/g, '').slice(-9);
export async function listBlacklist(env) {
  await env.DB.prepare(BL_DDL).run();
  const { results } = await env.DB.prepare("SELECT value, reason, created_at FROM blacklist WHERE kind = 'phone' ORDER BY created_at DESC LIMIT 500").all();
  return { items: results || [] };
}
export async function addBlacklist(env, b) {
  const v = blPhone(b && b.phone);
  if (v.length < 9) return { error: 'Введите номер полностью (9 цифр, например 777 090 210)', status: 400 };
  await env.DB.prepare(BL_DDL).run();
  const reason = String((b && b.reason) || '').replace(/[<>]/g, ' ').trim().slice(0, 200) || 'добавлен вручную';
  await env.DB.prepare("INSERT OR REPLACE INTO blacklist (kind, value, reason, created_at) VALUES ('phone', ?, ?, ?)").bind(v, reason, Date.now()).run();
  return { ok: true, value: v };
}
export async function removeBlacklist(env, b) {
  const v = blPhone(b && b.value);
  if (v.length < 9) return { error: 'Неверный номер', status: 400 };
  await env.DB.prepare(BL_DDL).run();
  const r = await env.DB.prepare("DELETE FROM blacklist WHERE kind = 'phone' AND value = ?").bind(v).run();
  return r.meta && r.meta.changes ? { ok: true } : { error: 'Номера нет в списке', status: 404 };
}

export async function markRefunded(env, id) {
  const o = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (o.status !== 'refund_due') return { error: 'Возврат не требуется (статус: ' + o.status + ')', status: 409 };
  await setStatus(env, id, { status: 'refunded' });
  await releasePromo(env, id);
  return { ok: true };
}
// Возврат на баланс сайта по решению админа: заказ завис (processing), нужен ручной разбор (manual) или ждёт возврата (refund_due).
// Статус 'balance' в финансы не попадает (там только delivered). Зачисление идемпотентно: повторное нажатие деньги не удвоит.
// Заказ для себя (админ): без оплаты, сразу уходит поставщику по себестоимости. Метод «Для себя» не входит в финансы (FIN_WHERE).
export async function selfOrder(env, b) {
  const g = SHOP.find(x => x.id === String(b.game || ''));
  const p = g && g.packs.find(x => x.k === String(b.pack || ''));
  if (!g || !p) return { error: 'Игра или пакет не найдены', status: 400 };
  const r = await createOrder(env, '', { region: g.region, pkg: p.k, pkgLabel: p.l, price: 0, method: 'Для себя', phone: '',
    playerId: g.none ? '' : String(b.playerId || ''), serverId: String(b.serverId || ''), deferNotify: true }, null, { promo: true, forceAuto: true });
  if (r.error) return r;
  if (r.status !== 'new') {
    await setStatus(env, r.id, { status: 'cancelled', fail_reason: 'Нет авто-выдачи для этого пакета' });
    return { error: 'Для этого пакета нет авто-выдачи у поставщика', status: 409 };
  }
  const c = await confirmOrder(env, r.id);
  if (c.error) {
    await setStatus(env, r.id, { status: 'cancelled', fail_reason: String(c.error).slice(0, 250), finished_at: Date.now() });
    return { error: c.error, status: c.status || 502 };
  }
  return { ok: true, id: r.id };
}
export async function selfOrders(env) {
  const { results } = await env.DB.prepare("SELECT id, created_at, pkg_label, region, player_id, server_id, status, fail_reason, delivery, cost_usd FROM orders WHERE method = 'Для себя' ORDER BY created_at DESC LIMIT 30").all();
  return { orders: results };
}

export async function refundToBalance(env, id) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (!['processing', 'manual', 'refund_due'].includes(o.status)) return { error: 'Нельзя вернуть на баланс (статус: ' + o.status + ')', status: 409 };
  if (o.method === 'promo') return { error: 'Промо-заказ: используйте «Отменить», промокод вернётся сам', status: 409 };
  if (!(await refundOrderToWallet(env, o))) return { error: 'У заказа нет аккаунта (гость): баланс положить некуда. Верните деньги вручную и нажмите «Деньги возвращены»', status: 409 };
  await setStatus(env, id, { status: 'balance', fail_reason: ((o.fail_reason || '') + ' [возврат на баланс админом]').trim().slice(0, 300), finished_at: Date.now() });
  await releasePromo(env, id);
  return { ok: true };
}
export async function markManualDone(env, id) {
  const o = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (!['manual', 'new'].includes(o.status)) return { error: 'Нельзя (статус: ' + o.status + ')', status: 409 };
  await setStatus(env, id, { status: 'delivered', finished_at: Date.now() });
  await sendOrderMail(env, id, 'delivered', gameTitle);
  await tgNotifyOrder(env, id, 'delivered');
  return { ok: true };
}
export async function cancelOrder(env, id) {
  const o = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (!['new', 'manual'].includes(o.status)) return { error: 'Нельзя отменить (статус: ' + o.status + ')', status: 409 };
  await setStatus(env, id, { status: 'cancelled', finished_at: Date.now() });
  await releasePromo(env, id);
  await tgNotifyOrder(env, id, 'cancelled');
  return { ok: true };
}

// Вебхук FazerCards: подпись X-Webhook-Signature: sha256=<hex HMAC-SHA256 тела>
export async function handleWebhook(env, rawBody, sigHeader) {
  if (!env.FAZERCARDS_WEBHOOK_SECRET) return { error: 'webhook secret не задан', status: 503 };
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.FAZERCARDS_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const hex = [...mac].map(x => x.toString(16).padStart(2, '0')).join('');
  const got = String(sigHeader || '').replace(/^sha256=/, '');
  if (got.length !== hex.length) return { error: 'bad signature', status: 401 };
  let r = 0; for (let i = 0; i < hex.length; i++) r |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  if (r) return { error: 'bad signature', status: 401 };
  let ev; try { ev = JSON.parse(rawBody); } catch (e) { return { error: 'bad json', status: 400 }; }
  const ord = ev.order || ev.data || ev;
  const fzId = ord && (ord.id || ord.order_id);
  if (!fzId) return { ok: true };
  const o = await env.DB.prepare('SELECT * FROM orders WHERE fz_order_id = ?').bind(String(fzId)).first();
  if (!o) return { ok: true };
  // источник истины — сам заказ, перечитываем
  const fz = await fzGetOrder(env, String(fzId));
  await syncFromFz(env, o, fz);
  return { ok: true };
}

// ---------- чек клиента ----------
const MAX_RECEIPT_BYTES = 1500 * 1024;
function sniffImage(u8) {
  if (u8.length > 3 && u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'image/jpeg';
  if (u8.length > 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) return 'image/png';
  if (u8.length > 12 && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return 'image/webp';
  return '';
}
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const s = atob(str); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }

// POST /api/orders/:id/receipt — публично, тело = картинка (jpeg/png/webp)
export async function saveReceipt(env, id, buf, opts = {}) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(clean(id, 20)).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (!['new', 'manual'].includes(o.status)) return { error: 'Заказ уже обработан', status: 409 };
  const u8 = new Uint8Array(buf);
  if (!u8.length) return { error: 'Пустой файл' };
  if (u8.length > MAX_RECEIPT_BYTES) return { error: 'Файл слишком большой (макс. 1,5 МБ)', status: 413 };
  const mime = sniffImage(u8);
  if (!mime) return { error: 'Нужна картинка: JPG, PNG или WebP' };
  const now = Date.now();
  const first = !o.receipt_at;
  await env.DB.batch([
    env.DB.prepare('INSERT OR REPLACE INTO receipts (order_id,mime,data,bytes,created_at) VALUES (?,?,?,?,?)').bind(o.id, mime, b64(u8), u8.length, now),
    env.DB.prepare('UPDATE orders SET receipt_at = ?, updated_at = ? WHERE id = ?').bind(now, now, o.id),
  ]);
  const cat = (CATALOGS[o.region] || {})[o.pkg] || null;
  const auto = !!(cat && cat.cost <= MAX_AUTO_COST_USD) && o.status === 'new';
  const text = alertText(o, cat, auto, true);
  if (first && !opts.silent) { // повторная загрузка чека не плодит уведомления
    await defer(env, (async () => {
      const sent = await notifyPhoto(env, u8, mime, text, adminButtons(o));
      if (sent !== true) await notify(env, text + '\n(чек не пришёл фото — смотрите его в админке)', adminButtons(o));
    })());
  }
  return { ok: true };
}

// GET /api/admin/orders/:id/receipt
export async function getReceipt(env, id) {
  const r = await env.DB.prepare('SELECT mime, data FROM receipts WHERE order_id = ?').bind(clean(id, 20)).first();
  return r ? { mime: r.mime, bytes: unb64(r.data) } : null;
}

// POST /api/orders/:id/notify — запасной путь: клиент не смог приложить чек и отправляет заказ через WhatsApp.
// Шлёт обычное уведомление один раз (receipt_at = -1 — «уведомлено без чека»).
export async function notifyWithoutReceipt(env, id) {
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(clean(id, 20)).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (!['new', 'manual'].includes(o.status) || o.receipt_at) return { ok: true };
  await env.DB.prepare('UPDATE orders SET receipt_at = -1, updated_at = ? WHERE id = ?').bind(Date.now(), o.id).run();
  const cat = (CATALOGS[o.region] || {})[o.pkg] || null;
  await notify(env, alertText(o, cat, !!(cat && cat.cost <= MAX_AUTO_COST_USD) && o.status === 'new', false), adminButtons(o));
  return { ok: true };
}

// ---------- запрос возврата, если заказ долго у исполнителя ----------
// Клиент через 30 минут может запросить возврат на баланс сайта или на реквизиты оплаты. Деньги не двигаются сами:
// владелец сначала отменяет заказ у поставщика, потом нажимает кнопку в Telegram. Если заказ выдался раньше, возврат отклоняется.
export const REFUND_WAIT_MS = 30 * 60000;
let refundCols = false;
async function ensureRefundCols(env) {
  if (refundCols) return;
  for (const c of ['refund_req TEXT', 'refund_req_at INTEGER']) { try { await env.DB.prepare('ALTER TABLE orders ADD COLUMN ' + c).run(); } catch (e) { /* уже есть */ } }
  refundCols = true;
}
export async function requestRefund(env, id, secret, sub, choice, tgChat = 0) {
  await ensureRefundCols(env);
  if (!['balance', 'requisites'].includes(choice)) return { error: 'Выберите способ возврата' };
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(clean(id, 20)).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (!((secret && safeEq(secret, o.secret)) || (sub && o.user_id && String(o.user_id) === String(sub)) || (tgChat && o.tg_chat && String(o.tg_chat) === String(tgChat)))) return { error: 'Нет доступа к заказу. Откройте его в том браузере или аккаунте, где оформляли.', status: 403 };
  if (o.status !== 'processing') return { error: o.status === 'delivered' ? 'Заказ уже выполнен' : 'Возврат сейчас недоступен', status: 409 };
  if (!o.confirmed_at || Date.now() - o.confirmed_at < REFUND_WAIT_MS) return { error: 'Возврат станет доступен через 30 минут после оплаты', status: 409 };
  if (o.method === 'promo' || o.method === 'Для себя') return { error: 'Для этого заказа возврат не нужен', status: 409 };
  if (choice === 'balance' && !o.user_id && !o.tg_chat) return { error: 'Для возврата на баланс войдите в аккаунт, с которого оформляли заказ, или выберите возврат на реквизиты', status: 409 };
  if (o.refund_req === 'balance' || o.refund_req === 'requisites') return { ok: true, refund_req: o.refund_req };
  const upd = await env.DB.prepare("UPDATE orders SET refund_req = ?, refund_req_at = ?, updated_at = ? WHERE id = ? AND status = 'processing'").bind(choice, Date.now(), Date.now(), o.id).run();
  if (!upd.meta.changes) return { error: 'Возврат сейчас недоступен', status: 409 };
  const way = choice === 'balance' ? '💰 на баланс сайта' : '🏦 на реквизиты, с которых оплачено (' + (o.method || '—') + ')';
  const row = [{ text: choice === 'balance' ? '💰 Вернуть на баланс' : '🏦 Вернуть на реквизиты', callback_data: (choice === 'balance' ? 'rb:' : 'rq:') + o.id }, { text: '✅ Заказ выполнен, отказать', callback_data: 'rx:' + o.id }];
  notify(env, `↩️ Запрос возврата по заказу ${o.id}\n${orderCard(o)}\nЖдёт у исполнителя: ${Math.round((Date.now() - o.confirmed_at) / 60000)} мин\nКлиент просит вернуть ${way}.\n\nСначала отмените заказ у поставщика, потом нажмите кнопку. Если заказ уже выдан, нажмите «отказать».`, { inline_keyboard: [row] });
  return { ok: true, refund_req: choice };
}
// Решение владельца по запросу: rb — на баланс, rq — на реквизиты (дальше вручную), rx — отказ (заказ выполнен)
export async function refundRequestAction(env, act, id) {
  await ensureRefundCols(env);
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(clean(id, 20)).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (act === 'rx') {
    await env.DB.prepare("UPDATE orders SET refund_req = 'declined', updated_at = ? WHERE id = ?").bind(Date.now(), o.id).run();
    if (o.tg_chat) await send(env, o.tg_chat, `ℹ️ <b>Заказ ${esc(o.id)} уже выполнен у исполнителя</b>\nПоэтому возврат невозможен. Заказ скоро поступит в игру. Спасибо за понимание!`);
    return { ok: true };
  }
  if (o.status === 'delivered') return { error: 'Заказ уже выполнен: возврат не делайте, нажмите «отказать»', status: 409 };
  if (act === 'rb') {
    const r = await refundToBalance(env, o.id);
    if (r.error) return r;
    await env.DB.prepare("UPDATE orders SET refund_req = '', updated_at = ? WHERE id = ?").bind(Date.now(), o.id).run();
    return { ok: true };
  }
  if (act === 'rq') {
    if (!['processing', 'manual'].includes(o.status)) return { error: 'Нельзя (статус: ' + o.status + ')', status: 409 };
    await setStatus(env, o.id, { status: 'refund_due', fail_reason: ((o.fail_reason || '') + ' [возврат на реквизиты по запросу клиента]').trim().slice(0, 300), finished_at: Date.now() });
    await tgNotifyOrder(env, o.id, 'refund');
    return { ok: true };
  }
  return { error: 'Неизвестное действие' };
}
