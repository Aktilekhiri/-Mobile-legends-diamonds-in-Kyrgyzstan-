// Telegram-магазин: заказ внутри бота (@diamond_kg_bot). Те же заказы, админка и автовыдача FazerCards, что и на сайте.
// Клиент: игра → пакет → ID → проверка → банк → чек (фото). Админ: кнопки «Подтвердить / Отказать» под чеком.
import { SHOP } from './shop_data.js';
import { tgApi, send, esc } from './tgapi.js';
import { createOrder, saveReceipt, confirmOrder, markManualDone, cancelOrder, alertText } from './orders.js';
import { CATALOGS, MAX_AUTO_COST_USD } from './catalog.js';

const PAY_NUM = '+996 702 097 127', PAY_NAME = 'Актилек К.';
const METHODS = { M: 'Mbank', O: 'O!Банк' };
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
const MENU = kb([[btn('🎮 Пополнить игру', 'games')], [btn('📋 Мои заказы', 'orders'), btn('💬 Поддержка', 'help')]]);
const CANCEL = [btn('❌ Отмена', 'menu')];
const isNight = () => ((new Date().getUTCHours() + 6) % 24) < 8;
const NIGHT = '\n\n🌙 Сейчас ночь: заказы с 00:00 до 08:00 по Бишкеку выдаём утром.';
const money = n => Number(n).toLocaleString('ru-RU').replace(/ /g, ' ');

// показать экран: редактируем прошлое сообщение (если пришли из кнопки), иначе новое
async function show(env, chat, msgId, text, markup) {
  if (msgId) {
    const r = await tgApi(env, 'editMessageText', { chat_id: chat, message_id: msgId, text: String(text).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup });
    if (r && r.ok) return;
  }
  await send(env, chat, text, { reply_markup: markup });
}

const welcome = chat => `<b>Diamond.kg</b>: пополнение игр за сомы\nMobile Legends, PUBG, Free Fire, Genshin и другие. Оплата через Mbank или O!Банк, зачисление 5–10 минут. Пароль от аккаунта не нужен.`;

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
  await show(env, chat, msgId, `<b>${esc(g.name)}</b>: ${esc(p.l)} · ${money(p.p)} сом\n\n${esc(g.hint || 'Введите ID игрока')}\n\n${g.mlbb ? 'Отправьте <b>ID и Zone ID</b> одним сообщением через пробел, например: <code>123456789 1234</code>' : 'Отправьте ID игрока (только цифры):'}`, kb([CANCEL]));
}

function validId(g, s) { const d = String(s).replace(/\D/g, ''); return g.mlbb ? (d.length >= 6 && d.length <= 10 ? d : '') : (d.length >= 5 && d.length <= 14 ? d : ''); }
function validZone(s) { const d = String(s).replace(/\D/g, ''); return d.length >= 3 && d.length <= 5 ? d : ''; }

async function showSummary(env, chat, msgId, st) {
  const g = SHOP.find(x => x.id === st.g), p = g.packs[st.i];
  st.step = 'confirm'; await setSt(env, chat, st);
  const srv = st.srv ? (g.servers ? ((g.servers.find(x => x.v === st.srv) || {}).l || st.srv) : st.srv) : '';
  let t = `<b>Проверьте заказ</b>\n\nИгра: ${esc(g.name)}\nПакет: ${esc(p.l)}\n` + (g.none ? '' : `ID: <code>${esc(st.pid)}</code>\n`) + (srv ? `Сервер: ${esc(srv)}\n` : '') + `Сумма: <b>${money(p.p)} сом</b>`;
  if (p.first) t += '\n\n⚠️ Этот пакет только для <b>первого пополнения</b> аккаунта. Если вы уже пополняли этот аккаунт в Mobile Legends, выберите другой пакет: иначе заказ может обрабатываться долго и будет возвращён.';
  await show(env, chat, msgId, t, kb([[btn(p.first ? '✅ Верно, я ещё не пополнял аккаунт' : '✅ Всё верно, к оплате', 'ok')], [btn('✏️ Изменить ID', 'ed')], CANCEL]));
}

async function showMethods(env, chat, msgId, st) {
  st.step = 'method'; await setSt(env, chat, st);
  await show(env, chat, msgId, '<b>Выберите банк</b>, через который переведёте оплату:', kb([[btn('Mbank', 'm:M'), btn('O!Банк', 'm:O')], CANCEL]));
}

async function showPay(env, chat, msgId, st) {
  const g = SHOP.find(x => x.id === st.g), p = g.packs[st.i];
  st.step = 'receipt'; await setSt(env, chat, st);
  await show(env, chat, msgId, `<b>Оплата · ${esc(st.method)}</b>\n\n1. Переведите <b>${money(p.p)} сом</b> на номер:\n<code>${PAY_NUM}</code> (${PAY_NAME})\n2. Сделайте скриншот чека и <b>отправьте его сюда фото</b>.\n\nПосле проверки оплаты заказ выдаётся за 5–10 минут.` + (isNight() ? NIGHT : ''), kb([CANCEL]));
}

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
  await send(env, chat, `✅ <b>Чек по заказу ${esc(r.id)} получен.</b>\nПроверяем оплату, обычно это 5–10 минут. Напишем сюда, как только заказ будет выдан.` + (isNight() ? NIGHT : ''), { reply_markup: kb([[btn('📋 Мои заказы', 'orders'), btn('🎮 Ещё заказ', 'games')]]) });
}

// ---------- кнопки админа под чеком ----------
async function adminAction(env, cq, act, id) {
  const chat = cq.message && cq.message.chat.id, mid = cq.message && cq.message.message_id;
  let r;
  if (act === 'ok') r = await confirmOrder(env, id);
  else if (act === 'mn') r = await markManualDone(env, id);
  else r = await cancelOrder(env, id);
  if (r.error) { await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: String(r.error).slice(0, 190), show_alert: true }); return; }
  await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'Готово' });
  const mark = act === 'ok' ? '\n\n✅ Отправлено на выдачу' : act === 'mn' ? '\n\n✅ Отмечено как выданное' : '\n\n❌ Отказано';
  if (chat) await tgApi(env, 'editMessageCaption', { chat_id: chat, message_id: mid, caption: ((cq.message.caption || '') + mark).slice(0, 1000), reply_markup: { inline_keyboard: [] } });
}

// ---------- точки входа ----------
async function onCallback(env, cq) {
  const chat = cq.message && cq.message.chat.id, mid = cq.message && cq.message.message_id, d = String(cq.data || '');
  const adm = String(env.TELEGRAM_CHAT_ID || '');
  const m = d.match(/^(ok|mn|no):([A-Z0-9]{4,20})$/);
  if (m) { if (adm && String(cq.from.id) === adm) await adminAction(env, cq, m[1], m[2]); else await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id }); return; }
  await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id });
  if (!chat) return;
  let st = await getSt(env, chat);
  if (d === 'menu') { await setSt(env, chat, {}); return show(env, chat, mid, welcome(), MENU); }
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
  if ((x = d.match(/^m:([MO])$/)) && st.g) { st.method = METHODS[x[1]]; return showPay(env, chat, mid, st); }
}

async function onMessage(env, msg) {
  const chat = msg.chat.id; if (msg.chat.type !== 'private') return;
  const text = String(msg.text || '').trim();
  if (/^\/(start|menu)/i.test(text)) { await setSt(env, chat, {}); return send(env, chat, welcome(), { reply_markup: MENU }); }
  if (/^\/orders/i.test(text)) return showOrders(env, chat, 0);
  if (/^\/help/i.test(text)) return showHelp(env, chat, 0);
  const st = await getSt(env, chat); const g = st.g && SHOP.find(x => x.id === st.g);
  if (g && st.step === 'receipt') return finishReceipt(env, chat, msg.from || {}, msg, st);
  if (g && st.step === 'id' && text) {
    const parts = text.match(/\d+/g) || [];
    const pid = validId(g, parts[0] || '');
    if (!pid) return send(env, chat, g.mlbb ? '⚠️ Проверьте ID (6–10 цифр). Отправьте ID и Zone ID через пробел.' : '⚠️ Проверьте ID: нужны только цифры (5–14).');
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
  await send(env, chat, welcome(), { reply_markup: MENU });
}

export async function handleTgUpdate(env, u) {
  try {
    await ensureTg(env);
    if (u.callback_query) await onCallback(env, u.callback_query);
    else if (u.message) await onMessage(env, u.message);
  } catch (e) { console.log('tg update error', String(e && e.stack || e).slice(0, 400)); }
}
