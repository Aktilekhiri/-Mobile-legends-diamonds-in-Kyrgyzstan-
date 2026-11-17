// Розничные цены конкурентов (сом) для подсказки «выгодно ли докупить вручную».
// Снято 17.11.2026 вручную: Donix, Refill Store, Play.kg, EagleShop. Цены меняются: при необходимости обновляйте здесь.
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
  'global:50+5': { price: 65, shop: 'Play.kg' },
  'global:78+8': { price: 101, shop: 'Play.kg' },
  'global:150+15': { price: 193, shop: 'Refill Store' },
  'global:156+16': { price: 199, shop: 'Play.kg' },
  'global:234+23': { price: 299, shop: 'Play.kg' },
  'global:250+25': { price: 313, shop: 'Refill Store' },
  'global:312+31': { price: 400, shop: 'Play.kg' },
  'global:500+65': { price: 642, shop: 'Refill Store' },
  'global:625+81': { price: 790, shop: 'Play.kg' },
  'global:1860+335': { price: 2410, shop: 'Refill Store' },
  'global:3099+589': { price: 4017, shop: 'Refill Store' },
  'global:4649+883': { price: 6026, shop: 'Refill Store' },
  'global:7740+1548': { price: 10042, shop: 'Refill Store' },
  'global:Weekly Diamond Pass': { price: 127, shop: 'Play.kg' },
  'global:Weekly Elite Pack': { price: 65, shop: 'Play.kg' },
  'global:Monthly Elite Pack': { price: 331, shop: 'Play.kg' },
  'global:Twilight Pass': { price: 665, shop: 'Play.kg' },
  'freefire:110_diamonds': { price: 75, shop: 'Play.kg' },
  'freefire:341_diamonds': { price: 229, shop: 'Play.kg' },
  'freefire:572_diamonds': { price: 372, shop: 'Play.kg' },
  'freefire:1166_diamonds': { price: 745, shop: 'Play.kg' },
  'freefire:2398_diamonds': { price: 1489, shop: 'Play.kg' },
  'freefire:6160_diamonds': { price: 3700, shop: 'Play.kg' },
  'freefire:level_up_package_10': { price: 59, shop: 'Play.kg' },
  'freefire:level_up_package_15': { price: 59, shop: 'Play.kg' },
  'freefire:level_up_package_20': { price: 59, shop: 'Play.kg' },
  'freefire:level_up_package_25': { price: 59, shop: 'Play.kg' },
  'freefire:level_up_package_30': { price: 85, shop: 'Play.kg' },
  'freefire:weekly_lite': { price: 36, shop: 'Play.kg' },
  'freefire:weekly_membership': { price: 149, shop: 'Play.kg' },
  'freefire:monthly_membership': { price: 537, shop: 'Play.kg' },
  'roblox:50_robux': { price: 108, shop: 'EagleShop' },
  'roblox:100_robux': { price: 165, shop: 'EagleShop' },
  'roblox:800_robux': { price: 859, shop: 'EagleShop' },
  'roblox:1000_robux': { price: 1059, shop: 'EagleShop' },
  'roblox:2000_robux': { price: 2127, shop: 'Refill Store' },
  'roblox:4500_robux': { price: 4599, shop: 'EagleShop' },
  'roblox:10000_robux': { price: 9399, shop: 'EagleShop' },
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
