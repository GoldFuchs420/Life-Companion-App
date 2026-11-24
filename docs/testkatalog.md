# Test-Katalog: LifeCompanion

> **Status:** Verbindliche Ausgestaltung zu FA-854/855 (M1-Start-Artefakt neben `docs/datamodel.md` und `docs/proxy-api.md`).
> **Geltungsbereich:** Alle Testfälle referenzieren ihre FA-ID (FA-854) und greifen auf die Seed-/Fixture-Konvention aus
> `docs/datamodel.md` (Abschnitt 6/8) zurück (FA-855). Die Gruppen TC-ENE…TC-PRF sind die Grundlage für
> Abnahmekriterium 1 („alle M-Anforderungen laut Test-Katalog bestanden“).

## 1. Zielsetzung und Grundregeln

| # | Regel |
|---|---|
| R1 | **Jeder Testfall trägt seine FA-ID** – damit bleibt das Lastenheft rückverfolgbar (FA-854); FA-IDs ohne Testfall werden in der Traceability (Abschnitt 6) sichtbar |
| R2 | **Determinismus:** alle Tests laufen ohne reale Provider-Netzabrufe; Provider-Antworten kommen aus Fixtures (FA-855), Zeiten werden gefroren (Time-Mocking); keine Abhängigkeit von echtem GPS, Kamera, BLE oder Netz |
| R3 | **Robustheitsfälle sind Pflicht:** für jede Rechenlogik existiert mindestens ein „fehlende Grundlage“-Fall → Eingabeaufforderung statt Absturz (FA-800) |
| R4 | Fixture-Datensätze sind synthetisch; reale Nährwertwerte nur als fachliche Beispielwerte, nie personenbezogene Daten |
| R5 | Testfälle sind automatisiert, sofern technisch möglich; manuelle Prüfpunkte sind explizit als solche gekennzeichnet |
| R6 | Jeder gefundene Fehler erzeugt einen Regressionstestcase, der dauerhaft im Katalog bleibt |

**Testpyramide (Stufen):**

| Stufe | Inhalt | Werkzeug (Voreinstellung) | Umfang |
|---|---|---|---|
| L1 | Unit-Tests: UseCases/Calculation-Services, ViewModel-Selektoren | **Vitest** (TS, native ESM) | schnell, ohne DB/Gerät – deckt die komplette Rechen-Domäne ab |
| L2 | DB-Integration: Migrationen, DAOs, Views, FIFO gegen jedes Migrationslevel | **Vitest** + SQLite-Treiber (in CI `better-sqlite3` als kompatibler Treiber für expo-sqlite-Schemata) | Schema-/FIFO-/Seed-Pflicht |
| L3 | API-Vertragstests gegen das In-App-Backend (Endpunkte + Fehlercodes) | **Vitest** + Fastify `inject()` (keine echten Sockets) | E1–E9 komplett |
| L4 | Provider-Adapter mit aufgezeichneten Fixtures und Golden-Drafts | **Vitest** (Fixture-Loader) | 5 Provider |
| L5 | Component-/UI-Smoke der Kernflüsse | **jest-expo @testing-library/react-native** für Komponenten; **Maestro**-Flows für Geräte-Smoke | Kern-Flüsse 4.1–4.11 |
| L6 | Abnahme-Mapping: Abnahmekriterien 1–14 ↔ Testgruppen | Checkliste (Abschnitt 6) | manuell + automatisiert |

## 2. Berechnungslogik (L1/L2 – UseCases & Calculation-Services)

### TC-ENE · EnergyCalculator (FA-329, O-2)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-ENE-01 | FA-329 | Haferflocken 13 g P / 60 g KH / 7 g F je 100 g | **355,0 kcal/100 g** (Referenz aus `datamodel.md`, kcal-View) |
| TC-ENE-02 | FA-329 | 8 g Ballaststoffe zusätzlich | 355 + 8 × 2 = **371,0 kcal** |
| TC-ENE-03 | FA-329/323 | Alkohol 5 g (Getränk, FA-307) | Faktor **× 7** = 35 kcal zusätzlich, nicht × 9 |
| TC-ENE-04 | FA-329 | kcal-Angabe des Providers 372 vs. berechnet 355 | Abweichung wird als Rückvergleich **angezeigt**, nicht gespeichert (FA-502) |
| TC-ENE-05 | FA-800 | Pflichtkern-Makro fehlt (z. B. Fett NULL) | Kein Absturz: Dialog „Es fehlen Daten: Fett – bitte ergänzen / überspringen / abbrechen“ |
| TC-ENE-06 | FA-329 | Rundung | eine Nachkommastelle, kaufmännisch gerundet; keine kumulierte Rundung über Serien |
| TC-ENE-07 | FA-322 | Werte in µg-normierter Form (13 000 000 statt 13) | identisches Ergebnis wie g-Eingabe |

### TC-UMR · UnitConverter (FA-330–335)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-UMR-01 | FA-331 | 1 TL Öl = 5 ml; 1 EL = 15 ml; 1 Prise = 0,5 ml | aus Seed-`unit_conversion`, exakt |
| TC-UMR-02 | FA-330 | 2 Tassen (alle drei Größen 150/250/330 ml) | entsprechend 300/500/660 ml wählbar |
| TC-UMR-03 | FA-331 | „1 Karotte“, `stueckgewicht_g` = 80 | 80 g; ohne Override greift der Seed-Default, fehlt auch dieser → Nachfrage (FA-334) |
| TC-UMR-04 | FA-331 | Dichte `dichte_g_pro_ml` für ml-Zutat | ml → g über Dichte |
| TC-UMR-05 | FA-334 | Umrechnungsregel fehlt (z. B. „1 Bund“ nicht in Tabelle) | Eingabeaufforderung mit Wertefeld statt erdachter Berechnung (FA-800) |
| TC-UMR-06 | FA-332 | Eingabe „1,5 TL“ (Komma) | 7,5 ml bzw. g über Default-Zutatenfaktor |
| TC-UMR-07 | FA-333 | Mengen-Normierung g/kg, ml/l | intern g/ml; Rezept → 1 Portion → N Portionen (mit TC-POR) |
| TC-UMR-08 | FA-331 | Nutzer-Override (Zutaten-Override) schlägt Seed | Override gewinnt; Zurücksetzen Restore |

### TC-NRM · µg-Normierung und kcal-View-Parität (FA-322, FA-329)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-NRM-01 | FA-322 | mg-Eingabe (Eisen 6 mg) | Speicherung 6 000 000 µg; Anzeige 6 mg |
| TC-NRM-02 | FA-322 | µg-Nährstoffe (B12, Vitamin D, Folsäure) | direkte µg-Erfassung, übliche Einheit µg bleibt Anzeige |
| TC-NRM-03 | FA-322 | Wasser | ML-Einheit bleibt erhalten (nicht normiert) |
| TC-NRM-04 | FA-329 | kcal-View vs. EnergyCalculator | SQL `v_ingredient_kcal_100` == `EnergyCalculator` für alle 1 000 Zufalls-Zutaten; Max-Abweichung 0,1 kcal |
| TC-NRM-05 | FA-327 | „0 / nicht angegeben“ | bewusste 0 unterscheidet sich sichtbar (Statistik) von „fehlt“ (FA-341) |

### TC-REC · RecurrenceResolver (FA-207a–d, FA-213)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-REC-01 | FA-207a | alle *x* Stunden/Tage/Wochen/Monate/Jahre | Instanzfolge exakt nach Intervall inkl. exakter Uhrzeitangaben |
| TC-REC-02 | FA-207a | „jeden 2. Sonntag“ | Intervall 14 Tage + Wochentag Sonntag (Ankerpunkt bleibt Sonntag) |
| TC-REC-03 | FA-207a | „Mo–Fr 07:00“ | 5 Instanzen je Woche, keine Wochenend-Instanz |
| TC-REC-04 | FA-207b | „jeden 31. des Monats“ im Februar | Feb überspringen (mit Kennzeichnung), März liefert |
| TC-REC-05 | FA-207c | „jeden 29.02.“ über Schaltjahre | Nur in Schaltjahren (FA-207c-Regel) |
| TC-REC-06 | FA-207 | mehrere Wiederholungen pro Aktivität | Instanzmenge = Vereinigungsmenge ohne Duplikate |
| TC-REC-07 | FA-207 | absolutes Serien-Ende | Instanzen enden korrekt (Enddatum inklusive) |
| TC-REC-08 | FA-213 | Serienlogik intern | im Systemkalender nur expandierte Einzel-Events; Serien-Record bleibt nur in der App-DB |
| TC-REC-09 | FA-201 | Zeitumstellung DST | Instanz um 07:00 Ortszeit je Tag, keine 06:00/08:00-Verschiebung |

### TC-POR · PortionCalculator (FA-302/303/333)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-POR-01 | FA-303 | Rezept (1 Portion) × 4 Portionen | sämtliche Nährwerte × 4 |
| TC-POR-02 | FA-610 | Teilportion 0,5 | × 0,5; Anzeige „0,5 Portionen“ |
| TC-POR-03 | FA-302 | kcal-Anzeige 400–600 | nur Referenz/Anzeige, keine Sperre bei 220 oder 800 kcal |

### TC-AGG · NutritionAggregator (FA-610, FA-341)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-AGG-01 | FA-610 | Intake = Σ Essen-Einträge × Portionen im Zeitraum | je Nährstoff korrekt aggregiert |
| TC-AGG-02 | FA-610 | Serien-Instanzen fallen in den Zeitraum | Instanzen zählen (FA-213), nicht die Serie als Ganzes |
| TC-AGG-03 | FA-341 | Tag mit Lücken (Empfohlen/Optional fehlt) | als „unvollständig erfasst“ markiert, **nicht** als 0 |
| TC-AGG-04 | FA-612 | Kategorie-Filter im Zeitraum X | gefilterte Anteile in Statistiken ausgegraut statt entfernt (FA-612) |
| TC-AGG-05 | FA-328 | Einzel-Lebensmittel-Eintrag ohne Rezept | wird wie Essen-Eintrag aggregiert |

### TC-DGE · DgeComparator (FA-601)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-DGE-01 | FA-601 | Profil Alter/Gewicht/Geschlecht → Referenzzeile | passende `reference_dge`-Zeile (nicht hart kodiert) |
| TC-DGE-02 | FA-800 | Altersgruppe ohne Referenzwert | Dialog „Referenzwert fehlt – ergänzen/überspringen“ |
| TC-DGE-03 | FA-602 | Ampellogik | unterhalb / innerhalb / oberhalb mit korrekten Schwellen |

### TC-FEH · Mangel-Prognose und Vorschläge (FA-613/614)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-FEH-01 | FA-613 | Standard-Fenster 14 Tage | Prognose über 14 Tage (2 Wochen) |
| TC-FEH-02 | FA-613 | Fenster-Grenzen 1 und 365 | zugelassen; 0 und 366 abgelehnt mit Hinweis |
| TC-FEH-03 | FA-613 | Bedarf × Fenster − geplante Zufuhr | Deckung je Nährstoff korrekt inkl. Serien-Instanzen |
| TC-FEH-04 | FA-614 | Vorschlagsreihenfolge | 1. vorrätig → 2. lokal gespeicherte → 3. externe Suche |
| TC-FEH-05 | FA-614 | Vorschlags-Übernahme | Tap → Essen-Eintrag an gewähltem Tag; erscheint sofort im Rezeptbuch (FA-362) |
| TC-FEH-06 | FA-341 | Lücken-Tage im Fenster | gekennzeichnet, nicht als 0 gezählt |

## 3. Datenhaltung, Bestand, Kalender (L2)

### TC-FIF · Bestand & FIFO (FA-400–406)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-FIF-01 | FA-401 | zwei Käufe (Karotten 500 g, dann 300 g); Kochen verbraucht 600 g | 500 g Posten → 0, dann 100 g vom zweiten; Reihenfolge korrekt |
| TC-FIF-02 | FA-401 | Verbrauch > Bestand | Deckungslücke angezeigt; Bestand nie sichtbar negativ |
| TC-FIF-03 | FA-402 | Bestandsposten ohne Nährwertprofil | lokale Suche → Provider → manuelle Anlage; leerer Zustand bleibt nutzbar |
| TC-FIF-04 | FA-404 | MHD: läuft in 3 Tagen ab / abgelaufen / kein MHD | Warnliste korrekt: „läuft bald ab“ und „ist abgelaufen“; ohne Datum keine Warnung |
| TC-FIF-05 | FA-406 | Wochenplan (inkl. „jeden 2. Sonntag“-Serie) − Bestand | Fehlbestandsliste deckt alle Zutaten × Portionen inkl. Rohmengen (FA-335) |
| TC-FIF-06 | FA-406 | Fehlbestandsliste per Tap → Einkauf | Positionen in Erfassungsmaske übernommen (FA-400/407) |
| TC-FIF-07 | FA-407 | Einkauf mit Markt/Produktkategorie/Menge/Preis; Felder leer gelassen | App blockiert nicht (FA-800); spätere Vervollständigung möglich |
| TC-FIF-08 | FA-408 | bereits gekaufte Zutat erneut erfassen | Marktvorschlag aus Historie (zuletzt/ø günstigster), jederzeit änderbar |
| TC-FIF-09 | FA-409 | Preis-/Mengenverlauf über mehrere Einkäufe | Linien-/Balkenverlauf nur aus eigenen Daten (O-6); keine Online-Abfrage |

### TC-OVR · Prioritäten & Überlappungen (FA-203, FA-211)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-OVR-01 | FA-202/203 | zwei überlappende Aktivitäten | nebeneinander dargestellt + Warnhinweis (nicht verhindert) |
| TC-OVR-02 | FA-211 | Priorität „beschäftigt“ im Konflikt | löst Warnung + Hervorhebung aus |
| TC-OVR-03 | FA-211 | „verfügbar“/„abwesend“ | nur Farbe/Anzeige, keine Berechnungslogik |
| TC-OVR-04 | FA-214 | Kategorie-Filter (Chips) | ungefilterte Termine ausgegraut, Layout/Zeilen bleibt |

### TC-KAL · Systemkalender-Sync (FA-200/201/213)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-KAL-01 | FA-200 | Kalender „LifeCompanion“ fehlt auf Gerät | wird angelegt; ohne Kalender-Berechtigung Hinweis statt Absturz (FA-800) |
| TC-KAL-02 | FA-201 | LWW pro Instanz | später geschriebene Änderung gewinnt; Konflikt dokumentiert |
| TC-KAL-03 | FA-213 | Serien-Aktivität synchronisieren | Systemkalender enthält N Einzel-Events; Serienquelle bleibt App-DB |
| TC-KAL-04 | FA-201 | Sync-Wiederholung | idempotent: zweiter Lauf erzeugt keine Dubletten |
| TC-KAL-05 | FA-201 | Änderung außerhalb der App (am Systemkalender) | wird erkannt, LWW abgeglichen; fehlende Grundlagen → Hinweis |

### TC-DBC · DB-Integration (FA-850–853; gemäß `datamodel.md` §7/8)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-DBC-01 | FA-850 | Migrationen jedes Levels (0001 → aktuell) gegen frische Datei | alle Levels fehlerfrei; `db_meta.schema_version` korrekt |
| TC-DBC-02 | FA-850 | Migration auf bestehender Datei (alte Version → neu) | keine Umstrukturierung alter Dateien; neuer Migrations-Schritt läuft transaktionell |
| TC-DBC-03 | FA-852 | Profil anlegen | alle Katalog-Tabellen mit Seed gefüllt; `db_meta.seed_version` gesetzt |
| TC-DBC-04 | FA-852 | Seed zweimal einspielen | idempotent, keine Dubletten |
| TC-DBC-05 | FA-853 | Seed-Datei fehlt/beschädigt | Tabellen leer angelegt, App läuft, Hinweis bietet Re-Import (FA-800) |
| TC-DBC-06 | FA-851 | zwei Profile parallel | strikte Isolation; Profilwechsel = DB-Wechsel; keine Inhalts-Leckage (kein Datenübergriff) |
| TC-DBC-07 | FA-851 | Profil löschen | Datei vollständig entfernt; Eintrag in `app.db.profile_registry` mitgelöscht |
| TC-DBC-08 | FA-329/322 | kcal-View-Parität (siehe TC-NRM-04) auf echtem Schema | identisch |
| TC-DBC-09 | FA-507 | `provider_consent`-Seed | alle Provider mit `akzeptiert_am = NULL` |
| TC-DBC-10 | FA-851 | Laufzeit-Verbindungen | max. 2 offene Verbindungen (app.db + aktives Profil) |

## 4. In-App-Backend (L3/L4 – gemäß `proxy-api.md`)

### TC-API · Vertragstests E1–E9

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-API-01 | FA-500 | Backend startet, bindet nur 127.0.0.1 | keine LAN-Schnittstelle; Port = App-Vorgabe |
| TC-API-02 | FA-506 | Handshake mit passender Version | E1-OK mit `apiVersion`; Folge-Endpunkte offen |
| TC-API-03 | FA-506 | Handshake mit falscher Major-Version | Hinweis, alle anderen Endpunkte blockiert |
| TC-API-04 | FA-500 | Backend deaktiviert | App läuft komplett, lokale/manuelle Erfassung (Abnahme 6) |
| TC-API-05 | FA-507 | Suche ohne Einwilligung | Fehler `CONSENT_REQUIRED` mit `fallback: einwilligung_einholen` |
| TC-API-06 | FA-507 | Suche nach Widerruf | `CONSENT_REVOKED`, kein erneuter Abruf |
| TC-API-07 | FA-508 | Offline-Suche mit Cache | Cache-Ergebnis `fromCache: true` mit originalem `queriedAt`; ohne Treffer → `OFFLINE` |
| TC-API-08 | FA-508 | Hintergrund-Verkehr | kein einziger Netz-Call ohne Nutzeraktion (beobachtetes Netzprotokoll im Test) |
| TC-API-09 | FA-503 | PARSE_FAILED / NOT_FOUND / TIMEOUT | strukturierter Fehler mit Fallback-Hinweis; kein Crash |
| TC-API-10 | FA-501 | Draft-Vorbefüllung | aus SearchResult wird Maske 1:1 vorbelegt; Commit nur per Nutzer |
| TC-API-11 | FA-505 | Anfragen protokolliert | Log-Zeile mit Provider-ID, Suchbegriff, Status, Dauer, Cache-Hit; keine Nutzerdaten |
| TC-API-12 | FA-502 | Standard-Reihenfolge | Nährwert-Default OFF; Rezept nur bei `rewe`; Provider separat wählbar (E6/E7) |

### TC-PRV · Provider-Adapter-Fixtures (FA-502/504)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-PRV-01 | FA-502 | OFF/USDA/naehrwertrechner/fddb/rewe: je Provider eine aufgezeichnete Suche | Draft passt zu Golden-Datei (`Fixture-HTML/JSON` → erwartetes Draft-JSON) |
| TC-PRV-02 | FA-503 | simulierte geänderte Website-Struktur (Fixture „broken“) | PARSE_FAILED, kein still falsches Ergebnis |
| TC-PRV-03 | FA-502/508 | Attribution | `sourceUrl`, OFF-Pflicht-Namensnennung übernommen |
| TC-PRV-04 | FA-504 | neuer Mock-Provider | nur Backend-Erweiterung, keine App-Änderung nötig |
| TC-PRV-05 | FA-410 | Barcode-Lookup EAN mit OFF-Fixture | Zutaten-Draft mit Barcode-Feld gefüllt; kein Treffer → NOT_FOUND (kein Dialog) |
| TC-PRV-06 | FA-502 |  Netz-Stub: Verbindungen nur zu registrierten Provider-Hosts beim Suchvorgang |

## 5. Schnittstellen und UI (L5)

### TC-EXP · Export/Import (FA-104; Basis für FA-911)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-EXP-01 | FA-104 | Export eines Profils | JSON-Bundle inkl. Versionsangabe aus `db_meta` |
| TC-EXP-02 | FA-104 | Import auf leerer Installation | alle Profildaten inkl. Kalender-Einträge rekonstruiert (Abnahme 7) |
| TC-EXP-03 | FA-104 | Bundle-Versionskonflikt | Hinweis statt Halbaufnahme; Abbruch sauber |
| TC-EXP-04 | FA-104 | invalide Bundle-Datei | klarer Fehlerhinweis, kein Absturz (FA-800) |
| TC-EXP-05 | FA-103 | Zwei-Profile-Vergleich | Statistiken, Kategoriezeit, kcal ø korrekt nebeneinander |

### TC-UI · UI-Smoke (Maestro-Flows, jeweils Ablauf 4.x)

| ID | FA | Fluss | Prüfpunkte |
|---|---|---|---|
| TC-UI-01 | FA-852/851/101 | 4.1 Erstnutzung | Seed vorhanden; Profil-Anlage; Wechsel |
| TC-UI-02 | FA-304/305/501 | 4.2 Rezept anlegen | lokal → Provider-Draft → Maske → Commit; Loop pausierbar/abbrechbar |
| TC-UI-03 | FA-303/FA-205–207 | 4.3 Essen planen | Portionsabfrage; Wiederholungen; Kategorie/Priorität |
| TC-UI-04 | FA-360–363 | 4.4 Rezeptbuch | Range bis 1 Jahr; Tages-Summen; Vorschläge sichtbar |
| TC-UI-05 | FA-400–407 | 4.6 Einkauf/Bestand | FIFO-Anzeige; MHD-Warnliste; Einkaufsplanung-Übernahme |
| TC-UI-06 | FA-300/302/324 | 4.7 Kochen | Rezept-Vorschlag; Teilschritte; Nährwertdetails |
| TC-UI-07 | FA-600–602 | 4.8 Statistik | Diagramme; DGE-Ampel; Vergleich zweier Zeiträume |
| TC-UI-08 | FA-104 | 4.9 Export/Import | Round-Trip am Gerät |
| TC-UI-09 | FA-202/204/214 | Wochenansicht | Swipe/KW-Navigation; Kategorie-Filter ausgegraut |
| TC-UI-10 | FA-106 | Sprachwechsel | DE/EN/FR/IT/ES direkt; ohne Datenverlust (Abnahme 13) |
| TC-UI-11 | FA-500/508 | Backend aus / Flugmodus | voll nutzbar; Offline-Hinweis statt Fehler (Abnahme 6/14) |
| TC-UI-12 | FA-410 | Barcode manuell | per Tastatureingabe; Draft-Vorbefüllung; Commit am Nutzer |

### TC-I18N · Mehrsprachigkeit (FA-106)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-I18N-01 | FA-106 | alle 5 Sprachen | alle Kern-Views übersetzt; Flaggen-Umschalter wirksam |
| TC-I18N-02 | FA-106 | fehlende Übersetzung | sichtbarer Fallback Deutsch (keine rohen Keys) |
| TC-I18N-03 | FA-106 | Währung pro Profil | Anzeige folgt Profil-Einstellung (Standard EUR) |

### TC-PRF · Performance & Barrierefreiheit (NFA, FA-900–903)

| ID | FA | Fall | Erwartet |
|---|---|---|---|
| TC-PRF-01 | FA-202 | 500 Aktivitäten in einer Woche | flüssiges Scrollen (lazy render, FlashList) |
| TC-PRF-02 | FA-360 | Rezeptbuch 365 Tage | virtualisiert, keine Verzögerung beim Scrollen |
| TC-PRF-03 | FA-903 | TalkBack / Kontrast / 48 dp | Kern-Flüsse bedienbar; Mindest-Touch-Ziele |
| TC-PRF-04 | FA-902 | Undo beim Löschen | Aktion rückholbar |

## 6. Deterministische Fixtures (FA-855)

Alle L1–L4-Tests arbeiten aus dem Seed plus dem nachfolgenden synthetischen Satz; jede Fixture liegt versioniert
unter `tests/fixtures/` (JSON/SQL), keine zur Laufzeit generierten Werte:

| Fixture | Inhalt | Determinismus-Zweck |
|---|---|---|
| `fx-profile-test` | Profil „Test“: Geburtsdatum 1990-01-01, 70 kg, 175 cm, männlich, Aktiv-Level moderat | fester DGE-Vergleichssatz (FA-601) |
| `fx-haferflocken` | 13 g P / 60 g KH / 7 g F je 100 g (µg-normiert); TC-ENE-02 ergänzt 8 g Ballaststoffe | kcal-Parität 355,0 kcal (TC-ENE-01/TC-NRM-04); mit Ballaststoffen 371,0 (Atwater O-2) |
| `fx-karotte` | Basis-Einheit g, `stueckgewicht_g` = 80, umrechnungslos sonst | Stück-/Override-Pfad (TC-UMR-03/08) |
| `fx-karotte-500g-300g` | zwei Einkäufe mit MHD-Datumsset | FIFO-/MHD-Fälle (TC-FIF-01/04) |
| `fx-pizza` | 2 Teilschritte, 3 Zutatenzeilen (1 unresolved beim Import) | Rezept-Draft/Loop-Fälle (FA-300/305) |
| `fx-serien-set` | Aktivitäten mit 5 Wiederholungs-Mustern (alle §207-Typen) über 2026 | Resolver-Goldenliste je Muster (TC-REC-01…07) |
| `fx-week-500` | synthetische Woche mit 500 Aktivitäten (Generator mit festem Seed) | Performance TC-PRF-01 |
| `fx-bundle-ok` / `fx-bundle-broken` | Export-Bundle: gültig / falsche Version / korrumpiert | TC-EXP-01…04 |
| `fx-provider-*` (5 Stück) | aufgezeichnete Provider-Antworten (HTML/JSON) + erwartetes Draft-JSON | TC-PRV, ohne Netz |
| `fx-barcode-ean` | gültige EAN + Nicht-Treffer-EAN | TC-PRV-05 |

Statistik-Erwartungen („ø pro Tag“, DGE-Ampel) werden als **erwartete Zahlenwerte** je Fixture
hinterlegt („Golden Values“), um Regressionen sichtbar zu machen (FA-855).

## 7. Traceability: Abnahmekriterien ↔ Testgruppen (FA-854)

| Abnahme | Inhalt (kurz) | abdeckt |
|---|---|---|
| 1 | M-Anforderungen bestanden | alle TC-Gruppen (alle FA mit Priorität M) |
| 2 | Wochenansicht Performance/KW | TC-PRF-01, TC-UI-09 |
| 3 | Rezept ≤ 3 min anlegbar | TC-UI-02, TC-API-10 |
| 4 | Profilwechsel = DB-Wechsel | TC-DBC-06/07, TC-UI-01 |
| 5 | FIFO korrekt | TC-FIF-01/02 |
| 6 | Backend deaktivierbar | TC-API-04, TC-UI-11 |
| 7 | Export/Import Round-Trip | TC-EXP-01/02, TC-UI-08 |
| 8 | Android 10+ / 400–600 kcal Anzeige | TC-PRF-03, TC-POR-03, TC-UI-* auf Referenzgerät |
| 9 | Mangel-Prognose + Übernahme | TC-FEH-01…06, TC-UI-04 |
| 10 | Kategorie-Filter | TC-OVR-04, TC-AGG-04 |
| 11 | Rezeptbuch-Range/Vorschläge | TC-UI-04, TC-PRF-02 |
| 12 | Einkaufsplanung | TC-FIF-05/06/07 |
| 13 | Sprachwechsel 5 Sprachen | TC-I18N-01…03, TC-UI-10 |
| 14 | Datenschutz/Offline-Verhalten | TC-API-05–08, TC-PRV-06, TC-UI-11 |

## 8. Ausführung und CI

- **Stufen/Targets:** `test:unit` (L1), `test:db` (L2), `test:api` (L3), `test:provider` (L4), `test:ui` (L5, lokal am Gerät/Emulator), Coverage-Ziel **L1 ≥ 90 %** für UseCases/Calculation-Services; für UI/Adapter kein hartes Metrik-Ziel, aber Pflicht-Case der obigen Tabellen.
- **PR-Check:** L1–L4 laufen auf jeden Pull-Request (Vitest, headless); L5-Flows laufen lokal/Emulator — im CI optional per Android-Emulator-Job.
- **Fehlerdatenbank:** reale Fehler werden als Regressionstestcase in der betroffenen TC-Gruppe dokumentiert (R6).
- **Geräte-Matrix (Voreinstellung):** Android-Emulator-API 29 und API 35; physisches Referenzgerät für finale Abnahmeläufe.

## 9. Offene Punkte (betreffen Ausgestaltung im Detail)

| # | Frage | Voreinstellung bis Klärung |
|---|---|---|
| F-1 | Testframework für L1–L4: Vitest (Voreinstellung) oder Jest überall? | Vitest für Logik/DB/API, jest-expo nur für Komponenten-Smoke |
| F-2 | UI-Smoke-Werkzeug: Maestro (Voreinstellung) oder Appium-Barrierefreiheit? | Maestro |
| F-3 | Coverage-Schwelle L1: 90 % (Voreinstellung) oder strenger/locker? | 90 % |
| F-4 | CI-Plattform: GitHub Actions (Voreinstellung)? | GitHub Actions |
| F-5 | Umfang der automatisierten UI-Flows: alle 12 TC-UI-Fälle oder nur M-Kern (01/02/05/09/11)? | M-Kern automatisiert, Rest manuell skriptgeprüft |
| F-6 | Verwaltung des USDA-API-Keys (Backend-Config-Datei)? | Key nicht in Tests nötig (Fixtures), Konfiguration später |

Der Fragenkatalog wird dem Auftraggeber zur Beantwortung vorgelegt; bis dahin gelten die Voreinstellungen (siehe letzte Spalte).
