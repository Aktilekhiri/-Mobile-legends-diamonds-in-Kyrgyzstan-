// Ежедневный отчёт о прибыли в Telegram (в 23:55 по Бишкеку; в последний день месяца — итог месяца).
// Считаются только доставленные заказы: прибыль = цена − себестоимость по каталогу (cost_usd × курс).
import { USD_KGS } from './catalog.js';
import { notify } from './notify.js';

const TZ = 6 * 3600 * 1000; // Бишкек = UTC+6
const REPORT_HOUR = 23, REPORT_MIN = 55;

async function sentDay(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)').run();
  const r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'profit_report_day'").first();
  return r ? r.v : null;
}
async function setSentDay(env, d) {
  await env.DB.prepare("INSERT INTO meta (k,v) VALUES ('profit_report_day', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(d).run();
}
const pad = n => String(n).padStart(2, '0');
const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

async function sums(env, from, to) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(price_kgs),0) AS rev,
            COALESCE(SUM(CASE WHEN cost_usd > 0 THEN price_kgs - cost_usd * ? ELSE 0 END),0) AS profit,
            COALESCE(SUM(CASE WHEN cost_usd > 0 THEN 0 ELSE 1 END),0) AS nocost
       FROM orders WHERE status = 'delivered'
        AND COALESCE(NULLIF(finished_at,0), created_at) >= ? AND COALESCE(NULLIF(finished_at,0), created_at) < ?`
  ).bind(USD_KGS, from, to).first();
  return r || { n: 0, rev: 0, profit: 0, nocost: 0 };
}
function line(s) {
  return `${s.n} заказ(ов) · выручка ${fmt(s.rev)} сом · прибыль ${s.profit >= 0 ? '+' : '−'}${fmt(Math.abs(s.profit))} сом` + (s.nocost ? `\n(у ${s.nocost} заказ(ов) нет себестоимости — они не входят в прибыль)` : '');
}

export async function buildReport(env, nowMs) {
  const local = new Date(nowMs + TZ);                       // «часы Бишкека» в UTC-полях
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  const dayStart = Date.UTC(y, m, d) - TZ, dayEnd = dayStart + 86400000;
  const monthStart = Date.UTC(y, m, 1) - TZ;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const [day, month] = await Promise.all([sums(env, dayStart, dayEnd), sums(env, monthStart, dayEnd)]);
  const MONTHS = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const title = d === lastDay ? `📊 Итог месяца (${MONTHS[m]} ${y})` : `📊 Отчёт за день`;
  return `${title}\n\n📅 Сегодня, ${pad(d)}.${pad(m + 1)}.${y}\n${line(day)}\n\n🗓 С 1 числа (${MONTHS[m]})\n${line(month)}`;
}

// Вызывается из cron каждую минуту: отправляет отчёт один раз в сутки после 23:55 по Бишкеку.
export async function maybeSendReport(env, nowMs = Date.now()) {
  const local = new Date(nowMs + TZ);
  const h = local.getUTCHours(), mi = local.getUTCMinutes();
  if (h < REPORT_HOUR || (h === REPORT_HOUR && mi < REPORT_MIN)) return;
  const dayKey = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  if ((await sentDay(env)) === dayKey) return;
  await setSentDay(env, dayKey);                            // сначала отметка — чтобы не слать дубли
  await notify(env, await buildReport(env, nowMs));
}
