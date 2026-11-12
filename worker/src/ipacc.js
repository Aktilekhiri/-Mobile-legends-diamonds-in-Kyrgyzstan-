// Модуль «Финансы и учёт ИП». Изолирован от остального сайта:
//  - свои таблицы ip_accounting_* (существующие таблицы только читаются: orders, и то без изменений);
//  - все маршруты под /api/admin/ipacc/* и только после проверки админ-токена (она делается в index.js до вызова);
//  - деньги хранятся целым числом в тыйынах (сотых долях сома), чтобы не было ошибок округления float.
// Налоговые ставки и сроки НЕ зашиты в код: их вводит владелец (с датой действия и источником).
import { FIN_WHERE, FIN_START_MS } from './catalog.js';
import { notify } from './notify.js';

export const METHODS = ['MBank', 'O!Bank', 'Bakai', 'Элкарт', 'Наличные', 'Банковский перевод', 'Другое'];
export const INCOME_CATS = ['Продажа товаров и услуг', 'Пополнение через сайт', 'Возврат от поставщика', 'Прочие доходы'];
export const EXPENSE_CATS = ['Закупка товаров и услуг', 'Оплата поставщикам', 'Серверы и хостинг', 'Домены', 'Реклама', 'Подписки на сервисы', 'Комиссии банков', 'Прочие расходы'];
const TZ = 6 * 3600 * 1000; // Бишкек UTC+6
const MAX_MINOR = 1e13;     // потолок суммы (100 млрд сом) — защита от опечаток
const MAX_FILE = 5 * 1024 * 1024;
const FILE_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

let ready = false;
export async function ensureIpAcc(env) {
  if (ready) return;
  const q = s => env.DB.prepare(s).run();
  await q(`CREATE TABLE IF NOT EXISTS ip_accounting_ops (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL, amount_minor INTEGER NOT NULL, op_date TEXT NOT NULL, category TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'Другое', comment TEXT NOT NULL DEFAULT '', supplier_id INTEGER, on_credit INTEGER NOT NULL DEFAULT 0, is_paid INTEGER NOT NULL DEFAULT 1, paid_date TEXT, idem_key TEXT, fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER)`);
  await q('CREATE UNIQUE INDEX IF NOT EXISTS ux_ipacc_ops_idem ON ip_accounting_ops (idem_key) WHERE idem_key IS NOT NULL');
  await q('CREATE INDEX IF NOT EXISTS ix_ipacc_ops_date ON ip_accounting_ops (kind, op_date)');
  await q('CREATE INDEX IF NOT EXISTS ix_ipacc_ops_fp ON ip_accounting_ops (fingerprint)');
  await q(`CREATE TABLE IF NOT EXISTS ip_accounting_suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, deleted_at INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS ip_accounting_supplier_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER NOT NULL, amount_minor INTEGER NOT NULL, pay_date TEXT NOT NULL, method TEXT NOT NULL DEFAULT 'Другое', comment TEXT NOT NULL DEFAULT '', idem_key TEXT, created_at INTEGER NOT NULL, deleted_at INTEGER)`);
  await q('CREATE UNIQUE INDEX IF NOT EXISTS ux_ipacc_pay_idem ON ip_accounting_supplier_payments (idem_key) WHERE idem_key IS NOT NULL');
  await q(`CREATE TABLE IF NOT EXISTS ip_accounting_tax_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT NOT NULL, regime TEXT NOT NULL DEFAULT '', rate_bp INTEGER NOT NULL DEFAULT 0, fixed_minor INTEGER NOT NULL DEFAULT 0, base TEXT NOT NULL DEFAULT 'revenue', period TEXT NOT NULL DEFAULT 'quarter', effective_from TEXT NOT NULL, effective_to TEXT, source TEXT NOT NULL DEFAULT '', verified_on TEXT, created_at INTEGER NOT NULL, deleted_at INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS ip_accounting_deadlines (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, due_date TEXT NOT NULL, amount_minor INTEGER NOT NULL DEFAULT 0, remind_days INTEGER NOT NULL DEFAULT 7, is_paid INTEGER NOT NULL DEFAULT 0, last_reminded TEXT, comment TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, deleted_at INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS ip_accounting_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
  await q(`CREATE TABLE IF NOT EXISTS ip_accounting_files (id INTEGER PRIMARY KEY AUTOINCREMENT, op_id INTEGER NOT NULL, r2_key TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, deleted_at INTEGER)`);
  await q('CREATE INDEX IF NOT EXISTS ix_ipacc_files_op ON ip_accounting_files (op_id)');
  await q(`CREATE TABLE IF NOT EXISTS ip_accounting_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '')`);
  // стартовые правила — только если таблица пуста; это значения владельца из finance.js, помечены «не подтверждено»
  const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM ip_accounting_tax_rules').first();
  if (!c || !c.n) {
    const now = Date.now();
    await env.DB.prepare('INSERT INTO ip_accounting_tax_rules (kind,name,regime,rate_bp,fixed_minor,base,period,effective_from,source,verified_on,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind('tax', 'Единый налог', 'Единый налог ИП', 200, 0, 'revenue', 'quarter', '2027-01-01', 'Значение владельца из настроек сайта (finance.js). Не подтверждено: сверьте с НК КР / ГНС и укажите источник.', null, now).run();
    await env.DB.prepare('INSERT INTO ip_accounting_tax_rules (kind,name,regime,rate_bp,fixed_minor,base,period,effective_from,source,verified_on,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind('social', 'Социальные взносы (Соцфонд)', 'Фиксированный взнос ИП', 0, 125700, 'fixed', 'month', '2026-01-01', 'Значение владельца (в finance.js: «официально 1257»). Не подтверждено: сверьте с Соцфондом.', null, now).run();
  }
  ready = true;
}

// ---------- валидация ----------
export function parseMoney(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(s)) return null;
  const [a, b = ''] = s.split('.');
  const minor = Number(a) * 100 + Number((b + '00').slice(0, 2));
  return minor > 0 && minor < MAX_MINOR ? minor : null;
}
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const cleanMulti = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, n);
const todayBk = () => new Date(Date.now() + TZ).toISOString().slice(0, 10);
const fmtKgs = m => (m / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bad = (msg, status = 400, extra) => ({ error: msg, status, ...(extra || {}) });

async function audit(env, action, entity, id, detail) {
  try { await env.DB.prepare('INSERT INTO ip_accounting_audit (ts, action, entity, entity_id, detail) VALUES (?,?,?,?,?)').bind(Date.now(), action, entity, String(id == null ? '' : id), JSON.stringify(detail || {}).slice(0, 1500)).run(); } catch (e) { /* журнал не должен ломать операцию */ }
}
async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT k, v FROM ip_accounting_settings').all();
  const s = Object.fromEntries((results || []).map(r => [r.k, r.v]));
  return {
    opening_minor: Number(s.opening_minor) || 0,
    auto_orders: s.auto_orders === undefined ? true : s.auto_orders === '1',
    auto_from: s.auto_from && isDate(s.auto_from) ? s.auto_from : new Date(FIN_START_MS + TZ).toISOString().slice(0, 10),
  };
}
async function setSetting(env, k, v) { await env.DB.prepare('INSERT INTO ip_accounting_settings (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run(); }

// ---------- автодоходы из заказов сайта (только чтение таблицы orders) ----------
async function autoMonthly(env, from, to, st) {
  if (!st.auto_orders) return [];
  const f = from > st.auto_from ? from : st.auto_from;
  if (f > to) return [];
  const t0 = Date.parse(f + 'T00:00:00+06:00'), t1 = Date.parse(to + 'T00:00:00+06:00') + 86400000;
  const ts = 'COALESCE(NULLIF(finished_at,0), created_at)';
  const base = `status = 'delivered' AND ${FIN_WHERE} AND COALESCE(method,'') != 'promo' AND ${ts} >= ? AND ${ts} < ?`;
  const month = `strftime('%Y-%m', (${ts} + ${TZ}) / 1000, 'unixepoch')`;
  let rows;
  try {
    ({ results: rows } = await env.DB.prepare(`SELECT ${month} AS ym, COUNT(*) AS n, COALESCE(SUM(price_kgs - refund_kgs),0) AS rev, COALESCE(SUM(fee_kgs),0) AS fee FROM orders WHERE ${base} GROUP BY ym`).bind(t0, t1).all());
  } catch (e) { // колонок refund_kgs/fee_kgs ещё нет (самые старые базы)
    try { ({ results: rows } = await env.DB.prepare(`SELECT ${month} AS ym, COUNT(*) AS n, COALESCE(SUM(price_kgs),0) AS rev, 0 AS fee FROM orders WHERE ${base} GROUP BY ym`).bind(t0, t1).all()); } catch (e2) { rows = []; }
  }
  return (rows || []).map(r => ({ ym: r.ym, n: r.n, rev: Math.round(r.rev * 100), fee: Math.round(r.fee * 100) }));
}

// ---------- сводка за период ----------
async function summary(env, from, to) {
  const st = await getSettings(env);
  const live = 'deleted_at IS NULL';
  const rng = 'op_date >= ? AND op_date <= ?';
  const { results: inc } = await env.DB.prepare(`SELECT substr(op_date,1,7) AS ym, COALESCE(SUM(amount_minor),0) AS s FROM ip_accounting_ops WHERE kind='income' AND ${live} AND ${rng} GROUP BY ym`).bind(from, to).all();
  const { results: exp } = await env.DB.prepare(`SELECT substr(op_date,1,7) AS ym, category, COALESCE(SUM(amount_minor),0) AS s FROM ip_accounting_ops WHERE kind='expense' AND ${live} AND ${rng} GROUP BY ym, category`).bind(from, to).all();
  const auto = await autoMonthly(env, from, to, st);
  const months = {}, cats = {};
  const m = ym => (months[ym] ||= { ym, income: 0, expense: 0 });
  for (const r of inc) m(r.ym).income += r.s;
  for (const r of exp) { m(r.ym).expense += r.s; cats[r.category] = (cats[r.category] || 0) + r.s; }
  let autoRev = 0, autoFee = 0, autoN = 0;
  for (const r of auto) { m(r.ym).income += r.rev; m(r.ym).expense += r.fee; autoRev += r.rev; autoFee += r.fee; autoN += r.n; if (r.fee) cats['Комиссии банков'] = (cats['Комиссии банков'] || 0) + r.fee; }
  const list = Object.values(months).sort((a, b) => a.ym.localeCompare(b.ym)).map(x => ({ ...x, profit: x.income - x.expense }));
  const income = list.reduce((a, x) => a + x.income, 0), expense = list.reduce((a, x) => a + x.expense, 0);
  return { from, to, income, expense, profit: income - expense, months: list, categories: cats, auto: { enabled: st.auto_orders, from: st.auto_from, orders: autoN, revenue: autoRev, fees: autoFee } };
}

async function balances(env) {
  const st = await getSettings(env), ALL_FROM = '0000-01-01', ALL_TO = '9999-12-31';
  const one = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).first()) || {}).s || 0;
  const incPaid = await one("SELECT COALESCE(SUM(amount_minor),0) AS s FROM ip_accounting_ops WHERE kind='income' AND is_paid=1 AND deleted_at IS NULL");
  const recv = await one("SELECT COALESCE(SUM(amount_minor),0) AS s FROM ip_accounting_ops WHERE kind='income' AND is_paid=0 AND deleted_at IS NULL");
  const expCash = await one("SELECT COALESCE(SUM(amount_minor),0) AS s FROM ip_accounting_ops WHERE kind='expense' AND on_credit=0 AND deleted_at IS NULL");
  const expCredit = await one("SELECT COALESCE(SUM(amount_minor),0) AS s FROM ip_accounting_ops WHERE kind='expense' AND on_credit=1 AND deleted_at IS NULL");
  const pays = await one('SELECT COALESCE(SUM(amount_minor),0) AS s FROM ip_accounting_supplier_payments WHERE deleted_at IS NULL');
  const auto = await autoMonthly(env, ALL_FROM, ALL_TO, st);
  const autoNet = auto.reduce((a, r) => a + r.rev - r.fee, 0);
  return { cash: st.opening_minor + incPaid + autoNet - expCash - pays, receivables: recv, supplier_debt: expCredit - pays, opening: st.opening_minor };
}

// ---------- налоги (предварительный расчёт) ----------
const monthsBetween = (from, to) => { const out = []; let [y, m] = from.slice(0, 7).split('-').map(Number); const [y2, m2] = to.slice(0, 7).split('-').map(Number); while (y < y2 || (y === y2 && m <= m2)) { out.push(y + '-' + String(m).padStart(2, '0')); if (++m > 12) { m = 1; y++; } } return out; };
function buckets(period, year) {
  const mk = (a, b, label) => ({ from: a, to: b, label });
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (period === 'year') return [mk(`${year}-01-01`, `${year}-12-31`, String(year))];
  if (period === 'month') return Array.from({ length: 12 }, (_, i) => mk(`${year}-${String(i + 1).padStart(2, '0')}-01`, `${year}-${String(i + 1).padStart(2, '0')}-${lastDay(year, i + 1)}`, `${year}-${String(i + 1).padStart(2, '0')}`));
  return [1, 2, 3, 4].map(q => mk(`${year}-${String(q * 3 - 2).padStart(2, '0')}-01`, `${year}-${String(q * 3).padStart(2, '0')}-${lastDay(year, q * 3)}`, `${year} Q${q}`));
}
async function taxEstimate(env, year) {
  const { results: rules } = await env.DB.prepare('SELECT * FROM ip_accounting_tax_rules WHERE deleted_at IS NULL ORDER BY id').all();
  const cache = {}, sum = async (a, b) => (cache[a + b] ||= await summary(env, a, b));
  const out = []; let total = 0;
  for (const r of rules) {
    const bs = [];
    for (const b of buckets(r.period, year)) {
      const a = b.from > r.effective_from ? b.from : r.effective_from, z = r.effective_to && r.effective_to < b.to ? r.effective_to : b.to;
      if (a > z) { bs.push({ label: b.label, from: b.from, to: b.to, base: 0, amount: 0, active: false }); continue; }
      let base = 0, amount = 0;
      if (r.kind === 'social' || r.base === 'fixed') { amount = r.fixed_minor * monthsBetween(a, z).length; }
      else { const s = await sum(a, z); base = r.base === 'profit' ? Math.max(0, s.profit) : Math.max(0, s.income); amount = Math.round(base * r.rate_bp / 10000); }
      total += amount; bs.push({ label: b.label, from: b.from, to: b.to, base, amount, active: true });
    }
    out.push({ rule: r, buckets: bs, total: bs.reduce((x, y) => x + y.amount, 0), unverified: !r.source || !r.verified_on });
  }
  return { year, rules: out, total, disclaimer: 'Предварительный расчёт по внесённым операциям и ставкам, которые ввёл владелец. Это не налоговая декларация и не официальный расчёт. Ставки и сроки нужно сверять с действующим законодательством КР.' };
}

// ---------- операции ----------
const fp = o => [o.kind, o.op_date, o.amount_minor, o.title.toLowerCase(), o.method, o.supplier_id || ''].join('|');
function readOp(b, kind) {
  const title = clean(b.title, 140);
  if (title.length < 2) return bad('Название операции: минимум 2 символа');
  const amount = parseMoney(b.amount);
  if (amount == null) return bad('Сумма: положительное число, не больше двух знаков после запятой');
  if (!isDate(b.date)) return bad('Дата: формат ГГГГ-ММ-ДД');
  if (b.date > (Number(todayBk().slice(0, 4)) + 1) + '-12-31') return bad('Дата слишком далеко в будущем');
  const cats = kind === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const category = clean(b.category, 60) || cats[cats.length - 1];
  if (!cats.includes(category)) return bad('Неизвестная категория');
  const method = clean(b.method, 40) || 'Другое';
  if (!METHODS.includes(method)) return bad('Неизвестный способ оплаты');
  const supplier_id = kind === 'expense' && b.supplier_id ? Number(b.supplier_id) || null : null;
  const on_credit = kind === 'expense' && supplier_id && b.on_credit ? 1 : 0;
  let is_paid = 1, paid_date = null;
  if (kind === 'income') { is_paid = b.is_paid === false || b.is_paid === 0 || b.is_paid === '0' ? 0 : 1; paid_date = is_paid ? (isDate(b.paid_date) ? b.paid_date : b.date) : null; }
  return { kind, title, amount_minor: amount, op_date: b.date, category, method, comment: cleanMulti(b.comment, 500), supplier_id, on_credit, is_paid, paid_date };
}
async function createOp(env, kind, b) {
  const o = readOp(b || {}, kind); if (o.error) return o;
  if (o.supplier_id && !(await env.DB.prepare('SELECT 1 AS x FROM ip_accounting_suppliers WHERE id = ? AND deleted_at IS NULL').bind(o.supplier_id).first())) return bad('Поставщик не найден', 404);
  const idem = b.idem_key ? clean(b.idem_key, 80) : null, f = fp(o);
  if (idem) { const ex = await env.DB.prepare('SELECT id FROM ip_accounting_ops WHERE idem_key = ?').bind(idem).first(); if (ex) return { ok: true, id: ex.id, duplicate_request: true }; }
  if (!b.force) {
    const d = await env.DB.prepare('SELECT id FROM ip_accounting_ops WHERE fingerprint = ? AND deleted_at IS NULL').bind(f).first();
    if (d) return bad('Такая операция уже есть (та же дата, сумма, название и способ). Если это другая операция, подтвердите добавление.', 409, { duplicate: true, existing_id: d.id });
  }
  const now = Date.now();
  const r = await env.DB.prepare('INSERT INTO ip_accounting_ops (kind,title,amount_minor,op_date,category,method,comment,supplier_id,on_credit,is_paid,paid_date,idem_key,fingerprint,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(o.kind, o.title, o.amount_minor, o.op_date, o.category, o.method, o.comment, o.supplier_id, o.on_credit, o.is_paid, o.paid_date, idem, f, now, now).run();
  const id = r.meta.last_row_id;
  await audit(env, 'create', 'op', id, { kind, title: o.title, amount: o.amount_minor, date: o.op_date });
  return { ok: true, id };
}
async function updateOp(env, id, b) {
  const cur = await env.DB.prepare('SELECT * FROM ip_accounting_ops WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!cur) return bad('Операция не найдена', 404);
  const o = readOp(b || {}, cur.kind); if (o.error) return o;
  if (o.supplier_id && !(await env.DB.prepare('SELECT 1 AS x FROM ip_accounting_suppliers WHERE id = ? AND deleted_at IS NULL').bind(o.supplier_id).first())) return bad('Поставщик не найден', 404);
  const f = fp(o);
  if (!b.force) { const d = await env.DB.prepare('SELECT id FROM ip_accounting_ops WHERE fingerprint = ? AND deleted_at IS NULL AND id != ?').bind(f, id).first(); if (d) return bad('Такая операция уже есть. Подтвердите сохранение.', 409, { duplicate: true, existing_id: d.id }); }
  await env.DB.prepare('UPDATE ip_accounting_ops SET title=?,amount_minor=?,op_date=?,category=?,method=?,comment=?,supplier_id=?,on_credit=?,is_paid=?,paid_date=?,fingerprint=?,updated_at=? WHERE id=?')
    .bind(o.title, o.amount_minor, o.op_date, o.category, o.method, o.comment, o.supplier_id, o.on_credit, o.is_paid, o.paid_date, f, Date.now(), id).run();
  await audit(env, 'update', 'op', id, { before: { title: cur.title, amount: cur.amount_minor, date: cur.op_date }, after: { title: o.title, amount: o.amount_minor, date: o.op_date } });
  return { ok: true, id };
}
async function listOps(env, p) {
  const w = ['o.deleted_at IS NULL'], b = [];
  if (p.kind === 'income' || p.kind === 'expense') { w.push('o.kind = ?'); b.push(p.kind); }
  if (isDate(p.from)) { w.push('o.op_date >= ?'); b.push(p.from); }
  if (isDate(p.to)) { w.push('o.op_date <= ?'); b.push(p.to); }
  if (p.supplier_id) { w.push('o.supplier_id = ?'); b.push(Number(p.supplier_id) || 0); }
  if (p.category) { w.push('o.category = ?'); b.push(p.category); }
  if (p.q) { w.push("(o.title LIKE ? OR o.comment LIKE ?)"); const l = '%' + clean(p.q, 60).replace(/[%_]/g, '') + '%'; b.push(l, l); }
  if (p.deleted === '1') w[0] = 'o.deleted_at IS NOT NULL';
  const limit = Math.min(500, Math.max(1, Number(p.limit) || 200)), offset = Math.max(0, Number(p.offset) || 0);
  const { results } = await env.DB.prepare(`SELECT o.*, s.name AS supplier_name, (SELECT COUNT(*) FROM ip_accounting_files f WHERE f.op_id = o.id AND f.deleted_at IS NULL) AS files FROM ip_accounting_ops o LEFT JOIN ip_accounting_suppliers s ON s.id = o.supplier_id WHERE ${w.join(' AND ')} ORDER BY o.op_date DESC, o.id DESC LIMIT ? OFFSET ?`).bind(...b, limit, offset).all();
  const t = await env.DB.prepare(`SELECT COALESCE(SUM(o.amount_minor),0) AS s, COUNT(*) AS n FROM ip_accounting_ops o WHERE ${w.join(' AND ')}`).bind(...b).first();
  return { ops: results, total_minor: t.s, count: t.n };
}
async function deleteOp(env, id, b) {
  if (!b || b.confirm !== true) return bad('Нужно подтверждение удаления (confirm: true)');
  const r = await env.DB.prepare('UPDATE ip_accounting_ops SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').bind(Date.now(), id).run();
  if (!r.meta.changes) return bad('Операция не найдена', 404);
  await audit(env, 'delete', 'op', id, {});
  return { ok: true, note: 'Операция перенесена в корзину, её можно восстановить' };
}
async function restoreOp(env, id) {
  const cur = await env.DB.prepare('SELECT fingerprint FROM ip_accounting_ops WHERE id = ? AND deleted_at IS NOT NULL').bind(id).first();
  if (!cur) return bad('Операция не найдена', 404);
  await env.DB.prepare('UPDATE ip_accounting_ops SET deleted_at = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), id).run();
  await audit(env, 'restore', 'op', id, {});
  return { ok: true };
}

// ---------- поставщики ----------
async function listSuppliers(env) {
  const { results } = await env.DB.prepare(`SELECT s.id, s.name, s.contact, s.note, s.created_at,
      COALESCE((SELECT SUM(amount_minor) FROM ip_accounting_ops o WHERE o.supplier_id = s.id AND o.kind='expense' AND o.deleted_at IS NULL),0) AS purchases,
      COALESCE((SELECT SUM(amount_minor) FROM ip_accounting_ops o WHERE o.supplier_id = s.id AND o.kind='expense' AND o.on_credit=1 AND o.deleted_at IS NULL),0) AS credit,
      COALESCE((SELECT SUM(amount_minor) FROM ip_accounting_supplier_payments p WHERE p.supplier_id = s.id AND p.deleted_at IS NULL),0) AS payments,
      (SELECT COUNT(*) FROM ip_accounting_ops o WHERE o.supplier_id = s.id AND o.kind='expense' AND o.deleted_at IS NULL) AS purchase_count
    FROM ip_accounting_suppliers s WHERE s.deleted_at IS NULL ORDER BY s.name`).all();
  // paid = оплачено сразу (не в долг) + платежи по долгу; debt = в долг − платежи (может быть < 0 при предоплате)
  return { suppliers: results.map(s => ({ ...s, paid: s.purchases - s.credit + s.payments, debt: s.credit - s.payments })) };
}
async function supplierDetail(env, id) {
  const s = (await listSuppliers(env)).suppliers.find(x => x.id === id);
  if (!s) return bad('Поставщик не найден', 404);
  const { results: ops } = await env.DB.prepare("SELECT id, title, amount_minor, op_date, category, method, on_credit, comment FROM ip_accounting_ops WHERE supplier_id = ? AND kind='expense' AND deleted_at IS NULL ORDER BY op_date DESC, id DESC LIMIT 300").bind(id).all();
  const { results: pays } = await env.DB.prepare('SELECT id, amount_minor, pay_date, method, comment FROM ip_accounting_supplier_payments WHERE supplier_id = ? AND deleted_at IS NULL ORDER BY pay_date DESC, id DESC LIMIT 300').bind(id).all();
  return { supplier: s, purchases: ops, payments: pays };
}
async function saveSupplier(env, id, b) {
  b = b || {};
  const name = clean(b.name, 100); if (name.length < 2) return bad('Название поставщика: минимум 2 символа');
  const contact = clean(b.contact, 200), note = cleanMulti(b.note, 500);
  if (id) {
    const r = await env.DB.prepare('UPDATE ip_accounting_suppliers SET name=?, contact=?, note=? WHERE id=? AND deleted_at IS NULL').bind(name, contact, note, id).run();
    if (!r.meta.changes) return bad('Поставщик не найден', 404);
    await audit(env, 'update', 'supplier', id, { name }); return { ok: true, id };
  }
  const dup = await env.DB.prepare('SELECT id FROM ip_accounting_suppliers WHERE lower(name) = lower(?) AND deleted_at IS NULL').bind(name).first();
  if (dup) return bad('Поставщик с таким названием уже есть', 409);
  const r = await env.DB.prepare('INSERT INTO ip_accounting_suppliers (name, contact, note, created_at) VALUES (?,?,?,?)').bind(name, contact, note, Date.now()).run();
  await audit(env, 'create', 'supplier', r.meta.last_row_id, { name }); return { ok: true, id: r.meta.last_row_id };
}
async function deleteSupplier(env, id, b) {
  if (!b || b.confirm !== true) return bad('Нужно подтверждение удаления (confirm: true)');
  const sd = (await listSuppliers(env)).suppliers.find(x => x.id === id);
  if (!sd) return bad('Поставщик не найден', 404);
  if (sd.debt !== 0) return bad('Нельзя удалить поставщика с ненулевой задолженностью (' + fmtKgs(sd.debt) + ' сом)', 409);
  await env.DB.prepare('UPDATE ip_accounting_suppliers SET deleted_at = ? WHERE id = ?').bind(Date.now(), id).run();
  await audit(env, 'delete', 'supplier', id, { name: sd.name }); return { ok: true };
}
async function addPayment(env, b) {
  b = b || {};
  const sid = Number(b.supplier_id) || 0, amount = parseMoney(b.amount);
  if (!(await env.DB.prepare('SELECT 1 AS x FROM ip_accounting_suppliers WHERE id = ? AND deleted_at IS NULL').bind(sid).first())) return bad('Поставщик не найден', 404);
  if (amount == null) return bad('Сумма: положительное число, не больше двух знаков после запятой');
  if (!isDate(b.date)) return bad('Дата: формат ГГГГ-ММ-ДД');
  const method = clean(b.method, 40) || 'Другое'; if (!METHODS.includes(method)) return bad('Неизвестный способ оплаты');
  const idem = b.idem_key ? clean(b.idem_key, 80) : null;
  if (idem) { const ex = await env.DB.prepare('SELECT id FROM ip_accounting_supplier_payments WHERE idem_key = ?').bind(idem).first(); if (ex) return { ok: true, id: ex.id, duplicate_request: true }; }
  const r = await env.DB.prepare('INSERT INTO ip_accounting_supplier_payments (supplier_id, amount_minor, pay_date, method, comment, idem_key, created_at) VALUES (?,?,?,?,?,?,?)').bind(sid, amount, b.date, method, cleanMulti(b.comment, 300), idem, Date.now()).run();
  await audit(env, 'create', 'payment', r.meta.last_row_id, { supplier: sid, amount, date: b.date });
  return { ok: true, id: r.meta.last_row_id };
}
async function deletePayment(env, id, b) {
  if (!b || b.confirm !== true) return bad('Нужно подтверждение удаления (confirm: true)');
  const r = await env.DB.prepare('UPDATE ip_accounting_supplier_payments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').bind(Date.now(), id).run();
  if (!r.meta.changes) return bad('Платёж не найден', 404);
  await audit(env, 'delete', 'payment', id, {}); return { ok: true };
}

// ---------- налоговые правила и сроки ----------
async function saveRule(env, id, b) {
  b = b || {};
  const kind = b.kind === 'social' ? 'social' : 'tax', name = clean(b.name, 100);
  if (name.length < 2) return bad('Название правила: минимум 2 символа');
  const base = ['revenue', 'profit', 'fixed'].includes(b.base) ? b.base : (kind === 'social' ? 'fixed' : 'revenue');
  const period = ['month', 'quarter', 'year'].includes(b.period) ? b.period : 'quarter';
  let rate_bp = 0, fixed = 0;
  if (base !== 'fixed') {
    const pct = String(b.rate_pct == null ? '' : b.rate_pct).replace(',', '.');
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(pct) || Number(pct) > 100) return bad('Ставка: процент от 0 до 100 (не больше двух знаков после запятой)');
    rate_bp = Math.round(Number(pct) * 100);
  } else {
    if (b.fixed_amount !== '' && b.fixed_amount != null) { fixed = parseMoney(b.fixed_amount); if (fixed == null) return bad('Фиксированная сумма за месяц: положительное число'); }
  }
  if (!isDate(b.effective_from)) return bad('Дата начала действия: формат ГГГГ-ММ-ДД');
  if (b.effective_to && (!isDate(b.effective_to) || b.effective_to < b.effective_from)) return bad('Дата окончания: ГГГГ-ММ-ДД, не раньше даты начала');
  const source = clean(b.source, 300), verified = b.verified_on && isDate(b.verified_on) ? b.verified_on : null;
  const vals = [kind, name, clean(b.regime, 100), rate_bp, fixed, base, period, b.effective_from, b.effective_to || null, source, verified];
  if (id) {
    const r = await env.DB.prepare('UPDATE ip_accounting_tax_rules SET kind=?,name=?,regime=?,rate_bp=?,fixed_minor=?,base=?,period=?,effective_from=?,effective_to=?,source=?,verified_on=? WHERE id=? AND deleted_at IS NULL').bind(...vals, id).run();
    if (!r.meta.changes) return bad('Правило не найдено', 404);
    await audit(env, 'update', 'tax_rule', id, { name, rate_bp, fixed }); return { ok: true, id };
  }
  const r = await env.DB.prepare('INSERT INTO ip_accounting_tax_rules (kind,name,regime,rate_bp,fixed_minor,base,period,effective_from,effective_to,source,verified_on,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(...vals, Date.now()).run();
  await audit(env, 'create', 'tax_rule', r.meta.last_row_id, { name, rate_bp }); return { ok: true, id: r.meta.last_row_id };
}
async function saveDeadline(env, id, b) {
  b = b || {};
  const title = clean(b.title, 140); if (title.length < 2) return bad('Название платежа: минимум 2 символа');
  if (!isDate(b.due_date)) return bad('Срок платежа: формат ГГГГ-ММ-ДД');
  let amount = 0; if (b.amount !== '' && b.amount != null) { amount = parseMoney(b.amount); if (amount == null) return bad('Сумма: положительное число'); }
  const rd = Math.min(60, Math.max(0, parseInt(b.remind_days, 10) || 7));
  if (id) {
    const r = await env.DB.prepare('UPDATE ip_accounting_deadlines SET title=?, due_date=?, amount_minor=?, remind_days=?, is_paid=?, comment=?, last_reminded=NULL WHERE id=? AND deleted_at IS NULL').bind(title, b.due_date, amount, rd, b.is_paid ? 1 : 0, cleanMulti(b.comment, 300), id).run();
    if (!r.meta.changes) return bad('Срок не найден', 404);
    await audit(env, 'update', 'deadline', id, { title, due: b.due_date }); return { ok: true, id };
  }
  const r = await env.DB.prepare('INSERT INTO ip_accounting_deadlines (title, due_date, amount_minor, remind_days, comment, created_at) VALUES (?,?,?,?,?,?)').bind(title, b.due_date, amount, rd, cleanMulti(b.comment, 300), Date.now()).run();
  await audit(env, 'create', 'deadline', r.meta.last_row_id, { title, due: b.due_date }); return { ok: true, id: r.meta.last_row_id };
}
async function softDelete(env, table, entity, id, b) {
  if (!b || b.confirm !== true) return bad('Нужно подтверждение удаления (confirm: true)');
  const r = await env.DB.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(Date.now(), id).run();
  if (!r.meta.changes) return bad('Запись не найдена', 404);
  await audit(env, 'delete', entity, id, {}); return { ok: true };
}
async function listDeadlines(env) {
  const { results } = await env.DB.prepare('SELECT * FROM ip_accounting_deadlines WHERE deleted_at IS NULL ORDER BY is_paid, due_date').all();
  const t = todayBk();
  return results.map(d => ({ ...d, days_left: Math.round((Date.parse(d.due_date + 'T00:00:00Z') - Date.parse(t + 'T00:00:00Z')) / 86400000) }));
}

// ---------- файлы (Cloudflare R2, привязка IPACC_FILES) ----------
async function uploadFile(env, req, url) {
  if (!env.IPACC_FILES) return bad('Хранилище файлов не подключено: добавьте R2-привязку IPACC_FILES (см. инструкцию)', 503);
  const opId = Number(url.searchParams.get('op_id')) || 0;
  if (!(await env.DB.prepare('SELECT 1 AS x FROM ip_accounting_ops WHERE id = ? AND deleted_at IS NULL').bind(opId).first())) return bad('Операция не найдена', 404);
  const mime = (req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!FILE_TYPES[mime]) return bad('Допустимы PDF, JPG, PNG, WEBP');
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return bad('Пустой файл');
  if (buf.byteLength > MAX_FILE) return bad('Файл больше 5 МБ');
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM ip_accounting_files WHERE op_id = ? AND deleted_at IS NULL').bind(opId).first();
  if (n.n >= 5) return bad('К операции можно прикрепить не больше 5 файлов');
  const name = clean(url.searchParams.get('name') || 'document', 100).replace(/[\\/]/g, '_');
  const key = 'ipacc/' + opId + '/' + crypto.randomUUID() + '.' + FILE_TYPES[mime];
  await env.IPACC_FILES.put(key, buf, { httpMetadata: { contentType: mime } });
  const r = await env.DB.prepare('INSERT INTO ip_accounting_files (op_id, r2_key, name, mime, size, created_at) VALUES (?,?,?,?,?,?)').bind(opId, key, name, mime, buf.byteLength, Date.now()).run();
  await audit(env, 'upload', 'file', r.meta.last_row_id, { op: opId, name, size: buf.byteLength });
  return { ok: true, id: r.meta.last_row_id };
}

// ---------- отчёты и резервная копия ----------
async function report(env, from, to) {
  if (!isDate(from) || !isDate(to) || from > to) return bad('Период: две даты ГГГГ-ММ-ДД, начало не позже конца');
  const s = await summary(env, from, to), st = await getSettings(env);
  const { results: ops } = await env.DB.prepare("SELECT o.id, o.kind, o.title, o.amount_minor, o.op_date, o.category, o.method, o.comment, o.is_paid, o.on_credit, s.name AS supplier FROM ip_accounting_ops o LEFT JOIN ip_accounting_suppliers s ON s.id = o.supplier_id WHERE o.deleted_at IS NULL AND o.op_date >= ? AND o.op_date <= ? ORDER BY o.op_date, o.id").bind(from, to).all();
  const { results: pays } = await env.DB.prepare('SELECT p.id, p.amount_minor, p.pay_date, p.method, p.comment, s.name AS supplier FROM ip_accounting_supplier_payments p LEFT JOIN ip_accounting_suppliers s ON s.id = p.supplier_id WHERE p.deleted_at IS NULL AND p.pay_date >= ? AND p.pay_date <= ? ORDER BY p.pay_date').bind(from, to).all();
  const auto = await autoMonthly(env, from, to, st);
  const incCats = {}, expCats = {};
  for (const o of ops) { const m = o.kind === 'income' ? incCats : expCats; m[o.category] = (m[o.category] || 0) + o.amount_minor; }
  const autoRev = auto.reduce((a, r) => a + r.rev, 0); if (autoRev) incCats['Заказы сайта (авто)'] = autoRev;
  const autoFee = auto.reduce((a, r) => a + r.fee, 0); if (autoFee) expCats['Комиссии банков'] = (expCats['Комиссии банков'] || 0) + autoFee;
  return { ...s, ops, supplier_payments: pays, income_categories: incCats, expense_categories: expCats, auto_months: auto, generated_at: new Date().toISOString() };
}
async function backup(env) {
  const out = {};
  for (const t of ['ops', 'suppliers', 'supplier_payments', 'tax_rules', 'deadlines', 'settings', 'files', 'audit']) out[t] = (await env.DB.prepare('SELECT * FROM ip_accounting_' + t).all()).results;
  await audit(env, 'backup', 'system', '', { tables: Object.keys(out) });
  return { version: 1, created_at: new Date().toISOString(), note: 'Полная копия таблиц ip_accounting_*. Суммы в тыйынах (1 сом = 100). Чеки (файлы R2) в копию не входят, только их список.', ...out };
}

// ---------- главная панель ----------
async function dashboard(env, from, to) {
  const t = todayBk(), monthFrom = t.slice(0, 7) + '-01';
  const [all, month, period, bal, tax, deadlines] = await Promise.all([
    summary(env, '0000-01-01', '9999-12-31'), summary(env, monthFrom, t.slice(0, 7) + '-31'),
    summary(env, from, to), balances(env), taxEstimate(env, Number(t.slice(0, 4))), listDeadlines(env),
  ]);
  const st = await getSettings(env);
  return {
    today: t, settings: st, balances: bal,
    totals: { income: all.income, expense: all.expense, profit: all.profit },
    month: { income: month.income, expense: month.expense, profit: month.profit },
    period, auto: all.auto,
    tax: { year: tax.year, total: tax.total, unverified: tax.rules.some(r => r.unverified), disclaimer: tax.disclaimer },
    upcoming: deadlines.filter(d => !d.is_paid && d.days_left <= Math.max(7, d.remind_days)),
  };
}

// ---------- напоминания о сроках (вызывается из cron раз в сутки) ----------
export async function ipaccRemind(env) {
  const now = new Date(Date.now() + TZ);
  if (now.getUTCHours() !== 10 || now.getUTCMinutes() > 4) return;
  await ensureIpAcc(env);
  const t = todayBk();
  for (const d of await listDeadlines(env)) {
    if (d.is_paid || d.days_left > d.remind_days || d.last_reminded === t) continue;
    await notify(env, `🧾 Учёт ИП: «${d.title}» — ${d.days_left < 0 ? 'просрочено на ' + (-d.days_left) + ' дн.' : d.days_left === 0 ? 'срок сегодня' : 'через ' + d.days_left + ' дн.'} (${d.due_date})${d.amount_minor ? '\nСумма: ' + fmtKgs(d.amount_minor) + ' сом' : ''}\nОтметьте оплату в админке → Учёт ИП → Налоги.`);
    await env.DB.prepare('UPDATE ip_accounting_deadlines SET last_reminded = ? WHERE id = ?').bind(t, d.id).run();
  }
}

// ---------- маршрутизатор: /api/admin/ipacc/* ----------
// h = { json, err, cors } из index.js (чтобы не было циклических импортов)
export async function ipaccHandle(req, env, path, url, h) {
  await ensureIpAcc(env);
  const m = req.method, sub = path.replace(/^\/api\/admin\/ipacc/, '') || '/';
  const q = Object.fromEntries(url.searchParams);
  const body = async () => req.json().catch(() => ({}));
  const doneBody = r => (r && r.error ? h.json(req, { error: r.error, ...(r.duplicate ? { duplicate: true, existing_id: r.existing_id } : {}) }, r.status || 400) : h.json(req, r));
  let x;
  try {
    if (sub === '/bootstrap' && m === 'GET') return h.json(req, { methods: METHODS, income_categories: INCOME_CATS, expense_categories: EXPENSE_CATS, settings: await getSettings(env), r2: !!env.IPACC_FILES, suppliers: (await listSuppliers(env)).suppliers, today: todayBk() });
    if (sub === '/dashboard' && m === 'GET') {
      const t = todayBk(); let from = isDate(q.from) ? q.from : t.slice(0, 4) + '-01-01', to = isDate(q.to) ? q.to : t;
      if (from > to) return h.err(req, 'Период: начало позже конца', 400);
      return h.json(req, await dashboard(env, from, to));
    }
    if (sub === '/ops' && m === 'GET') return h.json(req, await listOps(env, q));
    if ((x = sub.match(/^\/ops\/(income|expense)$/)) && m === 'POST') return doneBody(await createOp(env, x[1], await body()));
    if ((x = sub.match(/^\/ops\/(\d+)$/)) && m === 'POST') return doneBody(await updateOp(env, +x[1], await body()));
    if ((x = sub.match(/^\/ops\/(\d+)\/delete$/)) && m === 'POST') return doneBody(await deleteOp(env, +x[1], await body()));
    if ((x = sub.match(/^\/ops\/(\d+)\/restore$/)) && m === 'POST') return doneBody(await restoreOp(env, +x[1]));
    if ((x = sub.match(/^\/ops\/(\d+)\/files$/)) && m === 'GET') { const { results } = await env.DB.prepare('SELECT id, name, mime, size, created_at FROM ip_accounting_files WHERE op_id = ? AND deleted_at IS NULL').bind(+x[1]).all(); return h.json(req, { files: results }); }
    if (sub === '/suppliers' && m === 'GET') return h.json(req, await listSuppliers(env));
    if (sub === '/suppliers' && m === 'POST') return doneBody(await saveSupplier(env, 0, await body()));
    if ((x = sub.match(/^\/suppliers\/(\d+)$/)) && m === 'GET') return doneBody(await supplierDetail(env, +x[1]));
    if ((x = sub.match(/^\/suppliers\/(\d+)$/)) && m === 'POST') return doneBody(await saveSupplier(env, +x[1], await body()));
    if ((x = sub.match(/^\/suppliers\/(\d+)\/delete$/)) && m === 'POST') return doneBody(await deleteSupplier(env, +x[1], await body()));
    if (sub === '/payments' && m === 'POST') return doneBody(await addPayment(env, await body()));
    if ((x = sub.match(/^\/payments\/(\d+)\/delete$/)) && m === 'POST') return doneBody(await deletePayment(env, +x[1], await body()));
    if (sub === '/tax' && m === 'GET') { const y = parseInt(q.year, 10) || Number(todayBk().slice(0, 4)); return h.json(req, { ...(await taxEstimate(env, y)), deadlines: await listDeadlines(env) }); }
    if (sub === '/tax/rules' && m === 'POST') return doneBody(await saveRule(env, 0, await body()));
    if ((x = sub.match(/^\/tax\/rules\/(\d+)$/)) && m === 'POST') return doneBody(await saveRule(env, +x[1], await body()));
    if ((x = sub.match(/^\/tax\/rules\/(\d+)\/delete$/)) && m === 'POST') return doneBody(await softDelete(env, 'ip_accounting_tax_rules', 'tax_rule', +x[1], await body()));
    if (sub === '/tax/deadlines' && m === 'POST') return doneBody(await saveDeadline(env, 0, await body()));
    if ((x = sub.match(/^\/tax\/deadlines\/(\d+)$/)) && m === 'POST') return doneBody(await saveDeadline(env, +x[1], await body()));
    if ((x = sub.match(/^\/tax\/deadlines\/(\d+)\/delete$/)) && m === 'POST') return doneBody(await softDelete(env, 'ip_accounting_deadlines', 'deadline', +x[1], await body()));
    if (sub === '/settings' && m === 'POST') {
      const b = await body();
      if (b.opening_amount !== undefined) {
        const s = String(b.opening_amount).replace(/[\s ]/g, '').replace(',', '.');
        if (s === '' || s === '0') await setSetting(env, 'opening_minor', 0);
        else { if (!/^-?\d{1,11}(\.\d{1,2})?$/.test(s)) return h.err(req, 'Начальный остаток: число с двумя знаками после запятой'); await setSetting(env, 'opening_minor', Math.round(Number(s) * 100)); }
      }
      if (b.auto_orders !== undefined) await setSetting(env, 'auto_orders', b.auto_orders ? '1' : '0');
      if (b.auto_from !== undefined) { if (!isDate(b.auto_from)) return h.err(req, 'Дата начала автоучёта: ГГГГ-ММ-ДД'); await setSetting(env, 'auto_from', b.auto_from); }
      await audit(env, 'settings', 'settings', '', { keys: Object.keys(b) });
      return h.json(req, { ok: true, settings: await getSettings(env) });
    }
    if (sub === '/report' && m === 'GET') return doneBody(await report(env, q.from, q.to));
    if (sub === '/audit' && m === 'GET') { const { results } = await env.DB.prepare('SELECT * FROM ip_accounting_audit ORDER BY id DESC LIMIT ?').bind(Math.min(500, Number(q.limit) || 100)).all(); return h.json(req, { audit: results }); }
    if (sub === '/backup' && m === 'GET') return h.json(req, await backup(env));
    if (sub === '/files' && m === 'POST') return doneBody(await uploadFile(env, req, url));
    if ((x = sub.match(/^\/files\/(\d+)$/)) && m === 'GET') {
      if (!env.IPACC_FILES) return h.err(req, 'Хранилище файлов не подключено', 503);
      const f = await env.DB.prepare('SELECT * FROM ip_accounting_files WHERE id = ? AND deleted_at IS NULL').bind(+x[1]).first();
      if (!f) return h.err(req, 'Файл не найден', 404);
      const o = await env.IPACC_FILES.get(f.r2_key);
      if (!o) return h.err(req, 'Файл не найден в хранилище', 404);
      return new Response(o.body, { headers: { 'Content-Type': f.mime, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...h.cors(req) } });
    }
    if ((x = sub.match(/^\/files\/(\d+)\/delete$/)) && m === 'POST') {
      const b = await body(); if (b.confirm !== true) return h.err(req, 'Нужно подтверждение удаления (confirm: true)');
      const r = await env.DB.prepare('UPDATE ip_accounting_files SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').bind(Date.now(), +x[1]).run();
      if (!r.meta.changes) return h.err(req, 'Файл не найден', 404);
      await audit(env, 'delete', 'file', +x[1], {}); return h.json(req, { ok: true });
    }
  } catch (e) {
    return h.err(req, 'Ошибка модуля учёта: ' + String(e && e.message || e).slice(0, 200), 500);
  }
  return h.err(req, 'Не найдено', 404);
}
