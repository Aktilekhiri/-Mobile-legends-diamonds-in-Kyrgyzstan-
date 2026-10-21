// Уведомления владельцу в Telegram. Работает, только если заданы секреты TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.
export async function notify(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: String(text).slice(0, 3900) }),
    });
  } catch (e) { /* уведомление не критично */ }
}

// Фото в Telegram (чек клиента). true — отправлено.
export async function notifyPhoto(env, bytes, mime, caption) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  try {
    const fd = new FormData();
    fd.append('chat_id', String(env.TELEGRAM_CHAT_ID));
    fd.append('caption', String(caption).slice(0, 1000));
    fd.append('photo', new Blob([bytes], { type: mime }), mime === 'image/png' ? 'receipt.png' : 'receipt.jpg');
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: fd });
    return r.ok;
  } catch (e) { return false; }
}
