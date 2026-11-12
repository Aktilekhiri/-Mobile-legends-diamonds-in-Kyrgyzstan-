// Telegram-бот магазина (@diamond_kg_bot): вызовы Bot API и сообщения клиенту о заказе.
// Работает, только если задан секрет TG_SHOP_BOT_TOKEN. Админ-уведомления уходят в TELEGRAM_CHAT_ID.
import { defer } from './notify.js';

export async function tgApi(env, method, body, timeoutMs = 10000, token) {
  token = token || env.TG_SHOP_BOT_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(timeoutMs),
    });
    const d = await r.json().catch(() => null);
    if (!d || !d.ok) console.log('tg api', method, r.status, JSON.stringify(d || {}).slice(0, 200));
    return d;
  } catch (e) { console.log('tg api error', method, String(e && e.message || e)); return null; }
}

export const send = (env, chat, text, extra = {}) => tgApi(env, 'sendMessage', { chat_id: chat, text: String(text).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
export const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Секрет вебхука выводится из ADMIN_PASSWORD (отдельный секрет заводить не нужно)
export async function webhookSecret(env) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(env.ADMIN_PASSWORD || 'x')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('tg-shop-webhook')));
  return [...mac].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Сообщение клиенту в Telegram о смене статуса заказа. kind: 'paid' | 'delivered' | 'cancelled' | 'refund'.
// Получатель: чат, из которого оформлен заказ (бот), либо Telegram, привязанный к аккаунту сайта, под которым оформлен заказ.
const MENU_BTN = { inline_keyboard: [[{ text: '‹ В главное меню', callback_data: 'menu' }]] };
export function tgNotifyOrder(env, orderId, kind, titleOf) {
  if (!env.TG_SHOP_BOT_TOKEN) return;
  return defer(env, (async () => {
    try {
      const o = await env.DB.prepare('SELECT id, region, pkg_label, price_kgs, player_id, server_id, tg_chat, user_id, method, delivery FROM orders WHERE id = ?').bind(orderId).first();
      if (!o) return;
      let chat = o.tg_chat;
      if (!chat && o.user_id) { try { const l = await env.DB.prepare('SELECT tg_chat FROM tg_links WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(o.user_id).first(); chat = l && l.tg_chat; } catch (e) { /* таблицы привязки ещё нет */ } }
      if (!chat) return;
      const zone = !o.server_id || o.server_id === '-' ? '' : ' (' + esc(o.server_id) + ')';
      const game = titleOf ? titleOf(o.region) : '';
      const t = {
        paid: `✅ <b>Спасибо! Оплата получена.</b>\n🆔 ID: <code>${esc(o.player_id)}</code>${zone}\n\n🎮 ${game ? esc(game) + ' · ' : ''}${esc(o.pkg_label)}\nЗаказ <b>${esc(o.id)}</b> оформлен, пришлём результат сюда.`,
        delivered: `✅ <b>Заказ ${esc(o.id)} выполнен</b>\n${esc(o.pkg_label)}. ${o.delivery ? 'Ваш код:\n<code>' + esc(o.delivery) + '</code>\n\nАктивируйте его в игре и никому не показывайте.' : 'Проверьте аккаунт в игре.'}\n\nЕсли что-то не пришло, напишите в WhatsApp: +996 555 920 204`,
        cancelled: `❌ <b>Заказ ${esc(o.id)} отменён</b>\nЕсли вы уже оплатили, напишите нам в WhatsApp +996 555 920 204, мы вернём деньги.`,
        refund: `↩️ <b>Заказ ${esc(o.id)} не удалось выполнить</b>\nВернём ${esc(o.price_kgs)} сом на ваш счёт. Если вопросы, WhatsApp +996 555 920 204.`,
      }[kind];
      if (t) await send(env, chat, t, { reply_markup: MENU_BTN });
    } catch (e) { /* не критично */ }
  })());
}
