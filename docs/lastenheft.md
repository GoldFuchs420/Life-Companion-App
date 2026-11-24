# Lastenheft: LifeCompanion

**Version:** 0.7 · **Status:** Kernentscheidungen O-1 … O-5 (Abschnitt 9), Review-Klärungen Rev. 4, Scope-Erweiterungen Rev. 5 und Rezeptbuch Rev. 6 · **Plattform-Ziel:** Android 10+ (API 29), iOS folgt über dieselbe Codebasis

## 1. Zielsetzung

LifeCompanion ist eine mobile Begleit-App zur Organisation des Alltags und der Ernährung. Kernidee: ein **lokaler Kalender** mit wiederkommenden, kategorisierten Aktivitäten, der mit **Rezepten, Zutaten und Nährwertdaten** verbunden ist. Daraus entstehen automatisch **Ernährungs- und Aktivitätsstatistiken** pro Profil, vergleichbar mit den Empfehlungen der DGE.

**Kernwertversprechen:**

- Ein Tool statt vieler: Kalender + Rezepte + Bestand + Statistik in einer App.
- Volle Datenkontrolle: alle Daten lokal, frei exportierbar/importierbar.
- Keine stillen Datenlücken: fehlende Daten werden erkannt und interaktiv ergänzt, statt Berechnungen zu verfälschen oder die App abstürzen zu lassen.

## 2. Glossar

| Begriff | Bedeutung |
|---|---|
| Aktivität | Zeitlich geplanter Eintrag im Kalender mit Titel, Zeitraum, Wiederholung, Priorität, Kategorie |
| Vorlage | Wiederverwendbare Aktivitätsdefinition (z. B. „Radfahren“) |
| Rezept | Zubereitungsanleitung mit Zutatenliste und Portionsgröße; gilt auch für Getränke |
| Zutat / Lebensmittel | Nährwertgetragene Basis-Einheit; wird in g oder ml geführt |
| Nährwertprofil | Vollständiger Nährwerksatz einer Zutat (Makro-Nährwerte, Vitamine, Mineralstoffe, Lipide, Aminosäuren …) |
| Bestandsliste | Zugekaufte Zutatenmengen mit Datum; Basis für Vorrats- und Nährwertübersicht |
| Suchprovider | Austauschbarer Online-Quellenservice (z. B. naehrwertrechner.de, fddb, rewe.de/rezepte) |
| Priorität | Attribut einer Aktivität: *beschäftigt*, *abwesend*, *verfügbar* |
| DGE | Deutsche Gesellschaft für Ernährung; Quelle der Referenzwerte |
| Mangel-Prognose | Bedarf (DGE) minus erwartete Zufuhr der nächsten x Tage aus den geplanten Essen-Einträgen (FA-613) |
| Rezeptbuch | Ansicht im Hauptmenü: geplante Rezepte/Lebensmittel tagesweise gelistet mit Nährwerten und Vorschlägen (FA-360 ff.) |

## 3. Systemlandschaft und Stack

### 3.1 Festgelegter Stack (Entscheidung O-1, O-4)

Das Frontend ist **React Native mit Expo in TypeScript**; Android kommt zuerst, iOS kann später über dieselbe Codebasis folgen. Das **Node-Backend** (ebenfalls TypeScript) dient ab Version 1 als Parser-/Provider-Schicht:

| Ebene | Technologie | Begründung |
|---|---|---|
| App-Framework / UI | **React Native + Expo, TypeScript** | Eine Codebasis für Android und später iOS; entspricht der TS/JS-Präferenz |
| Architektur | **MVVM** (Views → ViewModel-Hooks → UseCases/Repository → DAO) | Explizite Anforderung; siehe Abschnitt 7 |
| Lokale DB | **SQLite** (expo-sqlite/drizzle-orm) | Offline-first, relationales Datenmodell mit Umrechnungs- und Nährwerttabellen |
| Kalenderzugriff | expo-calendar / react-native-calendar-events, eigener Kalender „LifeCompanion“ | Native Kalender-Integration, siehe FA-200 |
| Hintergrundjobs / Sync | expo-task-manager / expo-background-fetch | Periodischer Kalender-Sync und Import-Jobs |
| State-/ViewModel-Binding | Zustand oder MobX als ViewModel-Layer | Leichtgewichtig, testbar |
| Networking (App) | fetch/axios, ausschließlich gegen das eingebettete Backend (127.0.0.1) | Klare Schnittstelle, keine direkten Website-Zugriffe aus der App |
| Import/Export | JSON-Bundle (versioniert) | Siehe FA-104 |
| In-App-Backend (Parser-/Provider-Schicht) | **Node.js (TypeScript, Fastify), in die App eingebettet** (z. B. nodejs-mobile), lauscht ausschließlich auf 127.0.0.1 | Parser und Provider-Adapter zentral gewartet, ohne App-Release nachzuschieben; kein LAN-Exposure, kein separater Serverbetrieb nötig (Rev. 4) |

**Folgentscheidung iOS:** Dank React Native kann iOS später **über dieselbe Codebasis** erfolgen; nur kalender- und plattformspezifische Native-Module werden pro Plattform gepflegt. Datenmodell- und Provider-Verträge gelten für beide Plattformen.

### 3.1.1 Systemkomponenten

```
┌─────────────────────────────────────────────┐     ┌────────────────────────┐
│  LifeCompanion App (Gerät)                  │     │  Provider (Internet)   │
│  ┌───────────────────────────────────────┐  │     │  Open Food Facts,      │
│  │ UI · React Native (Expo, TypeScript)  │  │     │  USDA,                 │
│  │ MVVM (Stores → UseCases → Repos)      │  │     │  naehrwertrechner,     │
│  └──────────────┬────────────────────────┘  │     │  fddb, rewe.de         │
│                 │ localhost (127.0.0.1)     │     └───────────▲────────────┘
│  ┌──────────────▼────────────────────────┐  │                 │
│  │ In-App-Backend · Node.js (Fastify)    │──┼─────────────────┘
│  │ Provider-Adapter + Website-Parser     │  │
│  └───────────────────────────────────────┘  │
│  SQLite (lokal) + Systemkalender            │
└─────────────────────────────────────────────┘
```

Das In-App-Backend startet mit der App (Entscheidung Rev. 4: intern in der App als Backend, nur 127.0.0.1 – kein LAN-Exposure, daher keine Authentifizierung nötig) und ist in den Einstellungen deaktivierbar; ohne Backend stehen lokale Suche und manuelle Erfassung bereit.

```

Der Proxy läuft im Heimnetz des Nutzers (F-Droid- und Datenschutz-Vorgabe: kein Cloud-Zwang). Er ist optional deaktivierbar; ohne Proxy stehen nur lokale Suche und manuelle Erfassung bereit.

### 3.2 Architekturprinzipien

- **Offline-first:** Alle Kernfunktionen funktionieren ohne Netz; online wird nur für Suchprovider/Parser benötigt.
- **Single Source of Truth:** Die lokale SQLite-Datenbank. Der Systemkalender dient als Anzeige-/Synchronisationsziel, nicht als Datenquelle der App-Logik.
- **Validierung statt Annahme:** Rechenfunktionen (Statistik, Portionsrechner) nutzen keine erdachten Werte, sondern fordern fehlende Eingaben an (FA-800).
- **Backend eingebettet und austauschbar:** Das Node-Backend läuft als eigener Prozess im App-Kontext auf 127.0.0.1 (Rev. 4); fällt es aus, funktioniert die App weiter, nur die externe Suche bleibt aus.
- **Serie in der App, Instanz im Systemkalender:** Serienlogik strikt intern, der Systemkalender erhält expandierte Einzel-Events (Rev. 4, FA-201/213).
- **Rohmengen statt Kochzustand:** Nährwerte gelten für Rohware, Mengen werden in Rohmengen erfasst (Rev. 4, FA-335).
- **Ein Profil = eine Datenbank** (Entscheidung Rev. 3, siehe FA-851): strikte Isolation der Profildaten auf Datei-Ebene.
- **Datenbankentwurf vor Umsetzung** (FA-850): erst das Schema, dann die App; das Schema bleibt während der Umsetzung anpassbar.

## 4. Funktionale Anforderungen

Zählweise Prioritäten: **M** = Muss (V1), **S** = Soll (V1 sofern Aufwand vertretbar), **K** = Kann (Ausbau).

### 4.1 Hauptmenü und Navigation

| ID | Anforderung | Prio |
|---|---|---|
| FA-001 | Hauptmenü mit Einträgen: Kalender, **Rezeptbuch (Tagesplan),** Aktivitäten/Vorlagen, Kategorien, Rezepte, Zutaten/Lebensmittel, Bestand/Einkäufe, Profile, Statistiken, Einstellungen, Export/Import | M |
| FA-002 | Menüeinträge mit Icon + beschrifteter Fläche; Design siehe FA-900 | M |

### 4.2 Profile

| ID | Anforderung | Prio |
|---|---|---|
| FA-100 | Mehrere **Profile** anlegen, umbenennen, löschen. Jedes Profil isoliert seine Kalender-, Rezept-, Bestands- und Statistikdaten | M |
| FA-101 | Profildaten: Name, **Geburtsdatum/Alter**, **Gewicht**, optional Größe, Geschlecht, Aktivitätslevel → Basis der DGE-Referenzwerte | M |
| FA-102 | Ein Profil als **aktives Profil** auswählen und zwischen Profilen wechseln; Daten des aktiven Profils einsehen | M |
| FA-103 | **Vergleichsmodus:** zwei Profile direkt nebeneinander vergleichen (Statistiken, Zeit pro Kategorie, Ø kcal/Tag) | S |
| FA-104 | Alle Daten (Profil, Kalender, Aktivitäten, Rezepte, Zutaten, Bestand, Einstellungen) als **Export-Datei** sichern und auf anderem Gerät importieren | M |
| FA-105 | Beim Löschen eines Profils: Bestätigungsdialog mit Warnung über Datenverlust | M |

### 4.3 Kalender und Aktivitäten

| ID | Anforderung | Prio |
|---|---|---|
| FA-200 | **Lokaler Kalender „LifeCompanion“** entsprechend dem App-Namen wird als eigener Systemkalender integriert; App liest und schreibt ihn | M |
| FA-201 | Kalender-Sync mit dem Systemkalender (bidirektional für die eigene Kalender-ID). **Rev. 4:** Serienlogik bleibt ausschließlich in der App-DB (FA-207); der Systemkalender erhält die expandierten Instanzen als Einzel-Events. Konfliktfälle (gleichzeitige Änderung) per „Last write wins“ **pro Instanz**, dokumentiert | M |
| FA-202 | **Wochenansicht 0–24 Uhr**, Tage als Spalten, Zeit als Zeilen; mehrere zeitgleiche Aktivitäten werden **nebeneinander** dargestellt | M |
| FA-203 | Bei Überlappungen wird auf den Konflikt **hingewiesen** (visuelle Markierung + Hinweistext); die Überlappung wird nicht verhindert | M |
| FA-204 | Navigation zwischen Wochen über ←/→-Buttons oder Swipe; Anzeige der **KW-Nummer** und der **Datumsspanne** (z. B. „KW 42 · 14.–20. Okt 2026“) | M |
| FA-205 | Tap auf Tages-/Zeitzelle: neues Aktivitätsfenster mit vorbelegter Startzeit | M |
| FA-206 | Aktivität: Titel, Beschreibung, **Zeitraum** (Beginn/Ende), **Kategorie**, **Priorität** (*beschäftigt*, *abwesend*, *verfügbar*), **Wiederholungen** (Liste), ggf. Referenz auf Rezept oder Vorlage | M |
| FA-207 | **Mehrere Wiederholungen pro Aktivität**, jede mit eigenem Startdatum und **optionalem absolutem Enddatum** | M |
| FA-207a | Wiederholungstyp: alle *x* Stunden / Tage / Wochen / Monate / Jahre (Intervall konfigurierbar) | M |
| FA-207b | Wiederholungstyp: immer am *x.* Tag des Monats | M |
| FA-207c | Wiederholungstyp: immer am *x.* Tag des Jahres (inkl. Schaltjahresregel) | M |
| FA-207d | Wiederholungstyp: an Wochentag(en) (Montag, Dienstag, …; Mehrfachauswahl) | M |
| FA-208 | **Vorlagen:** Aktivitäten (nicht-kochen, z. B. „Radfahren“) als Vorlage speichern mit Titel, Beschreibung, Voreinstellung der Zeitspanne, Wiederholungen, Kategorie und optional **kcal-Verbrauch pro Stunde** (rein orientierend; leer/0 = „verbraucht keine Kalorien“, z. B. Hygiene, Haushalt) | M |
| FA-209 | Aus Vorlage: Aktivität im Kalender instanziieren, Werte übernehmen, Zeitraum anpassen | M |
| FA-210 | Kalendereintrag vom Typ **„Essen/Rezept“** (FA-300) ist fachlich ebenfalls eine Aktivität mit Kategorie „Kochen/Rezepte“ und erbt Priorität, Beschreibung, Wiederholung etc. | M |
| FA-211 | **Prioritäts-Semantik (Rev. 4):** reine Warnungs-/Anzeige-Logik – *beschäftigt* löst die Überlappungs-Warnung aus (FA-203) und wird farblich hervorgehoben; *verfügbar* und *abwesend* beeinflussen nur Farbe/Anzeige, keine weitere Berechnungs- oder Auswertungslogik (Auswertung nach Priorität ggf. als Ausbaustufe) | M |
| FA-212 | Serien-Editing: V1 bearbeitet eine Serie nur als Ganzes; „nur diesen Termin / alle / ab hier“ sowie Ausnahmen-Listen (Urlaub/Krankheit, `EXDATE`-Analogie) sind Ausbaustufe V2 | K |
| FA-213 | **Serien-Expansion (Rev. 4):** der RecurrenceResolver erzeugt die Instanzen einer Aktivität aus allen Wiederholungsregeln (FA-207) inkl. optionalem Serien-Ende; im Systemkalender existieren nur die expandierten Einzel-Events | M |
| FA-214 | **Kategorie-Filter (Rev. 5):** die Wochenansicht lässt sich nach einer oder mehreren Kategorien filtern (Filter-Chips); nicht gefilterte Termine werden **ausgegraut** statt ausgeblendet, damit Layout und Zeilenausrichtung erhalten bleiben – leichtere Übersicht über z. B. nur Kochen oder nur Sport | M |

### 4.4 Rezepte, Zutaten, Nährwerte

#### 4.4.1 Rezepte

| ID | Anforderung | Prio |
|---|---|---|
| FA-300 | In der Aktivität „Kochen“ (Kalender) werden gespeicherte Rezepte als Vorschlag angezeigt; Auswahl übernimmt Rezept-**Dauer** und ggf. **Teilschritte** (z. B. „Teig herrichten“ → „Pizza machen“) als sequenzielle Teil-Aktivitäten im selben Zeitraum-Block | M |
| FA-301 | **Rezeptmenü** (eigener Menüpunkt): Rezepte anlegen, bearbeiten, löschen, suchen, kategorisieren (z. B. Hauptgericht / Getränk / Snack) | M |
| FA-302 | Rezept enthält: Titel, Typ, Zubereitungsschritte, ggf. Unterteilung in Teilschritte, Zutatenliste; gilt **für eine Portion**. **Rev. 4:** 400–600 kcal ist nur **Anzeige/Referenzwert** (die errechneten kcal pro Portion werden angezeigt), kein Muss und keine Sperre | M |
| FA-303 | Beim Hinzufügen zum Kalender wählt der Nutzer die **Anzahl Portionen**; alle Nährwerte skalieren mit | M |
| FA-304 | Beim Rezeptanlegen ist der **erste Suchschritt lokal** in der Datenbank; danach kann online gesucht werden (Suchprovider wählbar) und die Ergebnisse füllen automatisch die Eingabemaske. **Speichern/Commit erfolgt erst durch explizite Nutzerbestätigung.** | M |
| FA-305 | **Abbrechbarer Loop** beim Rezept-Erstellen: prüft, ob für jede Rezeptzeile eine Zutat mit vollständigem Nährwertprofil existiert; falls nicht, führt der Loop Schritt für Schritt durch Suchen/Anlegen und kann jederzeit pausiert/abgebrochen werden (Zwischenstand bleibt erhalten) | M |
| FA-306 | V1-Rezeptsuche alternativ **manuell** oder über **rewe.de/rezepte** (Suchprovider über den Parser-Proxy); fachlicher Pin: Rezept-Datenhaltung ist provider-agnostisch | M |
| FA-307 | Auch **Getränke** lassen sich als Rezepte pflegen (Typ „Getränk“) | M |

#### 4.4.2 Zutaten / Lebensmittel

| ID | Anforderung | Prio |
|---|---|---|
| FA-320 | Zutaten werden **immer in Gramm (g) oder Milliliter (ml)** geführt; die Basiseinheit wird beim Anlegen festgelegt und bleibt konstant (z. B. Karotte → g) | M |
| FA-321 | Nährwertangaben beziehen sich auf **100 g bzw. 100 ml** (Referenz wie bei fddb / naehrwertrechner.de) | M |
| FA-322 | Nährwerte werden milligrammgenau gespeichert. **Rev. 4:** jeder Nährstoff führt seine **übliche Einheit** (mg; µg für B12, Vitamin D, Folsäure; ml für Wasser); intern werden alle Werte auf µg normiert gespeichert, das UI zeigt die übliche Einheit und rechnet Eingaben um. Energie (kcal) wird **nicht gespeichert**, sondern aus den Makro-Nährwerten abgeleitet (FA-329) | M |
| FA-323 | Nährwertkategorien: Basis-Nährwerte (Eiweiß, Fett, Kohlenhydrate, Zucker, Ballaststoffe, **Wasser**) sowie **Vitamine, Mineralstoffe, Spurenelemente, Lipide (einfach/mehrfach ungesättigt), Aminosäuren, Alkohol (für Getränke, FA-307; 7 kcal/g), weitere** | M |
| FA-324 | **Grundlegende Nährwerte** direkt sichtbar am Rezept: kcal, Eiweiß, Fett (gesättigt, einfach ungesättigt, mehrfach ungesättigt), Kohlenhydrate, davon Zucker, Wasser, Ballaststoffe | M |
| FA-325 | **Detailansicht** pro Rezept/Zutat: alle verfügbaren Nährwerte, gruppiert nach Nährwertkategorien | S |
| FA-326 | Zutaten können über **naehrwertrechner.de** abgerufen werden; der Nutzer **sichtet** die Werte (fddb als weitere Quelle optional) und übernimmt sie danach in die lokale Datenbank | M |
| FA-327 | Fehlende Nährwerte lösen einen aktiven **Eingabe-Hinweis** aus, keinen Fehler. Die Pflicht gilt über das **Stufenmodell (FA-340)**; „0 / nicht angegeben“ ist als bewusster Wert wählbar und unterscheidet sich im UI sichtbar von „fehlt“ | M |
| FA-328 | Auch ein **einzelnes Lebensmittel** (ohne Rezept) kann über den Kalender als Aktivität „Essen“ erfasst werden | M |
| FA-329 | **Energieberechnung (Brennwert-Ableitung, Entscheidung O-2):** kcal = Eiweiß × 4 + Kohlenhydrate × 4 + Fett × 9 (Atwater-Faktoren, bezogen auf g); Ballaststoffe werden mit × 2 kcal/g einberechnet (Festlegung Rev. 4); Alkohol × 7 kcal/g (FA-323). Von externen Quellen gelieferte kcal-Angaben werden **nicht** in die Datenbank übernommen, sondern nur zum Rückvergleich neben die berechneten kcal gestellt; Abweichungen werden angezeigt (Quellen können abweichen, da sie andere Brennwertansätze nutzen) | M |
| FA-340 | **Nährwert-Stufenmodell (Rev. 4):** *Pflichtkern* = Eiweiß, Fett, Kohlenhydrate, Zucker, Ballaststoffe, Wasser – muss gefüllt sein, sonst schließt der abbrechbare Loop (FA-305) nicht ab. *Empfohlen* = 13 Vitamine, 13 Mineralstoffe/Spurenelemente – Füllung wird angefragt, Lücken sichtbar markiert, Speichern bleibt möglich. *Optional* = Lipide, Aminosäuren, Alkohol – freiwillig | M |
| FA-341 | Lücken aus *Empfohlen/Optional* werden in der Detailansicht und Statistik (FA-600/601) als „offene Punkte“ markiert und in Zufuhr-Summen als „unvollständig erfasst“ ausgewiesen, nicht als 0 gezählt | M |

#### 4.4.3 Einheiten und Umrechnung

| ID | Anforderung | Prio |
|---|---|---|
| FA-330 | Mengenangaben in Rezepten können wahlweise in **Stück, Tassen (150 / 250 / 330 ml), TL, EL, Prise, g, kg, ml, l** erfolgen | M |
| FA-331 | **Umrechnungstabelle in der Datenbank** (`unit_conversion`), z. B. 1 TL Öl = 5 ml; pro Zutat können nutzerspezifische Dichte-/Stückgewichte hinterlegt werden (z. B. „1 Karotte ≈ 80 g“) | M |
| FA-332 | Externe Angaben wie „1,5 TL Zucker“ oder „2 Tassen Mehl“ werden über die Tabelle automatisch in g/ml umgerechnet | M |
| FA-333 | Mengenangaben in Rezepten werden intern auf g/ml normiert und daraus hochgerechnet (Rezept → 1 Portion → N Portionen) | M |
| FA-334 | Fehlt eine Umrechnungsregel → nicht-abrupte Eingabeaufforderung statt Berechnung mit erdachten Werten (FA-800) | M |

#### 4.4.4 Rezeptbuch (Tagesplan)

Neben dem Kalender existiert das **Rezeptbuch** als eigene Ansicht im Hauptmenü: der Essens-Plan, tagesweise gelistet.

| ID | Anforderung | Prio |
|---|---|---|
| FA-360 | **Rezeptbuch-Ansicht (Rev. 6):** im Hauptmenü als eigener Punkt; listet Tage chronologisch (Standard: die kommende Woche, Zeitraum frei wählbar). Pro Tag: alle geplanten Essen-/Rezept-Einträge und Einzel-Lebensmittel aus dem Kalender – zusammengeführt inkl. der expandierten Wiederholungs-Instanzen (FA-213) – mit Titel, Portionsanzahl und den berechneten Nährwerten (kcal + Pflichtkern-Makros; volle Details per Tap, FA-325) | M |
| FA-361 | **Tages-Summen:** je Tag die Summe der geplanten Zufuhr direkt vergleichbar mit dem DGE-Bedarf des Profils (Ampel-Logik wie FA-602); Lücken-Tage werden sichtbar markiert (FA-341) | M |
| FA-362 | **Vorschlags-Sichtbarkeit:** die Schließungs-Vorschläge der Mangel-Prognose (FA-614) und die Verbrauchs-Vorschläge (FA-405, V2) erscheinen **im Rezeptbuch tagesweise** auf dem jeweiligen Tag und sind dort per Tap als Essen-Eintrag für genau diesen Tag übernehmbar | M |
| FA-363 | **Keine separate Datenhaltung:** das Rezeptbuch ist eine Anzeige-/Bearbeitungs-Abkürzung; Single Source of Truth bleiben Kalender-/Rezept-Datenbank. Verschieben/Löschen im Rezeptbuch wirkt auf den Kalender-Eintrag; Löschen eines Rezepts markiert betroffene Tage sichtbar | M |
| FA-335 | **Rohmengen-Annahme (Rev. 4):** Nährwerte gelten für Rohware; alle Mengen werden in Rohmengen erfasst (z. B. Reis roh, nicht gekocht). Gewichtsverlust/-gewinn durchs Kochen (Wasserverlust) wird in V1 nicht modelliert; die Portionsrechnung bleibt auf Rohmengen | M |

### 4.5 Bestand / Einkäufe

| ID | Anforderung | Prio |
|---|---|---|
| FA-400 | **Einkäufe erfassen:** Datum + Liste von Zutaten mit Mengen (z. B. „13.10.2026: 500 g Karotten, 1 kg Zucker, 500 g Brokkoli (TK)“) | M |
| FA-401 | Eingaben werden in die **Bestandsliste** übertragen; Bestand steigt. **Rev. 4: FIFO-Abbuchung ab V1** – Kochen/Essen-Einträge buchen mengen-genau vom Bestand ab (ältester Posten zuerst); reicht der Bestand nicht, wird die Deckungslücke angezeigt, ohne den Bestand unsichtbar negativ zu machen | M |
| FA-402 | Pro Bestandsposten Nährwerte anzeigen. Fehlt das Nährwertprofil lokal → Suche (Suchprovider) oder manuelle Anlage der Zutat | M |
| FA-403 | Kennzeichnung „tiefgekühlt / trocken / …“ als Zusatzattribut (reine Information, keine Logik in V1) | S |
| FA-404 | **MHD/Verfallsdatum (Rev. 4):** optionales Feld pro Bestandsposten; Warnliste „läuft bald ab / ist abgelaufen“; ohne MHD-Datum bleibt der Posten einfach ohne Warnung | S |
| FA-405 | **Verbrauchs-Rezeptvorschläge (V2, Rev. 5):** aus der MHD-Warnliste und der Bestandsliste lässt sich ein Modus „Verwende was da ist“ starten; die App schlägt Rezepte vor, die den (MHD-kritischen) Bestand möglichst vollständig verwenden, und zeigt an, welche Zutaten zum Bestand passen und welche fehlen | K |

### 4.6 Suchprovider, Parser, Proxy

| ID | Anforderung | Prio |
|---|---|---|
| FA-500 | **In-App-Backend (Node/TypeScript; Entscheidung O-4, Rev. 4):** eingebettetes Node.js-Backend innerhalb der App (z. B. nodejs-mobile), lauscht ausschließlich auf **127.0.0.1** – kein LAN-/Netz-Exposure, daher keine Authentifizierung nötig. Ruft die Provider ab, parst strukturiert und liefert JSON an die UI; dadurch Wartung der Parser ohne App-Release. In den Einstellungen deaktivierbar | M |
| FA-501 | Pro Entitätsart existiert **eine Eingabemaske** (Zutat, Rezept, Aktivitätsvorlage, Kategorie, Profil, Einkauf, …); Parser/Proxy **vorbefüllt** diese Maske – der Nutzer prüft, korrigiert und committet | M |
| FA-502 | **Suchprovider-Auswahl und -Reihenfolge** (Entscheidung O-3 – APIs zuerst): 1. **Open Food Facts** (offizielle API), 2. USDA FoodData Central (optional ergänzend), 3. Website-Provider **naehrwertrechner.de**, 4. **fddb**, 5. **rewe.de/rezepte** (Rezepte). Auswählbar im UI (Dropdown/Badges); Standard bei Nährwertabfragen: Open Food Facts | M |
| FA-503 | Parser-Fehler → keine App-Fehler, sondern klarer Hinweis + angebotene manuelle Erfassung | M |
| FA-504 | Provider-Interface mit klarer Vertragsdefinition (JSON-Schema pro Entität), damit weitere Quellen ohne App- und Proxy-Rework nachrüstbar sind | M |
| FA-505 | Provider-Adapter im Backend sind einzeln konfigurierbar (aktiv/inaktiv, Reihenfolge), jede Antwort wird mit Provider- und Abfragedatum protokolliert, damit die Herkunft der übernommenen Daten nachvollziehbar bleibt | S |
| FA-506 | **Rev. 4:** UI und Backend stimmen sich beim Start per Versions-Handshake ab (interne API-Version; Inkompatibilität → Hinweis). Übernommene Daten tragen in der **Datenbank** Quelle und Abfragedatum (`quelle`, `abgefragt_am`), nicht nur im Backend-Log | M |

### 4.7 Statistiken

| ID | Anforderung | Prio |
|---|---|---|
| FA-600 | **Ernährungsstatistik** pro Profil und Zeitraum (Tag/Woche/Monat/freier Zeitraum): zugeführte Gesamtmenge je Nährstoff, detailliert, gruppiert nach Nährwertkategorien | M |
| FA-601 | **Durchschnitt pro Tag** im Vergleich zu den **DGE-Empfehlungen**, abhängig von Alter/Gewicht des Profils (Referenzwerte in einer Tabelle, nicht hart kodiert) | M |
| FA-602 | Visualisierung: Balken-/Ring-Diagramme, Ampellogik (unter/innerhalb/über DGE), Tooltip mit Zahlenwerten | M |
| FA-603 | **Aktivitätsstatistik im Profil:** wie viel Zeit in welcher **Kategorie** mit welchen Aktivitäten verbracht wurde; geschätzter **Kalorienverbrauch** aus Vorlagen-kcal/h × Dauer (orientierend) | M |
| FA-604 | Vergleich zweier Zeiträume | K |
| FA-610 | **Zähllogik für die Zufuhr (Rev. 4):** Intake = Σ über alle Kalender-Einträge vom Typ „Essen/Rezept“ bzw. „Essen/Zutat“ × Portionsanzahl im Zeitraum. Teilportionen (z. B. 0,5) sind erlaubt. Reste-Abrechnung („nur die Hälfte gegessen“ mit Portionsangabe beim Eintrag) als Ausbaustufe | M |
| FA-611 | **Grundumsatz/Energiebilanz:** Grundumsatz (Mifflin-St-Jeor aus Gewicht/Größe/Alter/Geschlecht) × PAL-Faktor als Gesamtumsatz, Bilanz gegen die Zufuhr aus FA-610 – Ausbaustufe V2 | K |
| FA-612 | **Kategorie-Filter (Rev. 5):** dieselbe Filter-Chip-Logik wie FA-214 gilt auch in den Statistiken (Zeitraum × Kategorie); gefilterte Anteile werden ausgegraut/transparent gezeigt statt entfernt | S |
| FA-613 | **Mangel-Prognose (V1, Rev. 5):** die App erkennt, welche Nährstoffe in den **nächsten x Tagen** noch fehlen (x konfigurierbar, Standard 7). Berechnung: DGE-Bedarf (FA-601) × x − erwartete Zufuhr laut geplanten Essen-Einträgen inkl. einer Aggregation der Wiederholungs-Instanzen (FA-610, FA-213). Anzeige je Nährstoff als Liste/Ring mit Ampel; Tage mit „unvollständig erfassten“ Daten werden entsprechend gekennzeichnet, nicht als 0 gezählt (FA-341) | M |
| FA-614 | **Schließungs-Vorschläge (V1, Rev. 5):** zu jeder Prognose-Lücke werden Lebensmittel- und Rezept-Vorschläge vorgeschlagen, die die Lücke schlössen (z. B. Nüsse, Snacks, Getränke), mit Menge, die die Lücke abdeckt. Vorschlags-Reihenfolge: 1. lokal vorrätige Zutaten (Bestand), 2. lokal gespeicherte Zutaten/Rezepte, 3. externe Suche über das In-App-Backend (FA-502). Ein Vorschlag lässt sich per Tap als Essen-Eintrag in den Kalender übernehmen | M |

### 4.8 Robustheit, Eingabelogik

| ID | Anforderung | Prio |
|---|---|---|
| FA-800 | Fehlende Berechnungsgrundlagen (Nährwerte, Umrechnungen, Profildaten für DGE) lösen **niemals einen Absturz** aus. Stattdessen: Dialog „Es fehlen Daten: X, Y – bitte ergänzen / überspringen / abbrechen“ | M |
| FA-801 | Für **jede** persistente Entität existiert eine Anzeige- und Eingabemaske (CRUD), konsistent aufgebaut | M |
| FA-802 | Alle Statistik-, Kalender- und Rezeptrechnungen laufen über zentrale **Calculation-Services** mit Unit-Tests (Einheiten-Umrechnungen sind die häufigste Fehlerquelle) | M |

### 4.8a Datenbankstruktur, Seed-Daten und Testfälle (Rev. 3)

| ID | Anforderung | Prio |
|---|---|---|
| FA-850 | **Eigene Entwurfsphase für die Datenbankstruktur vor der App-Umsetzung:** ER-Modell und Tabellenschema werden zuerst vollständig entworfen und dokumentiert (Abschnitt 5 ist die Ausgangsskizze); Ziel-Datenbank ist **SQLite**. Anpassungen am Schema während der Umsetzung sind ausdrücklich erlaubt und werden versioniert (Migrationen statt Handumbau) | M |
| FA-851 | **Jedes Profil erhält eine eigene Datenbank** (eine SQLite-Datei pro Profil). Profilwechsel = Datenbankwechsel; Löschen eines Profils löscht seine Datenbankdatei vollständig. Die nutzende DB-Library muss mehrere gleichzeitig verwaltete Datenbankverbindungen unterstützen (aktives Profil + Zugriff auf Katalog-/Referenztabellen) | M |
| FA-852 | **Seed-Daten:** Datenbanken und Tabellen werden beim ersten Start bzw. bei der Profil-Anlage **vorab mit grundlegenden Daten gefüllt**: Einheiten-Umrechnungstabelle (FA-331), Standard-Kategorien (Sport, Arbeit, Studium, Kochen/Rezepte, Hygiene, Haushalt, …), Nährstoff-Katalog (alle Nährwerte mit Kategorie und Einheit, FA-323), DGE-Referenzwerte (FA-601) sowie optional einige Beispiel-Zutaten/Rezepte zum Einstieg | M |
| FA-853 | Fehlen Seed-Daten (z. B. Datei beschädigt oder nicht mitgeliefert), werden die betroffenen Tabellen **leer angelegt** und die App läuft trotzdem (Prinzip FA-800); ein Hinweis bietet an, Seed-Daten erneut einzuspielen | M |
| FA-854 | **Ausführliche Testfälle werden zusammen mit der App angelegt und gepflegt** (Test-Katalog im Projekt): Unit-Tests für Calculation-Services (Brennwert-Ableitung FA-329, Unit-Converter, RecurrenceResolver, PortionCalculator), DB-Integrationstests gegen jedes Schema-Migrationslevel, UI-Smoke-Tests der Kernflüsse. Jeder Testfall referenziert seine FA-ID, so bleibt das Lastenheft rückverfolgbar | M |
| FA-855 | Testfälle nutzen die Seed-Daten als wiederverwendbare Test-Fixtures; ein separater Datensatz synthetischer Test-Profile/-Rezepte stellt deterministische Statistik-Ergebnisse sicher | S |

### 4.9 Design und Bedienbarkeit

| ID | Anforderung | Prio |
|---|---|---|
| FA-900 | Modernes Design, **Orientierung an „Simple Time Tracker“** (F-Droid): klare Flächen, kräftige Kategoriefarben, große Touch-Targets, Dark-Mode | M |
| FA-901 | Konsistente Farb- und Icon-Sprache; Kategorien erhalten eigene Farbcodes, die im Kalender sichtbar sind | M |
| FA-902 | Bedienbarkeit: Swipe-/Tap-Gesten im Kalender, Undo beim Löschen | S |
| FA-903 | **Barrierefreiheit (Rev. 4):** TalkBack-Beschriftungen, Kontrast-Anforderungen, Touch-Ziele min. 48 dp | S |

## 5. Datenmodell (Skizze)

> Geltungsbereich: Dieses Schema ist Ausgangspunkt der Entwurfsphase (FA-850) und gilt **pro Profildatenbank** (FA-851); Seed-/Katalogdaten werden beim Anlegen jeder Profildatenbank eingespielt (FA-852).

```
profile(id, name, geburtsdatum, geschlecht, gewicht_kg, groesse_cm, aktivitaetslevel)

category(id, name, farbe, icon)
activity(id, profil_id, titel, beschreibung, kategorie_id, prioritaet,   -- beschaeftigt|abwesend|verfuegbar
         start, ende, vorlage_id, rezept_id, portionen)
activity_template(id, titel, beschreibung, kategorie_id, dauer_default,
                  kcal_pro_stunde)
recurrence(id, aktivitaet_id, typ, intervall, wochentage[], tag_im_monat,
           tag_im_jahr, startdatum, enddatum NULL)                       -- mehrere pro Aktivität; Ausnahmen/Instanz-Editing erst V2 (FA-212)

ingredient(id, name, basis_einheit,             -- 'g' | 'ml'
           stueckgewicht_g NULL, dichte_g_pro_ml NULL)
nutrient(id, name, kategorie,                    -- vitamin|mineral|spurenelement|lipid|amino|alkohol|…
         einheit)                                 -- 'mg' | 'µg' | 'ml' (nur Wasser); je Nährstoff fest (FA-322)
ingredient_nutrient(ingredient_id, nutrient_id, wert_normiert_pro_100,    -- normiert je Nährstoff-Einheit (FA-322), Referenz 100 g/ml
                    quelle NULL, abgefragt_am NULL)                        -- Herkunft (FA-506)
-- kcal wird nicht gespeichert, sondern per Brennwert-Ableitung errechnet (FA-329):
-- kcal = Eiweiß×4 + Kohlenhydrate×4 + Fett×9   (pro g; fett: 9 kcal/g, weitere Atwater-Faktoren siehe FA-329)

recipe(id, titel, typ, teilschritte, kalorien_soll_pro_portion)
recipe_ingredient(recipe_id, ingredient_id, menge, einheit)               -- g|kg|ml|l|TL|EL|Tasse|Stueck
unit_conversion(id, einheit, faktor_ml, default_g_faktor_ml)
ingredient_unit_override(ingredient_id, einheit, gramm)                    -- nutzerspezifisch, überschreibt Default

purchase(id, profil_id, datum)
purchase_item(id, purchase_id, ingredient_id, menge, einheit, zustand,     -- z. B. 'TK' | 'trocken' | 'frisch'
              mhd NULL, uebrig_gelassen NULL)                              -- MHD (FA-404); Reste-Anteil K (FA-610)

reference_dge(nutrient_id, altersgruppe, geschlecht, empfohlen_tag)        -- Referenzwerte, nicht hart kodiert

settings(schluessel, wert)   -- u. a. Prognose-Horizont in Tagen (FA-613), Standard-Kategorien-Filter (FA-214)
```

Hinweise zum Modell:

- Nährwerte liegen **zeilenweise in Milligramm** in einer Zuordnungstabelle (`ingredient_nutrient`), nicht als breite Spaltenstraße → neue Nährstoffe sind migrationsfrei ergänzbar.
- Energie (kcal) ist ein Sonderfall: chemische Energie lässt sich nicht in Milligramm messen. Festlegung (O-2, FA-329): kcal wird **abgeleitet, nicht gespeichert**. Einheiten sind nährstoffspezifisch (FA-322: mg/µg/ml, intern auf µg normiert).

## 6. Meilensteine

| Meilenstein | Inhalt |
|---|---|
| **M1 – Fundament** | Projektsetup, **Datenbankentwurf (ER-Modell, Schemadefinition, Migrationen)**, Seed-Daten-Anlage, Profil-CRUD inkl. **Profil-Datenbanken (FA-851)**, MVVM-Gerüst, Design-System, **Test-Katalog-Anlage (FA-854)** |
| **M2 – Kalender & Aktivitäten** | Wochenansicht, Aktivitäten, Wiederholungen, Prioritäten, Kategorien, Vorlagen, Kalender-Sync, Kategorie-Filter (FA-214) |
| **M3 – Zutaten & Rezepte** | Zutaten-CRUD mit Nährwertprofil, Rezept-CRUD, Portions- und Einheiten-Umrechnung, lokale Suche, **Parser-Proxy (Node/TS) mit Provider-Adaptern** (Open Food Facts zuerst, darauf folgend die Website-Provider) |
| **M4 – Integration Kochen** | Aktivität „Kochen“ mit Rezeptvorschlag, Teilschritte, Portionen, Nährwertdetails, **Rezeptbuch-Grundansicht (FA-360/361/363)** |
| **M5 – Bestand & Einkäufe** | Einkaufserfassung, Bestandsliste inkl. **FIFO-Abbuchung (FA-401, Rev. 4)**, MHD-Warnliste (FA-404), Warn-/Nachfrage-Logik (FA-800) |
| **M6 – Statistiken** | Ernährungs- und Aktivitätsstatistik, DGE-Vergleich, Profil-Wechsel und -Vergleich, **Mangel-Prognose mit Schließungs-Vorschlägen (FA-613/614)**, Rezeptbuch-Vorschlagsansicht tagesweise (FA-362), Kategorie-Filter (FA-612) |
| **M7 – Export/Import & Feinschliff** | JSON-Export/Import, Design-Feinschliff, Stabilitätstest |
| **M8 – Ausbaustufe** | iOS über dieselbe Codebasis (O-1, Rev. 2), Serien-Editing und Ausnahmen (FA-212), Grundumsatz-Bilanz (FA-611), Reste-Abrechnung (FA-610), Verbrauchs-Rezeptvorschläge (FA-405), weitere Such-Provider |

## 7. MVVM-Schichten (React Native / TypeScript)

```
┌─────────────── View (React-Komponenten) ───────────────────────────┐
│  KalenderScreen · RezeptbuchScreen (Tagesplan) · RezeptScreen ·     │
│  StatistikScreen · CRUD-Masken ·                                    │
│  MainScreen (Hauptmenü)                                             │
├─────────────── ViewModel (Zustand-/MobX-Store + Selektoren) ───────┤
│  KalenderViewModel · RezeptViewModel · BestandViewModel ·           │
│  StatistikViewModel · ProviderSearchViewModel                       │
├─────────────── UseCase / Domain-Services (rein TypeScript, testbar) ─┤
│  RecurrenceResolver · PortionCalculator · UnitConverter ·           │
│  EnergyCalculator (Brennwert-Ableitung, FA-329) ·                   │
│  NutritionAggregator · DgeComparator · OverlapDetector              │
├─────────────── Repository (Interfaces + Implementierungen) ──────┤
│  KalenderRepository (SQLite + expo-calendar) · RezeptRepository ·   │
│  IngredientRepository · PurchaseRepository · ExportRepository       │
├─────────────── Datenquellen ──────────────────────────────────────┤
│  SQLite (lokal, Single Source of Truth, expo-sqlite/drizzle) ·      │
│  Systemkalender (expo-calendar, Sync via expo-task-manager) ·       │
│  Parser-Proxy via fetch/axios (REST/JSON)                           │
└───────────────────────────────────────────────────────────────────┘
```

ViewModels halten nur Darstellungszustand (Stores/Selektoren) und delegieren Berechnung an UseCases → Unit-Tests ohne UI möglich. Dependency Injection per Kontext-Factory oder Tsyringe.

Nachtrag zur Datenhaltung: Die lokalen SQLite-Datenbanken (eine pro Profil, FA-851) sind die architektonische Vorgabe aus Abschnitt 4.8a; das Schema aus Abschnitt 5 wird in der Entwurfsphase (FA-850) verbindlich ausgearbeitet und darf während der Umsetzung paketweise angepasst werden.

## 8. Nicht-funktionale Anforderungen

- **Datenschutz:** Gesundheits- und Essverhaltensdaten (Nährwerte, Gewicht, Alter) sind sensibel; Verarbeitung rein lokal im Heimnetz, keine Cloud-Pflicht, keine Werbe-/Tracking-SDKs. **Rev. 4:** Suchbegriffe und Abfragen gehen an die gewählten Provider (Open Food Facts etc.) – das wird in den Einstellungen transparent dokumentiert (welcher Provider erhält welche Daten, Attributions-Pflicht von Open Food Facts); keine Telemetrie, keine Konten. DSGVO-Prüfung, falls später Sync/Backup über Drittanbieter angeboten wird.
- **Robustheit:** keine unbehandelten Fehler bei fehlenden Daten (FA-800); Import/Parsing scheitert niemals mit Absturz, sondern führt zu Hinweis und Nachfrage.
- **Performance:** Wochenansicht bleibt auch mit mehreren hundert Einträgen flüssig (lazy render, FlatList/FlashList).
- **Testbarkeit:** Umrechnung, Energie-Ableitung (FA-329), Wiederholungslogik, Statistik = Unit-Tests; UI-Smoke-Tests.
- **Sprache:** UI deutsch; Internationalisierung (Englisch) vorbereitet.
- **Lizenz/Vertrieb (Entscheidung O-5):** Vertrieb **ausschließlich über F-Droid**; daher nur FOSS-Libraries (keine proprietären SDKs, keine Google-Play-Services-Abhängigkeiten im Kern), Lizenz **LGPL-3.0** (bewusst gewählt; Hinweis Rev. 4: LGPL ist primär eine Bibliotheks-Lizenz, für eine Gesamt-App zulässig, üblicher wäre GPL-3.0). Der Parser-Proxy ist optional und läuft im Heimnetz des Nutzers (self-hosted).

## 9. Getroffene Entscheidungen

| ID | Frage | Entscheidung |
|---|---|---|
| **O-1** | Tech-Stack | **React Native + Expo, TypeScript** (Rev. 2; zunächst Kotlin nativ gewählt, auf Wunsch des Auftraggebers geändert). Frontend und Node-Backend vollständig in TypeScript; iOS später über dieselbe Codebasis |
| **O-2** | Energie-Berechnung | kcal wird **nicht gespeichert**, sondern aus den Milligramm-Makros über Brennwert-Faktoren abgeleitet: **Eiweiß × 4, Kohlenhydrate × 4, Fett × 9** kcal/g (FA-329); Ballaststoffe optional × 2 kcal/g, Alkohol × 7 kcal/g. Kcal-Angaben von externen Quellen dienen nur dem Rückvergleich und werden angezeigt, nicht übernommen |
| **O-3** | Datenquellen | **Offizielle APIs zuerst:** Open Food Facts als Standard-Provider, USDA FoodData Central optional; danach Website-Provider naehrwertrechner.de, fddb, rewe.de/rezepte über das Provider-Interface (FA-502) |
| **O-4** | Backend | **Node-Parser-Proxy (TypeScript, Fastify) ab V1**, im Heimnetz des Nutzers self-hosted und optional deaktivierbar (FA-500) |
| **O-5** | Lizenz/Vertrieb | Vertrieb **nur über F-Droid**; Lizenz **LGPL-3.0** (Rev. 2); nur FOSS-Libraries, keine proprietären SDKs |

## 10. Abnahmekriterien (Rev. 4)

1. Alle **M**-Anforderungen sind laut Test-Katalog (FA-854) bestanden; kein unvollständiger Pflichtkern-Loop offen (FA-340).
2. Wochenansicht rendert 500 Einträge/Woche ohne spürbares Ruckeln; KW-Navigation/Swipe reagiert sofort (FA-202/204).
3. Ein neues Rezept inkl. vollständiger Pflichtkern-Nährwerte ist in einer geführten Sitzung in ≤ 3 Minuten anlegbar (FA-304/305).
4. Profilwechsel wechselt die Datenbank (FA-851); Daten des inaktiven Profils sind nicht sichtbar.
5. FIFO-Abbuchung: Kochen einer Rezeptportion reduziert den Bestand korrekt; Deckungslücken werden angezeigt (FA-401).
6. Bei deaktiviertem In-App-Backend bleibt die App voll nutzbar ohne externe Suche (FA-500).
7. Export → Import auf leerer Installation rekonstruiert alle Profildaten inkl. Kalender-Einträgen (FA-104).
8. Zielplattform: **Android 10+ (API 29, Entscheidung Rev. 4)**; UI-Smoke-Tests auf Referenzgerät; Zielband 400–600 kcal erscheint nur als Anzeige (FA-302).
9. Mangel-Prognose: für den konfigurierbaren Horizont (Standard 7 Tage) wird je Nährstoff „Bedarf − geplante Zufuhr“ angezeigt; ein Schließungs-Vorschlag lässt sich per Tap als Essen-Eintrag in den Kalender übernehmen (FA-613/614).
10. Kategorie-Filter: gefilterte Wochenansicht lädt schnell und zeigt nicht gefilterte Termine ausgegraut (FA-214).
11. Rezeptbuch: die Tagesansicht listet geplante Rezepte/Lebensmittel mit Nährwerten und Tages-Summen; Vorschläge sind pro Tag sichtbar und per Tap in den Kalender übernehmbar (FA-360–363).

## 11. Risikoregister (Rev. 4)

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Provider blockiert oder stellt ab (Website-Scraping) | Externe Suche fällt aus | APIs zuerst (O-3), Antwort-Caching, manuelle Erfassung bleibt |
| Parser-Bruch nach Website-Rework | Falsche/leere Vorschläge | Parser im In-App-Backend versioniert (FA-500), Validierung vor Masken-Füllung (FA-501) |
| Android-Batterieoptimierung stoppt Hintergrund-Sync | Kalender-Sync hinkt | Zusätzlich Sync on-start/on-change statt nur Background-Job; Nutzer-Hinweis |
| Eingebettetes Node-Runtime inkompatibel (nodejs-mobile + Expo, Geräteunterschiede) | Backend startet nicht | Fallback lokale Suche + manuelle Erfassung (FA-500); Kompatibilität früh in M3 testen |
| Multi-DB-Komplexität (drizzle, mehrere Verbindungen, FA-851) | Fehlverhalten bei Profilwechsel | DB-Integrationstests pro Migrationslevel (FA-854) |
| F-Droid-Repro-Builds mit React Native | Vertrieb verzögert | Dependencies festnageln, keine Binär-Blobs, Build-Pipeline früh einrichten |
| DGE-Referenzwerte-Lizenz | Tabelle evtl. nicht frei verteilbar | Referenzwerte als Seed-Daten (FA-852) mit Quellenangabe, nutzeranpassbar |
| Prognose basiert auf geplanten, nicht konsumierten Einträgen | Mangel-Prognose kann Wirklichkeit verfehlen | Ausweis als Planungs-/Prognose-Wert; Kennzeichnung unvollständig erfasster Tage (FA-341); Abgleich mit tatsächlicher Zufuhr (FA-610) in der Rückblick-Statistik |
