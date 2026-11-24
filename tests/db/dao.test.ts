import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NodeDriver } from '../../src/core/db/nodeDriver';
import { applyMigrations, applySeeds } from '../../src/core/db/migrate';
import { loadSteps } from '../../src/core/db/steps';
import { IngredientDao } from '../../src/core/dao/IngredientDao';
import { RecipeDao } from '../../src/core/dao/RecipeDao';
import { RecipeRepository } from '../../src/core/repo/RecipeRepository';

const M = 1_000_000;

let tmp: string;
let profile: NodeDriver;
let ingredients: IngredientDao;
let recipes: RecipeDao;
let repo: RecipeRepository;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-dao-'));
  profile = new NodeDriver(path.join(tmp, 'p1.db'));
  applyMigrations(profile, loadSteps(path.resolve(__dirname, '../../migrations/profile')));
  applySeeds(profile, loadSteps(path.resolve(__dirname, '../../seed/profile')), '0001');
  ingredients = new IngredientDao(profile);
  recipes = new RecipeDao(profile);
  repo = new RecipeRepository(profile);
});

afterAll(() => {
  profile.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('IngredientDao (TC-NRM, FA-322)', () => {
  it('legt fx-Haferflocken an: Mikronormierung bleibt erhalten, kcal kommt aus der View', () => {
    const id = ingredients.create(
      { name: 'Haferflocken', basis_einheit: 'g' },
      [
        { nutrient_name: 'Eiweiß', wert_normiert_pro_100: 13 * M, quelle: 'fixture' },
        { nutrient_name: 'Kohlenhydrate', wert_normiert_pro_100: 60 * M, quelle: 'fixture' },
        { nutrient_name: 'Fett', wert_normiert_pro_100: 7 * M, quelle: 'fixture' },
        { nutrient_name: 'Ballaststoffe', wert_normiert_pro_100: 8 * M, quelle: 'fixture' },
      ],
    );
    expect(ingredients.kcalPro100(id)).toBe(371);
    const display = ingredients.nutrientsOf(id);
    expect(display.find((n) => n.nutrient_name === 'Eiweiß')?.einheit).toBe('mg');
    expect(display.find((n) => n.nutrient_name === 'Eiweiß')?.anzeige_pro_100).toBeCloseTo(13000, 6);
  });

  it('Suche per Name und barcode (FA-408-Vorform TC-PRV-UC: Barcode-Feld V1)', () => {
    ingredients.create({ name: 'Karotte', basis_einheit: 'g', stueckgewicht_g: 80, barcode: '4001234567890' });
    expect(ingredients.searchByName('Kar').map((r) => r.name)).toContain('Karotte');
    expect(ingredients.findByBarcode('4001234567890')?.name).toBe('Karotte');
    expect(ingredients.findByBarcode('9999999999999')).toBeNull();
  });

  it('Barcode ist eindeutig (Partial-Unique-Index); mehrere NULL-Barcodes sind erlaubt', () => {
    expect(() => ingredients.create({ name: 'Zweitkarotte', basis_einheit: 'g', barcode: '4001234567890' })).toThrow();
    ingredients.create({ name: 'Ohne Barcode', basis_einheit: 'g' });
    ingredients.create({ name: 'Auch ohne Barcode', basis_einheit: 'g' });
    expect(ingredients.searchByName('Ohne Barcode').length).toBeGreaterThanOrEqual(1);
  });
});

describe('RecipeRepository (FA-300/305/331, TC-UMR-03/08)', () => {
  it('resolviert Zeilen in Basis-Einheiten und zaehlt Unresolved ohne zu Raten', () => {
    const karotte = ingredients.get(ingredients.searchByName('Karotte')[0]!.id)!;
    const mehlId = ingredients.create({ name: 'Mehl', basis_einheit: 'g' });

    const pizzaId = recipes.create(
      { titel: 'Pizza', kalorien_soll_pro_portion: 500 },
      [
        { titel: 'Teig herrichten', dauer_min: 20 },
        { titel: 'Pizza machen', dauer_min: 15 },
      ],
      [
        { ingredient_id: karotte.id, menge: 2, einheit: 'stueck' },
        { ingredient_id: mehlId, menge: 300, einheit: 'g' },
      ],
    );

    const solved = repo.resolveLines(pizzaId);
    expect(solved?.zeilen[0]?.result).toEqual({ menge_basis: 160, einheit_basis: 'g' });
    expect(solved?.zeilen[1]?.result).toEqual({ menge_basis: 300, einheit_basis: 'g' });
    expect(solved?.unresolvedCount).toBe(0);
    const steps = recipes.stepsOf(pizzaId);
    expect(steps.map((s) => s.titel)).toEqual(['Teig herrichten', 'Pizza machen']);
  });

  it('nutzer-Override ueber DAO schlaegt fehlende Seed-Dichte (TC-UMR-08)', () => {
    const mehl = ingredients.get(ingredients.searchByName('Mehl')[0]!.id)!;
    const pizzaId = recipes.create(
      { titel: 'Falsches Brot' },
      [],
      [{ ingredient_id: mehl.id, menge: 1, einheit: 'EL' }],
    );
    expect(repo.resolveLines(pizzaId)?.unresolvedCount).toBe(1);

    ingredients.setUnitOverride(mehl.id, 'EL', 9);
    expect(repo.resolveLines(pizzaId)?.zeilen[0]?.result.menge_basis).toBe(9);

    ingredients.removeUnitOverride(mehl.id, 'EL');
    expect(repo.resolveLines(pizzaId)?.unresolvedCount).toBe(1);
  });

  it('Zeilen auf unbekannte Zutaten sind FK-abgesichert (FA-803)', () => {
    expect(() =>
      recipes.create({ titel: 'Geist' }, [], [{ ingredient_id: 'does-not-exist', menge: 10, einheit: 'g' }]),
    ).toThrow(/FOREIGN KEY/);
  });
});
