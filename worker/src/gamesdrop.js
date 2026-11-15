// GamesDrop Partner API (https://gamesdrop.io/en/docs/partner-api). Хост: https://partner.gamesdrop.io
// Авторизация: заголовок Authorization: <Shop Token> (без "Bearer"). Секрет GAMESDROP_TOKEN в Cloudflare.
// Пока только проверка связи (баланс, поиск в каталоге, цена, тестовый заказ на оффер 999 «Steam US»). Реальные покупки не делаются.
const BASE = 'https://partner.gamesdrop.io';

async function gd(env, method, path, body) {
  if (!env.GAMESDROP_TOKEN) throw new Error('GAMESDROP_TOKEN не задан в Cloudflare');
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(BASE + path, { method, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: env.GAMESDROP_TOKEN }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let d = {}; try { d = JSON.parse(t); } catch (e) { d = { raw: t.slice(0, 300) }; }
    return { http: r.status, data: d };
  } finally { clearTimeout(tm); }
}

// Безопасная проверка: ничего не покупает, кроме тестового оффера 999 (только если test_order=true).
export async function gamesdropProbe(env, { search, test_order, check } = {}) {
  const out = {};
  try {
    const b = await gd(env, 'GET', '/api/v1/offers/balance');
    out.balance = { http: b.http, balance: b.data.balance, currency: b.data.currency, postpaid: b.data.isPostpaid, profile: b.data.balanceProfile, error: b.data.code || b.data.error || undefined };
    const q = String(search || 'standoff').slice(0, 40);
    const s = await gd(env, 'POST', '/api/v1/offers/sync', { search: q, page: 1, limit: 30 });
    const rows = (s.data.rows || s.data.data || []);
    out.catalog = { http: s.http, query: q, count: rows.length, items: rows.slice(0, 30).map(r => ({ offerId: r.offerGroupId, name: [r.productName, r.offerGroupName].filter(Boolean).join(' · '), price: r.price, currency: r.currency, inStock: r.inStock, needUserId: r.isRequiredGameUserId, needServer: r.isRequiredGameServerId })), error: s.data.code || undefined };
    // Проверка игрока (ник по ID): check = { offerId?, gameUserId, gameServerId? }. Ничего не покупает.
    if (check && check.gameUserId) {
      let offerId = Number(check.offerId) || 0;
      if (!offerId) { const hit = rows.find(r => r.isRequiredGameUserId && r.inStock); offerId = hit ? hit.offerGroupId : 0; }
      if (!offerId) out.check = { error: 'Не нашёл оффер с проверкой ID в результатах поиска. Уточните поиск или укажите offerId.' };
      else {
        const body = { offerId, gameUserId: String(check.gameUserId).slice(0, 30) };
        if (check.gameServerId) body.gameServerId = String(check.gameServerId).slice(0, 30);
        const c = await gd(env, 'POST', '/api/v1/offers/check-game-data', body);
        out.check = { offerId, http: c.http, data: c.data };
      }
    }
    if (test_order) {
      const f = await gd(env, 'POST', '/api/v1/offers/find-one', { offerId: 999 });
      const price = f.data.price != null ? f.data.price : (f.data.offer && f.data.offer.price);
      out.test_find = { http: f.http, price, raw: f.http === 200 ? undefined : f.data };
      if (price != null) {
        const o = await gd(env, 'POST', '/api/v1/offers/create-order', { offerId: 999, price, transactionId: 'DKTEST-' + Date.now(), quantity: 1 });
        out.test_order = { http: o.http, data: o.data };
      }
    }
  } catch (e) { out.error = String(e.message || e); }
  return out;
}

// ── Публичная проверка ника игрока по ID (клиент видит ник до оплаты). Ничего не покупает, баланс не нужен.
// Только положительный результат: ник найден → {nick}; всё остальное (не найден, ошибка, нет игры у GamesDrop) → {nick:null}.
const GD_SEARCH = { mlbb: 'Mobile Legends', pubg: 'PUBG Mobile', freefire: 'Free Fire', hok: 'Honor of Kings', genshin: 'Genshin Impact', wuwa: 'Wuthering Waves', bloodstrike: 'Blood Strike', hsr: 'Honkai Star Rail', zzz: 'Zenless Zone Zero', mchess: 'Magic Chess', deltaforce: 'Delta Force', marvel: 'Marvel Rivals', arena: 'Arena Breakout', whiteout: 'Whiteout Survival', lords: 'Lords Mobile', identityv: 'Identity V' };
const _offers = new Map(), _res = new Map(), _rl = new Map();
async function offersFor(env, game) {
  const c = _offers.get(game); if (c && c.exp > Date.now()) return c.list;
  const s = await gd(env, 'POST', '/api/v1/offers/sync', { search: GD_SEARCH[game], page: 1, limit: 100 });
  const words = GD_SEARCH[game].toLowerCase().split(/\s+/);
  let rows = (s.data.rows || s.data.data || []).filter(r => { const nm = ((r.productName || '') + ' ' + (r.offerGroupName || '')).toLowerCase(); return r.isRequiredGameUserId && r.inStock && words.every(w => nm.includes(w)); });
  // MLBB: только обычный оффер и Russia. Найден на Russia = российский аккаунт, на обычном = не российский (проверено на реальных заказах)
  if (game === 'mlbb') rows = rows.filter(r => /^mobile legends( russia)?$/i.test(String(r.productName || '').trim()));
  // по одному офферу с каждого продукта (регион/версия), «Global» в конце; максимум 3 попытки
  const seen = new Set(), list = [];
  for (const r of rows) { const k = r.productName || r.offerGroupName; if (seen.has(k)) continue; seen.add(k); list.push({ id: r.offerGroupId, srv: !!r.isRequiredGameServerId, glob: /global/i.test(k), reg: game === 'mlbb' ? (/russia/i.test(k) ? 'russia' : 'regular') : '' }); }
  list.sort((a, b) => a.glob - b.glob);
  const out = list.slice(0, 3);
  _offers.set(game, { list: out, exp: Date.now() + 6 * 3600e3 });
  return out;
}
export async function checkPlayer(env, ip, b) {
  const game = String(b.game || ''), pid = String(b.playerId || '').replace(/\D/g, ''), sid = String(b.serverId || '').trim().slice(0, 30);
  if (!GD_SEARCH[game] || pid.length < 5 || pid.length > 14) return { nick: null };
  const now = Date.now();
  const rl = _rl.get(ip); if (rl && rl.exp > now) { if (++rl.n > 40) return { nick: null }; } else _rl.set(ip, { n: 1, exp: now + 600e3 });
  if (_rl.size > 5000) _rl.clear();
  const key = game + '|' + pid + '|' + sid;
  const hit = _res.get(key); if (hit && hit.exp > now) return { nick: hit.nick, region: hit.region || '' };
  let nick = null, region = '';
  try {
    for (const o of await offersFor(env, game)) {
      const body = { offerId: o.id, gameUserId: pid }; if (sid && sid !== '-') body.gameServerId = sid;
      const c = await gd(env, 'POST', '/api/v1/offers/check-game-data', body);
      if (c.data && c.data.status === 'VALID' && c.data.gameUserLogin) { nick = String(c.data.gameUserLogin).slice(0, 40); region = o.reg || ''; break; }
    }
  } catch (e) { return { nick: null }; }
  _res.set(key, { nick, region, exp: now + (nick ? 3600e3 : 600e3) }); if (_res.size > 5000) _res.clear();
  return { nick, region };
}

// Сравнение цен: наша себестоимость (FazerCards) против GamesDrop. Ничего не покупает.
export async function comparePrices(env, CATS) {
  const out = {};
  const num = (s) => { const m = String(s).match(/(\d[\d\s]*)\s*(?:diamonds|uc|алмаз)/i); return m ? Number(m[1].replace(/\s/g, '')) : 0; };
  const load = async (q) => { let all = []; for (let p = 1; p <= 4; p++) { const s = await gd(env, 'POST', '/api/v1/offers/sync', { search: q, page: p, limit: 100 }); const rows = s.data.rows || s.data.data || []; all = all.concat(rows); if (rows.length < 100) break; } return all.filter(r => r.isRequiredGameUserId && r.inStock && r.price != null); };
  const jobs = [['mlbb_global', 'Mobile Legends', CATS.global], ['mlbb_russia', 'Mobile Legends', CATS.russia], ['pubg', 'PUBG Mobile', CATS.pubg]];
  for (const [k, q, cat] of jobs) {
    try {
      const rows = await load(q), res = [];
      for (const [pk, v] of Object.entries(cat || {})) {
        if (!v || !v.cost) continue;
        const parts = pk.match(/^(\d+)\+(\d+)$/); const uc = pk.match(/^(\d+)_uc$/); const total = parts ? Number(parts[1]) + Number(parts[2]) : uc ? Number(uc[1]) : num(pk) || num(v.offer);
        if (!total) continue;
        const gdm = rows.filter(r => num((r.productName || '') + ' ' + (r.offerGroupName || '')) === total).slice(0, 4).map(r => ({ n: (r.productName || '') + ' · ' + (r.offerGroupName || ''), p: r.price, d: Math.round((r.price / v.cost - 1) * 1000) / 10 }));
        res.push({ pack: pk, ours: v.cost, gd: gdm });
      }
      out[k] = res;
    } catch (e) { out[k] = { error: String(e.message || e) }; }
  }
  return out;
}

// Тест: различает ли проверка ID регион аккаунта. Берёт из доставленных заказов по несколько ID разных регионов
// и прогоняет по офферам Mobile Legends. Ничего не покупает; в ответе ID скрыты (только последние 3 цифры), ники не выводятся.
export async function regionTest(env, deep) {
  const q = async (sql) => (await env.DB.prepare(sql).all()).results || [];
  const base = "SELECT region, player_id, server_id FROM orders WHERE status='delivered' AND player_id GLOB '[0-9]*' AND ";
  const samples = deep ? [
    ...(await q(base + "region='russia' AND server_id LIKE '6%' ORDER BY created_at DESC LIMIT 6")),
    ...(await q(base + "region='russia' AND server_id NOT LIKE '6%' ORDER BY created_at DESC LIMIT 2")),
    ...(await q(base + "region='global' AND server_id LIKE '6%' ORDER BY created_at DESC LIMIT 3")),
    ...(await q(base + "region='global' AND server_id NOT LIKE '6%' ORDER BY created_at ASC LIMIT 2")),
  ] : [
    ...(await q(base + "region='global' AND server_id NOT LIKE '6%' AND server_id NOT LIKE '4%' ORDER BY created_at DESC LIMIT 1")),
    ...(await q(base + "region='global' AND server_id LIKE '6%' ORDER BY created_at DESC LIMIT 1")),
    ...(await q(base + "region='global' AND server_id LIKE '4%' ORDER BY created_at DESC LIMIT 1")),
    ...(await q(base + "region='russia' AND server_id LIKE '6%' ORDER BY created_at DESC LIMIT 1")),
    ...(await q(base + "region='russia' AND server_id NOT LIKE '6%' ORDER BY created_at DESC LIMIT 1")),
    ...(await q(base + "region='turkey' ORDER BY created_at DESC LIMIT 1")),
    ...(await q(base + "region='usa' ORDER BY created_at DESC LIMIT 1")),
  ];
  const s = await gd(env, 'POST', '/api/v1/offers/sync', { search: 'Mobile Legends', page: 1, limit: 100 });
  const rows = (s.data.rows || s.data.data || []).filter(r => r.isRequiredGameUserId && r.inStock);
  const seen = new Set(), offers = [];
  for (const r of rows) { const k = r.productName || r.offerGroupName; if (seen.has(k)) continue; seen.add(k); offers.push({ id: r.offerGroupId, name: k }); }
  if (deep) { const keep = offers.filter(o => /^Mobile Legends( Russia| Global)?$/i.test(o.name)); offers.length = 0; offers.push(...keep); }
  offers.length = Math.min(offers.length, 6);
  const out = [];
  for (const sm of samples) {
    const res = {};
    await Promise.all(offers.map(async (o) => {
      try {
        const c = await gd(env, 'POST', '/api/v1/offers/check-game-data', { offerId: o.id, gameUserId: String(sm.player_id), gameServerId: String(sm.server_id) });
        res[o.name] = c.data && c.data.status === 'VALID' ? 'V' : (c.data && c.data.status === 'INVALID' ? 'x' : '?');
      } catch (e) { res[o.name] = '?'; }
    }));
    out.push({ region: sm.region, zone: sm.server_id, id: '…' + String(sm.player_id).slice(-3), res });
  }
  return { offers: offers.map(o => o.name), rows: out };
}
