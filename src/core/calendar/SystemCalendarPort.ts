/**
 * Port zur Systemkalender-Integration (FA-200): zur Laufzeit via expo-calendar,
 * in Tests mit einer Fake-Implementierung. Alle Zeiten sind Wanduhr-Strings
 * 'YYYY-MM-DDTHH:MM' (FA-213/TC-REC-09).
 */
export interface SystemEvent {
  externalId: string;
  titel: string;
  start: string;
  ende: string;
  /**
   * Wanduhr der letzten Aenderung am Geraete-Event (Grundlage fuer LWW pro Instanz,
   * FA-201/TC-KAL-02); darf fehlen, wenn das Geraet keinen Zeitstempel liefert.
   */
  aktualisiertAm?: string;
}

export class CalendarZugriffFehler extends Error {
  constructor(readonly ursache: 'keine_berechtigung' | 'kalender_nicht_verfuegbar') {
    super(ursache);
  }
}

export interface SystemCalendarPort {
  /**
   * FA-200/TC-KAL-01: legt den Kalender an bzw. liefert seine Kalender-ID;
   * ohne Kalender-Berechtigung CalendarZugriffFehler statt Absturz (FA-800).
   */
  ensureCalendar(name: string): Promise<string>;
  listEvents(calendarId: string, von: string, bis: string): Promise<SystemEvent[]>;
  /**
   * Legt ein Event an (ohne externalId) oder aktualisiert das mit externalId;
   * liefert die externalId des Geraete-Events.
   */
  upsertEvent(
    calendarId: string,
    titel: string,
    start: string,
    ende: string,
    externalId?: string,
  ): Promise<string>;
  deleteEvent(calendarId: string, externalId: string): Promise<void>;
}
