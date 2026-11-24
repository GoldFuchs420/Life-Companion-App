import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NodeDriver } from '../../src/core/db/nodeDriver';
import { applyMigrations, applySeeds } from '../../src/core/db/migrate';
import { loadSteps } from '../../src/core/db/steps';
import { ActivityDao } from '../../src/core/dao/ActivityDao';
import { CalendarSyncRepository, wanduhrJetzt } from '../../src/core/calendar/CalendarSyncRepository';
import { CalendarZugriffFehler, type SystemCalendarPort, type SystemEvent } from '../../src/core/calendar/SystemCalendarPort';

const VON = '2027-01-04';
const BIS = '2027-01-31';
const SCHREIBZEIT = '2026-11-24T10:00';
const JETZT = new Date(2026, 10, 24, 10, 0);

let tmp: string;
let profile: NodeDriver;
let dao: ActivityDao;
let sync: CalendarSyncRepository;
let sportKategorie: number;
let sonstigesId: number;

class FakeCalendar implements SystemCalendarPort {
  berechtigung = true;
  calendarId = 'cal-lifecompanion';
  events = new Map<string, SystemEvent>();
  uhrzeit = SCHREIBZEIT;
  private n = 0;

  async ensureCalendar(): Promise<string> {
    if (!this.berechtigung) throw new CalendarZugriffFehler('keine_berechtigung');
    return this.calendarId;
  }

  async listEvents(
    _calendarId: string, von: string, bis: string,
  ): Promise<SystemEvent[]> {
    return [...this.events.values()].filter(
      (e) => e.start.slice(0, 10) >= von && e.start.slice(0, 10) <= bis,
    );
  }

  async upsertEvent(
    _calendarId: string, titel: string, start: string, ende: string, externalId?: string,
  ): Promise<string> {
    const id = externalId ?? `ext-${++this.n}`;
    this.events.set(id, { externalId: id, titel, start, ende, aktualisiertAm: this.uhrzeit });
    return id;
  }

  async deleteEvent(_calendarId: string, externalId: string): Promise<void> {
    this.events.delete(externalId);
  }
}

let fake: FakeCalendar;

function zeile<T>(sql: string, params: (string | number)[] = []): T {
  const row = profile.all<T>(sql, params).at(0);
  if (row == null) throw new Error(`Keine Zeile: ${sql} ${JSON.stringify(params)}`);
  return row;
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-kal-'));
  profile = new NodeDriver(path.join(tmp, 'p1.db'));
  applyMigrations(profile, loadSteps(path.resolve(__dirname, '../../migrations/profile')));
  applySeeds(profile, loadSteps(path.resolve(__dirname, '../../seed/profile')), '0001');
  dao = new ActivityDao(profile);
  sportKategorie = zeile<{ id: number }>("SELECT id FROM category WHERE name = 'Sport'").id;
  sonstigesId = zeile<{ id: number }>("SELECT id FROM category WHERE name = 'Sonstiges'").id;
  fake = new FakeCalendar();
  sync = new CalendarSyncRepository(profile, fake);
});

afterAll(() => {
  profile.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Systemkalender-Sync (FA-200/201/213, TC-KAL)', () => {
  it('TC-KAL-01: ohne Berechtigung Hinweis statt Absturz (FA-800)', async () => {
    fake.berechtigung = false;
    const ergebnis = await sync.sync(VON, BIS, JETZT);
    expect(ergebnis.calendarId).toBeNull();
    expect(ergebnis.hinweise.length).toBe(1);
    expect(ergebnis.hinweise[0]).toContain('Berechtigung');
    expect(fake.events.size).toBe(0);
    fake.berechtigung = true;
  });

  it('TC-KAL-03: Serie erscheint als N Einzel-Events, Serienquelle bleibt App-DB (FA-213)', async () => {
    const id = dao.create(
      { titel: 'Rudern', kategorie_id: sportKategorie, start: '2027-01-06T07:00', ende: '2027-01-06T08:00' },
      [{ typ: 'wochentage', wochentage: 'Mi', startdatum: '2027-01-06' }],
    );
    expect(zeile<{ anzahl: number }>('SELECT COUNT(*) AS anzahl FROM activity WHERE id = ?', [id]).anzahl).toBe(1);

    const ergebnis = await sync.sync(VON, BIS, JETZT);
    expect(ergebnis.calendarId).toBe(fake.calendarId);
    expect(ergebnis.kalenderAngelegt).toBe(true);
    expect(ergebnis.erstellt).toBe(4);
    expect([...fake.events.values()].map((e) => e.start.slice(0, 10))).toEqual(
      ['2027-01-06', '2027-01-13', '2027-01-20', '2027-01-27'],
    );
    expect(zeile<{ anzahl: number }>('SELECT COUNT(*) AS anzahl FROM calendar_sync').anzahl).toBe(4);
    expect(zeile<{ anzahl: number }>('SELECT COUNT(*) AS anzahl FROM recurrence WHERE aktivitaet_id = ?', [id]).anzahl).toBe(1);
  });

  it('TC-KAL-04: zweiter Lauf ist idempotent (keine Dubletten, FA-201)', async () => {
    const eventsVorher = fake.events.size;
    const ergebnis = await sync.sync(VON, BIS, JETZT);
    expect(ergebnis.erstellt).toBe(0);
    expect(ergebnis.aktualisiert).toBe(0);
    expect(ergebnis.uebernommen).toBe(0);
    expect(ergebnis.rekonstruiert).toBe(0);
    expect(ergebnis.entfernt).toBe(0);
    expect(ergebnis.importiert).toBe(0);
    expect(ergebnis.konflikte).toEqual([]);
    expect(fake.events.size).toBe(eventsVorher);
  });

  it('TC-KAL-02: App-Aenderung gewinnt (LWW) und erreicht das Geraete-Event', async () => {
    profile.run(
      "UPDATE activity SET start = '2027-01-06T09:00', ende = '2027-01-06T10:00' WHERE titel = 'Rudern'",
    );
    const ergebnis = await sync.sync(VON, BIS, JETZT);
    expect(ergebnis.aktualisiert).toBe(4);
    const events = [...fake.events.values()].filter((e) => e.titel === 'Rudern');
    expect(events.length).toBe(4);
    expect(events.every((e) => e.start.slice(11, 16) === '09:00' && e.ende.slice(11, 16) === '10:00')).toBe(true);
  });

  it('TC-KAL-05: externe Aenderung an Einzel-Aktivitaet wird uebernommen (LWW, FA-201)', async () => {
    dao.create({ titel: 'Zahnarzt', kategorie_id: sonstigesId, start: '2027-01-07T14:00', ende: '2027-01-07T15:00' });
    await sync.sync(VON, BIS, JETZT);
    const event = [...fake.events.values()].find((e) => e.titel === 'Zahnarzt')!;
    fake.events.set(event.externalId, {
      ...event,
      titel: 'Zahnarzt (verschoben)',
      start: '2027-01-07T16:00',
      ende: '2027-01-07T17:00',
      aktualisiertAm: '2026-11-24T11:00',
    });
    const ergebnis = await sync.sync(VON, BIS, JETZT);
    expect(ergebnis.uebernommen).toBe(1);
    const akt = zeile<{ titel: string; start: string; ende: string }>(
      'SELECT titel, start, ende FROM activity WHERE titel = ?', ['Zahnarzt (verschoben)'],
    );
    expect(akt.start).toBe('2027-01-07T16:00');
    expect(akt.ende).toBe('2027-01-07T17:00');
  });

  it('TC-KAL-05: externe Aenderung an Serien-Instanz erzeugt Konflikt-Hinweis (FA-800, kein stilles Verwerfen)', async () => {
    const event = [...fake.events.values()].find((e) => e.titel === 'Rudern')!;
    fake.events.set(event.externalId, { ...event, titel: 'Rudern (extern)', aktualisiertAm: '2026-11-24T12:00' });
    const ergebnis = await sync.sync(VON, BIS, JETZT);
    expect(ergebnis.konflikte.length).toBe(1);
    expect(ergebnis.konflikte[0]!.hinweis).toContain('Serienlogik');
    expect(zeile<{ anzahl: number }>("SELECT COUNT(*) AS anzahl FROM activity WHERE titel = 'Rudern (extern)'").anzahl).toBe(0);
  });

  it('FA-201 bidirektional: fremdes Geraete-Event wird als Aktivitaet importiert', async () => {
    const countVorher = zeile<{ anzahl: number }>('SELECT COUNT(*) AS anzahl FROM activity').anzahl;
    fake.events.set('ext-manuell', {
      externalId: 'ext-manuell',
      titel: 'Externer Termin',
      start: '2027-01-08T12:00',
      ende: '2027-01-08T13:00',
      aktualisiertAm: SCHREIBZEIT,
    });
    const ergebnis = await sync.sync(VON, BIS, JETZT);
    expect(ergebnis.importiert).toBe(1);
    const importiert = zeile<{ kategorie_id: number; prioritaet: string }>(
      'SELECT kategorie_id, prioritaet FROM activity WHERE titel = ?', ['Externer Termin'],
    );
    expect(importiert.kategorie_id).toBe(sonstigesId);
    expect(importiert.prioritaet).toBe('verfuegbar');
    expect(zeile<{ anzahl: number }>('SELECT COUNT(*) AS anzahl FROM activity').anzahl).toBe(countVorher + 1);
  });

  it('veraltete Mappings: Aktivitaet geloescht -> ihre Events werden entfernt', async () => {
    profile.run("DELETE FROM activity WHERE titel = 'Rudern'");
    const eventsVorher = fake.events.size;
    const ergebnis = await sync.sync(VON, BIS, JETZT);
    expect(ergebnis.entfernt).toBe(4);
    expect(fake.events.size).toBe(eventsVorher - 4);
    const rest = zeile<{ anzahl: number }>('SELECT COUNT(*) AS anzahl FROM calendar_sync').anzahl;
    const restEventBezug = [...fake.events.keys()].length;
    expect(rest).toBeGreaterThanOrEqual(2);
    expect(restEventBezug).toBe(2);
  });

  it('wanduhrJetzt liefert lokale Wanduhr ohne Offset (FA-213/TC-REC-09)', () => {
    expect(wanduhrJetzt(new Date(2027, 2, 14, 7, 5))).toBe('2027-03-14T07:05');
  });
});
