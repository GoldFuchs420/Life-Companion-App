import { describe, expect, it } from 'vitest';
import { anzahlTage } from '../../src/core/nutrition/NutritionAggregator';
import { ampelStatus, altersgruppeVonAlter } from '../../src/core/nutrition/DgeComparator';

describe('Nährwert-Statistik-Helfer', () => {
  it('anzahlTage: geschlossenes Intervall inklusive (FA-613-Kontext)', () => {
    expect(anzahlTage('2026-11-30', '2026-12-01')).toBe(2);
    expect(anzahlTage('2026-11-30', '2026-11-30')).toBe(1);
    expect(anzahlTage('2026-12-31', '2027-01-01')).toBe(2);
    expect(anzahlTage('2026-12-01', '2026-11-30')).toBe(0);
  });

  it('ampelStatus: unterhalb/innerhalb/oberhalb (TC-DGE-03)', () => {
    expect(ampelStatus(0.899, 0.1)).toBe('unterhalb');
    expect(ampelStatus(0.9, 0.1)).toBe('innerhalb');
    expect(ampelStatus(1.0, 0.1)).toBe('innerhalb');
    expect(ampelStatus(1.1, 0.1)).toBe('innerhalb');
    expect(ampelStatus(1.101, 0.1)).toBe('oberhalb');
  });

  it('altersgruppeVonAlter: K-Default-Gruppierung', () => {
    expect(altersgruppeVonAlter(12)).toBe('15-19');
    expect(altersgruppeVonAlter(22)).toBe('19-25');
    expect(altersgruppeVonAlter(50)).toBe('25-51');
    expect(altersgruppeVonAlter(64)).toBe('51-65');
    expect(altersgruppeVonAlter(90)).toBe('65+');
    expect(altersgruppeVonAlter(-3)).toBe('unbekannt');
  });
});
