// Письма клиенту о заказе через Resend. Работает, только если задан секрет RESEND_API_KEY.
// Необязательно: MAIL_FROM (по умолчанию "diamond.kg <orders@diamond.kg>"), MAIL_REPLY_TO (по умолчанию не задан).
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, lines, orderId) {
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#111">
<h2 style="margin:0 0 12px">${esc(title)}</h2>
${lines.map(l => `<p style="margin:8px 0;font-size:16px;line-height:1.5">${l}</p>`).join('')}
<p style="margin:16px 0"><a href="https://diamond.kg/" style="background:#32D9F5;color:#0B1020;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;display:inline-block">Мои заказы на diamond.kg</a></p>
<p style="color:#666;font-size:13px;margin-top:20px">Заказ ${esc(orderId)}. Вопросы по заказу: <a href="https://wa.me/996555920204" style="color:#0a7a8f">WhatsApp +996 555 920 204</a>. На это письмо отвечать не нужно.</p></div>`;
}

export async function sendMail(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || 'diamond.kg <orders@diamond.kg>', to: [to], ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}), subject, html }),
    });
    return r.ok;
  } catch (e) { return false; }
}

// kind: 'created' | 'delivered'. Сбой письма никогда не ломает заказ.
export async function sendOrderMail(env, orderId, kind, titleOf) {
  try {
    if (!env.RESEND_API_KEY) return;
    const o = await env.DB.prepare('SELECT o.id, o.region, o.pkg_label, o.price_kgs, o.player_id, o.user_id, u.email AS email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?').bind(orderId).first();
    if (!o || !o.email) return;
    const game = titleOf ? titleOf(o.region) : o.region;
    const what = `<b>${esc(game)}</b>: ${esc(o.pkg_label)} · ${esc(o.price_kgs)} сом`;
    if (kind === 'created') {
      await sendMail(env, o.email, `Заказ ${o.id} принят — diamond.kg`, layout('Заказ принят', [what, 'Проверяем оплату. Обычно это занимает несколько минут, мы напишем, когда всё будет выдано.'], o.id));
    } else if (kind === 'delivered') {
      await sendMail(env, o.email, `Заказ ${o.id} выдан — diamond.kg`, layout('Заказ выдан ✅', [what, 'Пополнение выполнено. Если это код или ключ, он показан в заказе на сайте.', 'Если что-то не пришло, напишите нам в WhatsApp (контакт ниже).'], o.id));
    }
  } catch (e) { /* письмо не критично */ }
}
