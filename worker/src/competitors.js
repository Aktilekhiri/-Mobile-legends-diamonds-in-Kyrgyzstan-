// Розничные цены конкурентов (сом) для подсказки «выгодно ли докупить вручную».
// Снято 17.11.2026 вручную: Donix, Refill Store, Play.kg. Цены меняются: при необходимости обновляйте здесь.
// Ключ = '<игра>:<ключ пакета на сайте>' → самая низкая цена и где она.
export const COMPETITOR_PRICES = {
  'pubg:60_uc': { price: 85, shop: 'Donix' },
  'pubg:325_uc': { price: 420, shop: 'Donix' },
  'pubg:660_uc': { price: 855, shop: 'Donix' },
  'pubg:1800_uc': { price: 2161, shop: 'Refill Store' },
  'pubg:3850_uc': { price: 4282, shop: 'Donix' },
  'pubg:8100_uc': { price: 8452, shop: 'Donix' },
  'pubg:prime_1_month': { price: 85, shop: 'Donix' },
  'pubg:prime_3_months': { price: 262, shop: 'Donix' },
  'pubg:prime_6_months': { price: 519, shop: 'Play.kg' },
  'pubg:prime_12_months': { price: 1038, shop: 'Play.kg' },
  'pubg:prime_plus_1_month': { price: 865, shop: 'Play.kg' },
  'pubg:prime_plus_3_months': { price: 2495, shop: 'Donix' },
  'pubg:prime_plus_6_months': { price: 5111, shop: 'Play.kg' },
  'pubg:prime_plus_12_months': { price: 9895, shop: 'Donix' },
  'pubg:elite_pass_lv1_50': { price: 535, shop: 'Donix' },
  'pubg:elite_pass_lv1_100': { price: 1085, shop: 'Donix' },
  'pubg:elite_pass_plus_lv1_100': { price: 2595, shop: 'Donix' },
  'standoff2:100_gold': { price: 122, shop: 'Refill Store' },
  'standoff2:200_gold': { price: 231, shop: 'Refill Store' },
  'standoff2:300_gold': { price: 353, shop: 'Refill Store' },
  'standoff2:500_gold': { price: 563, shop: 'Refill Store' },
  'standoff2:1000_gold': { price: 1116, shop: 'Refill Store' },
  'standoff2:3000_gold': { price: 3056, shop: 'Refill Store' },
};

// Подсказка владельцу: где купить дешевле всего и сколько останется прибыли после комиссии оплаты.
// Возвращает { text, profitable } (profitable = null, если цены конкурентов нет в таблице).
export function marketHint(o) {
  const c = COMPETITOR_PRICES[o.region + ':' + o.pkg];
  if (!c) return { text: '', profitable: null };
  const fee = Number(o.fee_kgs) || Math.round(o.price_kgs * 0.02);
  const profit = Math.round(o.price_kgs - c.price - fee);
  const ok = profit > 0;
  return { profitable: ok, profit, shop: c.shop, price: c.price,
    text: `\n🛒 Купить у конкурента: ${c.shop} ${c.price} сом → ${ok ? '✅ выгодно, прибыль' : '❌ невыгодно, убыток'} ${profit >= 0 ? '+' : '−'}${Math.abs(profit)} сом (после комиссии ${fee})` };
}
