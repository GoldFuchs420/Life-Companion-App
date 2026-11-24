# Lastenheft: LifeCompanion

**Version:** 0.9 · **Status:** überarbeitet und restrukturiert – Abläufe zuerst erzählt (Abschnitt 4), Anforderungen danach; Änderungshistorie in Anhang B · **Plattform-Ziel:** Android 10+ (API 29), iOS folgt über dieselbe Codebasis

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
| Suchprovider | Austauschbarer Online-Quellenservice (z. B. Open Food Facts, naehrwertrechner.de, fddb, rewe.de/rezepte) |
| In-App-Backend | Eingebettetes Node.js-Backend (TypeScript, Fastify) innerhalb der App, lauscht nur auf 127.0.0.1; führt die Parser-/Provider-Suche aus (FA-500) |
| Priorität | Attribut einer Aktivität: *beschäftigt*, *abwesend*, *verfügbar* |
| DGE | Deutsche Gesellschaft für Ernährung; Quelle der Referenzwerte |
| Mangel-Prognose | Bedarf (DGE) minus erwartete Zufuhr im Prognose-Fenster aus den geplanten Essen-Einträgen; Fenster einstellbar, Standard 2 Wochen (FA-613) |
| Rezeptbuch | Ansicht im Hauptmenü: geplante Rezepte/Lebensmittel tagesweise gelistet mit Nährwerten und Vorschlägen (FA-360 ff.) |

## 3. Systemlandschaft und Stack

### 3.1 Festgelegter Stack (Entscheidung O-1, O-4)

Das Frontend ist **React Native mit Expo in TypeScript**; Android kommt zuerst, iOS kann später über dieselbe Codebasis folgen. Das **Node-Backend** (ebenfalls TypeScript) dient ab Version 1 als Parser-/Provider-Schicht und ist **in die App eingebettet**:

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
| In-App-Backend (Parser-/Provider-Schicht) | **Node.js (TypeScript, Fastify), in die App eingebettet** (z. B. nodejs-mobile), lauscht ausschließlich auf 127.0.0.1 | Parser und Provider-Adapter zentral gewartet, ohne App-Release nachzuschieben; kein LAN-Exposure, kein separater Serverbetrieb nötig |

**Folgentscheidung iOS:** Dank React Native kann iOS später **über dieselbe Codebasis** erfolgen; nur kalender- und plattformspezifische Native-Module werden pro Plattform gepflegt. Datenmodell- und Provider-Verträge gelten für beide Plattformen.

### 3.1.1 Systemkomponenten

```
┌──────────────────────────────────────────────┐     ┌────────────────────────┐
│  LifeCompanion App (Gerät)                   │     │  Provider (Internet)   │
│  ┌────────────────────────────────────────┐  │     │  Open Food Facts,      │
│  │ UI · React Native (Expo, TypeScript)   │  │     │  USDA,                 │
│  │ MVVM (Stores → UseCases → Repos)       │  │     │  naehrwertrechner,     │
│  └───────────────────┬────────────────────┘  │     │  fddb, rewe.de         │
│                      │ localhost (127.0.0.1) │     └───────────▲────────────┘
│  ┌───────────────────▼────────────────────┐  │                 │
│  │ In-App-Backend · Node.js (Fastify)     │──┼─────────────────┘
│  │ Provider-Adapter + Website-Parser      │  │
│  └────────────────────────────────────────┘  │
│  SQLite (lokal) + Systemkalender             │
└──────────────────────────────────────────────┘
```

Das In-App-Backend startet mit der App (intern in der App als Backend, nur 127.0.0.1 – kein LAN-Exposure, daher keine Authentifizierung nötig) und ist in den Einstellungen deaktivierbar; ohne Backend stehen lokale Suche und manuelle Erfassung bereit.

### 3.2 Architekturprinzipien

- **Offline-first:** Alle Kernfunktionen funktionieren ohne Netz; online wird nur für Suchprovider/Parser benötigt.
- **Single Source of Truth:** Die lokale SQLite-Datenbank. Der Systemkalender dient als Anzeige-/Synchronisationsziel, nicht als Datenquelle der App-Logik.
- **Validierung statt Annahme:** Rechenfunktionen (Statistik, Portionsrechner) nutzen keine erdachten Werte, sondern fordern fehlende Eingaben an (FA-800).
- **Backend eingebettet und austauschbar:** Das Node-Backend läuft als eigener Prozess im App-Kontext auf 127.0.0.1; fällt es aus, funktioniert die App weiter, nur die externe Suche bleibt aus.
- **Serie in der App, Instanz im Systemkalender:** Serienlogik strikt intern, der Systemkalender erhält expandierte Einzel-Events (FA-201/213).
- **Rohmengen statt Kochzustand:** Nährwerte gelten für Rohware, Mengen werden in Rohmengen erfasst (FA-335).
- **Ein Profil = eine Datenbank** (FA-851): strikte Isolation der Profildaten auf Datei-Ebene.
- **Datenbankentwurf vor Umsetzung** (FA-850): erst das Schema, dann die App; das Schema bleibt während der Umsetzung anpassbar.

## 4. Anwendungsabläufe

Dieser Abschnitt erzählt die wichtigsten Nutzerflüsse in fester Reihenfolge; die formalen Anforderungen dahinter stehen in Abschnitt 5.

### 4.1 Erstnutzung: Profil anlegen, Datenbasis steht sofort bereit

1. Erststart: die App legt Konfiguration und Katalogstrukturen an und **befüllt sie mit Seed-Daten** – Umrechnungstabelle, Standard-Kategorien (Sport, Arbeit, Studium, Kochen/Rezepte, Hygiene, Haushalt …), Nährstoff-Katalog, DGE-Referenzwerte, optionale Beispiel-Rezepte (FA-852).
2. Fehlen Seed-Daten, werden die Tabellen **leer angelegt** und die App bleibt voll nutzbar; ein Hinweis bietet an, die Seed-Daten erneut einzuspielen (FA-853, FA-800).
3. Der Nutzer legt ein **Profil** an (Name, Geburtsdatum/Alter, Gewicht, optional Größe, Geschlecht, Aktivitätslevel) – Basis der DGE-Vergleiche (FA-101). **Jedes Profil erhält seine eigene SQLite-Datenbank** (FA-851).
4. Ein Profil ist das **aktive Profil**; der Wechsel ist jederzeit möglich (FA-102).

### 4.2 Rezept anlegen: lokal → Provider → Maske → Commit → Schleife

1. Der Nutzer startet das Rezept-Anlegen im Rezeptmenü; Grunddaten (Titel, Typ, Schritte) werden eingetragen (FA-301, FA-302).
2. Beim Hinzufügen einer Zutatenzeile wird **erst lokal** in der Datenbank gesucht. Ohne Treffer wählt der Nutzer einen **Suchprovider** und ruft die Daten ab; das Ergebnis **vorbefüllt automatisch die Eingabemaske** (FA-501). **Speichern (Commit) erfolgt erst durch die ausdrückliche Bestätigung des Nutzers** (FA-304).
3. Die Nährwerte werden im **Stufenmodell** abgefragt: *Pflichtkern* (Eiweiß, Fett, Kohlenhydrate, Zucker, Ballaststoffe, Wasser) muss gefüllt sein; *Empfohlen* (Vitamine, Mineralstoffe) wird angefragt, Lücken bleiben sichtbar; *Optional* (Lipide, Aminosäuren, Alkohol) ist freiwillig (FA-340, FA-327).
4. Ein **abbrechbarer Loop** prüft jede Rezeptzeile auf vollständige Zutaten und führt Schritt für Schritt durch fehlende Ergänzungen; jederzeit pausier-/abbrechbar, der Zwischenstand bleibt erhalten (FA-305).
5. kcal werden beim Speichern nie übernommen, sondern **aus den Makros abgeleitet** (FA-329); externe kcal-Angaben dienen nur dem Rückvergleich.

### 4.3 Essen im Kalender planen

1. Neue Aktivität über Tap auf eine Tages-/Zeitzelle (Startzeit vorbelegt) oder aus der Vorlagenliste (FA-205, FA-209).
2. Für Essen wird entweder ein **gespeichertes Rezept** gewählt (Portionsanzahl abfragen, FA-303), ein einzelnes **Lebensmittel** erfasst (FA-328) oder eine normale Aktivität angelegt (FA-206).
3. Wiederholungen: mehrere Regeln pro Aktivität (alle *x* h/T/W/M/J, *x.* des Monats/Jahres, Wochentag(e)), jede mit eigenem Start und optionalem Ende (FA-207a–d); der RecurrenceResolver expandiert daraus Einzeltermine.
4. Kategorie und Priorität (*beschäftigt* / *abwesend* / *verfügbar*) werden gesetzt; Priorität ist reine Warnungs-/Anzeigelogik (FA-211).
5. **Serienlogik bleibt in der App-DB**; nur die expandierten Einzel-Events werden in den Systemkalender „LifeCompanion“ geschrieben (FA-200, FA-213, FA-201). Der Wochenkalender zeigt Überlappungen nebeneinander mit Warnung (FA-202, FA-203), navigierbar über KW/Datumsspanne (FA-204) und filterbar nach Kategorie (FA-214).

### 4.4 Rezeptbuch: Tagesplan mit Blick bis zu einem Jahr

1. Im Hauptmenü öffnet das **Rezeptbuch**: der Essens-Plan, tagesweise gelistet (FA-360).
2. Der Betrachtungszeitraum wird **im Rezeptbuch selbst** gewählt – Standard die kommende Woche, sonst Starttag + Länge bis **ein ganzes Jahr** (Voreinstellungen 1/2/4 Wochen); lange Ranges werden virtualisiert (FA-360).
3. Je Tag: geplante Rezepte/Lebensmittel inkl. expandierter Serien-Instanzen, Portionsanzahl, Nährwerte; Tages-Summen mit DGE-Ampel (FA-361).
4. Die **Vorschläge** der Mangel-Prognose und der Verbrauchsvorschläge (V2) erscheinen sichtbar auf dem jeweiligen Tag und werden per Tap als Essen-Eintrag übernommen (FA-362, FA-614, FA-405).
5. Das Rezeptbuch hält **keine eigenen Daten**; Verschieben/Löschen wirkt auf den Kalender-Eintrag (FA-363).

### 4.5 Mangel-Prognose: Lücken erkennen, Vorschlag übernehmen

1. Die App berechnet je Nährstoff „**DGE-Bedarf × Fenstertage − erwartete Zufuhr der geplanten Essen-Einträge**“ im **Prognose-Fenster** – einstellbar, Standard **14 Tage**, zulässig 1–365 (FA-613, FA-610).
2. Je Lücke erzeugt die App **Schließungs-Vorschläge** (Lebensmittel/Rezepte) mit Mengen, die die Lücke über die Fensterlänge abdecken; Reihenfolge: vorrätig → lokal gespeichert → externe Suche (FA-614, FA-502).
3. Ein Vorschlag wird per Tap an einem konkreten Tag in den Kalender übernommen und erscheint sofort auch im Rezeptbuch (FA-362).

### 4.6 Einkauf erfassen, Bestand verwalten

1. Einkauf mit Datum + Zutatenliste in Mengen erfassen (über die Eingabemaske, FA-501): „13.10.2026: 500 g Karotten, 1 kg Zucker, 500 g Brokkoli (TK)“ (FA-400).
2. Die Posten landen in der **Bestandsliste**; je Posten Nährwerte sichtbar; fehlt ein Nährwertprofil → lokale Suche, Suchprovider oder manuelle Anlage (FA-402, FA-800).
3. **FIFO-Abbuchung ab V1:** Kochen/Essen-Einträge buchen mengen-genau vom ältesten Posten ab; Deckungslücken werden angezeigt (FA-401).
4. Optionales **MHD** pro Posten mit Warnliste „läuft bald ab / ist abgelaufen“ (FA-404); in V2 schlägt der Modus „Verwende was da ist“ Rezepte zum MHD-kritischen Bestand vor (FA-405).

### 4.7 Kochen: Aktivität mit Rezept und Teilschritten

1. Eine Aktivität „Kochen“ zeigt passende gespeicherte Rezepte als Vorschlag; die Auswahl übernimmt **Dauer** und ggf. **Teilschritte** (z. B. „Teig herrichten“ → „Pizza machen“) als Teil-Aktivitäten im selben Zeitraum-Block (FA-300).
2. Bei der Planung sind Portionsanzahl und Nährwertdetails (kcal + Pflichtkern-Makros, Details per Tap) einsehbar (FA-303, FA-324, FA-325).
3. Der Essen-Eintrag speist Zufuhr-Statistik und Bestandsabbuchung (FA-610, FA-401).

### 4.8 Auswertung: Statistik, Filter, Vergleich

1. **Ernährungsstatistik** je Profil und Zeitraum: Zufuhr je Nährstoff, gruppiert nach Kategorien; Ø pro Tag im **DGE-Vergleich nach Alter/Gewicht** als Balken-/Ring-Diagramme mit Ampel (FA-600, FA-601, FA-602).
2. Zufuhr zählt konventionsfest: alle „Essen“-Kalendereinträge × Portionsanzahl, Teilportionen erlaubt (FA-610).
3. **Aktivitätsstatistik:** Zeit pro Kategorie, geschätzter Verbrauch aus Vorlagen-kcal/h × Dauer (FA-603).
4. **Kategorie-Filter** wie im Kalender: gefilterte Anteile in Statistiken ausgegraut statt entfernt (FA-612, FA-214); Zeiträume-Vergleich (FA-604) und zwei-Profile-Vergleich (FA-103) ergänzen.

### 4.9 Export, Import, Profil-Wechsel

1. Über Einstellungen: **alle Daten als JSON-Bundle exportieren**, auf anderem Gerät importieren (FA-104).
2. Profil-Wechsel = Datenbank-Wechsel (FA-102, FA-851); Löschen nur mit Warnung (FA-105).
3. Beim Löschen von Referenzen (z. B. Rezept, das in geplanten Tagen verwendet wird) bleiben Anzeigen konsistent (FA-363).

### 4.10 Kalender-Synchronisation

1. Der Systemkalender **„LifeCompanion“** wird von der App gelesen und geschrieben (FA-200).
2. Sync ist bidirektional für die eigene Kalender-ID; die App pflegt die Serienlogik in ihrer DB und gleicht die **expandierten Einzel-Events** mit dem Systemkalender per „Last write wins“ pro Instanz ab (FA-201, FA-213).
3. Sync läuft on-start/on-change und über Hintergrundjobs (Stack 3.1); fehlgeschlagene oder fehlende Grundlagen erzeugen Hinweise statt Fehler (FA-800).

## 5. Funktionale Anforderungen

Zählweise Prioritäten: **M** = Muss (V1), **S** = Soll (V1 sofern Aufwand vertretbar), **K** = Kann (Ausbau).

### 5.1 Hauptmenü und Navigation

| ID | Anforderung | Prio |
|---|---|---|
| FA-001 | Hauptmenü mit Einträgen: Kalender, **Rezeptbuch (Tagesplan),** Aktivitäten/Vorlagen, Kategorien, Rezepte, Zutaten/Lebensmittel, Bestand/Einkäufe, Profile, Statistiken, Einstellungen, Export/Import | M |
| FA-002 | Menüeinträge mit Icon + beschrifteter Fläche; Design siehe FA-900 | M |

### 5.2 Profile

| ID | Anforderung | Prio |
|---|---|---|
| FA-100 | Mehrere **Profile** anlegen, umbenennen, löschen. Jedes Profil isoliert seine Kalender-, Rezept-, Bestands- und Statistikdaten | M |
| FA-101 | Profildaten: Name, **Geburtsdatum/Alter**, **Gewicht**, optional Größe, Geschlecht, Aktivitätslevel → Basis der DGE-Referenzwerte | M |
| FA-102 | Ein Profil als **aktives Profil** auswählen und zwischen Profilen wechseln; Daten des aktiven Profils einsehen | M |
| FA-103 | **Vergleichsmodus:** zwei Profile direkt nebeneinander vergleichen (Statistiken, Zeit pro Kategorie, Ø kcal/Tag) | S |
| FA-104 | Alle Daten (Profil, Kalender, Aktivitäten, Rezepte, Zutaten, Bestand, Einstellungen) als **Export-Datei** sichern und auf anderem Gerät importieren | M |
| FA-105 | Beim Löschen eines Profils: Bestätigungsdialog mit Warnung über Datenverlust | M |

### 5.3 Kalender und Aktivitäten

| ID | Anforderung | Prio |
|---|---|---|
| FA-200 | **Lokaler Kalender „LifeCompanion“** entsprechend dem App-Namen wird als eigener Systemkalender integriert; App liest und schreibt ihn | M |
| FA-201 | Kalender-Sync mit dem Systemkalender (bidirektional für die eigene Kalender-ID). Serienlogik bleibt ausschließlich in der App-DB (FA-207); der Systemkalender erhält die expandierten Instanzen als Einzel-Events. Konfliktfälle (gleichzeitige Änderung) per „Last write wins“ **pro Instanz**, dokumentiert | M |
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
| FA-211 | **Prioritäts-Semantik:** reine Warnungs-/Anzeige-Logik – *beschäftigt* löst die Überlappungs-Warnung aus (FA-203) und wird farblich hervorgehoben; *verfügbar* und *abwesend* beeinflussen nur Farbe/Anzeige, keine weitere Berechnungs- oder Auswertungslogik (Auswertung nach Priorität ggf. als Ausbaustufe) | M |
| FA-212 | Serien-Editing: V1 bearbeitet eine Serie nur als Ganzes; „nur diesen Termin / alle / ab hier“ sowie Ausnahmen-Listen (Urlaub/Krankheit, `EXDATE`-Analogie) sind Ausbaustufe V2 | K |
| FA-213 | **Serien-Expansion:** der RecurrenceResolver erzeugt die Instanzen einer Aktivität aus allen Wiederholungsregeln (FA-207) inkl. optionalem Serien-Ende; im Systemkalender existieren nur die expandierten Einzel-Events | M |
| FA-214 | **Kategorie-Filter:** die Wochenansicht lässt sich nach einer oder mehreren Kategorien filtern (Filter-Chips); nicht gefilterte Termine werden **ausgegraut** statt ausgeblendet, damit Layout und Zeilenausrichtung erhalten bleiben – leichtere Übersicht über z. B. nur Kochen oder nur Sport | M |

### 5.4 Rezepte, Zutaten, Nährwerte

#### 5.4.1 Rezepte

| ID | Anforderung | Prio |
|---|---|---|
| FA-300 | In der Aktivität „Kochen“ (Kalender) werden gespeicherte Rezepte als Vorschlag angezeigt; Auswahl übernimmt Rezept-**Dauer** und ggf. **Teilschritte** (z. B. „Teig herrichten“ → „Pizza machen“) als sequenzielle Teil-Aktivitäten im selben Zeitraum-Block | M |
| FA-301 | **Rezeptmenü** (eigener Menüpunkt): Rezepte anlegen, bearbeiten, löschen, suchen, kategorisieren (z. B. Hauptgericht / Getränk / Snack) | M |
| FA-302 | Rezept enthält: Titel, Typ, Zubereitungsschritte, ggf. Unterteilung in Teilschritte, Zutatenliste; gilt **für eine Portion**. 400–600 kcal ist nur **Anzeige/Referenzwert** (die errechneten kcal pro Portion werden angezeigt), kein Muss und keine Sperre | M |
| FA-303 | Beim Hinzufügen zum Kalender wählt der Nutzer die **Anzahl Portionen**; alle Nährwerte skalieren mit | M |
| FA-304 | Beim Rezeptanlegen ist der **erste Suchschritt lokal** in der Datenbank; danach kann online gesucht werden (Suchprovider wählbar) und die Ergebnisse füllen automatisch die Eingabemaske. **Speichern/Commit erfolgt erst durch explizite Nutzerbestätigung.** | M |
| FA-305 | **Abbrechbarer Loop** beim Rezept-Erstellen: prüft, ob für jede Rezeptzeile eine Zutat mit vollständigem Nährwertprofil existiert; falls nicht, führt der Loop Schritt für Schritt durch Suchen/Anlegen und kann jederzeit pausiert/abgebrochen werden (Zwischenstand bleibt erhalten) | M |
| FA-306 | V1-Rezeptsuche alternativ **manuell** oder über **rewe.de/rezepte** (Suchprovider über das In-App-Backend); fachlicher Pin: Rezept-Datenhaltung ist provider-agnostisch | M |
| FA-307 | Auch **Getränke** lassen sich als Rezepte pflegen (Typ „Getränk“) | M |

#### 5.4.2 Zutaten / Lebensmittel

| ID | Anforderung | Prio |
|---|---|---|
| FA-320 | Zutaten werden **immer in Gramm (g) oder Milliliter (ml)** geführt; die Basiseinheit wird beim Anlegen festgelegt und bleibt konstant (z. B. Karotte → g) | M |
| FA-321 | Nährwertangaben beziehen sich auf **100 g bzw. 100 ml** (Referenz wie bei fddb / naehrwertrechner.de) | M |
| FA-322 | Nährwerte werden milligrammgenau gespeichert. Jeder Nährstoff führt seine **übliche Einheit** (mg; µg für B12, Vitamin D, Folsäure; ml für Wasser); intern werden alle Werte auf µg normiert gespeichert, das UI zeigt die übliche Einheit und rechnet Eingaben um. Energie (kcal) wird **nicht gespeichert**, sondern aus den Makro-Nährwerten abgeleitet (FA-329) | M |
| FA-323 | Nährwertkategorien: Basis-Nährwerte (Eiweiß, Fett, Kohlenhydrate, Zucker, Ballaststoffe, **Wasser**) sowie **Vitamine, Mineralstoffe, Spurenelemente, Lipide (einfach/mehrfach ungesättigt), Aminosäuren, Alkohol (für Getränke, FA-307; 7 kcal/g), weitere** | M |
| FA-324 | **Grundlegende Nährwerte** direkt sichtbar am Rezept: kcal, Eiweiß, Fett (gesättigt, einfach ungesättigt, mehrfach ungesättigt), Kohlenhydrate, davon Zucker, Wasser, Ballaststoffe | M |
| FA-325 | **Detailansicht** pro Rezept/Zutat: alle verfügbaren Nährwerte, gruppiert nach Nährwertkategorien | S |
| FA-326 | Zutaten können über **naehrwertrechner.de** abgerufen werden; der Nutzer **sichtet** die Werte (fddb als weitere Quelle optional) und übernimmt sie danach in die lokale Datenbank | M |
| FA-327 | Fehlende Nährwerte lösen einen aktiven **Eingabe-Hinweis** aus, keinen Fehler. Die Pflicht gilt über das **Stufenmodell (FA-340)**; „0 / nicht angegeben“ ist als bewusster Wert wählbar und unterscheidet sich im UI sichtbar von „fehlt“ | M |
| FA-328 | Auch ein **einzelnes Lebensmittel** (ohne Rezept) kann über den Kalender als Aktivität „Essen“ erfasst werden | M |
| FA-329 | **Energieberechnung (Brennwert-Ableitung, Entscheidung O-2):** kcal = Eiweiß × 4 + Kohlenhydrate × 4 + Fett × 9 (Atwater-Faktoren, bezogen auf g); Ballaststoffe werden mit × 2 kcal/g einberechnet ; Alkohol × 7 kcal/g (FA-323). Von externen Quellen gelieferte kcal-Angaben werden **nicht** in die Datenbank übernommen, sondern nur zum Rückvergleich neben die berechneten kcal gestellt; Abweichungen werden angezeigt (Quellen können abweichen, da sie andere Brennwertansätze nutzen) | M |
| FA-340 | **Nährwert-Stufenmodell:** *Pflichtkern* = Eiweiß, Fett, Kohlenhydrate, Zucker, Ballaststoffe, Wasser – muss gefüllt sein, sonst schließt der abbrechbare Loop (FA-305) nicht ab. *Empfohlen* = 13 Vitamine, 13 Mineralstoffe/Spurenelemente – Füllung wird angefragt, Lücken sichtbar markiert, Speichern bleibt möglich. *Optional* = Lipide, Aminosäuren, Alkohol – freiwillig | M |
| FA-341 | Lücken aus *Empfohlen/Optional* werden in der Detailansicht und Statistik (FA-600/601) als „offene Punkte“ markiert und in Zufuhr-Summen als „unvollständig erfasst“ ausgewiesen, nicht als 0 gezählt | M |

#### 5.4.3 Einheiten und Umrechnung

| ID | Anforderung | Prio |
|---|---|---|
| FA-330 | Mengenangaben in Rezepten können wahlweise in **Stück, Tassen (150 / 250 / 330 ml), TL, EL, Prise, g, kg, ml, l** erfolgen | M |
| FA-331 | **Umrechnungstabelle in der Datenbank** (`unit_conversion`), z. B. 1 TL Öl = 5 ml; pro Zutat können nutzerspezifische Dichte-/Stückgewichte hinterlegt werden (z. B. „1 Karotte ≈ 80 g“) | M |
| FA-332 | Externe Angaben wie „1,5 TL Zucker“ oder „2 Tassen Mehl“ werden über die Tabelle automatisch in g/ml umgerechnet | M |
| FA-333 | Mengenangaben in Rezepten werden intern auf g/ml normiert und daraus hochgerechnet (Rezept → 1 Portion → N Portionen) | M |
| FA-334 | Fehlt eine Umrechnungsregel → nicht-abrupte Eingabeaufforderung statt Berechnung mit erdachten Werten (FA-800) | M |
| FA-335 | **Rohmengen-Annahme:** Nährwerte gelten für Rohware; alle Mengen werden in Rohmengen erfasst (z. B. Reis roh, nicht gekocht). Gewichtsverlust/-gewinn durchs Kochen (Wasserverlust) wird in V1 nicht modelliert; die Portionsrechnung bleibt auf Rohmengen | M |

#### 5.4.4 Rezeptbuch (Tagesplan)

Neben dem Kalender existiert das **Rezeptbuch** als eigene Ansicht im Hauptmenü: der Essens-Plan, tagesweise gelistet.

| ID | Anforderung | Prio |
|---|---|---|
| FA-360 | **Rezeptbuch-Ansicht:** im Hauptmenü als eigener Punkt; listet Tage chronologisch. Der Zeitraum wird **im Rezeptbuch selbst** gewählt – Standard die kommende Woche, sonst **beliebige Range bis ein ganzes Jahr** (Starttag + Länge; Voreinstellungen 1/2/4 Wochen). Bei langen Ranges werden Tage virtualisiert (nur sichtbare Bereiche rendern), Tageszusammenfassungen werden vor- oder inkrementell aggregiert. Pro Tag: alle geplanten Essen-/Rezept-Einträge und Einzel-Lebensmittel aus dem Kalender – zusammengeführt inkl. der expandierten Wiederholungs-Instanzen (FA-213) – mit Titel, Portionsanzahl und den berechneten Nährwerten (kcal + Pflichtkern-Makros; volle Details per Tap, FA-325) | M |
| FA-361 | **Tages-Summen:** je Tag die Summe der geplanten Zufuhr direkt vergleichbar mit dem DGE-Bedarf des Profils (Ampel-Logik wie FA-602); Lücken-Tage werden sichtbar markiert (FA-341) | M |
| FA-362 | **Vorschlags-Sichtbarkeit:** die Schließungs-Vorschläge der Mangel-Prognose (FA-614) und die Verbrauchs-Vorschläge (FA-405, V2) erscheinen **im Rezeptbuch tagesweise** auf dem jeweiligen Tag und sind dort per Tap als Essen-Eintrag für genau diesen Tag übernehmbar | M |
| FA-363 | **Keine separate Datenhaltung:** das Rezeptbuch ist eine Anzeige-/Bearbeitungs-Abkürzung; Single Source of Truth bleiben Kalender-/Rezept-Datenbank. Verschieben/Löschen im Rezeptbuch wirkt auf den Kalender-Eintrag; Löschen eines Rezepts markiert betroffene Tage sichtbar | M |

### 5.5 Bestand / Einkäufe

| ID | Anforderung | Prio |
|---|---|---|
| FA-400 | **Einkäufe erfassen:** Datum + Liste von Zutaten mit Mengen (z. B. „13.10.2026: 500 g Karotten, 1 kg Zucker, 500 g Brokkoli (TK)“) | M |
| FA-401 | Eingaben werden in die **Bestandsliste** übertragen; Bestand steigt. **FIFO-Abbuchung ab V1** – Kochen/Essen-Einträge buchen mengen-genau vom Bestand ab (ältester Posten zuerst); reicht der Bestand nicht, wird die Deckungslücke angezeigt, ohne den Bestand unsichtbar negativ zu machen | M |
| FA-402 | Pro Bestandsposten Nährwerte anzeigen. Fehlt das Nährwertprofil lokal → Suche (Suchprovider) oder manuelle Anlage der Zutat | M |
| FA-403 | Kennzeichnung „tiefgekühlt / trocken / …“ als Zusatzattribut (reine Information, keine Logik in V1) | S |
| FA-404 | **MHD/Verfallsdatum:** optionales Feld pro Bestandsposten; Warnliste „läuft bald ab / ist abgelaufen“; ohne MHD-Datum bleibt der Posten einfach ohne Warnung | S |
| FA-405 | **Verbrauchs-Rezeptvorschläge (V2):** aus der MHD-Warnliste und der Bestandsliste lässt sich ein Modus „Verwende was da ist“ starten; die App schlägt Rezepte vor, die den (MHD-kritischen) Bestand möglichst vollständig verwenden, und zeigt an, welche Zutaten zum Bestand passen und welche fehlen | K |

### 5.6 Suchprovider, Parser, In-App-Backend

| ID | Anforderung | Prio |
|---|---|---|
| FA-500 | **In-App-Backend (Node/TypeScript; Entscheidung O-4):** eingebettetes Node.js-Backend innerhalb der App (z. B. nodejs-mobile), lauscht ausschließlich auf **127.0.0.1** – kein LAN-/Netz-Exposure, daher keine Authentifizierung nötig. Ruft die Provider ab, parst strukturiert und liefert JSON an die UI; dadurch Wartung der Parser ohne App-Release. In den Einstellungen deaktivierbar | M |
| FA-501 | Pro Entitätsart existiert **eine Eingabemaske** (Zutat, Rezept, Aktivitätsvorlage, Kategorie, Profil, Einkauf, …); Parser/Proxy **vorbefüllt** diese Maske – der Nutzer prüft, korrigiert und committet | M |
| FA-502 | **Suchprovider-Auswahl und -Reihenfolge** (Entscheidung O-3 – APIs zuerst): 1. **Open Food Facts** (offizielle API), 2. USDA FoodData Central (optional ergänzend), 3. Website-Provider **naehrwertrechner.de**, 4. **fddb**, 5. **rewe.de/rezepte** (Rezepte). Auswählbar im UI (Dropdown/Badges); Standard bei Nährwertabfragen: Open Food Facts | M |
| FA-503 | Parser-Fehler → keine App-Fehler, sondern klarer Hinweis + angebotene manuelle Erfassung | M |
| FA-504 | Provider-Interface mit klarer Vertragsdefinition (JSON-Schema pro Entität), damit weitere Quellen ohne App- und Proxy-Rework nachrüstbar sind | M |
| FA-505 | Provider-Adapter im Backend sind einzeln konfigurierbar (aktiv/inaktiv, Reihenfolge), jede Antwort wird mit Provider- und Abfragedatum protokolliert, damit die Herkunft der übernommenen Daten nachvollziehbar bleibt | S |
| FA-506 | UI und Backend stimmen sich beim Start per Versions-Handshake ab (interne API-Version; Inkompatibilität → Hinweis). Übernommene Daten tragen in der **Datenbank** Quelle und Abfragedatum (`quelle`, `abgefragt_am`), nicht nur im Backend-Log | M |

### 5.7 Statistiken

| ID | Anforderung | Prio |
|---|---|---|
| FA-600 | **Ernährungsstatistik** pro Profil und Zeitraum (Tag/Woche/Monat/freier Zeitraum): zugeführte Gesamtmenge je Nährstoff, detailliert, gruppiert nach Nährwertkategorien | M |
| FA-601 | **Durchschnitt pro Tag** im Vergleich zu den **DGE-Empfehlungen**, abhängig von Alter/Gewicht des Profils (Referenzwerte in einer Tabelle, nicht hart kodiert) | M |
| FA-602 | Visualisierung: Balken-/Ring-Diagramme, Ampellogik (unter/innerhalb/über DGE), Tooltip mit Zahlenwerten | M |
| FA-603 | **Aktivitätsstatistik im Profil:** wie viel Zeit in welcher **Kategorie** mit welchen Aktivitäten verbracht wurde; geschätzter **Kalorienverbrauch** aus Vorlagen-kcal/h × Dauer (orientierend) | M |
| FA-604 | Vergleich zweier Zeiträume | K |
| FA-610 | **Zähllogik für die Zufuhr:** Intake = Σ über alle Kalender-Einträge vom Typ „Essen/Rezept“ bzw. „Essen/Zutat“ × Portionsanzahl im Zeitraum. Teilportionen (z. B. 0,5) sind erlaubt. Reste-Abrechnung („nur die Hälfte gegessen“ mit Portionsangabe beim Eintrag) als Ausbaustufe | M |
| FA-611 | **Grundumsatz/Energiebilanz:** Grundumsatz (Mifflin-St-Jeor aus Gewicht/Größe/Alter/Geschlecht) × PAL-Faktor als Gesamtumsatz, Bilanz gegen die Zufuhr aus FA-610 – Ausbaustufe V2 | K |
| FA-612 | **Kategorie-Filter:** dieselbe Filter-Chip-Logik wie FA-214 gilt auch in den Statistiken (Zeitraum × Kategorie); gefilterte Anteile werden ausgegraut/transparent gezeigt statt entfernt | S |
| FA-613 | **Mangel-Prognose (V1; Fenster einstellbar):** die App erkennt, welche Nährstoffe im **Prognose-Fenster** noch fehlen. Das Fenster ist **einstellbar**: Standard **14 Tage (2 Wochen)** – Tagesauflösung ist für die Vorschlagsqualität zu unruhig, 2 Wochen glätten Tages- und Wochenzyklen sinnvoll; zulässig sind 1–365 Tage (bis ein ganzes Jahr). Berechnung: DGE-Bedarf (FA-601) × Fenstertage − erwartete Zufuhr der geplanten Essen-Einträge im Fenster inkl. Aggregation der Wiederholungs-Instanzen (FA-610, FA-213). Anzeige je Nährstoff als Liste/Ring mit Ampel; „unvollständig erfasste“ Tage werden gekennzeichnet, nicht als 0 gezählt (FA-341) | M |
| FA-614 | **Schließungs-Vorschläge (V1):** zu jeder Prognose-Lücke werden Lebensmittel- und Rezept-Vorschläge vorgeschlagen, die die Lücke **im gewählten Prognose-Fenster** schlössen (z. B. Nüsse, Snacks, Getränke), mit Menge, die die Lücke über die Fensterlänge hinweg abdeckt. Vorschlags-Reihenfolge: 1. lokal vorrätige Zutaten (Bestand), 2. lokal gespeicherte Zutaten/Rezepte, 3. externe Suche über das In-App-Backend (FA-502). Ein Vorschlag lässt sich per Tap als Essen-Eintrag in den Kalender übernehmen | M |

### 5.8 Robustheit, Eingabelogik

| ID | Anforderung | Prio |
|---|---|---|
| FA-800 | Fehlende Berechnungsgrundlagen (Nährwerte, Umrechnungen, Profildaten für DGE) lösen **niemals einen Absturz** aus. Stattdessen: Dialog „Es fehlen Daten: X, Y – bitte ergänzen / überspringen / abbrechen“ | M |
| FA-801 | Für **jede** persistente Entität existiert eine Anzeige- und Eingabemaske (CRUD), konsistent aufgebaut | M |
| FA-802 | Alle Statistik-, Kalender- und Rezeptrechnungen laufen über zentrale **Calculation-Services** mit Unit-Tests (Einheiten-Umrechnungen sind die häufigste Fehlerquelle) | M |

### 5.9 Datenbankstruktur, Seed-Daten und Testfälle

| ID | Anforderung | Prio |
|---|---|---|
| FA-850 | **Eigene Entwurfsphase für die Datenbankstruktur vor der App-Umsetzung:** ER-Modell und Tabellenschema werden zuerst vollständig entworfen und dokumentiert (Abschnitt 6 ist die Ausgangsskizze); Ziel-Datenbank ist **SQLite**. Anpassungen am Schema während der Umsetzung sind ausdrücklich erlaubt und werden versioniert (Migrationen statt Handumbau) | M |
| FA-851 | **Jedes Profil erhält eine eigene Datenbank** (eine SQLite-Datei pro Profil). Profilwechsel = Datenbankwechsel; Löschen eines Profils löscht seine Datenbankdatei vollständig. Die nutzende DB-Library muss mehrere gleichzeitig verwaltete Datenbankverbindungen unterstützen (aktives Profil + Zugriff auf Katalog-/Referenztabellen) | M |
| FA-852 | **Seed-Daten:** Datenbanken und Tabellen werden beim ersten Start bzw. bei der Profil-Anlage **vorab mit grundlegenden Daten gefüllt**: Einheiten-Umrechnungstabelle (FA-331), Standard-Kategorien (Sport, Arbeit, Studium, Kochen/Rezepte, Hygiene, Haushalt, …), Nährstoff-Katalog (alle Nährwerte mit Kategorie und Einheit, FA-323), DGE-Referenzwerte (FA-601) sowie optional einige Beispiel-Zutaten/Rezepte zum Einstieg | M |
| FA-853 | Fehlen Seed-Daten (z. B. Datei beschädigt oder nicht mitgeliefert), werden die betroffenen Tabellen **leer angelegt** und die App läuft trotzdem (Prinzip FA-800); ein Hinweis bietet an, Seed-Daten erneut einzuspielen | M |
| FA-854 | **Ausführliche Testfälle werden zusammen mit der App angelegt und gepflegt** (Test-Katalog im Projekt): Unit-Tests für Calculation-Services (Brennwert-Ableitung FA-329, Unit-Converter, RecurrenceResolver, PortionCalculator), DB-Integrationstests gegen jedes Schema-Migrationslevel, UI-Smoke-Tests der Kernflüsse. Jeder Testfall referenziert seine FA-ID, so bleibt das Lastenheft rückverfolgbar | M |
| FA-855 | Testfälle nutzen die Seed-Daten als wiederverwendbare Test-Fixtures; ein separater Datensatz synthetischer Test-Profile/-Rezepte stellt deterministische Statistik-Ergebnisse sicher | S |

### 5.10 Design und Bedienbarkeit

| ID | Anforderung | Prio |
|---|---|---|
| FA-900 | Modernes Design, **Orientierung an „Simple Time Tracker“** (F-Droid): klare Flächen, kräftige Kategoriefarben, große Touch-Targets, Dark-Mode | M |
| FA-901 | Konsistente Farb- und Icon-Sprache; Kategorien erhalten eigene Farbcodes, die im Kalender sichtbar sind | M |
| FA-902 | Bedienbarkeit: Swipe-/Tap-Gesten im Kalender, Undo beim Löschen | S |
| FA-903 | **Barrierefreiheit:** TalkBack-Beschriftungen, Kontrast-Anforderungen, Touch-Ziele min. 48 dp | S |

## 6. Datenmodell (Skizze)

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
-- kcal = Eiweiß×4 + Kohlenhydrate×4 + Fett×9 + Ballaststoffe×2 + Alkohol×7  (pro g)

recipe(id, titel, typ, teilschritte, kalorien_soll_pro_portion)  -- reiner Anzeige-/Referenzwert, kein Muss (FA-302)
recipe_ingredient(recipe_id, ingredient_id, menge, einheit)               -- g|kg|ml|l|TL|EL|Tasse|Stueck
unit_conversion(id, einheit, faktor_ml, default_g_faktor_ml)
ingredient_unit_override(ingredient_id, einheit, gramm)                    -- nutzerspezifisch, überschreibt Default

purchase(id, profil_id, datum)
purchase_item(id, purchase_id, ingredient_id, menge, einheit, zustand,     -- z. B. 'TK' | 'trocken' | 'frisch'
              mhd NULL, uebrig_gelassen NULL)                              -- MHD (FA-404); Reste-Anteil K (FA-610)

reference_dge(nutrient_id, altersgruppe, geschlecht, empfohlen_tag)        -- Referenzwerte, nicht hart kodiert

settings(schluessel, wert)   -- u. a. Prognose-Fenster in Tagen, Standard 14, 1–365 (FA-613), Standard-Kategorien-Filter (FA-214)
```

Hinweise zum Modell:

- Nährwerte liegen **zeilenweise pro Nährstoff** in einer Zuordnungstabelle (`ingredient_nutrient`), **intern µg-normiert** (FA-322), nicht als breite Spaltenstraße → neue Nährstoffe sind migrationsfrei ergänzbar.
- Energie (kcal) ist ein Sonderfall: chemische Energie lässt sich nicht in Milligramm messen. Festlegung (O-2, FA-329): kcal wird **abgeleitet, nicht gespeichert** – aus den Makro-Nährwerten inklusive Ballaststoffen (× 2) und Alkohol (× 7). Einheiten sind nährstoffspezifisch (FA-322: mg/µg/ml, intern auf µg normiert).

## 7. Architektur: MVVM-Schichten (React Native / TypeScript)

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
│  In-App-Backend (fetch/axios, REST/JSON)                           │
└───────────────────────────────────────────────────────────────────┘
```

ViewModels halten nur Darstellungszustand (Stores/Selektoren) und delegieren Berechnung an UseCases → Unit-Tests ohne UI möglich. Dependency Injection per Kontext-Factory oder Tsyringe.

Hinweis zur Datenhaltung: Die lokalen SQLite-Datenbanken (eine pro Profil, FA-851) sind die architektonische Vorgabe aus Abschnitt 5.9; das Schema aus Abschnitt 6 wird in der Entwurfsphase (FA-850) verbindlich ausgearbeitet und darf während der Umsetzung paketweise angepasst werden.

## 8. Nicht-funktionale Anforderungen

- **Datenschutz:** Gesundheits- und Essverhaltensdaten (Nährwerte, Gewicht, Alter) sind sensibel; Verarbeitung rein lokal auf dem Gerät, keine Cloud-Pflicht, keine Werbe-/Tracking-SDKs. Suchbegriffe und Abfragen gehen an die gewählten Provider (Open Food Facts etc.) – das wird in den Einstellungen transparent dokumentiert (welcher Provider erhält welche Daten, Attributions-Pflicht von Open Food Facts); keine Telemetrie, keine Konten. DSGVO-Prüfung, falls später Sync/Backup über Drittanbieter angeboten wird.
- **Robustheit:** keine unbehandelten Fehler bei fehlenden Daten (FA-800); Import/Parsing scheitert niemals mit Absturz, sondern führt zu Hinweis und Nachfrage.
- **Performance:** Wochenansicht bleibt auch mit mehreren hundert Einträgen flüssig (lazy render, FlatList/FlashList).
- **Testbarkeit:** Umrechnung, Energie-Ableitung (FA-329), Wiederholungslogik, Statistik = Unit-Tests; UI-Smoke-Tests.
- **Sprache:** UI deutsch; Internationalisierung (Englisch) vorbereitet.
- **Lizenz/Vertrieb (Entscheidung O-5):** Vertrieb **ausschließlich über F-Droid**; daher nur FOSS-Libraries (keine proprietären SDKs, keine Google-Play-Services-Abhängigkeiten im Kern), Lizenz **LGPL-3.0** (bewusst gewählt; Hinweis: LGPL ist primär eine Bibliotheks-Lizenz, für eine Gesamt-App zulässig, üblicher wäre GPL-3.0). Das In-App-Backend ist eingebettet und optional deaktivierbar; ohne es stehen lokale Suche und manuelle Erfassung bereit.

## 9. Phasenplanung (Meilensteine)

| Meilenstein | Inhalt |
|---|---|
| **M1 – Fundament** | Projektsetup, **Datenbankentwurf (ER-Modell, Schemadefinition, Migrationen)**, Seed-Daten-Anlage, Profil-CRUD inkl. **Profil-Datenbanken (FA-851)**, MVVM-Gerüst, Design-System, **Test-Katalog-Anlage (FA-854)** |
| **M2 – Kalender & Aktivitäten** | Wochenansicht, Aktivitäten, Wiederholungen, Prioritäten, Kategorien, Vorlagen, Kalender-Sync, Kategorie-Filter (FA-214) |
| **M3 – Zutaten & Rezepte** | Zutaten-CRUD mit Nährwertprofil, Rezept-CRUD, Portions- und Einheiten-Umrechnung, lokale Suche, **In-App-Backend (Node/TS) mit Provider-Adaptern** (Open Food Facts zuerst, darauf folgend die Website-Provider) |
| **M4 – Integration Kochen** | Aktivität „Kochen“ mit Rezeptvorschlag, Teilschritte, Portionen, Nährwertdetails, **Rezeptbuch-Grundansicht (FA-360/361/363)** |
| **M5 – Bestand & Einkäufe** | Einkaufserfassung, Bestandsliste inkl. **FIFO-Abbuchung (FA-401)**, MHD-Warnliste (FA-404), Warn-/Nachfrage-Logik (FA-800) |
| **M6 – Statistiken** | Ernährungs- und Aktivitätsstatistik, DGE-Vergleich, Profil-Wechsel und -Vergleich, **Mangel-Prognose mit Schließungs-Vorschlägen (FA-613/614)**, Rezeptbuch-Vorschlagsansicht tagesweise (FA-362), Kategorie-Filter (FA-612) |
| **M7 – Export/Import & Feinschliff** | JSON-Export/Import, Design-Feinschliff, Stabilitätstest |
| **M8 – Ausbaustufe** | iOS über dieselbe Codebasis (O-1), Serien-Editing und Ausnahmen (FA-212), Grundumsatz-Bilanz (FA-611), Reste-Abrechnung (FA-610), Verbrauchs-Rezeptvorschläge (FA-405), weitere Such-Provider |
## 10. Abnahmekriterien

1. Alle **M**-Anforderungen sind laut Test-Katalog (FA-854) bestanden; kein unvollständiger Pflichtkern-Loop offen (FA-340).
2. Wochenansicht rendert 500 Einträge/Woche ohne spürbares Ruckeln; KW-Navigation/Swipe reagiert sofort (FA-202/204).
3. Ein neues Rezept inkl. vollständiger Pflichtkern-Nährwerte ist in einer geführten Sitzung in ≤ 3 Minuten anlegbar (FA-304/305).
4. Profilwechsel wechselt die Datenbank (FA-851); Daten des inaktiven Profils sind nicht sichtbar.
5. FIFO-Abbuchung: Kochen einer Rezeptportion reduziert den Bestand korrekt; Deckungslücken werden angezeigt (FA-401).
6. Bei deaktiviertem In-App-Backend bleibt die App voll nutzbar ohne externe Suche (FA-500).
7. Export → Import auf leerer Installation rekonstruiert alle Profildaten inkl. Kalender-Einträgen (FA-104).
8. Zielplattform: **Android 10+ (API 29)**; UI-Smoke-Tests auf Referenzgerät; Zielband 400–600 kcal erscheint nur als Anzeige (FA-302).
9. Mangel-Prognose: für das einstellbare Fenster (Standard 14 Tage, 1–365) wird je Nährstoff „Bedarf − geplante Zufuhr“ angezeigt; ein Schließungs-Vorschlag (Menge bezogen auf das Fenster) lässt sich per Tap als Essen-Eintrag übernehmen (FA-613/614).
10. Kategorie-Filter: gefilterte Wochenansicht lädt schnell und zeigt nicht gefilterte Termine ausgegraut (FA-214).
11. Rezeptbuch: die Tagesansicht listet geplante Rezepte/Lebensmittel mit Nährwerten und Tages-Summen – auch über eine von-bis-Range bis ein ganzes Jahr ohne spürbares Ruckeln (Virtualisierung); Vorschläge sind pro Tag sichtbar und per Tap in den Kalender übernehmbar (FA-360–363).

## 11. Risikoregister

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Provider blockiert oder stellt ab (Website-Scraping) | Externe Suche fällt aus | APIs zuerst (O-3), Antwort-Caching, manuelle Erfassung bleibt |
| Parser-Bruch nach Website-Rework | Falsche/leere Vorschläge | Parser im In-App-Backend versioniert (FA-500), Validierung vor Masken-Füllung (FA-501) |
| Android-Batterieoptimierung stoppt Hintergrund-Sync | Kalender-Sync hinkt | Zusätzlich Sync on-start/on-change statt nur Background-Job; Nutzer-Hinweis |
| Eingebettetes Node-Runtime inkompatibel (nodejs-mobile + Expo, Geräteunterschiede) | Backend startet nicht | Fallback lokale Suche + manuelle Erfassung (FA-500); Kompatibilität früh in M3 testen |
| Multi-DB-Komplexität (drizzle, mehrere Verbindungen, FA-851) | Fehlverhalten bei Profilwechsel | DB-Integrationstests pro Migrationslevel (FA-854) |
| F-Droid-Repro-Builds mit React Native | Vertrieb verzögert | Dependencies festnageln, keine Binär-Blobs, Build-Pipeline früh einrichten |
| Große Ranges (bis 1 Jahr) in Rezeptbuch/Prognose | Performance-Einbruch, Akkuverbrauch | Virtualisierung + inkrementelle/vorberechnete Tages-Aggregation (FA-360); Umfang in Abnahmekriterium 11 geprüft |
| DGE-Referenzwerte-Lizenz | Tabelle evtl. nicht frei verteilbar | Referenzwerte als Seed-Daten (FA-852) mit Quellenangabe, nutzeranpassbar |
| Prognose basiert auf geplanten, nicht konsumierten Einträgen | Mangel-Prognose kann Wirklichkeit verfehlen | Ausweis als Planungs-/Prognose-Wert; Kennzeichnung unvollständig erfasster Tage (FA-341); Abgleich mit tatsächlicher Zufuhr (FA-610) in der Rückblick-Statistik |

## 12. Anhang

### Anhang A – Getroffene Entscheidungen

| ID | Frage | Entscheidung |
|---|---|---|
| **O-1** | Tech-Stack | **React Native + Expo, TypeScript** (zunächst Kotlin nativ gewählt, auf Wunsch des Auftraggebers geändert). Frontend und Node-Backend vollständig in TypeScript; iOS später über dieselbe Codebasis |
| **O-2** | Energie-Berechnung | kcal wird **nicht gespeichert**, sondern aus den Makro-Nährwerten über Brennwert-Faktoren abgeleitet: **Eiweiß × 4, Kohlenhydrate × 4, Fett × 9, Ballaststoffe × 2, Alkohol × 7** kcal/g (FA-329). Kcal-Angaben von externen Quellen dienen nur dem Rückvergleich und werden angezeigt, nicht übernommen |
| **O-3** | Datenquellen | **Offizielle APIs zuerst:** Open Food Facts als Standard-Provider, USDA FoodData Central optional; danach Website-Provider naehrwertrechner.de, fddb, rewe.de/rezepte über das Provider-Interface (FA-502) |
| **O-4** | Backend | **Eingebettetes Node-Backend (TypeScript, Fastify) ab V1**, läuft intern in der App als Backend und lauscht ausschließlich auf 127.0.0.1 – kein LAN, keine Authentifizierung nötig; optional deaktivierbar (FA-500) |
| **O-5** | Lizenz/Vertrieb | Vertrieb **nur über F-Droid**; Lizenz **LGPL-3.0**; nur FOSS-Libraries, keine proprietären SDKs |

### Anhang B – Änderungshistorie

| Rev. | Inhalt |
|---|---|
| 1 | Ursprüngliche Anforderungen vom Auftraggeber zusammengetragen; Lastenheft-Vorschlag erstellt; offene Punkte O-1 bis O-5 abgefragt |
| 2 | O-1 zu React Native + Expo + TypeScript geändert; Lizenz zu LGPL-3.0 geändert |
| 3 | DB-Requirements ergänzt: Entwurfsphase vor Umsetzung (FA-850), ein Profil = eine Datenbank (FA-851), Seed-Daten (FA-852/853), Test-Katalog (FA-854/855) |
| 4 | Review-Klärungen: eingebettetes Backend auf 127.0.0.1 (FA-500/506), Serienlogik intern + expandierte Instanzen im Systemkalender (FA-201/213), Nährwert-Stufenmodell (FA-340/341), Einheiten pro Nährstoff intern µg-normiert (FA-322), Rohmengen (FA-335), FIFO (FA-401), MHD (FA-404), Prioritäts-Semantik (FA-211), Intake-Zähllogik (FA-610), Barrierefreiheit (FA-903), Abnahmekriterien + Risikoregister ergänzt |
| 5 | Kategorie-Filter (FA-214/612), Mangel-Prognose mit Schließungs-Vorschlägen (FA-613/614), Verbrauchs-Rezeptvorschläge V2 (FA-405) |
| 6 | Rezeptbuch als Tagesplan-Ansicht im Hauptmenü (FA-360–363) |
| 7 | Prognose-Fenster einstellbar (Standard 14 Tage, 1–365), Rezeptbuch-Range im Rezeptbuch selbst wählbar bis 1 Jahr mit Virtualisierung (FA-360/613/614) |
| 8 (→ v0.9) | Restrukturierung: neuer Abschnitt 4 „Anwendungsabläufe“ (zehn Nutzerflüsse mit FA-Querverweisen), Meilensteine als Phasenplanung hinter die NFA verschoben, Datenbank-/Seed-/Test-Abschnitt als 5.9 in die Anforderungen integriert, inline Rev.-Markierungen in Anhang B ausgelagert, veraltete „Proxy im Heimnetz“-Formulierungen durch die Entscheidung „eingebettetes Backend auf 127.0.0.1“ ersetzt |
