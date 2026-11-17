# diamond-kg-api

Cloudflare Worker + D1 для каталога аккаунтов на diamond.kg.

- Публично: `GET /api/accounts`, `GET /img/:id`
- Админ (по паролю): добавить / изменить / удалить аккаунт и фото (до 6 на аккаунт)
- База: D1 `diamond-accounts-db` (схема в `schema.sql`), фото хранятся в D1 как base64

## Подключение
1. Cloudflare → Workers & Pages → Create → Import a repository → этот репозиторий.
   Root directory: `worker`, имя Worker должно совпадать с `name` в wrangler.toml, Deploy command: `npx wrangler deploy`.
2. Settings → Variables and Secrets → добавить секрет `ADMIN_PASSWORD` (пароль админки).
3. Адрес Worker (`https://diamond-kg-api.<поддомен>.workers.dev`) вписать в `api-config.js` в корне сайта.
4. Админка (заказы и аккаунты во вкладках): https://diamond.kg/admin.html

## Отчёт о прибыли
Каждый день в 23:55 (Бишкек) бот шлёт в Telegram прибыль за день и с 1 числа месяца (worker/src/report.js, cron каждую минуту). В последний день месяца заголовок — «Итог месяца». Считаются доставленные заказы: цена − cost_usd × USD_KGS.


## Себестоимость (секрет CATALOG_COSTS)

Себестоимость пакетов (USD) не хранится в репозитории. Она задаётся секретами `CATALOG_COSTS`, `CATALOG_COSTS2`, `CATALOG_COSTS3` в Cloudflare (лимит секрета 5 КБ, поэтому JSON разбит на части)
(JSON вида `{"pubg|325_uc":4.49,"global|13+1":0.23,...}`, ключ = `<регион или игра>|<ключ пакета>`) и подмешивается
в каталог функцией `loadCosts()` при каждом запросе. Без секрета заказы уходят на ручную выдачу, поэтому **добавляйте секрет ДО деплоя воркера**.
