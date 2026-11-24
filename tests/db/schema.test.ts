import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NodeDriver } from '../../src/core/db/nodeDriver';
import { applyMigrations, applySeeds } from '../../src/core/db/migrate';
import { loadSteps } from '../../src/core/db/steps';
import { kcalPer100 } from '../../src/core/energy/EnergyCalculator';

const MIG_APP = path.resolve(__dirname, '../../migrations/app');
const MIG_PROFILE = path.resolve(__dirname, '../../migrations/profile');
const SEED_APP = path.resolve(__dirname, '../../seed/app');
const SEED_PROFILE = path.resolve(__dirname, '../../seed/profile');

let tmp: string;
let app: NodeDriver;
let profile: NodeDriver;

const tableNames = (d: NodeDriver) =>
  d.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).map((r) => r.name);

const count = (d: NodeDriver, t: string) =>
  (d.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)[0] ?? { n: -1 }).n;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-db-'));
  app = new NodeDriver(path.join(tmp, 'app.db'));
  profile = new NodeDriver(path.join(tmp, 'p1.db'));

  applyMigrations(app, loadSteps(MIG_APP));
  applySeeds(app, loadSteps(SEED_APP), '0001');
  applyMigrations(profile, loadSteps(MIG_PROFILE));
  applySeeds(profile, loadSteps(SEED_PROFILE), '0001');
});

afterAll(() => {
  app.close();
  profile.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Schema (FA-850, TC-DBC)', () => {
  it('app.db enthaelt genau die 4 zentralen Tabellen', () => {
    expect(tableNames(app).sort()).toEqual(
      ['app_settings', 'db_meta', 'profile_registry', 'provider_consent'].sort(),
    );
  });

  it('Profildatenbank enthaelt 21 Tabellen', () => {
    expect(tableNames(profile).length).toBe(21);
  });

  it('Profildatenbank enthaelt den kcal-View (FA-329)', () => {
    const views = profile.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'view'",
    );
    expect(views).toEqual([{ name: 'v_ingredient_kcal_100' }]);
  });

  it('foreign_key_check ohne Befund (beide DBs)', () => {
    expect(app.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(profile.all('PRAGMA foreign_key_check')).toEqual([]);
  });
});

describe('Seed-Daten (FA-852/853, TC-DBC-04)', () => {
  it('Kataloge sind eingespielt: nutrient=44, category=7, unit_conversion=6, shopping_category=10', () => {
    expect(count(profile, 'nutrient')).toBe(44);
    expect(count(profile, 'category')).toBe(7);
    expect(count(profile, 'unit_conversion')).toBe(6);
    expect(count(profile, 'shopping_category')).toBe(10);
  });

  it('Doppel-Einspielung der Seeds aendert keine Zeilenzahl (Idempotenz)', () => {
    const before = ['category', 'nutrient', 'unit_conversion', 'shopping_category', 'reference_dge']
      .map((t) => count(profile, t));
    applySeeds(profile, loadSteps(SEED_PROFILE), '0001');
    const after = ['category', 'nutrient', 'unit_conversion', 'shopping_category', 'reference_dge']
      .map((t) => count(profile, t));
    expect(after).toEqual(before);
  });

  it('provider_consent: 5 Provider, initial ohne Einwilligung (FA-507/O-8)', () => {
    const rows = app.all<{ provider: string; akzeptiert_am: string | null }>(
      'SELECT provider, akzeptiert_am FROM provider_consent ORDER BY provider',
    );
    expect(rows.map((r) => r.provider)).toEqual(
      ['fddb', 'naehrwertrechner', 'openfoodfacts', 'rewe', 'usda'],
    );
    expect(rows.every((r) => r.akzeptiert_am === null)).toBe(true);
  });

  it('db_meta traegt schema_version und seed_version (FA-850)', () => {
    const meta = app.all<{ schluessel: string; wert: string }>('SELECT schluessel, wert FROM db_meta');
    const kv = new Map(meta.map((r) => [r.schluessel, r.wert]));
    expect(kv.get('schema_version')).toBe('0001');
    expect(kv.get('seed_version')).toBe('0001');
  });
});

describe('kcal-View-Paritaet (FA-329, TC-ENE-01/02, TC-NRM-04)', () => {
  const M = 1_000_000;

  beforeAll(() => {
    profile.run(
      "INSERT INTO ingredient (id, name, basis_einheit) VALUES ('fx-haferflocken', 'Haferflocken', 'g')",
    );
    const vals: Record<string, number> = {
      Eiweiß: 13 * M,
      Kohlenhydrate: 60 * M,
      Fett: 7 * M,
      Ballaststoffe: 8 * M,
    };
    for (const [name, wert] of Object.entries(vals)) {
      profile.run(
        'INSERT INTO ingredient_nutrient (ingredient_id, nutrient_id, wert_normiert_pro_100) ' +
        "VALUES ('fx-haferflocken', (SELECT id FROM nutrient WHERE name = ?), ?)",
        [name, wert],
      );
    }
  });

  it('View und EnergyCalculator liefern identisch 371,0 kcal (mit Ballaststoffen)', () => {
    const row = profile
      .all<{ kcal_pro_100: number }>(
        "SELECT kcal_pro_100 FROM v_ingredient_kcal_100 WHERE ingredient_id = 'fx-haferflocken'",
      )
      .at(0);
    expect(row?.kcal_pro_100).toBe(371);
    expect(kcalPer100({ Eiweiß: 13 * M, Kohlenhydrate: 60 * M, Fett: 7 * M, Ballaststoffe: 8 * M })).toBe(371);
  });

  it('ohne Ballaststoffe: 355,0 kcal (View == Calculator, TC-ENE-01)', () => {
    profile.run(
      "DELETE FROM ingredient_nutrient WHERE ingredient_id = 'fx-haferflocken' " +
      "AND nutrient_id = (SELECT id FROM nutrient WHERE name = 'Ballaststoffe')",
    );
    const row = profile
      .all<{ kcal_pro_100: number }>(
        "SELECT kcal_pro_100 FROM v_ingredient_kcal_100 WHERE ingredient_id = 'fx-haferflocken'",
      )
      .at(0);
    expect(row?.kcal_pro_100).toBe(355);
    expect(kcalPer100({ Eiweiß: 13 * M, Kohlenhydrate: 60 * M, Fett: 7 * M })).toBe(355);
  });
});
