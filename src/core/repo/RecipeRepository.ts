import type { DbDriver } from '../db/driver';
import { IngredientDao } from '../dao/IngredientDao';
import { RecipeDao, type RecipeLineInput } from '../dao/RecipeDao';
import { convert, type ConvertResult, type IngredientUnitOverrideRow, type UnitConversionRow } from '../unit/UnitConverter';

export interface ResolvedLine {
  zeilen_nr: number;
  ingredient_id: string;
  name: string;
  menge_eingabe: number;
  einheit_eingabe: RecipeLineInput['einheit'];
  result: ConvertResult;
}

export interface ResolvedRecipe {
  recipe_id: string;
  titel: string;
  typ: string;
  zeilen: ResolvedLine[];
  /** Anzahl ungelöster Zeilen; > 0 steuert den abbrechbaren Loop (FA-305). */
  unresolvedCount: number;
}

/**
 * Resolviert alle Rezept-Zeilen in Basis-Einheiten (g/ml) und sammelt ungelöste
 * Zeilen statt zu raten (FA-334/FA-800) – Basis des abbrechbaren Validierungs-Loops.
 */
export class RecipeRepository {
  private readonly recipes: RecipeDao;
  private readonly ingredients: IngredientDao;

  constructor(private readonly db: DbDriver) {
    this.recipes = new RecipeDao(db);
    this.ingredients = new IngredientDao(db);
  }

  resolveLines(recipeId: string): ResolvedRecipe | null {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) return null;

    const rows = this.recipes.linesOf(recipeId).map((line) => {
      const ing = this.ingredients.get(line.ingredient_id);
      const info = ing
        ? {
            basis_einheit: ing.basis_einheit,
            stueckgewicht_g: ing.stueckgewicht_g,
            dichte_g_pro_ml: ing.dichte_g_pro_ml,
          }
        : { basis_einheit: 'g' as const, stueckgewicht_g: null, dichte_g_pro_ml: null };
      const result = ing
        ? convert(
            { menge: line.menge, einheit: line.einheit },
            info,
            this.conversionOf(line.einheit),
            this.overridesOf(ing.id),
          )
        : { menge_basis: null, einheit_basis: info.basis_einheit, hinweis: 'Zutat fehlt in der Datenbank' };
      return {
        zeilen_nr: line.zeilen_nr,
        ingredient_id: line.ingredient_id,
        name: ing?.name ?? '(unbekannte Zutat)',
        menge_eingabe: line.menge,
        einheit_eingabe: line.einheit,
        result,
      } satisfies ResolvedLine;
    });

    return {
      recipe_id: recipeId,
      titel: recipe.titel,
      typ: recipe.typ,
      zeilen: rows,
      unresolvedCount: rows.filter((r) => r.result.menge_basis === null).length,
    };
  }

  private conversionOf(einheit: string): UnitConversionRow | null {
    return (
      this.db
        .all<UnitConversionRow>('SELECT einheit, faktor_ml, default_g_faktor_ml FROM unit_conversion WHERE einheit = ?', [einheit])
        .at(0) ?? null
    );
  }

  private overridesOf(ingredientId: string): IngredientUnitOverrideRow[] {
    return this.db.all<IngredientUnitOverrideRow>(
      'SELECT einheit, gramm FROM ingredient_unit_override WHERE ingredient_id = ?',
      [ingredientId],
    );
  }
}
