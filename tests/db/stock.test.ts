import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NodeDriver } from '../../src/core/db/nodeDriver';
import { applyMigrations, applySeeds } from '../../src/core/db/migrate';
import { loadSteps } from '../../src/core/db/steps';
import { IngredientDao } from '../../src/core/dao/IngredientDao';
import { StockRepository } from '../../src/core/stock/StockRepository';

let tmp: string;
let profile: NodeDriver;
let ingredients: IngredientDao;
let stock: StockRepository;
let karotte: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-stock-'));
  profile = new NodeDriver(path.join(tmp, 'p1.db'));
  applyMigrations(profile, loadSteps(path.resolve(__dirname, '../../migrations/profile')));
  applySeeds(profile, loadSteps(path.resolve(__dirname, '../../seed/profile')), '0001');
  ingredients = new IngredientDao(profile);
  stock = new StockRepository(profile);
  karotte = ingredients.create({ name: 'Karotte (Stock)', basis_einheit: 'g', stueckgewicht_g: 80 });
});

afterAll(() => {
  profile.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('FIFO (FA-401, TC-FIF-01/02)', () => {
  it('TC-FIF-01: 500 g + 300 g, Verbrauch 600 g -> 500/100 Zuteilung, Rest 200', () => {
    stock.createPurchase({ datum: '2026-10-12' }, [{ ingredient_id: karotte, menge: 500, einheit: 'g' }]);
    stock.createPurchase({ datum: '2026-10-19' }, [{ ingredient_id: karotte, menge: 300, einheit: 'g' }]);

    const res = stock.verbrauche(karotte, 600, '2026-10-20');
    expect(res.deckungsluecke).toBe(0);
    expect(res.zuteilungen.map((z) => z.menge)).toEqual([500, 100]);

    const bestand = stock.bestand(karotte);
    expect(bestand.map((b) => b.rest)).toEqual([200]);
  });

  it('TC-FIF-02: Verbrauch > Bestand -> Deckungsluecke angezeigt, Bestand bleibt 0 (nie negativ)', () => {
    const res = stock.verbrauche(karotte, 1000, '2026-10-21');
    expect(res.zuteilungen.map((z) => z.menge)).toEqual([200]);
    expect(res.deckungsluecke).toBe(800);

    const bestand = stock.bestand(karotte);
    expect(bestand.length).toBe(0);
  });

  it('TC-FIF-01 (kg-Normierung): 1 kg Einkauf wird intern auf 1000 g normalisiert (FA-333)', () => {
    const zucker = ingredients.create({ name: 'Zucker (Stock)', basis_einheit: 'g' });
    stock.createPurchase({ datum: '2026-10-12' }, [{ ingredient_id: zucker, menge: 1, einheit: 'kg', preis: 1.29 }]);
    const bestand = stock.bestand(zucker);
    expect(bestand[0]?.menge_basis).toBe(1000);
    expect(bestand[0]?.einheit).toBe('g');
  });
});

describe('MHD-Warnliste (FA-404, TC-FIF-04)', () => {
  it('läuft in 3 Tagen ab / abgelaufen / kein MHD -> nur zwei Warnungen', () => {
    const a = ingredients.create({ name: 'Joghurt (MHD-3)', basis_einheit: 'g' });
    const b = ingredients.create({ name: 'Milch (MHD-alt)', basis_einheit: 'ml' });
    const c = ingredients.create({ name: 'Nudeln (kein MHD)', basis_einheit: 'g' });

    stock.createPurchase({ datum: '2026-10-12' }, [{ ingredient_id: a, menge: 500, einheit: 'g', mhd: '2026-10-23' }]);
    stock.createPurchase({ datum: '2026-10-12' }, [{ ingredient_id: b, menge: 1000, einheit: 'ml', mhd: '2026-10-19' }]);
    stock.createPurchase({ datum: '2026-10-12' }, [{ ingredient_id: c, menge: 500, einheit: 'g', mhd: null }]);

    const warnungen = stock.mhdWarnungen('2026-10-20', 3);
    const namen = warnungen.map((w) => w.name);
    expect(namen).toContain('Joghurt (MHD-3)');
    expect(warnungen.find((w) => w.name === 'Joghurt (MHD-3)')?.art).toBe('laeuft_bald_ab');
    expect(warnungen.find((w) => w.name === 'Milch (MHD-alt)')?.art).toBe('abgelaufen');
    expect(namen).not.toContain('Nudeln (kein MHD)');
  });
});
