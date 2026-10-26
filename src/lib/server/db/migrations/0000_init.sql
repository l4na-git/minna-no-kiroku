-- 空白とみなす文字: タブ・改行・VT・FF・CR・半角スペース・NBSP・全角スペース
-- char(9,10,11,12,13,32,160,12288)
CREATE TABLE users (
  id           TEXT    NOT NULL PRIMARY KEY,
  auth_subject TEXT    NOT NULL UNIQUE CHECK (length(auth_subject) > 0),
  email        TEXT    NOT NULL CHECK (length(email) > 0 AND email = lower(email)),
  display_name TEXT    NOT NULL CHECK (length(trim(display_name, char(9,10,11,12,13,32,160,12288))) >= 1 AND length(display_name) <= 20),
  color        INTEGER NOT NULL CHECK (color BETWEEN 0 AND 5),
  created_at   INTEGER NOT NULL
);

CREATE TABLE categories (
  id         TEXT    NOT NULL PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE CHECK (name = trim(name, char(9,10,11,12,13,32,160,12288)) AND length(name) BETWEEN 1 AND 20),
  sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order >= 0),
  created_by TEXT    REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL
);

CREATE TABLE entries (
  id           TEXT    NOT NULL PRIMARY KEY,
  author_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category_id  TEXT    NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  body         TEXT    NOT NULL CHECK (length(trim(body, char(9,10,11,12,13,32,160,12288))) >= 1 AND length(body) <= 10000),
  event_date   TEXT    NOT NULL CHECK (event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(event_date, '+0 days') IS event_date),
  event_period TEXT    CHECK (event_period IN ('morning', 'afternoon', 'evening', 'night')),
  created_at   INTEGER NOT NULL,
  edited_at    INTEGER
);

CREATE INDEX entries_by_event_date ON entries (event_date DESC, created_at DESC, id DESC);
