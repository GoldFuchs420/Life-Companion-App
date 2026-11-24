import { describe, expect, it } from 'vitest';
import { convert, parseMenge } from '../../src/core/unit/UnitConverter';

const conversions = [
  { einheit: 'TL', faktor_ml: 5, default_g_faktor_ml: null },
  { einheit: 'EL', faktor_ml: 15, default_g_faktor_ml: null },
  { einheit: 'prise', faktor_ml: 0.5, default_g_faktor_ml: null },
  { einheit: 'tasse_150', faktor_ml: 150, default_g_faktor_ml: null },
  { einheit: 'tasse_250', faktor_ml: 250, default_g_faktor_ml: null },
  { einheit: 'tasse_330', faktor_ml: 330, default_g_faktor_ml: null },
];
const conv = (einheit: string) => conversions.find((c) => c.einheit === einheit) ?? null;

describe('parseMenge (TC-UMR-06, FA-332)', () => {
  it('"1,5" -> 1.5, " 2 " -> 2, "abc" -> null, 0/-1 -> null', () => {
    expect(parseMenge('1,5')).toBe(1.5);
    expect(parseMenge(' 2 ')).toBe(2);
    expect(parseMenge('abc')).toBeNull();
    expect(parseMenge('0')).toBeNull();
    expect(parseMenge(-1)).toBeNull();
  });
});

describe('UnitConverter (FA-330..335, TC-UMR)', () => {
  const oel = { basis_einheit: 'ml' as const, stueckgewicht_g: null, dichte_g_pro_ml: 0.92 };
  const karotte = { basis_einheit: 'g' as const, stueckgewicht_g: 80, dichte_g_pro_ml: null };
  const mehl = { basis_einheit: 'g' as const, stueckgewicht_g: null, dichte_g_pro_ml: null };

  it('TC-UMR-01: 1 TL = 5 ml, 1 EL = 15 ml, 1 Prise = 0,5 ml (ml-Zutat)', () => {
    expect(convert({ menge: 1, einheit: 'TL' }, oel, conv('TL'))).toEqual({ menge_basis: 5, einheit_basis: 'ml' });
    expect(convert({ menge: 1, einheit: 'EL' }, oel, conv('EL'))).toEqual({ menge_basis: 15, einheit_basis: 'ml' });
    expect(convert({ menge: 1, einheit: 'prise' }, oel, conv('prise'))).toEqual({ menge_basis: 0.5, einheit_basis: 'ml' });
  });

  it('TC-UMR-02: 2 Tassen in allen drei Groessen -> 300/500/660 ml', () => {
    expect(convert({ menge: 2, einheit: 'tasse_150' }, oel, conv('tasse_150')).menge_basis).toBe(300);
    expect(convert({ menge: 2, einheit: 'tasse_250' }, oel, conv('tasse_250')).menge_basis).toBe(500);
    expect(convert({ menge: 2, einheit: 'tasse_330' }, oel, conv('tasse_330')).menge_basis).toBe(660);
  });

  it('TC-UMR-03: 1 Karotte mit stueckgewicht 80 g -> 80 g', () => {
    expect(convert({ menge: 1, einheit: 'stueck' }, karotte, null)).toEqual({ menge_basis: 80, einheit_basis: 'g' });
  });

  it('TC-UMR-03/05: stueckgewicht fehlt -> Nachfrage statt Raten', () => {
    const ohneGewicht = { ...karotte, stueckgewicht_g: null };
    const r = convert({ menge: 3, einheit: 'stueck' }, ohneGewicht, null);
    expect(r.menge_basis).toBeNull();
    expect(r.hinweis).toContain('Stueckgewicht');
  });

  it('TC-UMR-04: ml-Zutat mit Dichte: 1 EL Oel -> 15 ml * 0,92 = 13,8 g', () => {
    const gBasiert = convert({ menge: 1, einheit: 'EL' }, { ...oel, basis_einheit: 'g' }, conv('EL'));
    expect(gBasiert.menge_basis).toBeCloseTo(13.8, 6);
  });

  it('TC-UMR-05: unbekannte Einheit -> Nachfrage (FA-800)', () => {
    const r = convert({ menge: 1, einheit: 'Bund' }, mehl, null);
    expect(r.menge_basis).toBeNull();
    expect(r.hinweis).toContain('unbekannt');
  });

  it('TC-UMR-07: kg/l/100er-Normierung -> g/ml', () => {
    expect(convert({ menge: 1.5, einheit: 'kg' }, karotte, null)).toEqual({ menge_basis: 1500, einheit_basis: 'g' });
    expect(convert({ menge: 0.75, einheit: 'l' }, oel, null)).toEqual({ menge_basis: 750, einheit_basis: 'ml' });
  });

  it('TC-UMR-08: Nutzer-Override schlaegt Seed-Default, Zuruecksetzen stellt wieder her', () => {
    const override = [{ einheit: 'EL', gramm: 12 }];
    expect(convert({ menge: 1, einheit: 'EL' }, mehl, conv('EL'), override).menge_basis).toBe(12);
    expect(convert({ menge: 2, einheit: 'EL' }, mehl, conv('EL'), override).menge_basis).toBe(24);
  });

  it('ml-Zutat in g-Basis ohne Dichte/Override -> Nachfrage (FA-334)', () => {
    const r = convert({ menge: 1, einheit: 'EL' }, mehl, conv('EL'));
    expect(r.menge_basis).toBeNull();
    expect(r.hinweis).toContain('Dichte');
  });
});
