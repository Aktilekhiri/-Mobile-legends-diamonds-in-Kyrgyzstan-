// Соответствие пакетов сайта и офферов FazerCards (регион Global).
// Себестоимость (cost, USD) в репозитории НЕ хранится: она берётся из секрета CATALOG_COSTS (JSON, см. loadCosts ниже).
// Нет cost у пакета = выдача вручную.
export const GLOBAL_CATALOG = {
  '13+1':   { offer: '14_diamonds' },
  '38+4':   { offer: '42_diamonds' },
  '50+5':   { offer: '50_5_diamonds_first_top_up_bonus' },
  '51+5':   { offer: '51_5_diamonds' }, // обычный пакет (не только на 1-е пополнение), 56 алмазов
  '64+6':   { offer: '70_diamonds' },
  '78+8':   { offer: '78_8_diamonds' },
  '156+16': { offer: '156_16_diamonds' },
  '234+23': { offer: '234_23_diamonds' },
  // составной пакет: два оффера подряд (234+23 и 78+8 = 343), 'a|b' = несколько заказов FazerCards
  '253+23': { offer: '234_23_diamonds|19_diamonds' }, // 276 = 257 + 19
  '312+31': { offer: '234_23_diamonds|78_8_diamonds' },
  '310+34': { offer: '234_23_diamonds|78_8_diamonds' }, // старый ключ (заказы, созданные до замены)
  '1294+81':  { offer: '625_81_diamonds|429_diamonds|240_diamonds' }, // 1375 = 706 + 429 + 240
  '1679+162': { offer: '625_81_diamonds|625_81_diamonds|429_diamonds' }, // 1841 = 706 + 706 + 429
  '284+0':  { offer: '284_diamonds' },
  '2015+383': { offer: '2015_383_diamonds' },
  '317+38': { offer: '355_diamonds' },
  '383+46': { offer: '429_diamonds' },
  '625+81': { offer: '625_81_diamonds' },
  '500+500': { offer: '500_65_diamonds_first_top_up_bonus' }, // бонус x2 только на первое пополнение этого номинала
  '1000+160': { offer: '1007_156_diamonds' },
  '1252+194': { offer: '1446_diamonds' },
  '1860+335': { offer: '1860_335_diamonds' },
  '2500+475': { offer: '2976_diamonds' },
  '3099+589': { offer: '3099_589_diamonds' },
  '4649+883': { offer: '4649_883_diamonds' },
  // служебный пакет для автоповтора Россия 6000 → Global: два заказа ПО ОЧЕРЕДИ (5532 + 706 = 6238); на сайте не продаётся
  '5532+706': { offer: '4649_883_diamonds|625_81_diamonds' },
  '7502+0': { offer: '7502_diamonds' },
  '7740+1548': { offer: '7740_1548_diamonds' },
  'Weekly Diamond Pass': { offer: 'weekly_pass' },
  'Weekly Elite Pack': { offer: 'weekly_elite_pack' },
  'Monthly Elite Pack': { offer: 'monthly_elite_pack' },
  'Twilight Pass': { offer: 'twilight_pass' },
};
// Регион Россия (категория mobile_legends_ru)
export const RU_CATALOG = {
  '35+0': { offer: '35_diamonds' }, '55+0': { offer: '55_diamonds' },
  '165+0': { offer: '165_diamonds' }, '275+0': { offer: '275_diamonds' },
  '565+0': { offer: '565_diamonds' }, '1155+0': { offer: '1155_diamonds' },
  '1765+0': { offer: '1765_diamonds' }, '2975+0': { offer: '2975_diamonds' },
  '6000+0': { offer: '6000_diamonds' },
  'Diamond Pass (weekly)': { offer: 'weekly_pass' },
};
// Регион Индонезия (категория mobile_legends_indonesia): только для аккаунтов с индонезийским регионом
export const ID_CATALOG = {
  '5+0': { offer: '5_diamonds' },
  '11+1': { offer: '11_1_diamonds' },
  '17+2': { offer: '17_2_diamonds' },
  '25+3': { offer: '25_3_diamonds' },
  '40+4': { offer: '40_4_diamonds' },
  '53+6': { offer: '53_6_diamonds' },
  '77+8': { offer: '77_8_diamonds' },
  '154+16': { offer: '154_16_diamonds' },
  '217+23': { offer: '217_23_diamonds' },
  '256+40': { offer: '256_40_diamonds' },
  '367+41': { offer: '367_41_diamonds' },
  '503+65': { offer: '503_65_diamonds' },
  '774+101': { offer: '774_101_diamonds' },
  '1708+302': { offer: '1708_302_diamonds' },
  '4003+827': { offer: '4003_827_diamonds' },
  '50+50': { offer: '50_50_diamonds_first_top_up_bonus' },
  '150+150': { offer: '150_150_diamonds_first_top_up_bonus' },
  '250+250': { offer: '250_250_diamonds_first_top_up_bonus' },
  '500+500': { offer: '500_500_diamonds_first_top_up_bonus' },
  'Weekly Diamond Pass': { offer: 'weekly_pass' },
  'Weekly Elite Pack': { offer: 'weekly_elite_pack' },
  'Monthly Elite Pack': { offer: 'monthly_elite_pack' },
  'Twilight Pass': { offer: 'twilight_pass' },
};
// Регион Турция (категория mobile_legends_turkey): только для аккаунтов этого региона
export const TURKEY_CATALOG = {
  '16+0': { offer: '16_diamonds' },
  '24+0': { offer: '24_diamonds' },
  '44+0': { offer: '44_diamonds' },
  'Weekly Elite Pack': { offer: 'weekly_elite_pack' },
  '88+0': { offer: '88_diamonds' },
  'Weekly Diamond Pass': { offer: 'weekly_pass' },
  '133+0': { offer: '133_diamonds' },
  '221+0': { offer: '221_diamonds' },
  'Monthly Elite Pack': { offer: 'monthly_elite_pack' },
  '494+0': { offer: '494_diamonds' },
  'Twilight Pass': { offer: 'twilight_pass' },
  '1041+0': { offer: '1041_diamonds' },
  '2645+0': { offer: '2645_diamonds' },
  '6146+0': { offer: '6146_diamonds' },
};
// Регион Малайзия (категория mobile_legends_malaysia): только для аккаунтов этого региона
export const MALAYSIA_CATALOG = {
  '13+1': { offer: '13_1_diamonds' },
  '38+4': { offer: '38_4_diamonds' },
  '50+5': { offer: '50_5_diamonds_first_top_up_bonus' },
  'Weekly Elite Pack': { offer: 'weekly_elite_pack' },
  '64+6': { offer: '64_6_diamonds' },
  'Weekly Diamond Pass': { offer: 'weekly_pass' },
  '127+13': { offer: '127_13_diamonds' },
  '150+15': { offer: '150_15_diamonds_first_top_up_bonus' },
  '250+25': { offer: '250_25_diamonds_first_top_up_bonus' },
  'Monthly Elite Pack': { offer: 'monthly_elite_pack' },
  '254+30': { offer: '254_30_diamonds' },
  '317+38': { offer: '317_38_diamonds' },
  '383+46': { offer: '383_46_diamonds' },
  'Twilight Pass': { offer: 'twilight_pass' },
  '500+65': { offer: '500_65_diamonds_first_top_up_bonus' },
  '633+83': { offer: '633_83_diamonds' },
  '940+144': { offer: '940_144_diamonds' },
  '1252+194': { offer: '1252_194_diamonds' },
  '2501+475': { offer: '2501_475_diamonds' },
  '6252+1250': { offer: '6252_1250_diamonds' },
};
// Регион Филиппины (категория mobile_legends_philippines): только для аккаунтов этого региона
export const PHILIPPINES_CATALOG = {
  '10+1': { offer: '10_1_diamonds' },
  '20+2': { offer: '20_2_diamonds' },
  '51+5': { offer: '51_5_diamonds' },
  '50+5': { offer: '50_5_diamonds_first_top_up_bonus' },
  'Weekly Diamond Pass': { offer: 'weekly_diamond_pass' },
  '102+10': { offer: '102_10_diamonds' },
  '153+15': { offer: '153_15_diamonds' },
  '203+20': { offer: '203_20_diamonds' },
  '150+15': { offer: '150_15_diamonds_first_top_up_bonus' },
  '303+33': { offer: '303_33_diamonds' },
  '250+25': { offer: '250_25_diamonds_first_top_up_bonus' },
  'Twilight Pass': { offer: 'twilight_pass' },
  '504+66': { offer: '504_66_diamonds' },
  '500+65': { offer: '500_65_diamonds_first_top_up_bonus' },
  '1007+156': { offer: '1007_156_diamonds' },
  '2015+383': { offer: '2015_383_diamonds' },
  '5035+1007': { offer: '5035_1007_diamonds' },
};
// Регион Сингапур (категория mobile_legends_singapore): только для аккаунтов этого региона
export const SINGAPORE_CATALOG = {
  '5+0': { offer: '5_diamonds' },
  '13+1': { offer: '13_1_diamonds' },
  '38+4': { offer: '38_4_diamonds' },
  'Weekly Elite Pack': { offer: 'weekly_elite_pack' },
  '50+5': { offer: '50_5_diamonds_first_top_up_bonus' },
  '64+6': { offer: '64_6_diamonds' },
  'Weekly Diamond Pass': { offer: 'weekly_pass' },
  '127+13': { offer: '127_13_diamonds' },
  '150+15': { offer: '150_15_diamonds_first_top_up_bonus' },
  'Monthly Elite Pack': { offer: 'monthly_elite_pack' },
  '254+30': { offer: '254_30_diamonds' },
  '250+25': { offer: '250_25_diamonds_first_top_up_bonus' },
  '317+38': { offer: '317_38_diamonds' },
  '383+46': { offer: '383_46_diamonds' },
  '500+65': { offer: '500_65_diamonds_first_top_up_bonus' },
  '633+83': { offer: '633_83_diamonds' },
  '940+144': { offer: '940_144_diamonds' },
  '1252+194': { offer: '1252_194_diamonds' },
  '2501+475': { offer: '2501_475_diamonds' },
  '6252+1250': { offer: '6252_1250_diamonds' },
};
// Регион Бразилия (категория mobile_legends_brazil): только для аккаунтов этого региона
export const BRAZIL_CATALOG = {
  '50+5': { offer: '50_5_diamonds_first_top_up_bonus' },
  '78+8': { offer: '78_8_diamonds' },
  'Weekly Diamond Pass': { offer: 'weekly_pass' },
  '156+16': { offer: '156_16_diamonds' },
  '150+15': { offer: '150_15_diamonds_first_top_up_bonus' },
  '234+23': { offer: '234_23_diamonds' },
  '310+34': { offer: '310_34_diamonds' },
  '250+25': { offer: '250_25_diamonds_first_top_up_bonus' },
  '482+0': { offer: '482_diamonds' },
  '465+51': { offer: '465_51_diamonds' },
  '500+65': { offer: '500_65_diamonds_first_top_up_bonus' },
  'Twilight Pass': { offer: 'twilight_pass' },
  '625+81': { offer: '625_81_diamonds' },
  '1860+335': { offer: '1860_335_diamonds' },
  '3099+589': { offer: '3099_589_diamonds' },
  '4649+883': { offer: '4649_883_diamonds' },
  '7740+1548': { offer: '7740_1548_diamonds' },
};
// Регион США (категория mobile_legends_united_states): только для аккаунтов этого региона
export const USA_CATALOG = {
  '51+5': { offer: '51_5_diamonds' },
  '253+25': { offer: '253_25_diamonds' },
  '505+66': { offer: '505_66_diamonds' },
  '1010+182': { offer: '1010_182_diamonds' },
  '1515+273': { offer: '1515_273_diamonds' },
  '2525+480': { offer: '2525_480_diamonds' },
  '3030+576': { offer: '3030_576_diamonds' },
  '4008+802': { offer: '4008_802_diamonds' },
  '5010+1002': { offer: '5010_1002_diamonds' },
};
// Игры (не MLBB): категория FazerCards, поле сервера, каталог офферов (ключ = offer_id).
export const GAMES = {
  // Ручная игра: без категории FazerCards и без cost, заказы всегда уходят владельцу на ручную выдачу (докупает у конкурентов).
  standoff2: { category: '', serverField: null, servers: null, manual: true, disabled: true, catalog: {
    '100_gold': {}, '200_gold': {}, '300_gold': {}, '500_gold': {}, '1000_gold': {}, '3000_gold': {},
  } },
  pubg: { category: 'pubg_mobile_auto', serverField: null, servers: null, catalog: {
    '60_uc': { offer: '60_uc' },
    '325_uc': { offer: '325_uc' },
    '660_uc': { offer: '660_uc' },
    '1800_uc': { offer: '1800_uc' },
    '3850_uc': { offer: '3850_uc' },
    '8100_uc': { offer: '8100_uc' },
    'prime_1_month': { offer: 'prime_1_month' },
    'elite_pass_lv1_50': { offer: 'elite_pass_lv1_50' },
    'elite_pass_lv1_100': { offer: 'elite_pass_lv1_100' },
    'prime_3_months': { offer: 'prime_3_months' },
    'prime_6_months': { offer: 'prime_6_months' },
    'prime_12_months': { offer: 'prime_12_months' },
    'prime_plus_1_month': { offer: 'prime_plus_1_month' },
    'prime_plus_3_months': { offer: 'prime_plus_3_months' },
    'prime_plus_6_months': { offer: 'prime_plus_6_months' },
    'prime_plus_12_months': { offer: 'prime_plus_12_months' },
    'elite_pass_plus_lv1_100': { offer: 'elite_pass_plus_lv1_100' },
  } },
  freefire: { category: 'free_fire_cis', serverField: null, servers: null, catalog: {
    '110_diamonds': { offer: '110_diamonds' },
    '341_diamonds': { offer: '341_diamonds' },
    '572_diamonds': { offer: '572_diamonds' },
    '1166_diamonds': { offer: '1166_diamonds' },
    '2398_diamonds': { offer: '2398_diamonds' },
    '6160_diamonds': { offer: '6160_diamonds' },
    'level_up_package_10': { offer: 'level_up_package_10' },
    'level_up_package_15': { offer: 'level_up_package_15' },
    'level_up_package_20': { offer: 'level_up_package_20' },
    'level_up_package_25': { offer: 'level_up_package_25' },
    'level_up_package_30': { offer: 'level_up_package_30' },
    'evo_access_7d': { offer: 'evo_access_7d' },
    'evo_access_30d': { offer: 'evo_access_30d' },
    'weekly_lite': { offer: 'weekly_lite' },
    'weekly_membership': { offer: 'weekly_membership' },
    'monthly_membership': { offer: 'monthly_membership' },
  } },
  hok: { category: 'honor_of_kings', serverField: null, servers: null, catalog: {
    '16_tokens': { offer: '16_tokens' },
    '80_tokens': { offer: '80_tokens' },
    '240_tokens': { offer: '240_tokens' },
    '400_tokens': { offer: '400_tokens' },
    '560_tokens': { offer: '560_tokens' },
    '830_tokens': { offer: '830_tokens' },
    '1245_tokens': { offer: '1245_tokens' },
    '2508_tokens': { offer: '2508_tokens' },
    '4180_tokens': { offer: '4180_tokens' },
    '8360_tokens': { offer: '8360_tokens' },
    'weekly_card': { offer: 'weekly_card' },
    'weekly_card_plus': { offer: 'weekly_card_plus' },
  } },
  genshin: { category: 'genshin_impact_global', serverField: "server", servers: ["america", "asia", "europe", "tw_hk_mo"], catalog: {
    '60_genesis_crystals': { offer: '60_genesis_crystals' },
    '300_30_genesis_crystals': { offer: '300_30_genesis_crystals' },
    '980_110_genesis_crystals': { offer: '980_110_genesis_crystals' },
    '1980_260_genesis_crystals': { offer: '1980_260_genesis_crystals' },
    '3280_600_genesis_crystals': { offer: '3280_600_genesis_crystals' },
    '6480_1600_genesis_crystals': { offer: '6480_1600_genesis_crystals' },
    'blessing_of_the_welkin_moon': { offer: 'blessing_of_the_welkin_moon' },
  } },
  wuwa: { category: 'wuthering_waves', serverField: "server", servers: ["os_asia", "os_usa", "os_euro", "os_sea", "os_cht"], catalog: {
    '60_lunite': { offer: '60_lunite' },
    '330_lunite': { offer: '330_lunite' },
    '1090_lunite': { offer: '1090_lunite' },
    '2240_lunite': { offer: '2240_lunite' },
    '3880_lunite': { offer: '3880_lunite' },
    '8080_lunite': { offer: '8080_lunite' },
    'lunite_subscription': { offer: 'lunite_subscription' },
  } },
  // --- Новые игры. type:'gift_cards' = выдача кода (kind: username = нужен @username Telegram, none = ничего не нужно) ---
  bloodstrike: { category: 'blood_strike', serverField: null, servers: null, catalog: {
    '51_bc': { offer: '51_bc' },
    '105_bc': { offer: '105_bc' },
    '320_bc': { offer: '320_bc' },
    '540_bc': { offer: '540_bc' },
    '1100_bc': { offer: '1100_bc' },
    '2260_bc': { offer: '2260_bc' },
    '5800_bc': { offer: '5800_bc' },
    'level_up_pass': { offer: 'level_up_pass' },
    'strike_pass_elite': { offer: 'strike_pass_elite' },
    'strike_pass_premium': { offer: 'strike_pass_premium' },
  } },
  hsr: { category: 'honkai_star_rail_global', serverField: "server", servers: ["america", "asia", "europe", "tw_hk_mo"], catalog: {
    '60_oneiric_shard': { offer: '60_oneiric_shard' },
    '300_30_oneiric_shard': { offer: '300_30_oneiric_shard' },
    '980_110_oneiric_shard': { offer: '980_110_oneiric_shard' },
    '1980_260_oneiric_shard': { offer: '1980_260_oneiric_shard' },
    '3280_600_oneiric_shard': { offer: '3280_600_oneiric_shard' },
    '6480_1600_oneiric_shard': { offer: '6480_1600_oneiric_shard' },
    'express_supply_pass': { offer: 'express_supply_pass' },
  } },
  zzz: { category: 'zenless_zone_zero_global', serverField: "server", servers: ["america", "asia", "europe", "tw_hk_mo"], catalog: {
    '60_monochromes': { offer: '60_monochromes' },
    '300_30_monochromes': { offer: '300_30_monochromes' },
    '980_110_monochromes': { offer: '980_110_monochromes' },
    '1980_260_monochromes': { offer: '1980_260_monochromes' },
    '3280_600_monochromes': { offer: '3280_600_monochromes' },
    '6480_1600_monochromes': { offer: '6480_1600_monochromes' },
    'inter_knot_membership': { offer: 'inter_knot_membership' },
  } },
  mchess: { category: 'magic_chess_gogo_global', serverField: null, servers: null, serverText: true, catalog: {
    '86_diamonds': { offer: '86_diamonds' },
    '172_diamonds': { offer: '172_diamonds' },
    '257_diamonds': { offer: '257_diamonds' },
    '344_diamonds': { offer: '344_diamonds' },
    '516_diamonds': { offer: '516_diamonds' },
    '706_diamonds': { offer: '706_diamonds' },
    '1060_diamonds': { offer: '1060_diamonds' },
    '2195_diamonds': { offer: '2195_diamonds' },
    'weekly_card': { offer: 'weekly_card' },
  } },
  deltaforce: { category: 'delta_force', serverField: null, servers: null, catalog: {
    '60_delta_coins': { offer: '60_delta_coins' },
    '320_delta_coins': { offer: '320_delta_coins' },
    '750_delta_coins': { offer: '750_delta_coins' },
    '1480_delta_coins': { offer: '1480_delta_coins' },
    '3950_delta_coins': { offer: '3950_delta_coins' },
    'season_pass_operations_special': { offer: 'season_pass_operations_special' },
    'season_pass_warfare_special': { offer: 'season_pass_warfare_special' },
    'season_pass_delta_force_deluxe': { offer: 'season_pass_delta_force_deluxe' },
  } },
  marvel: { category: 'marvel_rivals', serverField: null, servers: null, catalog: {
    '100_lattices': { offer: '100_lattices' },
    '500_lattices': { offer: '500_lattices' },
    '1000_lattices': { offer: '1000_lattices' },
    '2180_lattices': { offer: '2180_lattices' },
    '5680_lattices': { offer: '5680_lattices' },
  } },
  arena: { category: 'arena_breakout', serverField: null, servers: null, catalog: {
    '66_bonds': { offer: '66_bonds' },
    '335_bonds': { offer: '335_bonds' },
    '675_bonds': { offer: '675_bonds' },
    '1690_bonds': { offer: '1690_bonds' },
    '3400_bonds': { offer: '3400_bonds' },
    'beginner_select': { offer: 'beginner_select' },
    'monthly_advanced_battle_pass_activation_pass': { offer: 'monthly_advanced_battle_pass_activation_pass' },
    'monthly_premium_battle_pass_activation_pass': { offer: 'monthly_premium_battle_pass_activation_pass' },
    'bulletproof_case_30d': { offer: 'bulletproof_case_30d' },
  } },
  tgstars: { category: 'telegram_stars', serverField: null, servers: null, type: 'gift_cards', direct: 'stars', kind: 'username', catalog: {
    '50': { offer: '50' },
    '100': { offer: '100' },
    '250': { offer: '250' },
    '500': { offer: '500' },
    '1000': { offer: '1000' },
    '2500': { offer: '2500' },
    '5000': { offer: '5000' },
  } },
  tgpremium: { category: 'telegram_premium', serverField: null, servers: null, type: 'gift_cards', direct: 'premium', kind: 'username', catalog: {
    '3m': { offer: '3m' },
    '6m': { offer: '6m' },
    '12m': { offer: '12m' },
  } },
  // PUBG Mobile кодом для Midasbuy (подарочные карты FazerCards): мгновенно, игрок активирует код сам
  pubgcode: { category: 'pubg_mobile', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '60_uc': { offer: '60_uc' }, '325_uc': { offer: '325_uc' }, '660_uc': { offer: '660_uc' },
    '3850_uc': { offer: '3850_uc' }, '8100_uc': { offer: '8100_uc' },
  } },
  roblox: { category: 'roblox_global', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '50_robux': { offer: '50_robux' },
    '100_robux': { offer: '100_robux' }, // 50 Robux убран: у FazerCards больше нет такого номинала (404 No matching offer)
    '800_robux': { offer: '800_robux' },
    '1000_robux': { offer: '1000_robux' },
    '2000_robux': { offer: '2000_robux' },
    '4500_robux': { offer: '4500_robux' },
    '10000_robux': { offer: '10000_robux' },
  } },
  steam: { category: 'steam_cis', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '5': { offer: '5' },
    '10': { offer: '10' },
    '15': { offer: '15' },
    '20': { offer: '20' },
    '25': { offer: '25' },
    '30': { offer: '30' },
    '50': { offer: '50' },
    '100': { offer: '100' },
  } },
  discord: { category: 'discord_global', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    'discord_basic_1_month_subscription': { offer: 'discord_basic_1_month_subscription' },
    'discord_nitro_1_month_subscription': { offer: 'discord_nitro_1_month_subscription' },
    'discord_nitro_12_months_subscription': { offer: 'discord_nitro_12_months_subscription' },
  } },
  netflix: { category: 'netflix_us', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '15_usd': { offer: '15_usd' },
    '25_usd': { offer: '25_usd' },
    '30_usd': { offer: '30_usd' },
    '40_usd': { offer: '40_usd' },
    '50_usd': { offer: '50_usd' },
    '60_usd': { offer: '60_usd' },
    '75_usd': { offer: '75_usd' },
  } },
  psn: { category: 'playstation_us', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '5_usd': { offer: '5_usd' },
    '10_usd': { offer: '10_usd' },
    '25_usd': { offer: '25_usd' },
    '50_usd': { offer: '50_usd' },
    '75_usd': { offer: '75_usd' },
    '100_usd': { offer: '100_usd' },
  } },
  gplay: { category: 'google_play_us', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '5_usd': { offer: '5_usd' },
    '10_usd': { offer: '10_usd' },
    '15_usd': { offer: '15_usd' },
    '20_usd': { offer: '20_usd' },
    '25_usd': { offer: '25_usd' },
    '50_usd': { offer: '50_usd' },
    '100_usd': { offer: '100_usd' },
  } },
  gplay_tr: { category: 'google_play_tr', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '50_try': { offer: '50_try' },
    '100_try': { offer: '100_try' },
    '250_try': { offer: '250_try' },
    '500_try': { offer: '500_try' },
    '1000_try': { offer: '1000_try' },
  } },
  gplay_de: { category: 'google_play_de', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '10_eur': { offer: '10_eur' },
    '15_eur': { offer: '15_eur' },
    '25_eur': { offer: '25_eur' },
    '50_eur': { offer: '50_eur' },
  } },
  gplay_uk: { category: 'google_play_uk', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '10_gbp': { offer: '10_gbp' },
    '25_gbp': { offer: '25_gbp' },
    '50_gbp': { offer: '50_gbp' },
    '100_gbp': { offer: '100_gbp' },
  } },
  gplay_ae: { category: 'google_play_ae', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '30_aed': { offer: '30_aed' },
    '50_aed': { offer: '50_aed' },
    '100_aed': { offer: '100_aed' },
    '300_aed': { offer: '300_aed' },
  } },
  nintendo: { category: 'nintendo_us', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '5_usd': { offer: '5_usd' },
    '10_usd': { offer: '10_usd' },
    '20_usd': { offer: '20_usd' },
    '35_usd': { offer: '35_usd' },
    '50_usd': { offer: '50_usd' },
  } },
  apple_us: { category: 'app_store_itunes_us', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '5_usd': { offer: '5_usd' },
    '10_usd': { offer: '10_usd' },
    '15_usd': { offer: '15_usd' },
    '20_usd': { offer: '20_usd' },
    '25_usd': { offer: '25_usd' },
    '50_usd': { offer: '50_usd' },
    '100_usd': { offer: '100_usd' },
  } },
  apple_tr: { category: 'app_store_itunes_tr', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '150_try': { offer: '150_try' },
    '200_try': { offer: '200_try' },
    '300_try': { offer: '300_try' },
    '400_try': { offer: '400_try' },
    '600_try': { offer: '600_try' },
    '799_try': { offer: '799_try' },
    '1000_try': { offer: '1000_try' },
  } },
  apple_ru: { category: 'app_store_itunes_ru', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '500_rub': { offer: '500_rub' },
    '1000_rub': { offer: '1000_rub' },
    '1500_rub': { offer: '1500_rub' },
    '2000_rub': { offer: '2000_rub' },
    '3000_rub': { offer: '3000_rub' },
    '5000_rub': { offer: '5000_rub' },
  } },
  valorant: { category: 'valorant_ru', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '325_vp': { offer: '325_vp' },
    '475_vp': { offer: '475_vp' },
    '1000_vp': { offer: '1000_vp' },
    '1520_vp': { offer: '1520_vp' },
    '2050_vp': { offer: '2050_vp' },
    '2575_vp': { offer: '2575_vp' },
    '3650_vp': { offer: '3650_vp' },
    '5350_vp': { offer: '5350_vp' },
    '8700_vp': { offer: '8700_vp' },
  } },
  whiteout: { category: 'whiteout_survival', serverField: null, servers: null, catalog: {
    '99_frost_stars': { offer: '99_frost_stars' },
    '299_frost_stars': { offer: '299_frost_stars' },
    '499_frost_stars': { offer: '499_frost_stars' },
    '999_frost_stars': { offer: '999_frost_stars' },
    '1999_frost_stars': { offer: '1999_frost_stars' },
    '4999_frost_stars': { offer: '4999_frost_stars' },
    '7499_frost_stars': { offer: '7499_frost_stars' },
    '9999_frost_stars': { offer: '9999_frost_stars' },
  } },
  lords: { category: 'lords_mobile', serverField: null, servers: null, catalog: {
    'weekly_diamond_pass': { offer: 'weekly_diamond_pass' },
    '395_diamonds': { offer: '395_diamonds' },
    '785_diamonds': { offer: '785_diamonds' },
    '1179_diamonds': { offer: '1179_diamonds' },
    'monthly_diamond_pass': { offer: 'monthly_diamond_pass' },
    '1964_diamonds': { offer: '1964_diamonds' },
    '3928_diamonds': { offer: '3928_diamonds' },
    '7857_diamonds': { offer: '7857_diamonds' },
  } },
  identityv: { category: 'identity_v', serverField: "server", servers: ["Asia", "NA and EU"], catalog: {
    '60_6_echoes': { offer: '60_6_echoes' },
    'inspirations_package': { offer: 'inspirations_package' },
    '185_18_echoes': { offer: '185_18_echoes' },
    '305_30_echoes': { offer: '305_30_echoes' },
    'clues_package': { offer: 'clues_package' },
    '690_69_echoes': { offer: '690_69_echoes' },
    'memory_sphere_package': { offer: 'memory_sphere_package' },
    '2025_202_echoes': { offer: '2025_202_echoes' },
    '3330_333_echoes': { offer: '3330_333_echoes' },
    '6590_659_echoes': { offer: '6590_659_echoes' },
  } },
  fortnite: { category: 'fortnite_eu', serverField: null, servers: null, type: 'gift_cards', kind: 'none', catalog: {
    '10': { offer: '10_eur' },
    '25': { offer: '25_eur' },
    '50': { offer: '50_eur' },
    '100': { offer: '100_eur' },
  } },
};

// Все каталоги по ключу региона/игры, которые шлёт сайт
export const CATALOGS = { global: GLOBAL_CATALOG, russia: RU_CATALOG, indonesia: ID_CATALOG, turkey: TURKEY_CATALOG, malaysia: MALAYSIA_CATALOG, philippines: PHILIPPINES_CATALOG, singapore: SINGAPORE_CATALOG, brazil: BRAZIL_CATALOG, usa: USA_CATALOG, ...Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, g.catalog])) };
export const USD_KGS = 90; // курс для расчёта прибыли в уведомлениях (обновляйте вручную)
export const MAX_AUTO_COST_USD = 116; // дороже — только вручную (самый дорогой пакет ≈ $115.82)

// Финансы с чистого листа: в выручку, прибыль и отчёты входят только заказы, созданные с этого момента (5.11.2026, 00:00 Бишкека)
// и оплаченные через Finik (или с баланса, который пополняется через Finik). Старые заказы остаются в базе, но в отчёты не попадают.
export const FIN_START_MS = 1793815200000;
export const FIN_WHERE = "created_at >= " + FIN_START_MS + " AND COALESCE(method,'') IN ('Finik','Баланс','promo')";

// Временно отключённые пакеты (поставщик отвечает «unavailable»). Формат: 'регион/игра:ключ_пакета'. Убрать строку, чтобы вернуть пакет.
export const OFF_PKGS = [];

// Все регионы Mobile Legends (ключ региона = ключ каталога); категории FazerCards — в fazercards.js
export const MLBB_REGIONS = ['global', 'russia', 'indonesia', 'turkey', 'malaysia', 'philippines', 'singapore', 'brazil', 'usa'];

// Подмешивает себестоимость из секрета CATALOG_COSTS: {"<регион или игра>|<ключ пакета>": USD}.
// Без секрета cost не задан и все заказы уходят на ручную выдачу (безопасный режим).
let _costsLoaded = false;
export function loadCosts(env) {
  if (_costsLoaded) return;
  let m = {};
  // секрет не больше 5 КБ: себестоимость лежит в нескольких секретах CATALOG_COSTS, CATALOG_COSTS2, ...
  for (const nm of ['CATALOG_COSTS', 'CATALOG_COSTS2', 'CATALOG_COSTS3', 'CATALOG_COSTS4', 'CATALOG_COSTS5']) {
    try { Object.assign(m, JSON.parse((env && env[nm]) || '{}') || {}); } catch (e) {}
  }
  for (const k of Object.keys(m)) {
    const i = k.indexOf('|'), group = k.slice(0, i), key = k.slice(i + 1);
    const cat = CATALOGS[group] || (GAMES[group] && GAMES[group].catalog);
    if (cat && cat[key]) cat[key].cost = Number(m[k]);
  }
  // Карты PUBG-кодом (pubgcode): себестоимость берём у такого же пакета PUBG (карта на 0.5-2% дешевле, запас в нашу пользу)
  if (GAMES.pubgcode && GAMES.pubg) for (const k of Object.keys(GAMES.pubgcode.catalog)) {
    const src = GAMES.pubg.catalog[k], dst = GAMES.pubgcode.catalog[k];
    if (src && src.cost > 0 && !(dst.cost > 0)) dst.cost = src.cost;
  }
  _costsLoaded = Object.keys(m).length > 0;
}
