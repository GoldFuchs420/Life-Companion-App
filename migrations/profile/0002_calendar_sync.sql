-- FA-200/201/213: Abbildung der expandierten Instanzen auf Systemkalender-Events
-- des Kalenders "LifeCompanion". Die Serienlogik bleibt in der App-DB; die
-- Zuordnung erfolgt pro Instanz (Schluessel: Aktivitaet + Ordinal innerhalb der
-- sortierten Instanzen, damit Anker-Aenderungen als Update und nicht als Neu-Anlage
-- laufen). Konflikte per Last-write-wins ueber zuletzt_geschrieben.
CREATE TABLE calendar_sync (
  -- weiche Referenz auf activity(id): das Loeschen einer Aktivitaet darf die
  -- Mapping-Zeilen nicht per FK-Cascade sofort mit entfernen, sonst verliert
  -- der Abgleich die Zuordnung zu den Geraete-Events; veraltete Zeilen raeumt
  -- der naechste Sync-Lauf ab.
  aktivitaet_id       TEXT    NOT NULL,
  ordinal             INTEGER NOT NULL,
  external_id         TEXT    NOT NULL UNIQUE,
  instanz_start       TEXT    NOT NULL,
  titel               TEXT    NOT NULL,
  ende                TEXT    NOT NULL,
  zuletzt_geschrieben TEXT    NOT NULL,
  PRIMARY KEY (aktivitaet_id, ordinal)
);
CREATE INDEX idx_calendar_sync_external ON calendar_sync(external_id);
CREATE INDEX idx_calendar_sync_instanz  ON calendar_sync(instanz_start);
