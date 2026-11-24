import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NodeDriver } from '../../src/core/db/nodeDriver';
import { applyMigrations, applySeeds } from '../../src/core/db/migrate';
import { loadSteps } from '../../src/core/db/steps';
import { IngredientDao } from '../../src/core/dao/IngredientDao';
import { RecipeDao } from '../../src/core/dao/RecipeDao';
import { NutritionAggregator, type NutrientAggregat } from '../../src/core/nutrition/NutritionAggregator';

let tmp: string;
let profile: NodeDriver;
let aggregator: NutritionAggregator;
let kochenKategorie: number;
let sportKategorie: number;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-agg-'));
  profile = new NodeDriver(path.join(tmp, 'p1.db'));
  applyMigrations(profile, loadSteps(path.resolve(__dirname, '../../migrations/profile')));
  applySeeds(profile, loadSteps(path.resolve(__dirname, '../../seed/profile')), '0001');
  aggregator = new NutritionAggregator(profile);
  kochenKategorie = profile.all<{ id: number }>("SELECT id FROM category WHERE name = 'Kochen/Rezepte'")[0]!.id;
  sportKategorie = profile.all<{ id: number }>("SELECT id FROM category WHERE name = 'Sport'")[0]!.id;
});

afterAll(() => {
  profile.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function vollenKatalogErfassen(ingredientId: string, overrides: Record<string, number> = {}): void {
  const rows = profile.all<{ name: string; id: number }>('SELECT id, name FROM nutrient');
  for (const n of rows) {
    profile.run(
      'INSERT INTO ingredient_nutrient (ingredient_id, nutrient_id, wert_normiert_pro_100, quelle) VALUES (?, ?, ?, ?)',
      [ingredientId, n.id, overrides[n.name] ?? 1_000_000, 'test-fixture'],
    );
  }
}

function legeEssenZutatAkt(id: string, start: string, kategorie: number, ingredientId: string, menge: number): void {
  profile.run(
    'INSERT INTO activity (id, titel, typ, kategorie_id, prioritaet, start, ende, ingredient_id, zutat_menge, zutat_einheit) ' +
    "VALUES (?, ?, 'essen_zutat', ?, 'verfuegbar', ?, ?, ?, ?, 'g')",
    [id, 'Zutat ' + id, kategorie, start, start.slice(0, 10) + 'T08:30', ingredientId, menge],
  );
}

function legeEssenRezeptAkt(id: string, start: string, kategorie: number, rezeptId: string, portionen: number): void {
  profile.run(
    'INSERT INTO activity (id, titel, typ, kategorie_id, prioritaet, start, ende, rezept_id, portionen) ' +
    "VALUES (?, ?, 'essen_rezept', ?, 'verfuegbar', ?, ?, ?, ?)",
    [id, 'Rezept ' + id, kategorie, start, start.slice(0, 10) + 'T12:30', rezeptId, portionen],
  );
}

function wertVon(liste: NutrientAggregat[], name: string): number | undefined {
  return liste.find((n) => n.name === name)?.wert_total_ug;
}

describe('NutritionAggregator (FA-610/FA-341)', () => {
  it('TC-AGG-01: Intake = Σ Essen-Eintraege × Portionen im Zeitraum', () => {
    const ingredients = new IngredientDao(profile);
    const hafer = ingredients.create({ name: 'Hafer (AGG-01)', basis_einheit: 'g' });
    vollenKatalogErfassen(hafer, { Eiweiß: 13_000_000 });
    const recipes = new RecipeDao(profile);
    const rezept = recipes.create({ titel: 'Brei AGG-01' }, [], [{ ingredient_id: hafer, menge: 100, einheit: 'g' }]);

    legeEssenZutatAkt('a1', '2026-11-30T08:00', kochenKategorie, hafer, 200);
    legeEssenRezeptAkt('a2', '2026-12-01T12:00', kochenKategorie, rezept, 2);

    const res = aggregator.aggregate('2026-11-30', '2026-12-01');
    expect(res.tage).toBe(2);
    expect(res.instanzen.length).toBe(2);
    expect(wertVon(res.proNutrient, 'Eiweiß')).toBe(52_000_000);
    const eiweiss = res.proNutrient.find((n) => n.name === 'Eiweiß')!;
    expect(eiweiss.wert_pro_tag_ug).toBe(26_000_000);
  });

  it('TC-AGG-02: Serien-Instanzen zaehlen (FA-213), nicht die Serie als Ganzes', () => {
    const ingredients = new IngredientDao(profile);
    const nuessen = ingredients.create({ name: 'Nuesse (AGG-02)', basis_einheit: 'g' });
    vollenKatalogErfassen(nuessen, { Eiweiß: 13_000_000 });

    profile.run(
      'INSERT INTO activity (id, titel, typ, kategorie_id, prioritaet, start, ende, ingredient_id, zutat_menge, zutat_einheit) ' +
      "VALUES ('s1', 'Snackserie', 'essen_zutat', ?, 'verfuegbar', '2027-01-04T10:00', '2027-01-04T10:15', ?, 100, 'g')",
      [kochenKategorie, nuessen],
    );
    profile.run(
      "INSERT INTO recurrence (aktivitaet_id, typ, intervall, wochentage, startdatum) VALUES ('s1', 'wochentage', 1, 'Mo,Di', '2027-01-04')",
    );

    const res = aggregator.aggregate('2027-01-04', '2027-01-11');
    expect(res.instanzen.length).toBe(3);
    expect(res.instanzen.map((i) => i.start.slice(0, 10))).toEqual(['2027-01-04', '2027-01-05', '2027-01-11']);
    expect(wertVon(res.proNutrient, 'Eiweiß')).toBe(39_000_000);
  });

  it('TC-AGG-03: Tag mit Luecken → "unvollstaendig erfasst", nicht als 0 (FA-341/FA-800)', () => {
    const ingredients = new IngredientDao(profile);
    const luecke = ingredients.create({ name: 'Luecke (AGG-03)', basis_einheit: 'g' }, [
      { nutrient_name: 'Eiweiß', wert_normiert_pro_100: 13_000_000 },
    ]);
    legeEssenZutatAkt('a3', '2026-12-02T08:00', kochenKategorie, luecke, 100);

    const res = aggregator.aggregate('2026-12-02', '2026-12-02');
    expect(res.unvollstaendigeTage).toEqual(['2026-12-02']);
    expect(res.instanzen[0]!.erfasst).toBe(false);
    expect(res.fehlendeNutrientwerte.length).toBeGreaterThan(0);
    expect(res.fehlendeNutrientwerte.every((f) => f.hinweis.includes('FA-800'))).toBe(true);
    expect(wertVon(res.proNutrient, 'Eiweiß')).toBe(13_000_000);
  });

  it('TC-AGG-04: Kategorie-Filter → ausgegraut statt entfernt (FA-612)', () => {
    const ingredients = new IngredientDao(profile);
    const karotte = ingredients.create({ name: 'Karotte (AGG-04)', basis_einheit: 'g' });
    vollenKatalogErfassen(karotte, { Eiweiß: 13_000_000 });
    legeEssenZutatAkt('a4', '2026-12-03T08:00', kochenKategorie, karotte, 100);
    legeEssenZutatAkt('a5', '2026-12-03T09:00', sportKategorie, karotte, 100);

    const res = aggregator.aggregate('2026-12-03', '2026-12-03', { kategorie_id: kochenKategorie });
    expect(wertVon(res.proNutrient, 'Eiweiß')).toBe(26_000_000);
    expect(wertVon(res.ausgegraut, 'Eiweiß')).toBe(13_000_000);
    expect(res.instanzen.every((i) => i.gefiltert === (i.aktivitaet_id === 'a4'))).toBe(true);
  });

  it('TC-AGG-05: Einzel-Lebensmittel-Eintrag ohne Rezept wird wie Essen-Eintrag aggregiert', () => {
    const ingredients = new IngredientDao(profile);
    const snack = ingredients.create({ name: 'Snack (AGG-05)', basis_einheit: 'g' });
    vollenKatalogErfassen(snack, { Eiweiß: 13_000_000 });
    const recipes = new RecipeDao(profile);
    const rezept = recipes.create({ titel: 'Äquivalent AGG-05' }, [], [{ ingredient_id: snack, menge: 100, einheit: 'g' }]);

    legeEssenZutatAkt('a6', '2026-12-04T08:00', kochenKategorie, snack, 150);
    const zutatRes = aggregator.aggregate('2026-12-04', '2026-12-04');

    legeEssenRezeptAkt('a7', '2026-12-05T12:00', kochenKategorie, rezept, 1.5);
    const rezeptRes = aggregator.aggregate('2026-12-05', '2026-12-05');

    expect(wertVon(zutatRes.proNutrient, 'Eiweiß')).toBe(wertVon(rezeptRes.proNutrient, 'Eiweiß'));
  });
});
