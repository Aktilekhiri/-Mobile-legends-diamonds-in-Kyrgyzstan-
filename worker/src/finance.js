// Финансы: выручка, себестоимость, прибыль и недельный план переводов.
// Считаются только выданные заказы; себестоимость = cost_usd × курс (USD_KGS) по каталогу, как в ежедневном отчёте.
import { USD_KGS } from './catalog.js';
import { fzGetBalance } from './fazercards.js';
import { notify } from './notify.js';

const TZ = 6 * 3600 * 1000;            // Бишкек = UTC+6
const DAY = 86400000;
export const RESERVE_PCT = 0.03;       // 3% выручки остаётся на карте приёма: комиссии сети, курс, возвраты
export const MIN_BALANCE_USD = 60;     // не опускаем баланс FazerCards ниже (запас на ~4 дня)
export const MIN_DEPOSIT_USD = 50;     // меньше не пополняем: комиссия 1 USDT съест слишком много
const SEND_DOW = 1, SEND_HOUR = 14;    // понедельник 14:00 по Бишкеку (итоги прошедшей недели)

const fmt = n => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
const pad = n => String(n).padStart(2, '0');

let refundCol = false;
async function sums(env, from, to) {
  if (!refundCol) { try { await env.DB.prepare('ALTER TABLE orders ADD COLUMN refund_kgs INTEGER NOT NULL DEFAULT 0').run(); } catch (e) { /* колонка уже есть */ } refundCol = true; }
  // промо-заказы (method = 'promo', бесплатные Weekly Pass) не входят в выручку и прибыль: их расход считается отдельно
  const NP = "COALESCE(method,'') != 'promo'";
  const r = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN ${NP} THEN 1 ELSE 0 END),0) AS n,
            COALESCE(SUM(CASE WHEN ${NP} THEN price_kgs - refund_kgs ELSE 0 END),0) AS rev,
            COALESCE(SUM(CASE WHEN ${NP} THEN cost_usd ELSE 0 END),0) AS cost_usd,
            COALESCE(SUM(CASE WHEN ${NP} AND cost_usd > 0 THEN price_kgs - refund_kgs - cost_usd * ? ELSE 0 END),0) AS profit,
            COALESCE(SUM(CASE WHEN ${NP} AND NOT cost_usd > 0 THEN 1 ELSE 0 END),0) AS nocost,
            COALESCE(SUM(CASE WHEN ${NP} THEN 0 ELSE 1 END),0) AS promo_n,
            COALESCE(SUM(CASE WHEN ${NP} THEN 0 ELSE cost_usd END),0) AS promo_usd
       FROM orders WHERE status = 'delivered'
        AND COALESCE(NULLIF(finished_at,0), created_at) >= ? AND COALESCE(NULLIF(finished_at,0), created_at) < ?`
  ).bind(USD_KGS, from, to).first();
  const s = r || { n: 0, rev: 0, cost_usd: 0, profit: 0, nocost: 0, promo_n: 0, promo_usd: 0 };
  return { n: s.n, rev: Math.round(s.rev), cost: Math.round(s.cost_usd * USD_KGS), cost_usd: Number(s.cost_usd.toFixed(2)), profit: Math.round(s.profit), nocost: s.nocost,
    promo_n: s.promo_n, promo_cost: Math.round(s.promo_usd * USD_KGS), promo_usd: Number(s.promo_usd.toFixed(2)) };
}

// План на неделю по её сумме: сколько перевести на «карту-сейф» (Simbank), сколько оставить, сколько USDT докупить
function plan(week, balanceUsd) {
  const reserve = Math.round(week.rev * RESERVE_PCT);
  const toSafe = Math.max(0, week.profit - reserve - (week.promo_cost || 0));   // расход на промо вычитаем: деньги реально потрачены
  const weeklySpend = week.cost_usd;                                 // расход на поставщика за неделю, USD
  const need = weeklySpend + MIN_BALANCE_USD - (balanceUsd == null ? 0 : balanceUsd);
  let buyUsd = 0;
  if (balanceUsd != null && need > 0) buyUsd = Math.max(MIN_DEPOSIT_USD, Math.ceil(need / 10) * 10);
  return {
    reserve, promo_cost: week.promo_cost || 0, to_safe: toSafe,
    keep: Math.max(0, week.rev - toSafe),                            // остаётся на картах приёма (закупка + резерв)
    weekly_spend_usd: Number(weeklySpend.toFixed(2)),
    buy_usd: buyUsd, buy_kgs: Math.round(buyUsd * USD_KGS),
    days_left: weeklySpend > 0 && balanceUsd != null ? Number((balanceUsd / (weeklySpend / 7)).toFixed(1)) : null,
  };
}

export async function financeSummary(env, nowMs = Date.now()) {
  const local = new Date(nowMs + TZ);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  const dayStart = Date.UTC(y, m, d) - TZ, dayEnd = dayStart + DAY;
  const dow = (local.getUTCDay() + 6) % 7;                           // 0 = понедельник
  const weekStart = dayStart - dow * DAY, lastWeekStart = weekStart - 7 * DAY;
  const monthStart = Date.UTC(y, m, 1) - TZ;
  let balance = null; try { balance = await fzGetBalance(env); } catch (e) { /* баланс недоступен */ }
  const [today, thisWeek, lastWeek, month, all, r7] = await Promise.all([
    sums(env, dayStart, dayEnd), sums(env, weekStart, dayEnd), sums(env, lastWeekStart, weekStart),
    sums(env, monthStart, dayEnd), sums(env, 0, dayEnd), sums(env, dayEnd - 7 * DAY, dayEnd),
  ]);
  const spend7 = r7.cost_usd + r7.promo_usd;                                        // реальный темп расхода: последние 7 дней
  return {
    rate: USD_KGS, balance_usd: balance, balance_kgs: balance == null ? null : Math.round(balance * USD_KGS),
    spend_per_day_usd: Number((spend7 / 7).toFixed(2)), days_left: spend7 > 0 && balance != null ? Number((balance / (spend7 / 7)).toFixed(1)) : null,
    today, week: thisWeek, last_week: lastWeek, month, all,
    plan_week: plan({ ...thisWeek, cost_usd: Math.max(thisWeek.cost_usd + thisWeek.promo_usd, spend7) }, balance),
    plan_last: plan({ ...lastWeek, cost_usd: Math.max(lastWeek.cost_usd + lastWeek.promo_usd, spend7) }, balance),
    constants: { reserve_pct: RESERVE_PCT, min_balance_usd: MIN_BALANCE_USD, min_deposit_usd: MIN_DEPOSIT_USD },
  };
}

export function weeklyText(f) {
  const w = f.last_week, p = f.plan_last;   // в понедельник отчёт за только что закончившуюся неделю
  let t = `💰 Итоги прошлой недели\n\nВыдано заказов: ${w.n}\nВыручка: ${fmt(w.rev)} сом\nСебестоимость: ${fmt(w.cost)} сом\nПрибыль: ${w.profit >= 0 ? '' : '−'}${fmt(Math.abs(w.profit))} сом` + (w.promo_n ? `\nПромо (бесплатные Weekly Pass): ${w.promo_n} шт, расход ${fmt(w.promo_cost)} сом (в прибыль не входит)` : '');
  t += `\n\n📤 Что перевести сейчас\n• На карту-сейф (Simbank): ${fmt(p.to_safe)} сом (прибыль за вычетом резерва ${fmt(p.reserve)} сом${p.promo_cost ? ' и промо ' + fmt(p.promo_cost) + ' сом' : ''})\n• На картах приёма (Mbank, O!Банк) оставьте остальное: это оборотные деньги на закупку`;
  if (f.balance_usd != null) {
    t += `\n\n🏦 FazerCards: баланс $${f.balance_usd.toFixed(2)} (≈ ${fmt(f.balance_kgs)} сом)`;
    if (f.days_left != null) t += `, хватит примерно на ${f.days_left} дн.`;
    t += p.buy_usd > 0 ? `\n• Докупите USDT на $${p.buy_usd} (≈ ${fmt(p.buy_kgs)} сом) одним платежом: комиссия сети 1 USDT одна` : '\n• Пополнять пока не нужно';
  }
  if (w.nocost) t += `\n\n(у ${w.nocost} заказ(ов) нет себестоимости: они не входят в прибыль)`;
  return t;
}

// Из cron каждую минуту: недельный план в Telegram — понедельник после 14:00 по Бишкеку, один раз за неделю
export async function maybeSendWeekly(env, nowMs = Date.now()) {
  const local = new Date(nowMs + TZ);
  if (local.getUTCDay() !== SEND_DOW || local.getUTCHours() < SEND_HOUR) return;
  const key = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)').run();
  const r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'finance_week_sent'").first();
  if (r && r.v === key) return;
  await env.DB.prepare("INSERT INTO meta (k,v) VALUES ('finance_week_sent', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(key).run();
  await notify(env, weeklyText(await financeSummary(env, nowMs)));
}
