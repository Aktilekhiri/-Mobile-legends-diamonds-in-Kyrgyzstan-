// Соответствие пакетов сайта и офферов FazerCards (регион Global).
// cost — ожидаемая себестоимость в USD (Gold-цены). Нет записи = выдача вручную.
export const GLOBAL_CATALOG = {
  '13+1':   { offer: '14_diamonds', cost: 0.23 },
  '38+4':   { offer: '42_diamonds', cost: 0.69 },
  '50+5':   { offer: '50_5_diamonds_first_top_up_bonus', cost: 0.7578 },
  '64+6':   { offer: '70_diamonds', cost: 1.15 },
  '78+8':   { offer: '78_8_diamonds', cost: 1.189 },
  '156+16': { offer: '156_16_diamonds', cost: 2.3582 },
  '234+23': { offer: '234_23_diamonds', cost: 3.417 },
  // составной пакет: два оффера подряд (234+23 и 78+8 = 343), 'a|b' = несколько заказов FazerCards
  '253+23': { offer: '234_23_diamonds|19_diamonds', cost: 3.754 }, // 276 = 257 + 19
  '312+31': { offer: '234_23_diamonds|78_8_diamonds', cost: 4.606 },
  '310+34': { offer: '234_23_diamonds|78_8_diamonds', cost: 4.606 }, // старый ключ (заказы, созданные до замены)
  '1294+81':  { offer: '625_81_diamonds|429_diamonds|240_diamonds', cost: 19.133 }, // 1375 = 706 + 429 + 240
  '1679+162': { offer: '625_81_diamonds|625_81_diamonds|429_diamonds', cost: 24.351 }, // 1841 = 706 + 706 + 429
  '284+0':  { offer: '284_diamonds', cost: 4.6345 },
  '2015+383': { offer: '2015_383_diamonds', cost: 33.7311 },
  '317+38': { offer: '355_diamonds', cost: 5.75 },
  '383+46': { offer: '429_diamonds', cost: 5.804 },
  '625+81': { offer: '625_81_diamonds', cost: 9.273 },
  '500+500': { offer: '500_65_diamonds_first_top_up_bonus', cost: 7.5225 }, // бонус x2 только на первое пополнение этого номинала
  '1000+160': { offer: '1007_156_diamonds', cost: 18.76 },
  '1252+194': { offer: '1446_diamonds', cost: 22.93 },
  '1860+335': { offer: '1860_335_diamonds', cost: 28.069 },
  '2500+475': { offer: '2976_diamonds', cost: 45.98 },
  '3099+589': { offer: '3099_589_diamonds', cost: 46.827 },
  '4649+883': { offer: '4649_883_diamonds', cost: 70.703 },
  '7502+0': { offer: '7502_diamonds', cost: 115.5703 },
  '7740+1548': { offer: '7740_1548_diamonds', cost: 117.433 },
  'Weekly Diamond Pass': { offer: 'weekly_pass', cost: 1.4777 },
  'Weekly Elite Pack': { offer: 'weekly_elite_pack', cost: 0.7759 },
  'Monthly Elite Pack': { offer: 'monthly_elite_pack', cost: 3.8321 },
  'Twilight Pass': { offer: 'twilight_pass', cost: 7.8305 },
};
// Регион Россия (категория mobile_legends_ru)
export const RU_CATALOG = {
  '35+0': { offer: '35_diamonds', cost: 0.596 }, '55+0': { offer: '55_diamonds', cost: 0.9373 },
  '165+0': { offer: '165_diamonds', cost: 2.8168 }, '275+0': { offer: '275_diamonds', cost: 4.6963 },
  '565+0': { offer: '565_diamonds', cost: 9.447 }, '1155+0': { offer: '1155_diamonds', cost: 18.955 },
  '1765+0': { offer: '1765_diamonds', cost: 28.341 }, '2975+0': { offer: '2975_diamonds', cost: 47.286 },
  '6000+0': { offer: '6000_diamonds', cost: 94.45 },
  'Diamond Pass (weekly)': { offer: 'weekly_pass', cost: 1.89 },
};
// Игры (не MLBB): категория FazerCards, поле сервера, каталог офферов (ключ = offer_id).
export const GAMES = {
  pubg: { category: 'pubg_mobile_auto', serverField: null, servers: null, catalog: {
    '60_uc': { offer: '60_uc', cost: 0.8798 },
    '325_uc': { offer: '325_uc', cost: 4.38 },
    '660_uc': { offer: '660_uc', cost: 8.76 },
    '1800_uc': { offer: '1800_uc', cost: 21.9 },
    '3850_uc': { offer: '3850_uc', cost: 43.9439 },
    '8100_uc': { offer: '8100_uc', cost: 87.5 },
    'prime_1_month': { offer: 'prime_1_month', cost: 0.88 },
    'elite_pass_lv1_50': { offer: 'elite_pass_lv1_50', cost: 5.3 },
    'elite_pass_lv1_100': { offer: 'elite_pass_lv1_100', cost: 10.692 },
  } },
  freefire: { category: 'free_fire_cis', serverField: null, servers: null, catalog: {
    '110_diamonds': { offer: '110_diamonds', cost: 0.7809 },
    '341_diamonds': { offer: '341_diamonds', cost: 2.3781 },
    '572_diamonds': { offer: '572_diamonds', cost: 3.867 },
    '1166_diamonds': { offer: '1166_diamonds', cost: 7.7547 },
    '2398_diamonds': { offer: '2398_diamonds', cost: 15.5094 },
    '6160_diamonds': { offer: '6160_diamonds', cost: 39.2904 },
    'weekly_lite': { offer: 'weekly_lite', cost: 0.3723 },
    'weekly_membership': { offer: 'weekly_membership', cost: 1.5509 },
    'monthly_membership': { offer: 'monthly_membership', cost: 5.5834 },
  } },
  hok: { category: 'honor_of_kings', serverField: null, servers: null, catalog: {
    '80_tokens': { offer: '80_tokens', cost: 0.84 },
    '240_tokens': { offer: '240_tokens', cost: 2.51 },
    '400_tokens': { offer: '400_tokens', cost: 4.19 },
    '830_tokens': { offer: '830_tokens', cost: 8.38 },
    '2508_tokens': { offer: '2508_tokens', cost: 25.15 },
    '8360_tokens': { offer: '8360_tokens', cost: 83.84 },
    'weekly_card': { offer: 'weekly_card', cost: 0.95 },
  } },
  genshin: { category: 'genshin_impact_global', serverField: "server", servers: ["america", "asia", "europe", "tw_hk_mo"], catalog: {
    '60_genesis_crystals': { offer: '60_genesis_crystals', cost: 1.01 },
    '300_30_genesis_crystals': { offer: '300_30_genesis_crystals', cost: 5.0298 },
    '980_110_genesis_crystals': { offer: '980_110_genesis_crystals', cost: 15.0692 },
    '1980_260_genesis_crystals': { offer: '1980_260_genesis_crystals', cost: 30.1384 },
    '3280_600_genesis_crystals': { offer: '3280_600_genesis_crystals', cost: 50.2273 },
    '6480_1600_genesis_crystals': { offer: '6480_1600_genesis_crystals', cost: 100.4445 },
    'blessing_of_the_welkin_moon': { offer: 'blessing_of_the_welkin_moon', cost: 5.0298 },
  } },
  wuwa: { category: 'wuthering_waves', serverField: "server", servers: ["os_asia", "os_usa", "os_euro", "os_sea", "os_cht"], catalog: {
    '60_lunite': { offer: '60_lunite', cost: 0.816 },
    '330_lunite': { offer: '330_lunite', cost: 4.141 },
    '1090_lunite': { offer: '1090_lunite', cost: 12.475 },
    '2240_lunite': { offer: '2240_lunite', cost: 24.949 },
    '3880_lunite': { offer: '3880_lunite', cost: 41.361 },
    '8080_lunite': { offer: '8080_lunite', cost: 81.355 },
    'lunite_subscription': { offer: 'lunite_subscription', cost: 4.141 },
  } },
  // --- Новые игры. type:'gift_cards' = выдача кода (kind: username = нужен @username Telegram, none = ничего не нужно) ---
  bloodstrike: { category: 'blood_strike', serverField: null, servers: null, catalog: {
    '51_bc': { offer: '51_bc', cost: 0.3798 },
    '105_bc': { offer: '105_bc', cost: 0.7607 },
    '320_bc': { offer: '320_bc', cost: 2.2568 },
    '540_bc': { offer: '540_bc', cost: 3.758 },
    '1100_bc': { offer: '1100_bc', cost: 7.5059 },
    '2260_bc': { offer: '2260_bc', cost: 14.9211 },
    '5800_bc': { offer: '5800_bc', cost: 37.1465 },
    'level_up_pass': { offer: 'level_up_pass', cost: 1.5516 },
    'strike_pass_elite': { offer: 'strike_pass_elite', cost: 3.1142 },
    'strike_pass_premium': { offer: 'strike_pass_premium', cost: 7.0193 },
  } },
  hsr: { category: 'honkai_star_rail_global', serverField: "server", servers: ["america", "asia", "europe", "tw_hk_mo"], catalog: {
    '60_oneiric_shard': { offer: '60_oneiric_shard', cost: 0.8866 },
    '300_30_oneiric_shard': { offer: '300_30_oneiric_shard', cost: 4.3222 },
    '980_110_oneiric_shard': { offer: '980_110_oneiric_shard', cost: 13.6416 },
    '1980_260_oneiric_shard': { offer: '1980_260_oneiric_shard', cost: 26.1749 },
    '3280_600_oneiric_shard': { offer: '3280_600_oneiric_shard', cost: 43.655 },
    '6480_1600_oneiric_shard': { offer: '6480_1600_oneiric_shard', cost: 86.7155 },
    'express_supply_pass': { offer: 'express_supply_pass', cost: 4.3222 },
  } },
  zzz: { category: 'zenless_zone_zero_global', serverField: "server", servers: ["america", "asia", "europe", "tw_hk_mo"], catalog: {
    '60_monochromes': { offer: '60_monochromes', cost: 0.9723 },
    '300_30_monochromes': { offer: '300_30_monochromes', cost: 4.9042 },
    '980_110_monochromes': { offer: '980_110_monochromes', cost: 14.7553 },
    '1980_260_monochromes': { offer: '1980_260_monochromes', cost: 29.5214 },
    '3280_600_monochromes': { offer: '3280_600_monochromes', cost: 49.2129 },
    '6480_1600_monochromes': { offer: '6480_1600_monochromes', cost: 98.4367 },
    'inter_knot_membership': { offer: 'inter_knot_membership', cost: 4.9042 },
  } },
  tgstars: { category: 'telegram_stars', serverField: null, servers: null, type: 'gift_cards', direct: 'stars', kind: 'username', catalog: {
    '50': { offer: '50', cost: 0.7669 },
    '100': { offer: '100', cost: 1.5337 },
    '250': { offer: '250', cost: 3.8344 },
    '500': { offer: '500', cost: 7.6687 },
    '1000': { offer: '1000', cost: 15.3375 },
    '2500': { offer: '2500', cost: 38.3438 },
    '5000': { offer: '5000', cost: 76.6875 },
  } },
  tgpremium: { category: 'telegram_premium', serverField: null, servers: null, type: 'gift_cards', direct: 'premium', kind: 'username', catalog: {
    '3m': { offer: '3m', cost: 12.27 },
    '6m': { offer: '6m', cost: 16.36 },
    '12m': { offer: '12m', cost: 29.6525 },
  } },
  roblox: { category: 'roblox_global', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '800_robux': { offer: '800_robux', cost: 8.9668 },
    '1000_robux': { offer: '1000_robux', cost: 10.92 },
    '2000_robux': { offer: '2000_robux', cost: 22.165 },
    '2500_robux': { offer: '2500_robux', cost: 28.8483 },
    '3000_robux': { offer: '3000_robux', cost: 34.7247 },
    '4500_robux': { offer: '4500_robux', cost: 48.8638 },
  } },
};

// Все каталоги по ключу региона/игры, которые шлёт сайт
export const CATALOGS = { global: GLOBAL_CATALOG, russia: RU_CATALOG, ...Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, g.catalog])) };
export const USD_KGS = 89.05; // курс для расчёта прибыли в уведомлениях (обновляйте вручную)
export const MAX_AUTO_COST_USD = 60; // дороже — только вручную
