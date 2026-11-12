// Автопроверка наличия паков у FazerCards. Раз в 15 минут (из cron) сверяем каталог поставщика с нашим.
// Пак, которого нет у поставщика два раза подряд, скрывается на сайте и перестаёт приниматься в заказ; вернулся — включается сам.
// Состояние хранится в таблице meta: avail_off (отключённые), avail_miss (счётчики пропаж), avail_forced (ручное «вернуть», 24 ч), avail_tpl (рабочий путь API), avail_cur (курсор).
import { CATALOGS, OFF_PKGS } from './catalog.js';
import { SHOP } from './shop_data.js';
import { fzCategoryOf, fzTypeOf, fzListOffers } from './fazercards.js';
import { notify } from './notify.js';

const MISS_TO_OFF = 2;               // сколько проверок подряд пак должен отсутствовать
const GLITCH_SHARE = 0.4;            // если пропало больше 40% категории сразу, считаем сбоем и ничего не отключаем
const FORCE_MS = 24 * 3600 * 1000;
const PRIORITY = ['global', 'russia', 'freefire', 'roblox', 'tgstars'];
const PER_RUN = 8;                   // остальные категории проверяем по кругу, чтобы не упереться в лимит запросов Workers
let ready = false;

async function getMeta(env, k) {
  if (!ready) { await env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)').run(); ready = true; }
  const r = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first();
  return r ? r.v : null;
}
async function setMeta(env, k, v) {
  await env.DB.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run();
}
async function getJson(env, k) { try { const v = JSON.parse((await getMeta(env, k)) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }

export async function getOffMap(env) { try { return await getJson(env, 'avail_off'); } catch (e) { return {}; } }
export async function offKeys(env) { return [...OFF_PKGS, ...Object.keys(await getOffMap(env))]; }
export async function isPkgOff(env, key) { return (await offKeys(env)).includes(key); }

// Отключить пак сразу (например, FazerCards ответил «No matching offer» при заказе)
export async function markPkgOff(env, key, reason) {
  const off = await getOffMap(env);
  if (off[key]) return false;
  off[key] = { since: Date.now(), reason: String(reason || '').slice(0, 120) };
  await setMeta(env, 'avail_off', JSON.stringify(off));
  await notify(env, `⛔ Пак ${key} отключён на сайте: ${reason}. Вернуть: админка → Заказы → «Наличие паков».`);
  return true;
}

// Что мониторим: только то, что реально продаётся на сайте (SHOP), сгруппировано по категориям FazerCards
function plan() {
  const byCat = new Map();
  for (const g of SHOP) {
    const cat = CATALOGS[g.id]; const category = fzCategoryOf(g.id);
    if (!cat || !category) continue;
    for (const p of g.packs) {
      const e = cat[p.k]; if (!e || !e.offer) continue;
      if (!byCat.has(category)) byCat.set(category, { key: g.id, category, type: fzTypeOf(g.id), packs: [] });
      byCat.get(category).packs.push({ key: g.id + ':' + p.k, offers: String(e.offer).split('|') });
    }
  }
  return byCat;
}

// force=true — проверить все категории (кнопка в админке). Возвращает отчёт.
export async function syncAvailability(env, { force = false, now = Date.now() } = {}) {
  if (!force && new Date(now).getUTCMinutes() % 15 !== 0) return null;
  const report = { checked: 0, failed: [], off: [], back: [], glitch: [] };
  const byCat = plan();
  const all = [...byCat.values()];
  let pick = all;
  if (!force) {
    const pri = all.filter(c => PRIORITY.includes(c.key));
    const rest = all.filter(c => !PRIORITY.includes(c.key));
    const cur = Number(await getMeta(env, 'avail_cur')) || 0;
    const take = []; for (let i = 0; i < Math.min(PER_RUN, rest.length); i++) take.push(rest[(cur + i) % rest.length]);
    await setMeta(env, 'avail_cur', rest.length ? (cur + PER_RUN) % rest.length : 0);
    pick = [...pri, ...take];
  }
  const tpls = await getJson(env, 'avail_tpl2'); // рабочий путь отдельно для topups и giftcards
  const dead = new Set(); // тип, для которого поиск пути в этом запуске уже не удался: не повторяем (лимит запросов Workers)
  const off = await getJson(env, 'avail_off'), miss = await getJson(env, 'avail_miss'), forced = await getJson(env, 'avail_forced');
  const msgs = [];
  for (const c of pick) {
    let res;
    const known = Number.isInteger(tpls[c.type]) ? tpls[c.type] : -1;
    if (known < 0 && dead.has(c.type)) { report.failed.push(c.category + ': путь к списку офферов не найден'); continue; }
    try { res = await fzListOffers(env, c.type, c.category, known); } catch (e) { if (known < 0) dead.add(c.type); report.failed.push(String(e.message || e).slice(0, 700)); continue; }
    if (res.tplIdx !== known) { tpls[c.type] = res.tplIdx; await setMeta(env, 'avail_tpl2', JSON.stringify(tpls)); }
    report.checked++;
    const absent = c.packs.filter(p => !p.offers.every(o => res.ids.has(o)));
    if (c.packs.length >= 5 && absent.length / c.packs.length > GLITCH_SHARE) { report.glitch.push(c.category + ' (' + absent.length + '/' + c.packs.length + ')'); continue; }
    const absentKeys = new Set(absent.map(p => p.key));
    for (const p of c.packs) {
      if (absentKeys.has(p.key)) {
        miss[p.key] = (miss[p.key] || 0) + 1;
        if (miss[p.key] >= MISS_TO_OFF && !off[p.key] && !(forced[p.key] && now - forced[p.key] < FORCE_MS)) {
          off[p.key] = { since: now, reason: 'нет у FazerCards' }; report.off.push(p.key);
          msgs.push(`⛔ ${p.key}: пака больше нет у FazerCards, на сайте отключён.`);
        }
      } else {
        if (miss[p.key]) delete miss[p.key];
        if (off[p.key] && off[p.key].reason === 'нет у FazerCards') { delete off[p.key]; report.back.push(p.key); msgs.push(`✅ ${p.key}: пак снова есть у FazerCards, на сайте включён.`); }
      }
    }
  }
  for (const k of Object.keys(forced)) if (now - forced[k] > FORCE_MS) delete forced[k];
  await setMeta(env, 'avail_off', JSON.stringify(off)); await setMeta(env, 'avail_miss', JSON.stringify(miss)); await setMeta(env, 'avail_forced', JSON.stringify(forced));
  if (msgs.length) await notify(env, msgs.join('\n').slice(0, 3500));
  if (report.glitch.length && !force) {
    const last = Number(await getMeta(env, 'avail_glitch_at')) || 0;
    if (now - last > 6 * 3600 * 1000) { await setMeta(env, 'avail_glitch_at', now); await notify(env, '⚠️ Проверка каталога: сразу много паков пропало (' + report.glitch.join(', ') + '). Похоже на сбой чтения, ничего не отключал.'); }
  }
  if (report.failed.length && report.checked === 0 && !force) {
    const last = Number(await getMeta(env, 'avail_fail_at')) || 0;
    if (now - last > 12 * 3600 * 1000) { await setMeta(env, 'avail_fail_at', now); await notify(env, '⚠️ Не удалось прочитать каталог FazerCards для автопроверки паков: ' + report.failed[0] + '. Откройте админку → Заказы → «Проверить каталог».'); }
  }
  return report;
}

// Ручное «вернуть» из админки: включает пак и 24 часа не даёт автопроверке его снова отключить
export async function adminForceOn(env, key) {
  const off = await getJson(env, 'avail_off'), forced = await getJson(env, 'avail_forced'), miss = await getJson(env, 'avail_miss');
  key = String(key || '').slice(0, 80);
  if (!off[key]) return { error: 'Этот пак не отключён автоматически', status: 404 };
  delete off[key]; delete miss[key]; forced[key] = Date.now();
  await setMeta(env, 'avail_off', JSON.stringify(off)); await setMeta(env, 'avail_forced', JSON.stringify(forced)); await setMeta(env, 'avail_miss', JSON.stringify(miss));
  return { ok: true };
}
export async function adminAvailability(env) {
  const off = await getOffMap(env);
  return { off: Object.entries(off).map(([key, v]) => ({ key, since: v.since, reason: v.reason })), static: OFF_PKGS };
}
