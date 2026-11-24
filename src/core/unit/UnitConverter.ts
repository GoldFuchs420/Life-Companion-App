/**
 * UnitConverter (FA-330..f, TC-UMR): normiert Rezept-/Einkaufsangaben auf g/ml (FA-330, FA-333).
 * Fehlt eine Umrechnungsgrundlage, wird NICHT gerechnet (FA-334) – es kommt ein
 * unbefriedigtes Ergebnis mit Hinweis zurueck, das UI holt den Wert nach (FA-800).
 */
export interface UnitConversionRow {
  einheit: string;
  faktor_ml: number;
  default_g_faktor_ml: number | null;
}

export interface IngredientUnitOverrideRow {
  einheit: string;
  gramm: number;
}

export interface IngredientConvertInfo {
  basis_einheit: 'g' | 'ml';
  stueckgewicht_g: number | null;
  dichte_g_pro_ml: number | null;
}

export interface ConvertInput {
  menge: number;
  einheit: string;
}

export interface ConvertResult {
  /** null = Umrechnung unmoeglich (FA-334: kein Raten) -> Eingabeaufforderung (FA-800) */
  menge_basis: number | null;
  einheit_basis: 'g' | 'ml';
  hinweis?: string;
}

const VOLUME_EINHEITEN = new Set(['TL', 'EL', 'prise', 'tasse_150', 'tasse_250', 'tasse_330']);
const MASS_EINHEITEN: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME_MASS_EINHEITEN: Record<string, number> = { ml: 1, l: 1000 };

/** Parst deutsche Mengeneingaben inkl. Komma ("1,5" -> 1.5, TC-UMR-06). */
export function parseMenge(raw: string | number): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  const cleaned = raw.trim();
  if (cleaned === '') return null;
  const wert = Number(cleaned.replace(',', '.'));
  return Number.isFinite(wert) && wert > 0 ? wert : null;
}

export function convert(
  input: ConvertInput,
  info: IngredientConvertInfo,
  conversion: UnitConversionRow | null,
  overrides: IngredientUnitOverrideRow[] = [],
): ConvertResult {
  if (!Number.isFinite(input.menge) || input.menge <= 0) {
    return { menge_basis: null, einheit_basis: info.basis_einheit, hinweis: 'Menge fehlt oder ist ungueltig' };
  }

  if (input.einheit in MASS_EINHEITEN) {
    return { menge_basis: input.menge * MASS_EINHEITEN[input.einheit]!, einheit_basis: 'g' };
  }
  if (input.einheit in VOLUME_MASS_EINHEITEN) {
    return { menge_basis: input.menge * VOLUME_MASS_EINHEITEN[input.einheit]!, einheit_basis: 'ml' };
  }

  if (input.einheit === 'stueck') {
    if (info.stueckgewicht_g == null) {
      return { menge_basis: null, einheit_basis: 'g', hinweis: 'Stueckgewicht fehlt – bitte ergaenzen (FA-334)' };
    }
    return { menge_basis: input.menge * info.stueckgewicht_g, einheit_basis: 'g' };
  }

  if (VOLUME_EINHEITEN.has(input.einheit)) {
    if (!conversion) {
      return { menge_basis: null, einheit_basis: info.basis_einheit, hinweis: `Umrechnung fuer "${input.einheit}" fehlt (FA-800)` };
    }
    const menge_ml = input.menge * conversion.faktor_ml;
    if (info.basis_einheit === 'ml') {
      return { menge_basis: menge_ml, einheit_basis: 'ml' };
    }
    const override = overrides.find((o) => o.einheit === input.einheit);
    if (override) {
      return { menge_basis: input.menge * override.gramm, einheit_basis: 'g' };
    }
    if (info.dichte_g_pro_ml != null) {
      return { menge_basis: menge_ml * info.dichte_g_pro_ml, einheit_basis: 'g' };
    }
    if (conversion.default_g_faktor_ml != null) {
      return { menge_basis: menge_ml * conversion.default_g_faktor_ml, einheit_basis: 'g' };
    }
    return { menge_basis: null, einheit_basis: 'g', hinweis: `Keine Dichte/Override fuer "${input.einheit}" – bitte ergaenzen (FA-334)` };
  }

  return { menge_basis: null, einheit_basis: info.basis_einheit, hinweis: `Einheit "${input.einheit}" ist unbekannt (FA-800)` };
}
