import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NodeDriver } from '../../src/core/db/nodeDriver';
import { applyMigrations, applySeeds } from '../../src/core/db/migrate';
import { loadSteps } from '../../src/core/db/steps';
import { ActivityDao, type RecurrenceInput } from '../../src/core/dao/ActivityDao';
import { ActivityRepository } from '../../src/core/activity/ActivityRepository';
import { ActivityStatistics } from '../../src/core/stats/ActivityStatistics';

let tmp: string;
let profile: NodeDriver;
let dao: ActivityDao;
let repo: ActivityRepository;
let statistics: ActivityStatistics;
let sportKategorie: number;
let hygieneKategorie: number;
let haushaltKategorie: number;
let radfahrenVorlage: number;
let duschenVorlage: number;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-akt-'));
  profile = new NodeDriver(path.join(tmp, 'p1.db'));
  applyMigrations(profile, loadSteps(path.resolve(__dirname, '../../migrations/profile')));
  applySeeds(profile, loadSteps(path.resolve(__dirname, '../../seed/profile')), '0001');
  dao = new ActivityDao(profile);
  repo = new ActivityRepository(profile);
  statistics = new ActivityStatistics(profile);
  sportKategorie = profile.all<{ id: number }>("SELECT id FROM category WHERE name = 'Sport'")[0]!.id;
  hygieneKategorie = profile.all<{ id: number }>("SELECT id FROM category WHERE name = 'Hygiene'")[0]!.id;
  haushaltKategorie = profile.all<{ id: number }>("SELECT id FROM category WHERE name = 'Haushalt'")[0]!.id;
  profile.run(
    'INSERT INTO activity_template (titel, beschreibung, kategorie_id, dauer_min, kcal_pro_stunde) VALUES (?, ?, ?, ?, ?)',
    ['Radfahren (AT)', null, sportKategorie, 90, 600],
  );
  radfahrenVorlage = profile.all<{ id: number }>("SELECT id FROM activity_template WHERE titel = 'Radfahren (AT)'")[0]!.id;
  profile.run(
    'INSERT INTO activity_template (titel, beschreibung, kategorie_id, dauer_min, kcal_pro_stunde) VALUES (?, ?, ?, ?, ?)',
    ['Duschen (AT)', null, hygieneKategorie, 20, null],
  );
  duschenVorlage = profile.all<{ id: number }>("SELECT id FROM activity_template WHERE titel = 'Duschen (AT)'")[0]!.id;
});

afterAll(() => {
  profile.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('ActivityDao (FA-202/208/209)', () => {
  it('FA-209: Aktivität aus Vorlage instanziiert Titel/Kategorie, bei unbekannter Vorlage null (FA-800)', () => {
    const id = dao.createAusVorlage(radfahrenVorlage, '2027-01-04T17:00', '2027-01-04T18:30')!;
    const akt = dao.get(id)!;
    expect(akt.titel).toBe('Radfahren (AT)');
    expect(akt.kategorie_id).toBe(sportKategorie);
    expect(akt.vorlage_id).toBe(radfahrenVorlage);
    expect(akt.prioritaet).toBe('verfuegbar');
    expect(dao.createAusVorlage(4711, '2027-01-04T17:00', '2027-01-04T18:30')).toBeNull();
  });

  it('FA-208: Aktivität mit Wiederholungs-Regeln anlegen; Wochenansicht zeigt Instanzen, nicht den Anker (FA-213)', () => {
    dao.create(
      { titel: 'Mo-Serie', kategorie_id: sportKategorie, start: '2027-01-05T07:00', ende: '2027-01-05T08:00' },
      [{ typ: 'wochentage', wochentage: 'Mo', startdatum: '2027-01-04' }],
    );
    dao.create({ titel: 'Einzeltermin', kategorie_id: haushaltKategorie, start: '2027-01-06T09:00', ende: '2027-01-06T09:45' });

    const res = repo.wochenansicht('2027-01-04', '2027-01-10');
    const serie = res.instanzen.filter((i) => i.titel === 'Mo-Serie');
    expect(serie.map((i) => i.start.slice(0, 10))).toEqual(['2027-01-04']);
    expect(res.instanzen.filter((i) => i.titel === 'Einzeltermin').map((i) => i.start.slice(0, 10))).toEqual(['2027-01-06']);
    expect(res.instanzen.every((i) => i.konflikt_beschaeftigt === false && i.ueberlappt === false)).toBe(true);
  });
});

describe('Prioritäten & Überlappungen (FA-203/211, TC-OVR)', () => {
  it('TC-OVR-01/02: Überlappung erlaubt + Warnung; "beschäftigt" liefert Konflikt-Flag', () => {
    const a = dao.create({
      titel: 'Beschaeftigt-A',
      kategorie_id: sportKategorie,
      prioritaet: 'beschaeftigt',
      start: '2027-01-05T10:00',
      ende: '2027-01-05T11:00',
    });
    const b = dao.create({
      titel: 'Verfuegbar-B',
      kategorie_id: sportKategorie,
      start: '2027-01-05T10:30',
      ende: '2027-01-05T11:30',
    });
    dao.create({ titel: 'Isoliert-C', kategorie_id: sportKategorie, start: '2027-01-05T12:00', ende: '2027-01-05T13:00' });

    const res = repo.wochenansicht('2027-01-04', '2027-01-10');
    const nachId = new Map(res.instanzen.map((i) => [i.aktivitaet_id, i]));
    expect(nachId.get(a)!.ueberlappt).toBe(true);
    expect(nachId.get(b)!.ueberlappt).toBe(true);
    expect(nachId.get(a)!.konflikt_beschaeftigt).toBe(true);
    expect(nachId.get(b)!.konflikt_beschaeftigt).toBe(true);
    expect(res.ueberlappungen.length).toBe(1);
    const c = nachId.get(res.instanzen.find((i) => i.titel === 'Isoliert-C')!.aktivitaet_id)!;
    expect(c.ueberlappt).toBe(false);
    expect(c.konflikt_beschaeftigt).toBe(false);
  });

  it('TC-OVR-03: "verfügbar"/"abwesend" überlappen, ohne Konflikt-Flag (nur Anzeige-Logik)', () => {
    dao.create({
      titel: 'Abwesend-D',
      kategorie_id: hygieneKategorie,
      prioritaet: 'abwesend',
      start: '2027-01-06T14:00',
      ende: '2027-01-06T15:00',
    });
    dao.create({ titel: 'Verfuegbar-E', kategorie_id: hygieneKategorie, start: '2027-01-06T14:30', ende: '2027-01-06T15:30' });

    const res = repo.wochenansicht('2027-01-04', '2027-01-10');
    const paar = res.ueberlappungen.filter((u) => {
      const a = res.instanzen.find((i) => i.aktivitaet_id === u.a)!;
      return a.titel === 'Abwesend-D';
    });
    expect(paar.length).toBe(1);
    const beide = res.instanzen.filter((i) => i.titel === 'Abwesend-D' || i.titel === 'Verfuegbar-E');
    expect(beide.every((i) => i.ueberlappt === true && i.konflikt_beschaeftigt === false)).toBe(true);
  });

  it('TC-OVR-04: Kategorie-Filter – alle Instanzen bleiben, Flag nur für die gewählte Kategorie', () => {
    const res = repo.wochenansicht('2027-01-04', '2027-01-10', { kategorie_id: sportKategorie });
    expect(res.instanzen.length).toBeGreaterThan(0);
    expect(res.instanzen.every((i) => i.gefiltert === (i.kategorie_id === sportKategorie))).toBe(true);
  });

  it('Schutzfall: mehrere Recurrence-Regeln pro Aktivität → duplikatfreie Instanzmenge (FA-207, TC-AGG-02)', () => {
    const regeln: RecurrenceInput[] = [
      { typ: 'wochentage', wochentage: 'Mo', startdatum: '2027-01-04' },
      { typ: 'intervall', intervall: 1, einheit: 'wochen', startdatum: '2027-01-04' },
    ];
    dao.create(
      { titel: 'Zwei-Regeln', kategorie_id: haushaltKategorie, start: '2027-01-04T19:00', ende: '2027-01-04T19:15' },
      regeln,
    );

    const res = repo.wochenansicht('2027-01-04', '2027-01-10');
    const zwei = res.instanzen.filter((i) => i.titel === 'Zwei-Regeln');
    expect(zwei.map((i) => i.start.slice(0, 10))).toEqual(['2027-01-04']);
  });
});

describe('Aktivitätsstatistik (FA-603)', () => {
  it('Zeit je Kategorie; kcal nur aus Vorlagen-kcal_pro_stunde (FA-208: leer = keine Kalorien)', () => {
    const res = repo.wochenansicht('2027-01-04', '2027-01-10');

    const zeilen = statistics.zeitProKategorie(res.instanzen);
    const sport = zeilen.find((z) => z.kategorie_id === sportKategorie)!;
    const hygiene = zeilen.find((z) => z.kategorie_id === hygieneKategorie)!;
    const haushalt = zeilen.find((z) => z.kategorie_id === haushaltKategorie)!;

    expect(sport.minuten).toBeGreaterThanOrEqual(90);
    expect(sport.kcal_verbrauch).toBeGreaterThanOrEqual(900);
    expect(hygiene.minuten).toBeGreaterThanOrEqual(30);
    expect(hygiene.kcal_verbrauch).toBe(0);
    expect(haushalt.kcal_verbrauch).toBe(0);
    expect(zeilen[0]!.minuten).toBeGreaterThanOrEqual(zeilen[zeilen.length - 1]!.minuten);
  });
});
