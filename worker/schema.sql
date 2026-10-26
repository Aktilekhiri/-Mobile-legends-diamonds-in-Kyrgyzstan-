CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, title_ky TEXT DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  rank TEXT DEFAULT '', level INTEGER DEFAULT 0, heroes INTEGER DEFAULT 0, skins INTEGER DEFAULT 0,
  description TEXT DEFAULT '', description_ky TEXT DEFAULT '',
  seo_ru TEXT DEFAULT '', seo_ky TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available',
  sort INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL, pos INTEGER NOT NULL DEFAULT 0,
  mime TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_acc ON photos(account_id, pos);

-- Заказы на алмазы (оплата вручную, выдача через FazerCards)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,                 -- публичный код заказа, например DK7K2M9Q
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  player_id TEXT NOT NULL, server_id TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'global',
  pkg TEXT NOT NULL,                   -- ключ пакета, например 234+23 или Weekly Diamond Pass
  pkg_label TEXT NOT NULL DEFAULT '',
  price_kgs INTEGER NOT NULL DEFAULT 0,
  method TEXT DEFAULT '', phone TEXT DEFAULT '',
  offer_id TEXT DEFAULT '',            -- offer на FazerCards (пусто = выдача вручную)
  cost_usd REAL DEFAULT 0,             -- ожидаемая себестоимость
  status TEXT NOT NULL DEFAULT 'new',  -- new | processing | delivered | refund_due | refunded | manual | cancelled
  fz_order_id TEXT DEFAULT '', fz_status TEXT DEFAULT '', fail_reason TEXT DEFAULT '',
  ip TEXT DEFAULT '', confirmed_at INTEGER DEFAULT 0, finished_at INTEGER DEFAULT 0,
  receipt_at INTEGER DEFAULT 0         -- когда клиент приложил чек на сайте
);
-- Чеки клиентов (картинка в base64, как и фото аккаунтов)
CREATE TABLE IF NOT EXISTS receipts (
  order_id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_fz ON orders(fz_order_id);

-- Клиенты, вошедшие через Google
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- Google sub
  email TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', picture TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, last_login INTEGER NOT NULL
);
-- ALTER TABLE orders ADD COLUMN user_id TEXT;   (выполнено один раз)
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
