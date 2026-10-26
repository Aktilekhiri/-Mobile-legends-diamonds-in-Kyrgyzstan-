// Заказы: приём с сайта, подтверждение оплаты админом, выдача через FazerCards, возврат.
import { CATALOGS, GAMES, MAX_AUTO_COST_USD, USD_KGS } from './catalog.js';
import { fzCreateOrder, fzGetOrder, FZ_READY } from './fazercards.js';
import { notify, notifyPhoto } from './notify.js';

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
});

// Прибыль в скобках: цена − себестоимость по каталогу (USD × курс). Нет себестоимости в каталоге — ничего не пишем.
function profitText(price, cat) {
  if (!cat || !(cat.cost > 0)) return '';
  const p = Math.round(price - cat.cost * USD_KGS);
  return ` (${p >= 0 ? '+' : '−'}${Math.abs(p)} сом прибыль)`;
}

const GAME_TITLE = { bloodstrike: 'Blood Strike', hsr: 'Honkai: Star Rail', zzz: 'Zenless Zone Zero', tgstars: 'Telegram Stars', tgpremium: 'Telegram Premium', roblox: 'Roblox', pubg: 'PUBG Mobile', freefire: 'Free Fire', hok: 'Honor of Kings', genshin: 'Genshin Impact', wuwa: 'Wuthering Waves', russia: 'Mobile Legends (Россия)', global: 'Mobile Legends' };
const gameTitle = region => GAME_TITLE[region] || 'Mobile Legends';

function alertText(o, cat, auto, withReceipt) {
  return `🆕 Новый заказ ${o.id}\n🎮 ${gameTitle(o.region)}\n${o.pkg_label} · ${o.price_kgs} сом${profitText(o.price_kgs, cat)} · ${o.method}\nID ${o.player_id}${o.server_id === '-' ? '' : ' (' + o.server_id + ')'}${auto ? '' : '\n⚠️ Выдача вручную (нет авто-оффера)'}${withReceipt ? '\n📎 Чек приложен' : ''}\nПроверьте оплату и подтвердите в админке.`;
}

// POST /api/orders — публично (с сайта)
export async function createOrder(env, ip, b, userId = null) {
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
    player = digits(b.playerId, 14);
    if (!game) server = digits(b.serverId, 8);
    else if (game.servers) server = game.servers.includes(String(b.serverId)) ? String(b.serverId) : '';
    else server = '-';
    if (!game && region === 'global' && /^6\d{3}$/.test(server)) return { error: 'Сервер 6xxx — российский. Выберите регион «Россия»' };
    if (!game && (player.length < 6 || player.length > 10 || server.length < 3 || server.length > 5)) return { error: 'Проверьте ID (6–10 цифр) и Zone ID (4–5 цифр) — вводите их в отдельные поля' };
    if (player.length < 5 || !server) return { error: game ? 'Проверьте ID и сервер' : 'Проверьте ID и Zone ID' };
  }
  const pkg = clean(b.pkg, 60);
  const price = Math.max(0, Math.min(10000000, Math.floor(Number(b.price) || 0)));
  if (!pkg || !price) return { error: 'Не указан пакет или сумма' };

  // защита от спама: не более 8 заказов с одного IP за час
  if (ip) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM orders WHERE ip = ? AND created_at > ?').bind(ip, Date.now() - 3600000).first();
    if (r && r.c >= 8) return { error: 'Слишком много заказов, попробуйте позже', status: 429 };
  }
  const cat = (CATALOGS[region] || {})[pkg] || null;
  const id = newCode(), now = Date.now();
  const secret = newSecret();
  const auto = !!(cat && cat.cost <= MAX_AUTO_COST_USD);
  await env.DB.prepare(
    `INSERT INTO orders (id,created_at,updated_at,player_id,server_id,region,pkg,pkg_label,price_kgs,method,phone,offer_id,cost_usd,status,ip)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(id, now, now, player, server, region, pkg, clean(b.pkgLabel || pkg, 100), price, clean(b.method, 30), clean(b.phone, 30),
    auto ? cat.offer : '', auto ? cat.cost : 0, auto ? 'new' : 'manual', ip || '').run();
  // привязка к аккаунту (если клиент вошёл через Google); сбой не должен ломать заказ
  if (userId) { try { await env.DB.prepare('UPDATE orders SET user_id = ? WHERE id = ?').bind(userId, id).run(); } catch (e) {} }
  // секрет заказа: по нему клиент без входа может увидеть выданный код (колонка secret; сбой не должен ломать заказ)
  try { await env.DB.prepare('UPDATE orders SET secret = ? WHERE id = ?').bind(secret, id).run(); } catch (e) {}
  // Заказ «с чеком на сайте» (deferNotify): уведомляем позже, когда придёт чек, одним сообщением с фото.
  if (!b.deferNotify) await notify(env, alertText({ id, region, pkg, pkg_label: clean(b.pkgLabel || pkg, 100), price_kgs: price, method: clean(b.method, 30), player_id: player, server_id: server }, cat, auto));
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
    await setStatus(env, o.id, { status: 'delivered', fz_status: st, fz_order_id: fz.id || o.fz_order_id, finished_at: Date.now(), fail_reason: '', ...(isCode ? { delivery: codes.join('\n') } : {}) });
    await notify(env, `✅ Заказ ${o.id} выдан (${o.pkg_label}, ${o.price_kgs} сом).${isCode ? ' Код показан клиенту на сайте.' : ''}`);
  } else if (st === 'partial') {
    // составной пакет: часть выдана, часть возвращена — разбирать вручную
    await setStatus(env, o.id, { status: 'manual', fz_status: st, fz_order_id: fz.id || o.fz_order_id, fail_reason: 'Частично выдан: ' + String(fz.fail_reason || '').slice(0, 200), finished_at: Date.now() });
    await notify(env, `⚠️ Заказ ${o.id}: составной пакет выдан частично (FazerCards ${fz.id}). Проверьте вручную, что получил клиент.`);
  } else if (st === 'refund' || st === 'failed') {
    // failed: деньги гарантированно вернутся только при refund, поэтому клиенту возвращаем деньги только после refund
    if (st === 'refund') {
      await setStatus(env, o.id, { status: 'refund_due', fz_status: st, fail_reason: String(fz.fail_reason || '').slice(0, 300), finished_at: Date.now() });
      await notify(env, `↩️ Заказ ${o.id} не выполнен (FazerCards вернул деньги на баланс).\nВерните клиенту ${o.price_kgs} сом (${o.method}, тел. ${o.phone || '—'}) и нажмите «Деньги возвращены» в админке.\nПричина: ${String(fz.fail_reason || '—').slice(0, 150)}`);
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
        fz = await fzCreateOrder(env, { region: o.region, offerId: o.offer_id, playerId: o.player_id, serverId: o.server_id, idempotencyKey: o.id });
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

export async function markRefunded(env, id) {
  const o = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (o.status !== 'refund_due') return { error: 'Возврат не требуется (статус: ' + o.status + ')', status: 409 };
  await setStatus(env, id, { status: 'refunded' });
  return { ok: true };
}
export async function markManualDone(env, id) {
  const o = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (!['manual', 'new'].includes(o.status)) return { error: 'Нельзя (статус: ' + o.status + ')', status: 409 };
  await setStatus(env, id, { status: 'delivered', finished_at: Date.now() });
  return { ok: true };
}
export async function cancelOrder(env, id) {
  const o = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(id).first();
  if (!o) return { error: 'Заказ не найден', status: 404 };
  if (!['new', 'manual'].includes(o.status)) return { error: 'Нельзя отменить (статус: ' + o.status + ')', status: 409 };
  await setStatus(env, id, { status: 'cancelled', finished_at: Date.now() });
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
export async function saveReceipt(env, id, buf) {
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
  if (first) { // повторная загрузка чека не плодит уведомления
    const sent = await notifyPhoto(env, u8, mime, text);
    if (!sent) await notify(env, text + '\n(фото не ушло в Telegram — смотрите чек в админке)');
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
  await notify(env, alertText(o, cat, !!(cat && cat.cost <= MAX_AUTO_COST_USD) && o.status === 'new', false));
  return { ok: true };
}
