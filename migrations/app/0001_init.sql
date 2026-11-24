CREATE TABLE db_meta (
  schluessel TEXT PRIMARY KEY,
  wert       TEXT NOT NULL
);

CREATE TABLE profile_registry (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  db_datei     TEXT NOT NULL UNIQUE,
  erstellt_am  TEXT NOT NULL
);

CREATE TABLE app_settings (
  schluessel TEXT PRIMARY KEY,
  wert       TEXT NOT NULL
);

CREATE TABLE provider_consent (
  provider      TEXT PRIMARY KEY,
  akzeptiert_am TEXT
);
