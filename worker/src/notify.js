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
