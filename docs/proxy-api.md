# API-Vertrag: In-App-Backend (Proxy-API) – LifeCompanion

> **Status:** Verbindliche Ausgestaltung zu FA-500/504 (M1-Start-Artefakt neben `docs/datamodel.md`).
> **Geltungsbereich:** Vertrag zwischen der App (React Native/TypeScript) und dem eingebetteten Node.js-Backend
> (Fastify, Entscheidung O-4). Das Backend ist ausschließlich die **Provider-/Parser-Schicht** – es rechnet
> keine Nährwerte, hält keine Nutzerdaten und schreibt **nie** in die Datenbanken.

## 1. Grundprinzipien

| # | Prinzip | Anforderung |
|---|---|---|
| P1 | **Nur Loopback** | Bind auf `127.0.0.1` (ausschließlich IPv4-Loopback), zufälliger freier Port, der der App beim Start mitgeteilt wird. Kein LAN, kein Hostname-Exposure, daher keine Authentifizierung (FA-500) |
| P2 | **Stateless bzgl. Nutzerdaten** | Keine Speicherung von Profilen/Rezepten/Zutaten im Backend; lediglich Suchbegriffe landen im In-Memory-/Datei-Cache (FA-508) |
| P3 | **Commit nur in der App** | Provider-Treffer werden als **Draft-Objekte** (Vorbefüllung, FA-501) geliefert; Speichern geschieht ausschließlich durch den Nutzer (FA-304) |
| P4 | **Niemand schreibt SQLite** | Single Writer ist die App über ihre DAOs. Das Backend liefert rein JSON |
| P5 | **Einwilligung wird erzwungen** | Ohne erteilte Einwilligung (FA-507, O-8) antwortet das Backend mit `CONSENT_REQUIRED` – auch für Barcode- und Rezept-Anfragen (FA-410, FA-306) |
| P6 | **Nur explizite Anfragen** | Externe Abrufe passieren nur auf Nutzeraktion (Suche, Barcode-Lookup). Kein Hintergrund-Traffic, kein Prefetch, keine Telemetrie (FA-508) |
| P7 | **Fehler statt Absturz** | Parser-/Netzwerkfehler sind strukturierte Fehler (Abschnitt 5) mit `fallback`-Hinweis; bietet die App die manuelle Erfassung an (FA-503, FA-800) |
| P8 | **Austauschbar** | Adapter-Interface (Abschnitt 6) und Draft-Schemas (Abschnitt 4) sind versioniert; neue Provider benötigen keine App-Änderung (FA-504) |
| P9 | **Deaktivierbar** | In den Einstellungen abschaltbar; ist er deaktiviert, lauscht das Backend gar nicht erst – alle Suchmasken arbeiten dann rein lokal/manuell |

## 2. Verbindungsaufbau und Konventionen

- **Base URL:** `http://127.0.0.1:<port>/api/v1` – `<port>` wird von der App gewählt und dem Backend als
  CLI-Argument/Umgebungsvariablen beim Start übergeben. Die App fragt das Backend nach dem Start mit `GET /health`
  an, bis der Handshake klappt (FA-506); scheitert er dauerhaft, läuft die App weiter **ohne** externe Suche (FA-800).
- **Handshake (FA-506):** `GET /health` liefert `apiVersion` + `minClientApiVersion`. Stimmt die Major-Version nicht mit
  der erwarteten überein, zeigt die App einen Hinweis („Backend- und App-Version stimmen nicht überein – bitte App aktualisieren“) und blockiert
  alle anderen Endpunkte.
- **Format:** JSON (UTF-8), `Content-Type: application/json`; alle Zeitangaben ISO 8601 UTC; Mengen als
  Zahlen (Punkt-Dezimaltrenner); Mengenangaben in der Basiseinheit der Entität (FA-320/322: intern µg-normiert, die Normierung
  übernimmt die App beim Commit).
- **Timeouts:** Connect 5 s, Read 15 s pro Provider-Call; Gesamt-Search-Timeout 20 s → `TIMEOUT` (retryable).
- **Jede Provider-Antwort** (`200er`-Suchantworten und Drafts) trägt `providerId`, `queriedAt` und ggf. `fromCache`,
  damit Quellen- und Abfrage-Datum beim Commit in `quelle`/`abgefragt_am` persistiert werden können (FA-506).

## 3. Provider-Registry

| providerId | Bezeichnung | Art | Entitäten | Priorität (O-3) |
|---|---|---|---|---|
| `openfoodfacts` | Open Food Facts | API | Zutat (inkl. Barcode) | 1 (Standard für Nährwerte/Barcode) |
| `usda` | USDA FoodData Central | API | Zutat | 2 (optional, API-Key im Backend-Config-Datei, nicht in der App-DB) |
| `naehrwertrechner` | naehrwertrechner.de | Website-Parser | Zutat | 3 |
| `fddb` | fddb.info | Website-Parser | Zutat | 4 |
| `rewe` | rewe.de/rezepte | Website-Parser | Rezept | 5 (Rezepte) |

Konfiguration (aktiv/inaktiv, Reihenfolge) liegt pro Adapter im Backend (FA-505); die App spiegelt die Einwilligungen
aus `provider_consent` (app.db) beim Start und nach jedem Widerruf (Abschnitt 7, FA-507).

## 4. Endpunkte (Übersicht)

| # | Methode | Pfad | Zweck | FA |
|---|---|---|---|---|
| E1 | GET | `/api/v1/health` | Liveness + Versions-Handshake | FA-500, FA-506 |
| E2 | POST | `/api/v1/bootstrap` | Startübergabe (Konfiguration, Einwilligungen, Cache-Verzeichnis) | FA-500, FA-505, FA-507 |
| E3 | GET | `/api/v1/providers` | Adapter-Liste mit Zustand (aktiv, Reihenfolge, Einwilligung, letzte Nutzung) | FA-502, FA-505 |
| E4 | PUT | `/api/v1/providers/{providerId}/config` | Adapter konfigurieren (aktiv/inaktiv, Reihenfolge) | FA-505 |
| E5 | PUT | `/api/v1/providers/{providerId}/consent` | Einwilligungs-Status spiegeln (erteilen/widerrufen, live) | FA-507 |
| E6 | GET | `/api/v1/search/ingredients` | Zutaten-/Lebensmittelsuche → Drafts | FA-501, FA-502, FA-326 |
| E7 | GET | `/api/v1/search/recipes` | Rezept-Suche → Drafts | FA-306, FA-502 |
| E8 | GET | `/api/v1/barcode/{code}` | Barcode-Lookup → Zutaten-Draft | FA-410 |
| E9 | DELETE | `/api/v1/cache` | Ergebnis-Cache leeren (komplett oder pro Provider) | FA-508 |

### E1 – `GET /api/v1/health`

```json
{ "status": "ok", "apiVersion": "1.0.0", "minClientApiVersion": "1.0.0",
  "providers": { "configured": 5, "enabled": 5, "consented": 2 }, "startedAt": "2026-10-13T07:41:22Z" }
```

### E2 – `POST /api/v1/bootstrap`

Wird einmal nach dem (erfolgreichen) Handshake gesendet (optional bei Konfigurationsänderung erneut).

```json
{
  "appVersion": "1.2.0",
  "clientApiVersion": "1.0.0",
  "locale": "de-DE",
  "cacheDirectory": "/data/…/files/backend-cache",
  "providers": [ { "providerId": "openfoodfacts", "enabled": true, "order": 1 } ],
  "consents":    [ { "providerId": "fddb", "granted": true, "grantedAt": "2026-10-13T07:45:01Z" } ]
}
```

Antwort: `{ "accepted": true, "effectiveConsents": 2 }` – von hier an erzwingt das Backend die mitgelieferte Einwilligungslage (FA-507).

### E3 – `GET /api/v1/providers`
Liefert je Adapter: `providerId`, `kind` (`api`|`website`), `entities` (`ingredient`|`recipe`), `enabled`, `order`, `consent` (`granted`|`missing`|`revoked`), `lastUsedAt` (nur Backend-Statistik, FA-505).

### E4 – `PUT /api/v1/providers/{providerId}/config`
Body `{ "enabled": true, "order": 3 }` → `200` mit dem aktualisierten Provider-Objekt (wie E3).

### E5 – `PUT /api/v1/providers/{providerId}/consent`
Body `{ "granted": false }` → deaktiviert den Adapter **sofort**; laufende Anfragen werden abgebrochen. Die
protokollierte Wahrheit bleibt immer `provider_consent` in `app.db`; der Endpunkt spiegelt nur (FA-507).

### E6 – `GET /api/v1/search/ingredients`

Query-Parameter: `query` (erforderlich, Suchbegriff), `providerId` (erforderlich, ein einzelner Provider;
Reihenfolge/default-Regeln O-3 entscheidet die App), `limit` (optional, Default 10, Max 25), `allowCache`
(optional, Default `true` → bei Netz-Ausfall die letzte gecachte Suchantwort als `fromCache: true`).

Siehe Abschnitt 5 (Antwortstruktur + Fehler) und Abschnitt 5 für `SearchResult`/`IngredientDraft`.

### E7 – `GET /api/v1/search/recipes`
Identisch zu E6, `providerId` ist ein Rezept-Provider (aktuell nur `rewe`, FA-306).

### E8 – `GET /api/v1/barcode/{code}`
`code` = EAN/UPC (Format-/Prüfziffernkontrolle durch die App). Liefert einen `SearchResult` vom `kind: "ingredient"` (Standard-Provider
`openfoodfacts`, FA-502/FA-410); kein Treffer → `404` mit `NOT_FOUND` – **kein Fehler-Dialog**, die Maske bleibt leer (FA-503).

### E9 – `DELETE /api/v1/cache?providerId=fddb`
Leert den Ergebnis-Cache (optional nur eines Providers); Antwort `{ "deletedEntries": 14 }`.

## 5. Suchantwort, Draft-Schemas (FA-504)

Alle Suche/Lookup-Antworten haben dieselbe Hülle:

```json
{
  "results": [
    {
      "resultId": "fddb::haferflocken::8f2e",
      "kind": "ingredient",
      "providerId": "fddb",
      "queriedAt": "2026-10-13T09:41:00Z",
      "fromCache": false,
      "sourceUrl": "https://fddb.info/…",
      "fidelity": "teilweise",
      "draft": { … IngredientDraft oder RecipeDraft … },
      "missingNutrients": ["Vitamin B12", "Folsäure"],
      "warnings": ["Provider-kcal 372 weicht von berechneten 355 kcal ab (FA-329 – Anzeige als Rückvergleich)"]
    }
  ],
  "queryTerms": ["Haferflocken"],
  "providerId": "fddb"
}
```

- **`fidelity`:** `vollstaendig` (Pflichtkern komplett, FA-340) · `teilweise` (Pflichtkern-Lücken in `missingNutrients`) · `minimal` (nur Name/Basis-Einheit) – die App zeigt daraus den Übernahme-Hinweis im Vorher-Nachher der Maske (FA-501).
- **`resultId`** ist stabil (Provider + externer Key), damit der abbrechbare Loop (FA-305) eine Zeile dem Draft zuordnen kann.

### 5.1 `IngredientDraft`

```json
{
  "name": "Haferflocken",
  "basisEinheit": "g",
  "stueckgewichtG": null, "dichteGProMl": null, "barcode": null,
  "nutrients": [
    { "nutrientName": "Eiweiß",           "wertNormiertPro100": 13700000, "einheit": "g",  "stufe": "pflichtkern", "angegeben": true },
    { "nutrientName": "Fett",             "wertNormiertPro100":  7000000, "einheit": "g",  "stufe": "pflichtkern", "angegeben": true },
    { "nutrientName": "Kohlenhydrate",   "wertNormiertPro100": 60000000, "einheit": "g",  "stufe": "pflichtkern", "angegeben": true },
    { "nutrientName": "davon Zucker",    "wertNormiertPro100":  1000000, "einheit": "g",  "stufe": "pflichtkern", "angegeben": true },
    { "nutrientName": "Ballaststoffe",   "wertNormiertPro100": 10000000, "einheit": "g",  "stufe": "pflichtkern", "angegeben": true },
    { "nutrientName": "Wasser",          "wertNormiertPro100":  9000000, "einheit": "ml", "stufe": "pflichtkern", "angegeben": true },
    { "nutrientName": "Vitamin B12",     "wertNormiertPro100": null,     "einheit": "µg", "stufe": "empfohlen",   "angegeben": false }
  ]
}
```

Werte sind **pro 100 g bzw. 100 ml** (FA-321), bereits µg-normiert (FA-322), so dass die Maske 1:1 vorbelegt ist;
die App übernimmt beim Commit die normierten Werte; die Umrechnung von TL/EL/Tasse/Stück über `unit_conversion` (FA-331/332) erfolgt **in der App** nach der Übernahme.

### 5.2 `RecipeDraft`

```json
{
  "name": "Pizza Margherita",
  "typ": "Hauptgericht",
  "portionen": 1,
  "steps": [ { "laufnummer": 1, "titel": "Teig herrrichten", "dauerMin": 30 },
             { "laufnummer": 2, "titel": "Pizza machen",    "dauerMin": 20 } ],
  "ingredients": [
    { "rohText": "500 g Mehl", "menge": 500, "einheit": "g", "resolved": null,
      "suggestion": { "resultId": "fddb::mehl::12aa", "name": "Weizenmehl Typ 405" } },
    { "rohText": "1,5 TL Zucker", "menge": 1.5, "einheit": "TL", "resolved": "local:ingredient:12345",
      "suggestion": null }
  ],
  "providerKcal": 372.0,
  "providerKcalHinweis": "wird nur als Rückvergleich gezeigt, nie gespeichert (FA-329)"
}
```

- Unresolved Zutaten eines RecipeDrafts sind der Eingangspunkt für den **abbrechbarer Loop** (FA-305): jede Zeile
  mit `resolved: null` wird in der Maske einzeln durch lokale Suche → Provider-Suche → manuelle Anlage geführt.
- `einheit`-Codes wie E6-Abfrage: `g|kg|ml|l|TL|EL|Tasse|Stueck` (FA-330); die App normiert mit der
  `unit_conversion`-/`ingredient_unit_override`-Tabelle, fehlende Regel → Nachfrage statt Annahme (FA-334, FA-800).

## 6. Fehlermodell (FA-503, FA-800)

Alle Fehlerantworten (HTTP-Status anders als 2xx) folgen einem Schema:

```json
{
  "error": {
    "code": "CONSENT_REQUIRED",
    "message": "Für „fddb“ wurde noch keine Einwilligung erteilt.",
    "providerId": "fddb",
    "retryable": false,
    "fallback": "einwilligung_einholen",
    "queriedAt": "2026-10-13T09:41:00Z"
  }
}
```

| Code | Status | Bedeutung | fallback |
|---|---|---|---|
| HANDSHAKE_FAILED | 503 | Backend läuft, Client-Version unbekannt (FA-506) | app_ohne_backend |
| CONSENT_REQUIRED | 403 | Keine Einwilligung für den Provider (auch fürs Barcode/Rezept, FA-507) | einwilligung_einholen |
| CONSENT_REVOKED | 403 | Widerrufen – Anfrage bewusst abgelehnt, kein erneuter Abruf | lokale_suche |
| PROVIDER_DISABLED | 409 | Adapter inaktiv (Einstellungen/E4) | anderer_provider |
| PROVIDER_UNAVAILABLE | 502 | Website oder API nicht erreichbar oder Aufbau geändert | anderer_provider |
| PARSE_FAILED | 422 | Seite/API-Antwort nicht mehr parsbar – kein Absturz; Maske leer + Klartext-Hinweis (FA-503) | manuelle_eingabe |
| OFFLINE | 503 | Kein Netz / Flugmodus (FA-508) | cache |
| NOT_FOUND | 404 | Barcode/Suche ohne Treffer (kein Dialog, FA-503) | manuelle_eingabe |
| RATE_LIMITED | 429 | Provider-Drosselung | spaeter |
| QUERY_REQUIRED | 400 | Suchbegriff fehlt/zu kurz (unter 2 Zeichen) | – |
| TIMEOUT | 504 | Read- oder Gesamt-Timeout | cache |

Der Offline-Pfad (FA-508): alle Such- und Barcode-Endpunkte akzeptieren `allowCache=true`; ist das Netz weg,
antwortet zuerst der Cache (`results[].fromCache: true`, originales `queriedAt` bleibt sichtbar). Ohne Cache-Treffer
kommt OFFLINE als Code. Hintergrundabrufe, Verbindungs-Prüfungen im Hintergrund oder sonstiger Traffic finden nicht statt.

## 7. Adapter-Interface (FA-504, verbindlich für neue Provider)

```ts
export interface ProviderAdapter {
  readonly id: ProviderId;                       // siehe Registry, Abschnitt 3
  readonly kind: 'api' | 'website';
  readonly entities: readonly ('ingredient' | 'recipe')[];
  /** Nur bei ausdrücklicher Nutzeraktion gerufen (FA-508). Muss die Timeout-Vorgaben aus Abschnitt 2 einhalten. */
  search(query: SearchQuery): Promise<RawResult[]>;
  /** Nur für Barcode-Provider (FA-410). */
  lookupBarcode?(code: string): Promise<RawResult | null>;
  /** Liefert ein normalisiertes Draft-Objekt (Abschnitt 5). Keine kcal-Berechnung – die App rechnet (FA-329). */
  toDraft(raw: RawResult): IngredientDraft | RecipeDraft;
}

export interface SearchQuery {
  query: string;
  limit: number;
  locale: string;              // z. B. 'de-DE', aus der App-i18n übergeben (FA-106)
  allowCache: boolean;
}
```

Anforderungen an jeden Adapter:

1. **Ein Adapter = eine Datei** mit eigenem Parser (oder API-Client), registriert in der Provider-Registry;
   neue Provider werden ausschließlich im Backend ergänzt (FA-500/504).
2. **Protokollierung pro Anfrage (FA-505):** JSON-Zeile in der Cache-/Log-Datei mit `ts`, `providerId`, `query`,
   `status`, `dauerMs`, `bytes`, `cacheHit`. Keine Profil- oder sonstigen Nutzerdaten – nur der Suchbegriff
   bzw. Barcode. Deaktivierbares Backend bedeutet auch: keine Log-Dateien.
3. **Attribution:** Website-Treffer tragen `sourceUrl`; Open-Food-Facts-Ergebnisse die Pflicht-Namensnennung
   (siehe NFA Datenschutz) in den Draft-Metadaten (FA-502).
4. Reagieren Website-Parser auf geänderte Selektoren, liefern sie PARSE_FAILED statt einer still fehlerhaften Ausgabe; Parser-Goldendateien (Eingabe-HTML → erwartetes Draft-JSON) für Regressionen sind Pflicht (Abschnitt 8).

## 8. Testbarkeit (FA-854/855)

- **Contract-Tests** für jeden Endpunkt E1 bis E9 – inklusive aller Fehlercodes aus Abschnitt 6.
- **Provider-Fixtures:** aufgezeichnete Antwortdaten je Provider; Adapter-Tests laufen ohne Netzverbindung
  gegen diese Fixtures, Parser werden als Golden-Dateien geprüft (Eingabe-HTML → erwartetes Draft-JSON).
- **Consent-Tests:** CONSENT_REQUIRED und CONSENT_REVOKED für alle fünf Provider ebenso wie der Offline-Pfad
  (OFFLINE plus Cache-Vorhalte-Verhalten, FA-508).
- **Handshake-Test:** falsche Major-Version blockiert alle anderen Endpunkte (FA-506).

## 9. Querverweise

- Lastenheft: Abschnitt 3.1/3.1.1 (Stack, Systemkomponenten), Abschnitt 5.6 (FA-500 bis FA-508), FA-410 (Barcode),
  FA-305/306 (Loop und Rezept-Suche), FA-800 (Robustheit), NFA Datenschutz (keine Telemetrie).
- Datenmodell: `docs/datamodel.md` – `provider_consent` (app.db), `ingredient_nutrient` mit `quelle`/`abgefragt_am`,
  `unit_conversion`/`ingredient_unit_override` (Normierung nach dem Commit in der App).
