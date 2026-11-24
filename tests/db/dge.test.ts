import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NodeDriver } from '../../src/core/db/nodeDriver';
import { applyMigrations, applySeeds } from '../../src/core/db/migrate';
import { loadSteps } from '../../src/core/db/steps';
import { DgeComparator, altersgruppeVonAlter, alterVonGeburtsdatum } from '../../src/core/nutrition/DgeComparator';
import type { NutrientAggregat } from '../../src/core/nutrition/NutritionAggregator';

let tmp: string;
let profile: NodeDriver;
let comparator: DgeComparator;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-dge-'));
  profile = new NodeDriver(path.join(tmp, 'p1.db'));
  applyMigrations(profile, loadSteps(path.resolve(__dirname, '../../migrations/profile')));
  applySeeds(profile, loadSteps(path.resolve(__dirname, '../../seed/profile')), '0001');
  comparator = new DgeComparator(profile);
});

afterAll(() => {
  profile.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function intake(name: string, wert_pro_tag_ug: number): NutrientAggregat[] {
  return [{ name, stufe: 'pflicht', wert_total_ug: wert_pro_tag_ug * 7, wert_pro_tag_ug }];
}

describe('DgeComparator (FA-601/602)', () => {
  it('TC-DGE-01: passende reference_dge-Zeile aus der DB (nicht hart kodiert)', () => {
    profile.run(
      "INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag) " +
      "SELECT id, '26-50', 'divers', 123 FROM nutrient WHERE name = 'Eiweiß'",
    );
    const res = comparator.compare(intake('Eiweiß', 12_300), { altersgruppe: '26-50', geschlecht: 'divers' });

    const zeile = res.zeilen.find((z) => z.nutrient_name === 'Eiweiß')!;
    expect(zeile.empfohlen_tag).toBe(123);
    expect(zeile.intake_pro_tag).toBeCloseTo(12.3, 3);
    expect(zeile.ist_anteil).toBeCloseTo(0.1, 3);
  });

  it('TC-DGE-01b: Altersgruppen-Mapping aus Profil-Alter (K-Default)', () => {
    expect(altersgruppeVonAlter(40)).toBe('25-51');
    expect(altersgruppeVonAlter(30)).toBe('25-51');
    expect(altersgruppeVonAlter(55)).toBe('51-65');
    expect(altersgruppeVonAlter(70)).toBe('65+');
    expect(alterVonGeburtsdatum('1990-06-01', new Date('2026-11-24T12:00:00'))).toBe(36);
  });

  it('TC-DGE-02: Altersgruppe ohne Referenzwert → Hinweis statt Absturz (FA-800)', () => {
    const res = comparator.compare(intake('Eiweiß', 26_000_000), { altersgruppe: '99-99', geschlecht: 'divers' });

    expect(res.zeilen).toEqual([]);
    expect(res.referenzFehlt.map((r) => r.nutrient_name)).toEqual(['Eiweiß']);
    expect(res.referenzFehlt[0]!.hinweis).toContain('FA-800');
  });

  it('TC-DGE-03: Ampellogik mit ±10 %-Schwellen (FA-602)', () => {
    const res = comparator.compare(
      intake('Eiweiß', 51_000_000),
      { altersgruppe: '25-51', geschlecht: 'maennlich', toleranz: 0.1 },
    );
    const zeile = res.zeilen.find((z) => z.nutrient_name === 'Eiweiß')!;
    expect(zeile.empfohlen_tag).toBe(57_000);
    expect(zeile.status).toBe('unterhalb');

    expect(
      comparator
        .compare(intake('Eiweiß', 57_000_000), { altersgruppe: '25-51', geschlecht: 'maennlich' })
        .zeilen.find((z) => z.nutrient_name === 'Eiweiß')!.status,
    ).toBe('innerhalb');

    expect(
      comparator
        .compare(intake('Eiweiß', 68_400_000), { altersgruppe: '25-51', geschlecht: 'maennlich' })
        .zeilen.find((z) => z.nutrient_name === 'Eiweiß')!.status,
    ).toBe('oberhalb');
  });
});
