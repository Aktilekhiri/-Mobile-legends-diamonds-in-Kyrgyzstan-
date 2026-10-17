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
  '317+38': { offer: '355_diamonds', cost: 5.75 },
  '383+46': { offer: '429_diamonds', cost: 5.804 },
  '625+81': { offer: '625_81_diamonds', cost: 9.273 },
  '504+66': { offer: '504_66_diamonds', cost: 9.0 },
  '716+0': { offer: '716_diamonds', cost: 11.5 },
  '1000+160': { offer: '1007_156_diamonds', cost: 18.76 },
  '2015+383': { offer: '2015_383_diamonds', cost: 32.7 },
  '7502+0': { offer: '7502_diamonds', cost: 114.73 },
  '1252+194': { offer: '1446_diamonds', cost: 22.93 },
  '1860+335': { offer: '1860_335_diamonds', cost: 28.069 },
  '2500+475': { offer: '2976_diamonds', cost: 45.98 },
  '3099+589': { offer: '3099_589_diamonds', cost: 46.827 },
  '4649+883': { offer: '4649_883_diamonds', cost: 70.703 },
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
export const CATALOGS = { global: GLOBAL_CATALOG, russia: RU_CATALOG };
export const MAX_AUTO_COST_USD = 60; // дороже — только вручную
