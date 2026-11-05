// Уведомления владельцу в Telegram. Работает, только если заданы секреты TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID.
// Фоновая отправка: ответ клиенту не ждёт внешние сервисы (Telegram, почта).
// В fetch-обработчике env.ctx = ExecutionContext; без него (cron, тесты) просто ждём.
export function defer(env, p) {
  const safe = Promise.resolve(p).catch(() => {});
  if (env && env.ctx && typeof env.ctx.waitUntil === 'function') {
    try { env.ctx.waitUntil(safe); return; } catch (e) { /* упадём на ожидание */ }
  }
  return safe;
}

export function notify(env, text, markup) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  return defer(env, (async () => {
    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: String(text).slice(0, 3900), ...(markup ? { reply_markup: markup } : {}) }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) { /* уведомление не критично */ }
  })());
}

// Фото в Telegram (чек клиента). true — отправлено, 'unknown' — таймаут (фото могло дойти позже), false — не отправлено.
export async function notifyPhoto(env, bytes, mime, caption, markup) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  try {
    const fd = new FormData();
    fd.append('chat_id', String(env.TELEGRAM_CHAT_ID));
    fd.append('caption', String(caption).slice(0, 1000));
    if (markup) fd.append('reply_markup', JSON.stringify(markup));
    fd.append('photo', new Blob([bytes], { type: mime }), mime === 'image/png' ? 'receipt.png' : 'receipt.jpg');
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: fd, signal: AbortSignal.timeout(12000) });
    return r.ok;
  } catch (e) {
    // таймаут: Telegram мог получить фото и доставить его с задержкой, поэтому «не ушло» не утверждаем,
    // иначе владелец получит два одинаковых сообщения об одном заказе (текст-запасной вариант + фото)
    return e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'unknown' : false;
  }
}
