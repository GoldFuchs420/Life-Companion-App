import { describe, expect, it } from 'vitest';
import { kcalPer100 } from '../../src/core/energy/EnergyCalculator';

const M = 1_000_000; // g -> µg-normiert (FA-322)

describe('EnergyCalculator (FA-329/O-2, TC-ENE)', () => {
  it('TC-ENE-01: 13 g P / 60 g KH / 7 g F je 100 g -> 355,0 kcal', () => {
    expect(kcalPer100({ Eiweiß: 13 * M, Kohlenhydrate: 60 * M, Fett: 7 * M })).toBe(355);
  });

  it('TC-ENE-02: + 8 g Ballaststoffe -> 371,0 kcal (Faktor ×2)', () => {
    expect(
      kcalPer100({ Eiweiß: 13 * M, Kohlenhydrate: 60 * M, Fett: 7 * M, Ballaststoffe: 8 * M }),
    ).toBe(371);
  });

  it('TC-ENE-03: Alkohol 5 g -> Faktor ×7 = 35 kcal, nicht ×9', () => {
    expect(kcalPer100({ Alkohol: 5 * M })).toBe(35);
  });

  it('TC-ENE-05: leere Angabe -> 0,0 kcal (keine Berechnungsgrundlage ist kein Fehler, FA-800)', () => {
    expect(kcalPer100({})).toBe(0);
  });

  it('Nährwerte mit negativem Wert werden abgelehnt (FA-803-Defensivregel)', () => {
    expect(() => kcalPer100({ Eiweiß: -1 })).toThrow();
  });
});
