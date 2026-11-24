import { describe, expect, it } from 'vitest';
import { kcalProPortion, kcalReferenzHinweis, skaliere } from '../../src/core/nutrition/PortionCalculator';

const zeilen100 = [
  { menge_basis: 100, einheit_basis: 'g' as const, kcal_pro_100: 371 },
];

describe('PortionCalculator (FA-302/303/610, TC-POR)', () => {
  it('TC-POR-01: Rezept 1 Portion × 4 -> sämtliche Werte × 4', () => {
    expect(skaliere(371, 4)).toBe(1484);
    expect(skaliere(13, 4)).toBe(52);
  });

  it('TC-POR-02: Teilportion 0,5 -> × 0,5', () => {
    expect(skaliere(371, 0.5)).toBe(185.5);
  });

  it('kcalProPortion: 200 g Haferflocken auf 2 Portionen -> 371,0 kcal/Portion', () => {
    expect(kcalProPortion([
      { menge_basis: 200, einheit_basis: 'g', kcal_pro_100: 371 },
    ], 2)).toBe(371);
  });

  it('kcalProPortion: portionen 0/-1 -> null (Eingabeaufforderung, FA-800), kein Absturz', () => {
    expect(kcalProPortion(zeilen100, 0)).toBeNull();
    expect(kcalProPortion(zeilen100, -1)).toBeNull();
  });

  it('TC-POR-03: kcal 220 oder 800 -> nur Hinweis, keine Sperre (FA-302)', () => {
    expect(kcalReferenzHinweis(220).imBereich).toBe(false);
    expect(kcalReferenzHinweis(800).imBereich).toBe(false);
    expect(kcalReferenzHinweis(550).imBereich).toBe(true);
    expect(kcalReferenzHinweis(800).text).toContain('nur Hinweis');
  });

  it('TC-POR-03: fehlende kcal -> Nachfrage-Text (FA-800)', () => {
    expect(kcalReferenzHinweis(null).text).toContain('FA-800');
  });
});
