CREATE TABLE db_meta (
  schluessel TEXT PRIMARY KEY,
  wert       TEXT NOT NULL
);

CREATE TABLE profile (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  geburtsdatum      TEXT NOT NULL,
  geschlecht        TEXT NOT NULL CHECK (geschlecht IN ('maennlich','weiblich','divers')),
  gewicht_kg        REAL NOT NULL,
  groesse_cm        REAL,
  aktivitaetslevel  TEXT NOT NULL DEFAULT 'moderat',
  waehrung           TEXT NOT NULL DEFAULT 'EUR'
);

CREATE TABLE settings (
  schluessel TEXT PRIMARY KEY,
  wert       TEXT NOT NULL
);

CREATE TABLE category (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  farbe      TEXT NOT NULL,
  icon       TEXT,
  sortierung INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ingredient (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  basis_einheit   TEXT NOT NULL CHECK (basis_einheit IN ('g','ml')),
  stueckgewicht_g REAL,
  dichte_g_pro_ml REAL,
  barcode         TEXT
);
CREATE UNIQUE INDEX idx_ingredient_barcode ON ingredient(barcode) WHERE barcode IS NOT NULL;

CREATE TABLE nutrient (
  id                  INTEGER PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE,
  kategorie           TEXT NOT NULL
                      CHECK (kategorie IN ('basis','vitamin','mineral','spurenelement','lipid','aminosaeure','alkohol','sonstiges')),
  einheit             TEXT NOT NULL CHECK (einheit IN ('mg','µg','ml')),
  stufe               TEXT NOT NULL
                      CHECK (stufe IN ('pflicht','empfohlen','optional')),
  normfaktor_nach_µg  REAL NOT NULL
);

CREATE TABLE ingredient_nutrient (
  ingredient_id         TEXT NOT NULL REFERENCES ingredient(id) ON DELETE CASCADE,
  nutrient_id           INTEGER NOT NULL REFERENCES nutrient(id),
  wert_normiert_pro_100 REAL NOT NULL CHECK (wert_normiert_pro_100 >= 0),
  quelle                TEXT,
  abgefragt_am          TEXT,
  PRIMARY KEY (ingredient_id, nutrient_id)
);

CREATE TABLE recipe (
  id                        TEXT PRIMARY KEY,
  titel                     TEXT NOT NULL,
  typ                       TEXT NOT NULL DEFAULT 'hauptgericht'
                            CHECK (typ IN ('hauptgericht','beilage','getraenk','snack','sonstiges')),
  kalorien_soll_pro_portion REAL
);

CREATE TABLE recipe_step (
  id           INTEGER PRIMARY KEY,
  recipe_id    TEXT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  laufnummer   INTEGER NOT NULL,
  titel        TEXT NOT NULL,
  beschreibung TEXT,
  dauer_min    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (recipe_id, laufnummer)
);

CREATE TABLE recipe_ingredient (
  recipe_id     TEXT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  zeilen_nr     INTEGER NOT NULL,
  ingredient_id TEXT NOT NULL REFERENCES ingredient(id),
  menge         REAL NOT NULL CHECK (menge > 0),
  einheit       TEXT NOT NULL CHECK (einheit IN
                ('g','kg','ml','l','TL','EL','prise','tasse_150','tasse_250','tasse_330','stueck')),
  PRIMARY KEY (recipe_id, zeilen_nr)
);

CREATE TABLE unit_conversion (
  einheit             TEXT PRIMARY KEY,
  faktor_ml           REAL NOT NULL,
  default_g_faktor_ml REAL
);

CREATE TABLE ingredient_unit_override (
  ingredient_id TEXT NOT NULL REFERENCES ingredient(id) ON DELETE CASCADE,
  einheit       TEXT NOT NULL REFERENCES unit_conversion(einheit),
  gramm         REAL NOT NULL,
  PRIMARY KEY (ingredient_id, einheit)
);

CREATE TABLE activity_template (
  id              INTEGER PRIMARY KEY,
  titel           TEXT NOT NULL,
  beschreibung    TEXT,
  kategorie_id    INTEGER NOT NULL REFERENCES category(id),
  dauer_min       INTEGER NOT NULL,
  kcal_pro_stunde REAL
);

CREATE TABLE activity (
  id            TEXT PRIMARY KEY,
  titel         TEXT NOT NULL,
  beschreibung  TEXT,
  typ           TEXT NOT NULL DEFAULT 'normal'
                CHECK (typ IN ('normal','essen_rezept','essen_zutat')),
  kategorie_id  INTEGER NOT NULL REFERENCES category(id),
  prioritaet    TEXT NOT NULL DEFAULT 'verfuegbar'
                CHECK (prioritaet IN ('beschaeftigt','abwesend','verfuegbar')),
  start         TEXT NOT NULL,
  ende          TEXT NOT NULL,
  vorlage_id    INTEGER REFERENCES activity_template(id),
  rezept_id     TEXT     REFERENCES recipe(id),
  portionen     REAL NOT NULL DEFAULT 1 CHECK (portionen > 0),
  ingredient_id INTEGER REFERENCES ingredient(id),
  zutat_menge   REAL,
  zutat_einheit TEXT CHECK (zutat_einheit IS NULL OR zutat_einheit IN ('g','ml')),
  systemkalender_event_id TEXT
);
CREATE INDEX idx_activity_start     ON activity(start, ende);
CREATE INDEX idx_activity_kategorie ON activity(kategorie_id);

CREATE TABLE recurrence (
  id            INTEGER PRIMARY KEY,
  aktivitaet_id TEXT NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  typ           TEXT NOT NULL
                CHECK (typ IN ('intervall','monatstag','jahrstag','wochentage')),
  intervall     INTEGER NOT NULL DEFAULT 1,
  einheit       TEXT CHECK (einheit IN ('stunden','tage','wochen','monate','jahre')),
  wochentage    TEXT,
  tag_im_monat  INTEGER CHECK (tag_im_monat BETWEEN 1 AND 31),
  tag_im_jahr   TEXT,
  startdatum    TEXT NOT NULL,
  enddatum      TEXT
);
CREATE INDEX idx_recurrence_activity ON recurrence(aktivitaet_id);

CREATE TABLE shopping_category (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE store (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE purchase (
  id       TEXT PRIMARY KEY,
  datum    TEXT NOT NULL,
  markt_id INTEGER REFERENCES store(id),
  notiz    TEXT
);
CREATE INDEX idx_purchase_datum ON purchase(datum);

CREATE TABLE purchase_item (
  id                   TEXT PRIMARY KEY,
  purchase_id          TEXT NOT NULL REFERENCES purchase(id) ON DELETE CASCADE,
  ingredient_id        TEXT NOT NULL REFERENCES ingredient(id),
  menge                REAL NOT NULL CHECK (menge > 0),
  einheit              TEXT NOT NULL CHECK (einheit IN ('g','kg','ml','l')),
  zustand              TEXT,
  shopping_category_id INTEGER REFERENCES shopping_category(id),
  preis                REAL CHECK (preis IS NULL OR preis >= 0),
  mhd                  TEXT,
  uebrig_gelassen      REAL
);
CREATE INDEX idx_purchase_item_ingredient ON purchase_item(ingredient_id);
CREATE INDEX idx_purchase_item_mhd        ON purchase_item(mhd) WHERE mhd IS NOT NULL;

CREATE TABLE stock_consumption (
  id               INTEGER PRIMARY KEY,
  purchase_item_id TEXT NOT NULL REFERENCES purchase_item(id),
  aktivitaet_id    TEXT REFERENCES activity(id),
  datum            TEXT NOT NULL,
  menge            REAL NOT NULL CHECK (menge > 0),
  einheit          TEXT NOT NULL CHECK (einheit IN ('g','ml'))
);
CREATE INDEX idx_consumption_posten ON stock_consumption(purchase_item_id);

CREATE TABLE reference_dge (
  nutrient_id   INTEGER NOT NULL REFERENCES nutrient(id),
  altersgruppe  TEXT NOT NULL,
  geschlecht    TEXT NOT NULL CHECK (geschlecht IN ('maennlich','weiblich','divers')),
  empfohlen_tag REAL NOT NULL,
  PRIMARY KEY (nutrient_id, altersgruppe, geschlecht)
);

CREATE VIEW v_ingredient_kcal_100 AS
SELECT i.id AS ingredient_id,
       ROUND( ( COALESCE(MAX(CASE WHEN n.name = 'Eiweiß'        THEN inr.wert_normiert_pro_100 END), 0) * 4
              + COALESCE(MAX(CASE WHEN n.name = 'Kohlenhydrate' THEN inr.wert_normiert_pro_100 END), 0) * 4
              + COALESCE(MAX(CASE WHEN n.name = 'Fett'          THEN inr.wert_normiert_pro_100 END), 0) * 9
              + COALESCE(MAX(CASE WHEN n.name = 'Ballaststoffe' THEN inr.wert_normiert_pro_100 END), 0) * 2
              + COALESCE(MAX(CASE WHEN n.name = 'Alkohol'       THEN inr.wert_normiert_pro_100 END), 0) * 7
              ) / 1000000.0, 1) AS kcal_pro_100
FROM ingredient i
LEFT JOIN ingredient_nutrient inr ON inr.ingredient_id = i.id
LEFT JOIN nutrient n              ON n.id = inr.nutrient_id
GROUP BY i.id;