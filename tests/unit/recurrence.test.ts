import { describe, expect, it } from 'vitest';
import {
  expandiere, expandiereAlle,
  type AktivitaetZeitrahmen, type RecurrenceRule,
} from '../../src/core/recurrence/RecurrenceResolver';

const FUNK = (start: string, ende: string): AktivitaetZeitrahmen => ({ start, ende });

describe('RecurrenceResolver (FA-207a-d, FA-213, TC-REC)', () => {
  it('TC-REC-01 (Tage): alle 3 Tage, exakte Instanzfolge inkl. Uhrzeit', () => {
    const r: RecurrenceRule = { typ: 'intervall', einheit: 'tage', intervall: 3, startdatum: '2026-01-01' };
    const res = expandiere(r, FUNK('2026-01-01T07:00', '2026-01-01T08:00'), '2026-01-01', '2026-01-31');
    expect(res.instanzen.map((i) => i.start)).toEqual([
      '2026-01-01T07:00', '2026-01-04T07:00', '2026-01-07T07:00', '2026-01-10T07:00',
      '2026-01-13T07:00', '2026-01-16T07:00', '2026-01-19T07:00', '2026-01-22T07:00',
      '2026-01-25T07:00', '2026-01-28T07:00', '2026-01-31T07:00',
    ]);
    expect(res.instanzen.every((i) => i.ende === i.start.replace('T07:00', 'T08:00'))).toBe(true);
  });

  it('TC-REC-01 (Stunden): alle 6 h inkl. Überlauf in den Folgetag', () => {
    const r: RecurrenceRule = { typ: 'intervall', einheit: 'stunden', intervall: 6, startdatum: '2026-01-04' };
    const res = expandiere(r, FUNK('2026-01-04T07:00', '2026-01-04T07:45'), '2026-01-04', '2026-01-05');
    expect(res.instanzen.map((i) => i.start)).toEqual([
      '2026-01-04T07:00', '2026-01-04T13:00', '2026-01-04T19:00',
      '2026-01-05T01:00', '2026-01-05T07:00', '2026-01-05T13:00', '2026-01-05T19:00',
    ]);
    expect(res.instanzen.every((i) => ['T07:45', 'T01:45', 'T13:45', 'T19:45'].some((m) => i.ende.endsWith(m)))).toBe(true);
  });

  it('TC-REC-02: jeden 2. Sonntag – Intervall 14 Tage + Anker Sonntag', () => {
    const r: RecurrenceRule = { typ: 'intervall', einheit: 'tage', intervall: 14, wochentage: ['So'], startdatum: '2026-01-04' };
    const res = expandiere(r, FUNK('2026-01-04T09:00', '2026-01-04T10:30'), '2026-01-01', '2026-03-31');
    expect(res.instanzen.map((i) => i.start.slice(0, 10))).toEqual([
      '2026-01-04', '2026-01-18', '2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15', '2026-03-29',
    ]);
    expect(res.instanzen.every((i) => i.start.endsWith('T09:00'))).toBe(true);
  });

  it('TC-REC-03: Mo-Fr 07:00 -> 5 Instanzen je Woche, keine Wochenend-Instanz', () => {
    const r: RecurrenceRule = { typ: 'wochentage', wochentage: ['Mo', 'Di', 'Mi', 'Do', 'Fr'], startdatum: '2026-01-05' };
    const res = expandiere(r, FUNK('2026-01-05T07:00', '2026-01-05T08:00'), '2026-01-05', '2026-01-11');
    expect(res.instanzen.map((i) => i.start.slice(0, 10))).toEqual([
      '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
    ]);
    expect(res.instanzen.every((i) => i.start.endsWith('T07:00'))).toBe(true);
  });

  it('TC-REC-02 (wochentage-Modell): wochentage + intervall 2 Wochen = jeder zweite Sonntag', () => {
    const r: RecurrenceRule = { typ: 'wochentage', wochentage: ['So'], intervall: 2, startdatum: '2026-01-04' };
    const res = expandiere(r, FUNK('2026-01-04T09:00', '2026-01-04T10:30'), '2026-01-01', '2026-02-28');
    expect(res.instanzen.map((i) => i.start.slice(0, 10))).toEqual(['2026-01-04', '2026-01-18', '2026-02-01', '2026-02-15']);
  });

  it('TC-REC-04: jeden 31. des Monats – Februar/April übersprungen (Kennzeichnung), März liefert', () => {
    const r: RecurrenceRule = { typ: 'monatstag', tag_im_monat: 31, startdatum: '2026-01-01' };
    const res = expandiere(r, FUNK('2026-01-31T20:00', '2026-01-31T21:00'), '2026-01-01', '2026-04-30');
    expect(res.instanzen.map((i) => i.start.slice(0, 10))).toEqual(['2026-01-31', '2026-03-31']);
    expect(res.ausgelassen.map((a) => a.datum)).toContain('2026-02-31');
    expect(res.ausgelassen.map((a) => a.datum)).toContain('2026-04-31');
    expect(res.ausgelassen[0]?.hinweis).toContain('übersprungen');
  });

  it('TC-REC-05: 29.02. nur in Schaltjahren', () => {
    const r: RecurrenceRule = { typ: 'jahrstag', tag_im_jahr: '02-29', startdatum: '2023-02-28' };
    const res = expandiere(r, FUNK('2023-02-28T12:00', '2023-02-28T13:00'), '2023-01-01', '2029-12-31');
    expect(res.instanzen.map((i) => i.start.slice(0, 10))).toEqual(['2024-02-29', '2028-02-29']);
  });

  it('TC-REC-06: mehrere Wiederholungen -> Vereinigungsmenge ohne Duplikate', () => {
    const montag: RecurrenceRule = { typ: 'intervall', einheit: 'tage', intervall: 7, wochentage: ['Mo'], startdatum: '2026-01-05' };
    const auchMontag: RecurrenceRule = { typ: 'wochentage', wochentage: ['Mo'], startdatum: '2026-01-05' };
    const res = expandiereAlle([montag, auchMontag], FUNK('2026-01-05T07:00', '2026-01-05T08:00'), '2026-01-01', '2026-01-31');
    const starte = res.instanzen.map((i) => i.start);
    expect(starte.length).toBe(new Set(starte).size);
    expect(starte).toEqual([
      '2026-01-05T07:00', '2026-01-12T07:00', '2026-01-19T07:00', '2026-01-26T07:00',
    ]);
  });

  it('TC-REC-07: absolutes Ende – Enddatum inklusive', () => {
    const r: RecurrenceRule = { typ: 'intervall', einheit: 'tage', intervall: 2, startdatum: '2026-01-01', enddatum: '2026-01-07' };
    const res = expandiere(r, FUNK('2026-01-01T07:00', '2026-01-01T08:00'), '2026-01-01', '2026-12-31');
    expect(res.instanzen.map((i) => i.start.slice(0, 10))).toEqual(['2026-01-01', '2026-01-03', '2026-01-05', '2026-01-07']);
  });

  it('TC-REC-08: nur expandierte Einzel-Instanzen (keine Serien-Objekte)', () => {
    const r: RecurrenceRule = { typ: 'wochentage', wochentage: ['Mo'], startdatum: '2026-01-05' };
    const res = expandiere(r, FUNK('2026-01-05T07:00', '2026-01-05T08:00'), '2026-01-01', '2026-01-31');
    expect(res.instanzen.length).toBeGreaterThan(1);
    expect(res.instanzen.every((i) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(i.start))).toBe(true);
    expect('serie' in res.instanzen[0]!).toBe(false);
  });

  it('TC-REC-09 (DST): 07:00 bleibt 07:00 über die DST-Grenze (29.03.2026)', () => {
    const r: RecurrenceRule = { typ: 'wochentage', wochentage: ['So'], startdatum: '2026-03-22' };
    const res = expandiere(r, FUNK('2026-03-22T07:00', '2026-03-22T08:00'), '2026-03-01', '2026-04-30');
    expect(res.instanzen.map((i) => i.start.slice(0, 10))).toEqual(['2026-03-22', '2026-03-29', '2026-04-05', '2026-04-12', '2026-04-19', '2026-04-26']);
    expect(res.instanzen.every((i) => i.start.endsWith('T07:00'))).toBe(true);
  });
});
