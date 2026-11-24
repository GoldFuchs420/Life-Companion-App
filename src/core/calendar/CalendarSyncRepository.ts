/**
 * CalendarSyncRepository – Abgleich App-DB mit dem Systemkalender "LifeCompanion"
 * (FA-200/201/213, TC-KAL-01..05).
 *
 * Grundsaetze:
 * - Serienlogik strikt in der App-DB; der Systemkalender erhaelt nur expandierte
 *   Einzel-Events (FA-201/213). Pro Instanz gib es eine Zeile in calendar_sync,
 *   geschluesselt als Aktivitaet + Ordinal innerhalb der sortierten Instanzen.
 * - Last write wins pro Instanz (FA-201/TC-KAL-02): das Geraete-Event traegt
 *   `aktualisiertAm`, unser Abgleich traegt `zuletzt_geschrieben`; wer spaeter
 *   schrieb, gewinnt. Externe Aenderungen an Events von Einzel-Aktivitaeten werden
 *   in die App-DB uebernommen (Event wird zur Konvergenz noch einmal retour
 *   angetaktet); an Serien-Instanzen erzeugen sie einen Konflikt-Hinweis (kein
 *   stilles Verwerfen, FA-800), da einzelne Instanzen den Serienregeln folgen.
 * - Fehlt ein verknuepftes Event im Sync-Fenster, wird es aus der App-DB
 *   rekonstruiert; sind Mappings veraltet (Aktivitaet geloescht oder Instanz
 *   verschoben), wird das zugehoerige Geraete-Event entfernt. Der Systemkalender
 *   ist damit Projektion der App-DB im Sync-Fenster.
 * - Events ohne App-Mapping werden als Aktivitaet der Kategorie "Sonstiges"
 *   importiert (bidirektional, FA-201).
 * - Fehlende Grundlagen (Berechtigung fehlt, Kategorie "Sonstiges" fehlt) erzeugen
 *   Hinweise statt Fehler (FA-800, TC-KAL-01).
 */
import type { DbDriver } from '../db/driver';
import { makeId } from '../dao/ids';
import { ActivityRepository, type KalenderInstanz } from '../activity/ActivityRepository';
import { CalendarZugriffFehler, type SystemCalendarPort } from './SystemCalendarPort';

export const KALENDER_NAME = 'LifeCompanion';

export interface SyncKonflikt {
  externalId: string;
  aktivitaet_id: string;
  instanz_start: string;
  hinweis: string;
}

export interface SyncErgebnis {
  von: string;
  bis: string;
  calendarId: string | null;
  kalenderAngelegt: boolean;
  erstellt: number;
  aktualisiert: number;
  /** Externe Aenderungen an Einzel-Aktivitaeten in die App-DB uebernommen (LWW). */
  uebernommen: number;
  /** Verknuepfte Events, die am Geraet fehlen, aus der App-DB rekonstruiert. */
  rekonstruiert: number;
  /** Veraltete Mappings samt Geraete-Event entfernt (Aktivitaet geloescht/Instanz verschoben). */
  entfernt: number;
  /** Events ohne App-Mapping als Aktivitaet importiert (bidirektional, FA-201). */
  importiert: number;
  konflikte: SyncKonflikt[];
  hinweise: string[];
}

interface SyncZeile {
  aktivitaet_id: string;
  ordinal: number;
  external_id: string;
  instanz_start: string;
  titel: string;
  ende: string;
  zuletzt_geschrieben: string;
}

const SYNC_SELECT =
  'SELECT aktivitaet_id, ordinal, external_id, instanz_start, titel, ende, zuletzt_geschrieben ' +
  'FROM calendar_sync';

/** Lokale Wanduhr 'YYYY-MM-DDTHH:MM' – kein UTC-Offset im String (FA-213). */
export function wanduhrJetzt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export class CalendarSyncRepository {
  private readonly aktiv: ActivityRepository;

  constructor(
    private readonly db: DbDriver,
    private readonly kalender: SystemCalendarPort,
  ) {
    this.aktiv = new ActivityRepository(db);
  }

  async sync(von: string, bis: string, jetzt: Date = new Date()): Promise<SyncErgebnis> {
    const ergebnis: SyncErgebnis = {
      von,
      bis,
      calendarId: null,
      kalenderAngelegt: false,
      erstellt: 0,
      aktualisiert: 0,
      uebernommen: 0,
      rekonstruiert: 0,
      entfernt: 0,
      importiert: 0,
      konflikte: [],
      hinweise: [],
    };

    let calendarId: string;
    try {
      ergebnis.kalenderAngelegt = this.kalenderIdGespeichert() === null;
      calendarId = await this.kalender.ensureCalendar(KALENDER_NAME);
    } catch (e) {
      if (e instanceof CalendarZugriffFehler) {
        ergebnis.hinweise.push(
          `Kalender-Zugriff Fuer "${KALENDER_NAME}" nicht moeglich (${e.ursache}) – ` +
          'bitte Berechtigung erteilen, dann erneut synchronisieren (FA-800).',
        );
        return ergebnis;
      }
      throw e;
    }
    ergebnis.calendarId = calendarId;
    this.kalenderIdSpeichern(calendarId);

    const schreibZeit = wanduhrJetzt(jetzt);
    const instanzen = this.aktiv.wochenansicht(von, bis).instanzen;
    const nachAktivitaet = new Map<string, { instanz: KalenderInstanz; ordinal: number }[]>();
    for (const instanz of instanzen) {
      const gruppe = nachAktivitaet.get(instanz.aktivitaet_id) ?? [];
      gruppe.push({ instanz, ordinal: gruppe.length });
      nachAktivitaet.set(instanz.aktivitaet_id, gruppe);
    }

    const external = await this.kalender.listEvents(calendarId, von, bis);
    const externalNachId = new Map(external.map((e) => [e.externalId, e]));
    const verknuepft = new Set<string>();

    for (const gruppe of nachAktivitaet.values()) {
      const istSerie = this.istSerie(gruppe[0]!.instanz.aktivitaet_id);
      for (const { instanz, ordinal } of gruppe) {
        const zeile = this.mappingZu(instanz.aktivitaet_id, ordinal);
        if (!zeile) {
          const externalId = await this.kalender.upsertEvent(
            calendarId, instanz.titel, instanz.start, instanz.ende,
          );
          this.mappingAnlegen(instanz, ordinal, externalId, schreibZeit);
          ergebnis.erstellt++;
          continue;
        }
        const event = externalNachId.get(zeile.external_id);
        if (!event) {
          const externalId = await this.kalender.upsertEvent(
            calendarId, instanz.titel, instanz.start, instanz.ende,
          );
          this.db.run('DELETE FROM calendar_sync WHERE external_id = ?', [zeile.external_id]);
          this.mappingAnlegen(instanz, ordinal, externalId, schreibZeit);
          ergebnis.rekonstruiert++;
          continue;
        }
        verknuepft.add(event.externalId);
        if (event.aktualisiertAm != null && event.aktualisiertAm > zeile.zuletzt_geschrieben) {
          if (istSerie) {
            ergebnis.konflikte.push({
              externalId: event.externalId,
              aktivitaet_id: instanz.aktivitaet_id,
              instanz_start: instanz.start,
              hinweis:
                'Aenderung im Systemkalender an einer Serien-Instanz: die Serienlogik bleibt ' +
                'in der App-DB (FA-213), bitte die Serie in der App aendern.',
            });
          } else {
            this.db.run(
              'UPDATE activity SET titel = ?, start = ?, ende = ? WHERE id = ?',
              [event.titel, event.start, event.ende, instanz.aktivitaet_id],
            );
            await this.kalender.upsertEvent(
              calendarId, event.titel, event.start, event.ende, event.externalId,
            );
            this.mappingAuffrischen(
              { ...instanz, titel: event.titel, start: event.start, ende: event.ende },
              ordinal, event.externalId, schreibZeit,
            );
            ergebnis.uebernommen++;
          }
          continue;
        }
        if (event.titel !== instanz.titel || event.start !== instanz.start || event.ende !== instanz.ende) {
          await this.kalender.upsertEvent(
            calendarId, instanz.titel, instanz.start, instanz.ende, event.externalId,
          );
          this.mappingAuffrischen(instanz, ordinal, event.externalId, schreibZeit);
          ergebnis.aktualisiert++;
        }
      }
    }

    for (const event of external) {
      if (verknuepft.has(event.externalId)) continue;
      if (this.mappingZuExternal(event.externalId) != null) continue;
      const sonstiges = this.db
        .all<{ id: number }>("SELECT id FROM category WHERE name = 'Sonstiges'")
        .at(0);
      if (!sonstiges) {
        ergebnis.hinweise.push(
          'Kategorie "Sonstiges" fehlt - Systemkalender-Event "' + event.titel +
          '" konnte nicht importiert werden (FA-800).',
        );
        continue;
      }
      const id = makeId();
      this.db.run(
        "INSERT INTO activity (id, titel, typ, kategorie_id, prioritaet, start, ende) " +
        "VALUES (?, ?, 'normal', ?, 'verfuegbar', ?, ?)",
        [id, event.titel, sonstiges.id, event.start, event.ende],
      );
      this.mappingAnlegen(
        { aktivitaet_id: id, titel: event.titel, start: event.start, ende: event.ende } as KalenderInstanz,
        0, event.externalId, schreibZeit,
      );
      ergebnis.importiert++;
    }

    await this.raeumeAuf(calendarId, instanzen, von, bis, ergebnis);
    return ergebnis;
  }

  private async raeumeAuf(
    calendarId: string,
    instanzen: KalenderInstanz[],
    von: string,
    bis: string,
    ergebnis: SyncErgebnis,
  ): Promise<void> {
    const aktuelle = new Set(instanzen.map((i) => `${i.aktivitaet_id}::${i.start}`));
    for (const zeile of this.db.all<SyncZeile>(
      `${SYNC_SELECT} WHERE instanz_start BETWEEN ? AND ?`,
      [von, bis],
    )) {
      const aktivitaetExistiert = this.db
        .all<{ id: string }>('SELECT id FROM activity WHERE id = ?', [zeile.aktivitaet_id]).length > 0;
      const zuAktivitaet = aktuelle.size > 0
        && instanzen.some((i) => i.aktivitaet_id === zeile.aktivitaet_id);
      const nochAktuell = aktuelle.has(`${zeile.aktivitaet_id}::${zeile.instanz_start}`);
      if (aktivitaetExistiert && (nochAktuell || !zuAktivitaet)) continue;
      await this.kalender.deleteEvent(calendarId, zeile.external_id);
      this.db.run('DELETE FROM calendar_sync WHERE external_id = ?', [zeile.external_id]);
      ergebnis.entfernt++;
    }
    for (const zeile of this.db.all<SyncZeile>(
      `${SYNC_SELECT} WHERE aktivitaet_id NOT IN (SELECT id FROM activity)`,
    )) {
      await this.kalender.deleteEvent(calendarId, zeile.external_id);
      this.db.run('DELETE FROM calendar_sync WHERE external_id = ?', [zeile.external_id]);
      ergebnis.entfernt++;
    }
  }

  private kalenderIdGespeichert(): string | null {
    return this.db
      .all<{ wert: string }>("SELECT wert FROM settings WHERE schluessel = 'calendar_id'")
      .at(0)?.wert ?? null;
  }

  private kalenderIdSpeichern(calendarId: string): void {
    this.db.run(
      "INSERT INTO settings (schluessel, wert) VALUES ('calendar_id', ?) " +
      'ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert',
      [calendarId],
    );
  }

  private mappingZu(aktivitaetId: string, ordinal: number): SyncZeile | null {
    return (
      this.db
        .all<SyncZeile>(`${SYNC_SELECT} WHERE aktivitaet_id = ? AND ordinal = ?`, [aktivitaetId, ordinal])
        .at(0) ?? null
    );
  }

  private mappingZuExternal(externalId: string): SyncZeile | null {
    return (
      this.db
        .all<SyncZeile>(`${SYNC_SELECT} WHERE external_id = ?`, [externalId])
        .at(0) ?? null
    );
  }

  private mappingAnlegen(
    instanz: Pick<KalenderInstanz, 'aktivitaet_id' | 'titel' | 'start' | 'ende'>,
    ordinal: number,
    externalId: string,
    schreibZeit: string,
  ): void {
    this.db.run(
      'INSERT INTO calendar_sync ' +
      '(aktivitaet_id, ordinal, external_id, instanz_start, titel, ende, zuletzt_geschrieben) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
      [instanz.aktivitaet_id, ordinal, externalId, instanz.start, instanz.titel, instanz.ende, schreibZeit],
    );
  }

  private mappingAuffrischen(
    instanz: Pick<KalenderInstanz, 'aktivitaet_id' | 'titel' | 'start' | 'ende'>,
    ordinal: number,
    externalId: string,
    schreibZeit: string,
  ): void {
    this.db.run(
      'UPDATE calendar_sync SET external_id = ?, instanz_start = ?, titel = ?, ende = ?, ' +
      'zuletzt_geschrieben = ? WHERE aktivitaet_id = ? AND ordinal = ?',
      [externalId, instanz.start, instanz.titel, instanz.ende, schreibZeit, instanz.aktivitaet_id, ordinal],
    );
  }

  private istSerie(aktivitaetId: string): boolean {
    const zeilen = this.db
      .all<{ anzahl: number }>('SELECT COUNT(*) AS anzahl FROM recurrence WHERE aktivitaet_id = ?', [aktivitaetId]);
    return (zeilen.at(0)?.anzahl ?? 0) > 0;
  }
}
