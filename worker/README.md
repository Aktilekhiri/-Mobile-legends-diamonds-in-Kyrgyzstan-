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
4. Админка: https://diamond.kg/admin.html
