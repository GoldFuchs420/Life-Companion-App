import type { DbDriver } from '../db/driver';
import { makeId } from './ids';

export interface IngredientInput {
  name: string;
  basis_einheit: 'g' | 'ml';
  stueckgewicht_g?: number | null;
  dichte_g_pro_ml?: number | null;
  barcode?: string | null;
}

export interface NutrientValueInput {
  nutrient_name: string;
  wert_normiert_pro_100: number;
  quelle?: string | null;
}

export interface NutrientDisplay {
  nutrient_name: string;
  einheit: 'mg' | 'µg' | 'ml';
  stufe: 'pflicht' | 'empfohlen' | 'optional';
  /** Anzeigewert je 100 g/ml in der Einheit des Naehrstoffs (FA-322). */
  anzeige_pro_100: number;
}

export class IngredientDao {
  constructor(private readonly db: DbDriver) {}

  create(input: IngredientInput, nutrientValues: NutrientValueInput[] = []): string {
    const id = makeId();
    this.db.run(
      'INSERT INTO ingredient (id, name, basis_einheit, stueckgewicht_g, dichte_g_pro_ml, barcode) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
      [id, input.name, input.basis_einheit, input.stueckgewicht_g ?? null, input.dichte_g_pro_ml ?? null, input.barcode ?? null],
    );
    for (const nv of nutrientValues) {
      if (Number.isFinite(nv.wert_normiert_pro_100) && nv.wert_normiert_pro_100 >= 0) {
        this.db.run(
          'INSERT INTO ingredient_nutrient (ingredient_id, nutrient_id, wert_normiert_pro_100, quelle) ' +
          'VALUES (?, (SELECT id FROM nutrient WHERE name = ?), ?, ?)',
          [id, nv.nutrient_name, nv.wert_normiert_pro_100, nv.quelle ?? null],
        );
      }
    }
    return id;
  }

  searchByName(query: string) {
    return this.db.all<{ id: string; name: string; basis_einheit: 'g' | 'ml' }>(
      'SELECT id, name, basis_einheit FROM ingredient WHERE name LIKE ? ORDER BY name',
      [`%${query}%`],
    );
  }

  findByBarcode(barcode: string) {
    return this.db
      .all<{ id: string; name: string }>(
        'SELECT id, name FROM ingredient WHERE barcode = ?',
        [barcode],
      )
      .at(0) ?? null;
  }

  get(id: string) {
    return this.db
      .all<{ id: string; name: string; basis_einheit: 'g' | 'ml'; stueckgewicht_g: number | null; dichte_g_pro_ml: number | null }>(
        'SELECT id, name, basis_einheit, stueckgewicht_g, dichte_g_pro_ml FROM ingredient WHERE id = ?',
        [id],
      )
      .at(0) ?? null;
  }

  nutrientsOf(id: string): NutrientDisplay[] {
    return this.db.all<{ nutrient_name: string; einheit: 'mg' | 'µg' | 'ml'; stufe: 'pflicht' | 'empfohlen' | 'optional'; normfaktor: number; wert: number }>(
      'SELECT n.name AS nutrient_name, n.einheit, n.stufe, n.normfaktor_nach_µg AS normfaktor, inr.wert_normiert_pro_100 AS wert ' +
      'FROM ingredient_nutrient inr JOIN nutrient n ON n.id = inr.nutrient_id ' +
      'WHERE inr.ingredient_id = ? ORDER BY n.stufe, n.name',
      [id],
    ).map((r) => ({
      nutrient_name: r.nutrient_name,
      einheit: r.einheit,
      stufe: r.stufe,
      anzeige_pro_100: r.wert / r.normfaktor,
    }));
  }

  /** kcal je 100 g/ml aus der View (FA-329); liefert 0.0, wenn keine Makros erfasst sind. */
  kcalPro100(id: string): number {
    return this.db
      .all<{ kcal_pro_100: number }>('SELECT kcal_pro_100 FROM v_ingredient_kcal_100 WHERE ingredient_id = ?', [id])
      .at(0)?.kcal_pro_100 ?? 0;
  }

  setUnitOverride(id: string, einheit: string, gramm: number): void {
    this.db.run(
      'INSERT INTO ingredient_unit_override (ingredient_id, einheit, gramm) VALUES (?, ?, ?) ' +
      'ON CONFLICT(ingredient_id, einheit) DO UPDATE SET gramm = excluded.gramm',
      [id, einheit, gramm],
    );
  }

  removeUnitOverride(id: string, einheit: string): void {
    this.db.run('DELETE FROM ingredient_unit_override WHERE ingredient_id = ? AND einheit = ?', [id, einheit]);
  }
}
