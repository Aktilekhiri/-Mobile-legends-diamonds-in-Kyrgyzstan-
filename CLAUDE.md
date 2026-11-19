# diamond.kg: карта проекта для Claude

Владелец: Актилек (Бишкек). Общаемся по-русски, коротко. Не соглашаться по умолчанию: если он неправ, сказать прямо.

## Архитектура
- **Фронтенд:** статический сайт на GitHub Pages (домен diamond.kg, файл CNAME), корень репозитория.
- **Бэкенд:** Cloudflare Worker `mobile-legends-diamonds-in-kyrgyzstan` из папки `worker/`, деплоится автоматически при пуше в `main`. База D1 `diamond-accounts-db`. Cron каждую минуту.
- **Внешние сервисы:** поставщик FazerCards (выдача), Finik (оплата, комиссия 2%), GamesDrop, GoPay, Telegram-бот магазина, Resend (почта).

## Фронтенд (корень)
- `index.html` (~550 КБ, не читать целиком, искать через grep): каталог. Внутри inline JSON `gamesData` (цены, пакеты), `GC_IMG`, `pkgImg()`, `CAT_SERVICES` (порядок раздела подарочных карт), `CAT_GIFT`, `CAT_ALIAS`, `CAT_SUB`, словарь hints, описания игр. `json.dumps` круглит JSON без потерь.
- `admin*.html`: админка (orders, finance, accounts, clients, reviews, chat, bot, gd, ipacc, self). Пароль админки хранится секретом ADMIN_PASSWORD.
- `script.js`, `chat.js`, `accounts.js`, `api-config.js` (адрес воркера), `styles.css`, `theme.css`.
- Папки вида `mobile-legends-almazy/`, `*-kyrgyzstan/`: SEO-страницы, **генерируются** `tools/gen_seo_pages.py` (после запуска откатить лишние изменения `sitemap.xml`: `git checkout sitemap.xml`). `guides/`, `delivery/`, `refund/`, `terms/`, `privacy/`, `reviews/`: статические страницы.
- `img/`: картинки (`img/games/`, `img/packs/<игра>/*.webp`).

## Воркер (`worker/src/`)
- `index.js`: все маршруты и админ-API. `catalog.js`: GAMES, CATALOGS (пакет сайта → оффер FazerCards), себестоимость из секретов `CATALOG_COSTS`…`CATALOG_COSTS6` (нет цены = ручная выдача), `FIN_START_MS`, `FIN_WHERE`, `USD_KGS=90`.
- `orders.js`: приём, выдача, возврат (статусы: delivered, cancelled, refunded, refund_due, balance = возврат на баланс сайта). `fazercards.js`: клиент поставщика. `finik.js`, `gopay.js`: оплата. `wallet.js` + `ledger.js` + `balance.js`: баланс клиента и пополнение (таблица wallet_topups).
- `finance.js`: финансы, недельный план, налог. `report.js`: ежедневный отчёт. `ipacc.js`: учёт ИП (изолированный модуль). `market.js`, `deals.js`, `acomments.js`, `crypt.js`: продажа аккаунтов, постинг в канал.
- `tgbot.js`, `tgapi.js`, `notify.js`: Telegram. `aichat.js`: ИИ-чат. `shop_data.js`: **автогенерация** `python3 tools/gen_bot_data.py` (цены берутся из index.html), руками не править.
- Важно: `{...env}` теряет секреты и привязки, доп. значения передавать отдельными параметрами.

## Деньги и налоги
- Цена = ceil5(max(себестоимость×90×1.15, (себестоимость×90+15)/0.98)).
- ИП, единый налог **2%** со всех поступлений через Finik (заказы + пополнения баланса + Тойго/Clip4K), возвраты не вычитаются, комиссии не вычитаются. Заказы с оплатой с баланса не считать (двойной счёт). Период с 5 ноября 2026 (`FIN_START_MS`), платёж до 20 января 2027. Соцфонд 1257 сом в месяц до 20 числа (ноябрь оплачен).
- Не юрист и не бухгалтер: формы и документы согласовывать с налоговой.

## Правила работы
- **Коммиты:** в конце каждого `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` и `Claude-Session: <ссылка текущей сессии>`. Force push только по прямой просьбе.
- **Секреты:** ключи и токены в чат не просим и не пишем. Он вставляет их сам в Cloudflare. Пароли не вводим.
- **Траты у FazerCards** только после явного подтверждения товара, суммы и ID игрока.
- **Кошельки и D1:** изменения только по явной просьбе. Читающие запросы можно.
- Сообщения клиентам и поставщикам только готовим текстом, отправляет он.
- Известных персонажей и логотипы брендов не рисуем (его собственные иконки можно).
- Сначала уточняющие вопросы и выбор лучшего варианта, потом код. Минимум кода, стандартные средства вместо лишних библиотек.
- Проверка: `node --input-type=module --check < worker/src/<файл>.js`.
