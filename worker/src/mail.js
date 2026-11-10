import { defer } from './notify.js';
// Письма клиенту о заказе через Resend. Работает, только если задан секрет RESEND_API_KEY.
// Необязательно: MAIL_FROM (по умолчанию "diamond.kg <orders@diamond.kg>"), MAIL_REPLY_TO (по умолчанию не задан).
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, lines, orderId) {
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#111">
<div style="margin:0 0 16px"><img src="https://diamond.kg/favicon-180.png" width="40" height="40" alt="" style="vertical-align:middle;border-radius:10px;margin-right:10px"><span style="font-size:20px;font-weight:800;vertical-align:middle">Diamond.kg</span></div>
<h2 style="margin:0 0 12px">${esc(title)}</h2>
${lines.map(l => `<p style="margin:8px 0;font-size:16px;line-height:1.5">${l}</p>`).join('')}
<p style="margin:16px 0"><a href="https://diamond.kg/" style="background:#32D9F5;color:#0B1020;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;display:inline-block">Мои заказы на diamond.kg</a></p>
<p style="color:#666;font-size:13px;margin-top:20px">Заказ ${esc(orderId)}. Вопросы по заказу: <a href="https://wa.me/996555920204" style="color:#0a7a8f">WhatsApp +996 555 920 204</a>. На это письмо отвечать не нужно.</p></div>`;
}

export async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      signal: AbortSignal.timeout(10000),
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || 'diamond.kg <orders@diamond.kg>', to: [to], ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}), subject, html }),
    });
    if (!r.ok) console.log('mail failed', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return r.ok;
  } catch (e) { console.log('mail error', String(e && e.message || e)); return false; }
}

// kind: 'created' | 'delivered'. Сбой письма никогда не ломает заказ.
export function sendOrderMail(env, orderId, kind, titleOf) {
  if (!env.RESEND_API_KEY) return;
  return defer(env, sendOrderMailNow(env, orderId, kind, titleOf));
}
async function sendOrderMailNow(env, orderId, kind, titleOf) {
  try {
    if (!env.RESEND_API_KEY) return;
    const o = await env.DB.prepare('SELECT o.id, o.region, o.pkg_label, o.price_kgs, o.player_id, o.user_id, o.delivery, u.email AS email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?').bind(orderId).first();
    if (!o || !o.email) return;
    const game = titleOf ? titleOf(o.region) : o.region;
    const what = `<b>${esc(game)}</b>: ${esc(o.pkg_label)} · ${esc(o.price_kgs)} сом`;
    if (kind === 'created') {
      await sendMail(env, o.email, `Оплата получена, заказ ${o.id} выдаётся — diamond.kg`, layout('Оплата получена ✅', [what, 'Оплата получена, выдаём заказ. Обычно это занимает 1–5 минут, мы напишем, когда всё будет выдано.'], o.id));
    } else if (kind === 'delivered') {
      await sendMail(env, o.email, `Заказ ${o.id} выдан — diamond.kg`, layout('Заказ выдан ✅', o.delivery ? [what, 'Ваш код (активируйте его в игре или на сайте игры):', '<b style="font-family:monospace;font-size:18px;word-break:break-all">' + esc(o.delivery).replace(/\n/g, '<br>') + '</b>', 'Код также сохранён в заказе на сайте. Никому его не показывайте.'] : [what, 'Пополнение выполнено. Если это код или ключ, он показан в заказе на сайте.', 'Если что-то не пришло, напишите нам в WhatsApp (контакт ниже).'], o.id));
    }
  } catch (e) { /* письмо не критично */ }
}
