import type { DbDriver } from '../db/driver';
import { makeId } from './ids';

export interface RecipeInput {
  titel: string;
  typ?: 'hauptgericht' | 'beilage' | 'getraenk' | 'snack' | 'sonstiges';
  kalorien_soll_pro_portion?: number | null;
}

export interface RecipeStepInput {
  titel: string;
  beschreibung?: string | null;
  dauer_min?: number;
}

export interface RecipeLineInput {
  ingredient_id: string;
  menge: number;
  einheit: 'g' | 'kg' | 'ml' | 'l' | 'TL' | 'EL' | 'prise' | 'tasse_150' | 'tasse_250' | 'tasse_330' | 'stueck';
}

export type RecipeTyp = NonNullable<RecipeInput['typ']>;

export class RecipeDao {
  constructor(private readonly db: DbDriver) {}

  create(recipe: RecipeInput, steps: RecipeStepInput[] = [], lines: RecipeLineInput[] = []): string {
    const id = makeId();
    this.db.run(
      'INSERT INTO recipe (id, titel, typ, kalorien_soll_pro_portion) VALUES (?, ?, ?, ?)',
      [id, recipe.titel, recipe.typ ?? 'hauptgericht', recipe.kalorien_soll_pro_portion ?? null],
    );
    steps.forEach((s, i) => {
      this.db.run(
        'INSERT INTO recipe_step (recipe_id, laufnummer, titel, beschreibung, dauer_min) VALUES (?, ?, ?, ?, ?)',
        [id, i + 1, s.titel, s.beschreibung ?? null, s.dauer_min ?? 0],
      );
    });
    lines.forEach((l, i) => {
      this.db.run(
        'INSERT INTO recipe_ingredient (recipe_id, zeilen_nr, ingredient_id, menge, einheit) VALUES (?, ?, ?, ?, ?)',
        [id, i + 1, l.ingredient_id, l.menge, l.einheit],
      );
    });
    return id;
  }

  get(id: string) {
    return this.db
      .all<{ id: string; titel: string; typ: RecipeTyp; kalorien_soll_pro_portion: number | null }>(
        'SELECT id, titel, typ, kalorien_soll_pro_portion FROM recipe WHERE id = ?',
        [id],
      )
      .at(0) ?? null;
  }

  stepsOf(id: string) {
    return this.db.all<{ laufnummer: number; titel: string; beschreibung: string | null; dauer_min: number }>(
      'SELECT laufnummer, titel, beschreibung, dauer_min FROM recipe_step WHERE recipe_id = ? ORDER BY laufnummer',
      [id],
    );
  }

  linesOf(id: string) {
    return this.db.all<{ zeilen_nr: number; ingredient_id: string; menge: number; einheit: RecipeLineInput['einheit'] }>(
      'SELECT zeilen_nr, ingredient_id, menge, einheit FROM recipe_ingredient WHERE recipe_id = ? ORDER BY zeilen_nr',
      [id],
    );
  }

  list() {
    return this.db.all<{ id: string; titel: string; typ: RecipeTyp }>(
      'SELECT id, titel, typ FROM recipe ORDER BY titel',
    );
  }
}
