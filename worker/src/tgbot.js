// Telegram-магазин: заказ внутри бота (@diamond_kg_bot). Те же заказы, админка и автовыдача FazerCards, что и на сайте.
// Клиент: игра → пакет → ID → проверка → банк → чек (фото). Админ: кнопки «Подтвердить / Отказать» под чеком.
import { SHOP } from './shop_data.js';
import { tgApi, send, esc } from './tgapi.js';
import { createOrder, saveReceipt, confirmOrder, markManualDone, cancelOrder, alertText } from './orders.js';
import { CATALOGS, MAX_AUTO_COST_USD } from './catalog.js';
import { adminDeal, createDeal } from './deals.js';
import { startFinikOrder, finikReady } from './finik.js';
import { startGopayOrder, gopayPublic } from './gopay.js';
const fastReady = env => gopayPublic(env) || finikReady(env);
import { publishOffer, rejectOffer, createOffer, addOfferPhoto, submitOffer, markup as sellMarkup, GAMES as SELL_GAMES } from './market.js';
import { notify } from './notify.js';
import { aiChat, aiReady } from './aichat.js';
import { checkPromo, redeemPromo, normCode } from './promo.js';

const PAGE = 8;
const ST_LABEL = { new: 'Ждёт проверки оплаты', manual: 'Ждёт выдачи', processing: 'Зачисляется', delivered: 'Выдан ✅', refund_due: 'Возврат', refunded: 'Деньги возвращены', cancelled: 'Отменён' };
const WA = '+996 555 920 204';
let ready = false;

async function ensureTg(env) {
  if (ready) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS tg_sessions (chat_id INTEGER PRIMARY KEY, st TEXT NOT NULL DEFAULT \'{}\', updated INTEGER NOT NULL DEFAULT 0)').run();
  for (const col of ['tg_chat INTEGER', 'tg_user TEXT']) { try { await env.DB.prepare('ALTER TABLE orders ADD COLUMN ' + col).run(); } catch (e) { /* уже есть */ } }
  ready = true;
}
const getSt = async (env, chat) => { const r = await env.DB.prepare('SELECT st FROM tg_sessions WHERE chat_id = ?').bind(chat).first(); try { return r ? JSON.parse(r.st) : {}; } catch (e) { return {}; } };
const setSt = (env, chat, st) => env.DB.prepare('INSERT INTO tg_sessions (chat_id, st, updated) VALUES (?,?,?) ON CONFLICT(chat_id) DO UPDATE SET st = excluded.st, updated = excluded.updated').bind(chat, JSON.stringify(st), Date.now()).run();

const btn = (text, data) => ({ text, callback_data: data });
const kb = rows => ({ inline_keyboard: rows });
const CHANNEL = 'https://t.me/topupdiamondskg';
const MENU = kb([[btn('🎮 Пополнить игру', 'games')], [btn('🛒 Купить аккаунт', 'acc'), btn('💼 Продать аккаунт', 'sell')], [btn('📋 Мои заказы', 'orders'), btn('💬 Поддержка', 'help')], [btn('🎁 Промокод', 'promo')], [{ text: '📣 Наш канал', url: CHANNEL }]]);
const CANCEL = [btn('❌ Отмена', 'menu')];
const money = n => Number(n).toLocaleString('ru-RU').replace(/ /g, ' ');

// показать экран: редактируем прошлое сообщение (если пришли из кнопки), иначе новое
async function show(env, chat, msgId, text, markup) {
  if (msgId) {
    const r = await tgApi(env, 'editMessageText', { chat_id: chat, message_id: msgId, text: String(text).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup });
    if (r && r.ok) return;
  }
  await send(env, chat, text, { reply_markup: markup });
}

const welcome = chat => `<b>Diamond.kg</b>: пополнение игр за сомы\nMobile Legends, PUBG, Free Fire, Genshin и другие. Оплата по QR в приложении любого банка Кыргызстана, заказ выдаётся автоматически. Пароль от аккаунта не нужен.`;

async function showGames(env, chat, msgId) {
  const rows = []; for (let i = 0; i < SHOP.length; i += 2) rows.push(SHOP.slice(i, i + 2).map(g => btn(g.name, 'g:' + g.id)));
  rows.push([btn('« Меню', 'menu')]);
  await show(env, chat, msgId, '<b>Выберите игру</b>', kb(rows));
}

async function showPacks(env, chat, msgId, gid, page) {
  const g = SHOP.find(x => x.id === gid); if (!g) return showGames(env, chat, msgId);
  const from = page * PAGE, list = g.packs.slice(from, from + PAGE);
  const rows = list.map((p, i) => [btn(`${p.first ? '⚠️ ' : ''}${p.l} · ${money(p.p)} сом`, `p:${gid}:${from + i}`)]);
  const nav = []; if (page > 0) nav.push(btn('‹ Назад', `pg:${gid}:${page - 1}`)); if (from + PAGE < g.packs.length) nav.push(btn('Ещё ›', `pg:${gid}:${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([btn('« Игры', 'games')]);
  await show(env, chat, msgId, `<b>${esc(g.name)}</b>\nВыберите пакет:` + (g.packs.some(p => p.first) ? '\n⚠️ Только на 1-е пополнение аккаунта' : ''), kb(rows));
}

async function askId(env, chat, msgId, st) {
  const g = SHOP.find(x => x.id === st.g), p = g.packs[st.i];
  st.step = 'id'; await setSt(env, chat, st);
  await show(env, chat, msgId, `<b>${esc(g.name)}</b>: ${esc(p.l)} · ${money(p.p)} сом\n\n${esc(g.hint || 'Введите ID игрока')}\n\n${g.user ? 'Отправьте ваш Telegram <b>@username</b> (Настройки → Имя пользователя):' : g.mlbb ? 'Отправьте <b>ID и Zone ID</b> одним сообщением через пробел, например: <code>123456789 1234</code>' : 'Отправьте ID игрока (только цифры):'}`, kb([CANCEL]));
}

function validId(g, s) { const d = String(s).replace(/\D/g, ''); return g.mlbb ? (d.length >= 6 && d.length <= 10 ? d : '') : (d.length >= 5 && d.length <= 25 ? d : ''); }
function validZone(s) { const d = String(s).replace(/\D/g, ''); return d.length >= 3 && d.length <= 5 ? d : ''; }

async function showSummary(env, chat, msgId, st) {
  const g = SHOP.find(x => x.id === st.g), p = g.packs[st.i];
  st.step = 'confirm'; await setSt(env, chat, st);
  const srv = st.srv ? (g.servers ? ((g.servers.find(x => x.v === st.srv) || {}).l || st.srv) : st.srv) : '';
  let t = `<b>Проверьте заказ</b>\n\nИгра: ${esc(g.name)}\nПакет: ${esc(p.l)}\n` + (g.none ? '' : `${g.user ? 'Username' : 'ID'}: <code>${esc(g.user ? '@' + st.pid : st.pid)}</code>\n`) + (srv ? `Сервер: ${esc(srv)}\n` : '') + `Сумма: <b>${money(p.p)} сом</b>`;
  if (p.first) t += '\n\n⚠️ Этот пакет только для <b>первого пополнения</b> аккаунта. Если вы уже пополняли этот аккаунт в Mobile Legends, выберите другой пакет: иначе заказ может обрабатываться долго и будет возвращён.';
  await show(env, chat, msgId, t, kb([[btn(p.first ? '✅ Верно, я ещё не пополнял аккаунт' : '✅ Всё верно, к оплате', 'ok')], [btn('✏️ Изменить ID', 'ed')], CANCEL]));
}

async function showMethods(env, chat, msgId, st) {
  st.step = 'method'; await setSt(env, chat, st);
  if (!fastReady(env)) { await show(env, chat, msgId, `<b>Оплата временно недоступна</b>\nПопробуйте позже или напишите нам в WhatsApp ${WA}.`, kb([CANCEL])); return; }
  await show(env, chat, msgId, '<b>Оплата</b>\n⚡ Платите в приложении любого банка Кыргызстана или по QR. Заказ выдаётся автоматически, чек не нужен.', kb([[btn('⚡ Оплатить по QR', 'mf')], CANCEL]));
}

async function payFinikBot(env, cq, st) {
  const chat = cq.message.chat.id, g = SHOP.find(x => x.id === st.g), p = g && g.packs[st.i];
  if (!g || !p) { await send(env, chat, 'Сессия устарела. Начните заново.', { reply_markup: MENU }); return; }
  const recent = await env.DB.prepare('SELECT COUNT(*) AS c FROM orders WHERE tg_chat = ? AND created_at > ?').bind(chat, Date.now() - 3600000).first();
  if (recent && recent.c >= 5) { await send(env, chat, 'Слишком много заказов за час. Попробуйте позже или напишите в WhatsApp ' + WA + '.'); return; }
  const r = await (gopayPublic(env) ? startGopayOrder : startFinikOrder)(env, '', { region: g.region, pkg: p.k, pkgLabel: p.l, price: p.p, phone: '000' + String(chat), playerId: g.none ? '' : st.pid, serverId: st.srv || '' }, null);
  if (r.error) { await send(env, chat, '⚠️ ' + esc(r.error), { reply_markup: kb([[btn('✏️ Изменить ID', 'ed')], CANCEL]) }); return; }
  const from = cq.from || {}, who = from.username ? '@' + from.username : (from.first_name || 'клиент');
  await env.DB.prepare('UPDATE orders SET tg_chat = ?, tg_user = ? WHERE id = ?').bind(chat, who, r.id).run();
  await setSt(env, chat, {});
  await send(env, chat, `<b>Заказ ${esc(r.id)}</b>: ${esc(g.name)}, ${esc(p.l)} · ${money(p.p)} сом\n\nНажмите кнопку, выберите банк или отсканируйте QR. После оплаты заказ придёт автоматически, мы напишем сюда.\n⏱ Ссылка действует 1 час.`, { reply_markup: { inline_keyboard: [[{ text: '⚡ Перейти к оплате', url: r.url }], [btn('« Меню', 'menu')]] } });
}

// ручной перевод отключён: старые кнопки выбора банка ведут на оплату через Finik
async function showPay(env, chat, msgId, st) { return showMethods(env, chat, msgId, st); }

async function showOrders(env, chat, msgId) {
  const { results } = await env.DB.prepare('SELECT id, pkg_label, price_kgs, status, created_at FROM orders WHERE tg_chat = ? ORDER BY created_at DESC LIMIT 5').bind(chat).all();
  const t = results.length ? '<b>Ваши заказы</b>\n\n' + results.map(o => `<b>${esc(o.id)}</b> · ${esc(o.pkg_label)} · ${money(o.price_kgs)} сом\n${ST_LABEL[o.status] || esc(o.status)}`).join('\n\n') : 'Заказов пока нет.';
  await show(env, chat, msgId, t, kb([[btn('🎮 Пополнить игру', 'games')], [btn('« Меню', 'menu')]]));
}

async function showHelp(env, chat, msgId) {
  await show(env, chat, msgId, `<b>Поддержка</b>\nWhatsApp: ${WA}\nКанал с новостями и розыгрышем: https://t.me/topupdiamondskg\n\nПри обращении укажите код заказа (например, DK12345678).`, kb([[btn('« Меню', 'menu')]]));
}

// ---------- чек: создаём заказ и отправляем админу ----------
async function finishReceipt(env, chat, from, msg, st) {
  const g = SHOP.find(x => x.id === st.g), p = g && g.packs[st.i];
  if (!g || !p) { await send(env, chat, 'Сессия устарела. Начните заново.', { reply_markup: MENU }); return; }
  // выбираем файл: фото (самое большое до 1.4 МБ) или картинка-документ
  let fileId = '', size = 0;
  if (msg.photo && msg.photo.length) { const ok = msg.photo.filter(x => (x.file_size || 0) <= 1400000); const pick = ok[ok.length - 1] || null; if (pick) { fileId = pick.file_id; size = pick.file_size || 0; } }
  else if (msg.document && /^image\//.test(msg.document.mime_type || '') && (msg.document.file_size || 0) <= 1400000) { fileId = msg.document.file_id; size = msg.document.file_size || 0; }
  if (!fileId) { await send(env, chat, 'Пришлите чек картинкой (фото или скриншот), размером до 1,4 МБ.'); return; }

  const recent = await env.DB.prepare('SELECT COUNT(*) AS c FROM orders WHERE tg_chat = ? AND created_at > ?').bind(chat, Date.now() - 3600000).first();
  if (recent && recent.c >= 5) { await send(env, chat, 'Слишком много заказов за час. Попробуйте позже или напишите в WhatsApp ' + WA + '.'); return; }

  const r = await createOrder(env, '', { region: g.region, pkg: p.k, pkgLabel: p.l, price: p.p, method: st.method, phone: '000' + String(chat), playerId: g.none ? '' : st.pid, serverId: st.srv || '', deferNotify: true }, null);
  if (r.error) { await send(env, chat, '⚠️ ' + esc(r.error), { reply_markup: kb([[btn('✏️ Изменить ID', 'ed')], CANCEL]) }); return; }
  const who = from.username ? '@' + from.username : (from.first_name || 'клиент');
  await env.DB.prepare('UPDATE orders SET tg_chat = ?, tg_user = ? WHERE id = ?').bind(chat, who, r.id).run();

  // сохраняем чек в базу (для админки); если не вышло, чек всё равно уйдёт админу по file_id
  try {
    const fi = await tgApi(env, 'getFile', { file_id: fileId });
    if (fi && fi.ok) {
      const res = await fetch(`https://api.telegram.org/file/bot${env.TG_SHOP_BOT_TOKEN}/${fi.result.file_path}`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) await saveReceipt(env, r.id, await res.arrayBuffer(), { silent: true });
    }
  } catch (e) { /* не критично */ }

  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(r.id).first();
  const cat = (CATALOGS[g.region] || {})[p.k] || null;
  const auto = !!(cat && cat.cost <= MAX_AUTO_COST_USD) && o.status === 'new';
  const caption = (alertText(o, cat, auto, true) + `\n📱 Из Telegram-бота: ${who} (id ${chat})`).slice(0, 1000);
  const buttons = o.status === 'new' ? [btn('✅ Подтвердить и выдать', 'ok:' + r.id), btn('❌ Отказать', 'no:' + r.id)] : [btn('✅ Выдано вручную', 'mn:' + r.id), btn('❌ Отказать', 'no:' + r.id)];
  if (env.TELEGRAM_CHAT_ID) await tgApi(env, 'sendPhoto', { chat_id: env.TELEGRAM_CHAT_ID, photo: fileId, caption, reply_markup: kb([buttons]) });

  await setSt(env, chat, {});
  await send(env, chat, `✅ <b>Чек по заказу ${esc(r.id)} получен.</b>\nПроверяем оплату, обычно это 5–10 минут. Напишем сюда, как только заказ будет выдан.`, { reply_markup: kb([[btn('📋 Мои заказы', 'orders'), btn('🎮 Ещё заказ', 'games')]]) });
}

// ---------- кнопки админа под чеком ----------
async function adminAction(env, cq, act, id, token) {
  const chat = cq.message && cq.message.chat.id, mid = cq.message && cq.message.message_id;
  const call = (m, body) => tgApi(env, m, body, 10000, token);
  let r;
  if (act === 'ok') r = await confirmOrder(env, id);
  else if (act === 'mn') r = await markManualDone(env, id);
  else if (act === 'mp') r = await publishOffer(env, id);
  else if (act === 'mr') r = await rejectOffer(env, id);
  else if (/^d[pndr]$/.test(act)) r = await adminDeal(env, act, id);
  else r = await cancelOrder(env, id);
  if (r.error) { await call('answerCallbackQuery', { callback_query_id: cq.id, text: String(r.error).slice(0, 190), show_alert: true }); return; }
  await call('answerCallbackQuery', { callback_query_id: cq.id, text: 'Готово' });
  const mark = act === 'ok' ? '\n\n✅ Отправлено на выдачу' : act === 'mn' ? '\n\n✅ Отмечено как выданное' : act === 'mp' ? '\n\n✅ Опубликовано' : act === 'mr' ? '\n\n❌ Отклонено' : act === 'dp' ? '\n\n✅ Оплата подтверждена, данные выданы покупателю' : act === 'dn' ? '\n\n❌ Сделка отменена' : act === 'dd' ? '\n\n💸 Выплата продавцу отмечена' : act === 'dr' ? '\n\n↩️ Возврат покупателю (объявление скрыто)' : '\n\n❌ Отказано';
  if (!chat) return;
  const m = cq.message;
  if (m.caption !== undefined || m.photo) await call('editMessageCaption', { chat_id: chat, message_id: mid, caption: ((m.caption || '') + mark).slice(0, 1000), reply_markup: { inline_keyboard: [] } });
  else await call('editMessageText', { chat_id: chat, message_id: mid, text: ((m.text || '') + mark).slice(0, 3900), reply_markup: { inline_keyboard: [] } });
}

// Бот «Diamond KG Заказы» (уведомления владельцу): только нажатия кнопок под заказами
export async function handleOrdersBotUpdate(env, u) {
  try {
    const cq = u && u.callback_query; if (!cq) return;
    const token = env.TELEGRAM_BOT_TOKEN, adm = String(env.TELEGRAM_CHAT_ID || '');
    const m = String(cq.data || '').match(/^(ok|mn|no|mp|mr|dp|dn|dd|dr):([A-Z0-9]{4,20})$/);
    if (!m || !adm || String(cq.from.id) !== adm) { await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id }, 10000, token); return; }
    await adminAction(env, cq, m[1], m[2], token);
  } catch (e) { console.log('orders bot error', String(e && e.stack || e).slice(0, 300)); }
}


// ---------- аккаунты: покупка и продажа через гаранта ----------
const SELL_STEPS = ['st', 'sp', 'sd', 'sl', 'sw', 'sb', 'so', 'sc', 'sph'];
const pickPhoto = (arr, max) => { const ok = (arr || []).filter(x => (x.file_size || 0) <= max); return ok.length ? ok[ok.length - 1] : null; };
async function tgDownload(env, fileId) {
  const fi = await tgApi(env, 'getFile', { file_id: fileId });
  if (!fi || !fi.ok) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${env.TG_SHOP_BOT_TOKEN}/${fi.result.file_path}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const ext = String(fi.result.file_path).split('.').pop().toLowerCase();
  return { buf: await res.arrayBuffer(), mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' };
}
const money2 = n => Number(n).toLocaleString('ru-RU').replace(/ /g, ' ');

async function showAccounts(env, chat, msgId) {
  const { results } = await env.DB.prepare("SELECT id, title, price FROM accounts WHERE status = 'available' ORDER BY sort DESC, id DESC LIMIT 10").all();
  const rows = results.map(a => [btn(`${String(a.title).slice(0, 38)} · ${money2(a.price)} сом`, 'ac:' + a.id)]);
  rows.push([btn('💼 Продать свой аккаунт', 'sell')], [{ text: '📣 Все объявления в канале', url: CHANNEL }], [btn('« Меню', 'menu')]);
  await show(env, chat, msgId, results.length ? '<b>Аккаунты в продаже</b>\nПокупка идёт через гаранта Diamond.kg: деньги у нас, пока вы не получите аккаунт.' : 'Сейчас объявлений нет. Загляните позже или разместите свой аккаунт.', kb(rows));
}
async function showAccount(env, chat, id) {
  const a = await env.DB.prepare("SELECT id, title, price, description FROM accounts WHERE id = ? AND status = 'available'").bind(id).first();
  if (!a) return send(env, chat, 'Это объявление уже недоступно.', { reply_markup: kb([[btn('« К списку', 'acc')]]) });
  const p = await env.DB.prepare('SELECT id FROM photos WHERE account_id = ? ORDER BY pos, id LIMIT 1').bind(id).first();
  const cap = `<b>${esc(a.title)}</b>\n💰 ${money2(a.price)} сом\n\n${esc((a.description || '').slice(0, 700))}\n\nВсе фото: https://diamond.kg/`.slice(0, 1000);
  const markup = kb([[btn('🛡 Купить через гаранта', 'ab:' + a.id)], [btn('« К списку', 'acc')]]);
  let r = null;
  if (p && env.origin) r = await tgApi(env, 'sendPhoto', { chat_id: chat, photo: `${env.origin}/img/${p.id}`, caption: cap, parse_mode: 'HTML', reply_markup: markup }, 15000);
  if (!r || !r.ok) await send(env, chat, cap, { reply_markup: markup });
}
async function buyAccount(env, cq, id) {
  const chat = cq.message.chat.id;
  const a = await env.DB.prepare("SELECT id, title, price FROM accounts WHERE id = ? AND status = 'available'").bind(id).first();
  if (!a) return send(env, chat, 'Это объявление уже недоступно.');
  const who = cq.from.username ? '@' + cq.from.username : (cq.from.first_name || 'покупатель');
  const dl = await createDeal(env, { tg_chat: chat }, { account_id: a.id, contact: cq.from.username ? '@' + cq.from.username : 'Telegram id ' + chat });
  if (dl.ok) {
    const link = `https://diamond.kg/deal.html?c=${dl.code}&s=${dl.secret}`;
    return send(env, chat, `<b>Покупка через гаранта</b>\n${esc(a.title)}, ${money2(a.price)} сом.\n\nОткройте страницу сделки: там реквизиты для оплаты. После вашей оплаты и моего подтверждения на этой же странице появятся логин и пароль. Войдите в аккаунт и нажмите «Зашёл, подтверждаю». Деньги продавцу мы переводим только через 72 часа после вашего подтверждения.\n\n⚠️ Сохраните ссылку, она личная.`, { reply_markup: { inline_keyboard: [[{ text: '🛡 Открыть страницу сделки', url: link }], [btn('« К списку', 'acc')]] } });
  }
  if (dl.status && dl.status !== 400) return send(env, chat, '⚠️ ' + esc(dl.error), { reply_markup: kb([[btn('« К списку', 'acc')]]) });
  await notify(env, `🛒 Покупатель ${who} (id ${chat}) хочет аккаунт №${a.id}: ${a.title} за ${a.price} сом. Напишите ему и проведите сделку через гаранта.`);
  const wa = 'https://wa.me/996555920204?text=' + encodeURIComponent(`Здравствуйте! Хочу купить аккаунт №${a.id}: ${a.title}, ${a.price} сом (diamond.kg)`);
  await send(env, chat, `<b>Заявка отправлена</b>\nАккаунт: ${esc(a.title)}, ${money2(a.price)} сом.\n\nКак проходит сделка:\n1. Мы свяжемся с вами и пришлём реквизиты.\n2. Вы переводите сумму гаранту (Diamond.kg), деньги держим у себя.\n3. Продавец передаёт аккаунт, вы проверяете.\n4. Мы переводим деньги продавцу.\n\nХотите ускорить, напишите нам напрямую.`, { reply_markup: { inline_keyboard: [[{ text: '📲 Написать в WhatsApp', url: wa }], [btn('« К списку', 'acc')]] } });
}
async function startSell(env, chat, msgId) {
  await setSt(env, chat, { step: 'sg', sell: {} });
  const rows = SELL_GAMES.map((g, i) => [btn(g, 'sg:' + i)]); rows.push([btn('« Меню', 'menu')]);
  await show(env, chat, msgId, `<b>Продать аккаунт</b>\n\n1. Размещение <b>бесплатное</b>: вы указываете, сколько хотите получить.\n2. Вы пишете данные для входа (они зашифрованы и видны покупателю только после оплаты).\n3. Мы проверяем и публикуем объявление на сайте и в канале. К вашей цене добавляется наша наценка.\n4. Покупатель платит нам, получает данные, проверяет вход. Через 72 часа после его подтверждения мы переводим вам деньги.\n\nВыберите игру:`, kb(rows));
}
async function onSellMessage(env, chat, msg, st) {
  const text = String(msg.text || '').trim(), S = st.sell || (st.sell = {});
  if (st.step === 'st') {
    if (text.length < 3) return send(env, chat, 'Напишите короткое название, например: «Mythic Glory, 120 скинов».');
    S.title = text.slice(0, 80); st.step = 'sp'; await setSt(env, chat, st);
    return send(env, chat, 'Сколько вы хотите <b>получить на руки</b>, в сомах? (только число). Покупатель увидит цену с нашей наценкой.', { reply_markup: kb([CANCEL]) });
  }
  if (st.step === 'sp') {
    const n = Number(text.replace(/\s/g, '')); if (!(n >= 100)) return send(env, chat, '⚠️ Введите цену числом, не меньше 100 сом.');
    S.price = Math.floor(n); st.step = 'sd'; await setSt(env, chat, st);
    return send(env, chat, `Вы получите: <b>${money2(S.price)} сом</b>. Покупатель увидит: <b>${money2(S.price + sellMarkup(S.price))} сом</b> (наценка +${sellMarkup(S.price)}).\n\nОпишите аккаунт: ранг, уровень, героев, скины, что привязано. Или пропустите.`, { reply_markup: kb([[btn('Пропустить', 'sskip')], CANCEL]) });
  }
  if (st.step === 'sd') { S.desc = text.slice(0, 1500); return askLogin(env, chat, st); }
  if (st.step === 'sl') {
    if (text.length < 3) return send(env, chat, '⚠️ Напишите способ входа и логин.');
    S.login = text.slice(0, 160); st.step = 'sw'; await setSt(env, chat, st);
    return send(env, chat, '🔑 Теперь <b>пароль</b> от аккаунта. Покупатель увидит его только после оплаты. Я удалю ваше сообщение с паролем из чата.', { reply_markup: kb([CANCEL]) });
  }
  if (st.step === 'sw') {
    if (!text) return send(env, chat, '⚠️ Отправьте пароль текстом.');
    S.pass = text.slice(0, 120); st.step = 'sb'; await setSt(env, chat, st);
    if (msg.message_id) await tgApi(env, 'deleteMessage', { chat_id: chat, message_id: msg.message_id });
    return send(env, chat, '🔗 Что <b>привязано</b> к аккаунту? Например: «Google gmail …@gmail.com, телефона нет, Facebook нет». Покупателю важно знать, что поменять после покупки.', { reply_markup: kb([CANCEL]) });
  }
  if (st.step === 'sb') {
    if (text.length < 3) return send(env, chat, '⚠️ Напишите, что привязано (почта, телефон, соцсети) или «ничего».');
    S.bind = text.slice(0, 400); st.step = 'so'; await setSt(env, chat, st);
    return send(env, chat, '💳 <b>Куда перевести деньги</b> после сделки? Номер Mbank или O!Банк (и имя).', { reply_markup: kb([CANCEL]) });
  }
  if (st.step === 'so') {
    if (text.length < 5) return send(env, chat, '⚠️ Укажите номер Mbank или O!Банк.');
    S.payout = text.slice(0, 120); return askContact(env, chat, st, msg.from || {});
  }
  if (st.step === 'sc') { if (text.length < 5) return send(env, chat, '⚠️ Укажите номер WhatsApp или @username.'); return createAndAskPhotos(env, chat, st, msg.from || {}, text); }
  if (st.step === 'sph') {
    const ph = pickPhoto(msg.photo, 450 * 1024) || (msg.document && /^image\//.test(msg.document.mime_type || '') && (msg.document.file_size || 0) <= 450 * 1024 ? { file_id: msg.document.file_id } : null);
    if (!ph) return send(env, chat, msg.photo || msg.document ? 'Фото слишком большое. Отправьте скриншот поменьше (как обычное фото, не файлом).' : 'Пришлите фото аккаунта (скриншоты профиля, героев, скинов).');
    const f = await tgDownload(env, ph.file_id); if (!f) return send(env, chat, 'Не удалось получить фото, отправьте ещё раз.');
    const r = await addOfferPhoto(env, S.code, S.secret, f.mime, f.buf);
    if (r.error) return send(env, chat, '⚠️ ' + esc(r.error), { reply_markup: kb([[btn('✅ Готово', 'sdone')]]) });
    return send(env, chat, `📷 Фото добавлено (${r.count}/6). Отправьте ещё или нажмите «Готово».`, { reply_markup: kb([[btn('✅ Готово', 'sdone')]]) });
  }
}
async function askLogin(env, chat, st) {
  st.step = 'sl'; await setSt(env, chat, st);
  return send(env, chat, '🔐 <b>Данные для входа.</b> Они хранятся в зашифрованном виде и показываются покупателю только после того, как он оплатит.\n\nНапишите <b>способ входа и логин</b>, например: «Moonton, email test@mail.com» или «Facebook, логин …».', { reply_markup: kb([CANCEL]) });
}
async function askContact(env, chat, st, from) {
  st.step = 'sc'; await setSt(env, chat, st);
  const rows = []; if (from.username) rows.push([btn('Использовать @' + from.username, 'scont')]); rows.push(CANCEL);
  return send(env, chat, 'Как с вами связаться? Номер WhatsApp или @username в Telegram:', { reply_markup: kb(rows) });
}
async function createAndAskPhotos(env, chat, st, from, contact) {
  const S = st.sell;
  const r = await createOffer(env, { tg_chat: chat, tg_user: from.username ? '@' + from.username : '' }, { game: S.game, title: S.title, price: S.price, description: S.desc || '', contact, login_method: (S.login || '').split(/[,:]/)[0].slice(0, 40), login: S.login, password: S.pass, bindings: S.bind, payout: S.payout });
  if (r.error) { await send(env, chat, '⚠️ ' + esc(r.error)); return; }
  S.code = r.code; S.secret = r.secret; st.step = 'sph'; await setSt(env, chat, st);
  return send(env, chat, 'Теперь пришлите <b>фото аккаунта</b> (скриншоты профиля, героев, скинов), от 1 до 6. Отправляйте как обычные фото. Когда закончите, нажмите «Готово».', { reply_markup: kb([CANCEL]) });
}
async function onSellCallback(env, cq, d, st) {
  const chat = cq.message.chat.id, mid = cq.message.message_id; let x;
  if (d === 'sell') { await startSell(env, chat, mid); return true; }
  if ((x = d.match(/^sg:(\d)$/)) && st.step === 'sg') { const g = SELL_GAMES[Number(x[1])]; if (!g) return true; st.sell = { game: g }; st.step = 'st'; await setSt(env, chat, st); await show(env, chat, mid, `Игра: <b>${esc(g)}</b>\n\nНапишите короткое <b>название объявления</b>, например: «Mythic Glory, 120 скинов».`, kb([CANCEL])); return true; }
  if (d === 'sskip' && st.step === 'sd') { st.sell.desc = ''; await askLogin(env, chat, st); return true; }
  if (d === 'scont' && st.step === 'sc' && cq.from && cq.from.username) { await createAndAskPhotos(env, chat, st, cq.from, '@' + cq.from.username); return true; }
  if (d === 'sdone' && st.step === 'sph') {
    const r = await submitOffer(env, st.sell.code, st.sell.secret);
    if (r.error) { await send(env, chat, '⚠️ ' + esc(r.error)); return true; }
    const code = st.sell.code; await setSt(env, chat, {});
    await send(env, chat, `✅ <b>Объявление ${esc(code)} отправлено на проверку.</b>\nПубликуем обычно в течение нескольких часов. Напишем сюда, когда оно появится в каталоге и в канале.`, { reply_markup: MENU });
    return true;
  }
  return false;
}

// ---------- точки входа ----------
async function onCallback(env, cq) {
  const chat = cq.message && cq.message.chat.id, mid = cq.message && cq.message.message_id, d = String(cq.data || '');
  const adm = String(env.TELEGRAM_CHAT_ID || '');
  const m = d.match(/^(ok|mn|no|mp|mr):([A-Z0-9]{4,20})$/);
  if (m) { if (adm && String(cq.from.id) === adm) await adminAction(env, cq, m[1], m[2]); else await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id }); return; }
  await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id });
  if (!chat) return;
  let st = await getSt(env, chat);
  if (d === 'menu') { await setSt(env, chat, {}); return show(env, chat, mid, welcome(), MENU); }
  if (await onSellCallback(env, cq, d, st)) return;
  if (d === 'promo') { await setSt(env, chat, { step: 'pc' }); return show(env, chat, mid, '<b>🎁 Промокод</b>\nОтправьте ваш промокод одним сообщением (например, <code>DKG-XXXXXX</code>).\nПромокод даёт бесплатный Weekly Diamond Pass для Mobile Legends и работает только для Global-аккаунтов.', kb([CANCEL])); }
  if (d === 'acc') return showAccounts(env, chat, mid);
  { const a = d.match(/^(ac|ab):(\d+)$/); if (a) return a[1] === 'ac' ? showAccount(env, chat, Number(a[2])) : buyAccount(env, cq, Number(a[2])); }
  if (d === 'games') { await setSt(env, chat, {}); return showGames(env, chat, mid); }
  if (d === 'orders') return showOrders(env, chat, mid);
  if (d === 'help') return showHelp(env, chat, mid);
  let x;
  if ((x = d.match(/^g:(\w+)$/))) return showPacks(env, chat, mid, x[1], 0);
  if ((x = d.match(/^pg:(\w+):(\d+)$/))) return showPacks(env, chat, mid, x[1], Number(x[2]));
  if ((x = d.match(/^p:(\w+):(\d+)$/))) {
    const g = SHOP.find(q => q.id === x[1]); if (!g || !g.packs[Number(x[2])]) return showGames(env, chat, mid);
    st = { g: g.id, i: Number(x[2]) };
    if (g.none) { st.pid = ''; return showSummary(env, chat, mid, st); }
    return askId(env, chat, mid, st);
  }
  if ((x = d.match(/^s:(\w+)$/)) && st.g) { st.srv = x[1]; return showSummary(env, chat, mid, st); }
  if (d === 'ed' && st.g) return askId(env, chat, mid, st);
  if (d === 'ok' && st.g && st.step === 'confirm') return showMethods(env, chat, mid, st);
  if (d === 'mf' && st.g && st.step === 'method') return payFinikBot(env, cq, st);
  if (/^m:[MO]$/.test(d) && st.g) return showPay(env, chat, mid, st);
}

async function onMessage(env, msg) {
  const chat = msg.chat.id; if (msg.chat.type !== 'private') return;
  const text = String(msg.text || '').trim();
  if (/^\/(start|menu)/i.test(text)) { await setSt(env, chat, {}); return send(env, chat, welcome(), { reply_markup: MENU }); }
  if (/^\/orders/i.test(text)) return showOrders(env, chat, 0);
  if (/^\/help/i.test(text)) return showHelp(env, chat, 0);
  const st = await getSt(env, chat); const g = st.g && SHOP.find(x => x.id === st.g);
  if (SELL_STEPS.includes(st.step)) return onSellMessage(env, chat, msg, st);
  if (st.step === 'pc' && text) {
    const c = await checkPromo(env, 'tg:' + chat, text);
    if (c.error) return send(env, chat, '⚠️ ' + esc(c.error), { reply_markup: kb([CANCEL]) });
    await setSt(env, chat, { step: 'pi', promo: normCode(text) });
    return send(env, chat, '✅ Промокод принят.\n\nОтправьте <b>ID и Zone ID</b> вашего аккаунта Mobile Legends одним сообщением через пробел, например: <code>123456789 1234</code>\n⚠️ Только Global-аккаунт: сервер, который начинается на 6, не подходит.', { reply_markup: kb([CANCEL]) });
  }
  if (st.step === 'pi' && text) {
    const parts = text.match(/\d+/g) || [];
    const pid = validId({ mlbb: true }, parts[0] || ''), zone = validZone(parts[1] || '');
    if (!pid || !zone) return send(env, chat, '⚠️ Отправьте ID (6–10 цифр) и Zone ID (3–5 цифр) через пробел.', { reply_markup: kb([CANCEL]) });
    const from = msg.from || {}, who = from.username ? '@' + from.username : (from.first_name || 'клиент');
    const r = await redeemPromo(env, 'tg:' + chat, { code: st.promo, playerId: pid, serverId: zone }, null, { tgChat: chat, tgUser: who });
    if (r.error) {
      if (r.status === 400) return send(env, chat, '⚠️ ' + esc(r.error), { reply_markup: kb([CANCEL]) });
      await setSt(env, chat, {}); return send(env, chat, '⚠️ ' + esc(r.error), { reply_markup: MENU });
    }
    await setSt(env, chat, {});
    return send(env, chat, `🎁 <b>Промокод активирован!</b>\nЗаказ ${esc(r.id)}: Weekly Diamond Pass для ID <code>${pid}</code> (${zone}). Выдача занимает 5–10 минут, напишем сюда, как только он придёт.`, { reply_markup: kb([[btn('📋 Мои заказы', 'orders')], [btn('« Меню', 'menu')]]) });
  }
  if (g && st.step === 'receipt') return finishReceipt(env, chat, msg.from || {}, msg, st);
  if (g && g.user && st.step === 'id' && text) {
    const u = text.replace(/^@/, '').trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(u)) return send(env, chat, '⚠️ Проверьте @username: 5–32 символа, латиница, цифры и _.');
    st.pid = u; st.srv = ''; return showSummary(env, chat, 0, st);
  }
  if (g && st.step === 'id' && text) {
    const parts = text.match(/\d+/g) || [];
    const pid = validId(g, parts[0] || '');
    if (!pid) return send(env, chat, g.mlbb ? '⚠️ Проверьте ID (6–10 цифр). Отправьте ID и Zone ID через пробел.' : '⚠️ Проверьте ID: нужны только цифры (от 5 до 25).');
    st.pid = pid;
    if (g.mlbb) { const z = validZone(parts[1] || ''); if (z) { st.srv = z; return showSummary(env, chat, 0, st); } st.step = 'zone'; await setSt(env, chat, st); return send(env, chat, 'Теперь отправьте <b>Zone ID</b> (в скобках рядом с ID, 3–5 цифр).', { reply_markup: kb([CANCEL]) }); }
    if (g.zone) { st.step = 'zone'; await setSt(env, chat, st); return send(env, chat, 'Теперь отправьте <b>Server ID</b> (3–5 цифр).', { reply_markup: kb([CANCEL]) }); }
    if (g.servers) { st.step = 'server'; await setSt(env, chat, st); return send(env, chat, 'Выберите сервер:', { reply_markup: kb([...g.servers.map(s => [btn(s.l, 's:' + s.v)]), CANCEL]) }); }
    st.srv = ''; return showSummary(env, chat, 0, st);
  }
  if (g && st.step === 'zone' && text) {
    const z = validZone(text);
    if (!z) return send(env, chat, '⚠️ Проверьте Zone/Server ID: 3–5 цифр.');
    st.srv = z; return showSummary(env, chat, 0, st);
  }
  // свободный текст: ИИ-помощник (история диалога хранится в состоянии сессии)
  if (text && aiReady(env) && !st.step) {
    const hist = Array.isArray(st.ai) ? st.ai : [];
    hist.push({ role: 'user', content: text });
    const from = msg.from || {};
    const r = await aiChat(env, { history: hist, ip: 'tg:' + chat, channel: 'tg', qa: true, sid: String(chat), tgChat: chat, tgUser: from.username ? '@' + from.username : (from.first_name || '') });
    const reply = r.reply || r.error || 'Не получилось ответить.';
    hist.push({ role: 'assistant', content: reply });
    st.ai = hist.slice(-14); await setSt(env, chat, st);
    const pay = (r.actions || []).find(x => x.type === 'pay');
    return send(env, chat, esc(reply), pay ? { reply_markup: kb([[{ text: '⚡ Оплатить ' + money(pay.amount) + ' сом', url: pay.url }], [btn('« Меню', 'menu')]]) } : { reply_markup: MENU });
  }
  await send(env, chat, welcome(), { reply_markup: MENU });
}

export async function handleTgUpdate(env, u) {
  try {
    await ensureTg(env);
    if (u.callback_query) await onCallback(env, u.callback_query);
    else if (u.message) await onMessage(env, u.message);
  } catch (e) { console.log('tg update error', String(e && e.stack || e).slice(0, 400)); }
}
