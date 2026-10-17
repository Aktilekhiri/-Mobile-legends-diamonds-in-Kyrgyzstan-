// Оповещение в Telegram, когда баланс FazerCards ниже порога. Проверка раз в 10 минут (из cron каждую минуту).
import { fzGetBalance } from './fazercards.js';
import { notify } from './notify.js';

export const LOW_BALANCE_USD = 15;          // порог оповещения
const REPEAT_MS = 6 * 3600 * 1000;          // пока баланс низкий, напоминаем раз в 6 часов

async function getMeta(env, k) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)').run();
  const r = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first();
  return r ? r.v : null;
}
async function setMeta(env, k, v) {
  await env.DB.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run();
}

export async function checkBalance(env, now = Date.now()) {
  if (new Date(now).getUTCMinutes() % 10 !== 0) return;
  const bal = await fzGetBalance(env);
  if (bal === null) return;
  if (bal >= LOW_BALANCE_USD) {
    if ((await getMeta(env, 'low_balance_alert_at')) !== '0') await setMeta(env, 'low_balance_alert_at', 0);
    return;
  }
  const last = Number(await getMeta(env, 'low_balance_alert_at')) || 0;
  if (now - last < REPEAT_MS) return;
  await setMeta(env, 'low_balance_alert_at', now);
  await notify(env, `⚠️ Низкий баланс FazerCards: $${bal.toFixed(2)} (порог $${LOW_BALANCE_USD}).\nПополните баланс, иначе заказы не будут выдаваться автоматически.`);
}
