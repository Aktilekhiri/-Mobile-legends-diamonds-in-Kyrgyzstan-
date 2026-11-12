# Модуль «Финансы и учёт ИП»

Изолированный модуль учёта в админке (вкладка «Учёт»). Не меняет старые таблицы, API и авторизацию.

## Файлы
- `worker/src/ipacc.js` — вся логика и API (`/api/admin/ipacc/*`), таблицы создаются сами при первом обращении.
- `admin-ipacc.html` — интерфейс (открывается во вкладке админки).
- Минимальные точечные изменения старого кода: `worker/src/index.js` (импорт, 1 маршрут за проверкой админа, 1 строка в cron), `admin.html` (вкладка и iframe), `worker/wrangler.toml` (комментарий про R2).

## Таблицы (все новые, префикс `ip_accounting_`)
`ops` (доходы и расходы), `suppliers`, `supplier_payments`, `tax_rules`, `deadlines`, `settings`, `files`, `audit`.
Миграций вручную не нужно: `CREATE TABLE IF NOT EXISTS` выполняется при первом открытии вкладки. Деньги хранятся в тыйынах (целые числа).

## API (все только с админ-токеном)
`GET bootstrap, dashboard, ops, suppliers, suppliers/:id, tax, report, audit, backup, files/:id`;
`POST ops/income|expense, ops/:id, ops/:id/delete|restore, suppliers, suppliers/:id, suppliers/:id/delete, payments, payments/:id/delete, tax/rules[/:id[/delete]], tax/deadlines[/:id[/delete]], settings, files?op_id=, files/:id/delete`.

## Запуск
1. Задеплойте воркер как обычно (новые таблицы создадутся сами).
2. Для чеков: создайте R2-бакет и раскомментируйте блок `r2_buckets` в `wrangler.toml` (привязка `IPACC_FILES`).
3. Откройте админку → «Учёт». Проверьте и подтвердите налоговые ставки (вкладка «Налоги»).

## Ограничения
- Ставки в «Налогах» — предварительные значения владельца, помечены «не подтверждено», пока не указан источник и дата проверки. Это не налоговая декларация.
- PDF формируется через печать браузера («Сохранить как PDF»), Excel — в браузере (SheetJS).
- Одна учётная запись админа, ролей нет. Мультивалютности нет (KGS).
