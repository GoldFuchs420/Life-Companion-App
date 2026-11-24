/**
 * PortionCalculator (FA-302/303/610, TC-POR): skaliert Rezept-Zeilen und
 * Nährwerte auf die gewählte Portionszahl (Teilportionen erlaubt, FA-610).
 * kcal-Soll 400–600 ist reine Referenz/Display, nie eine Sperre (FA-302, TC-POR-03).
 */
import { roundKcal } from '../energy/EnergyCalculator';

export interface RecipeLineBasis {
  menge_basis: number;
  einheit_basis: 'g' | 'ml';
  kcal_pro_100: number;
}

export interface KcalReferenz {
  imBereich: boolean;
  text: string;
}

/** kcal je Portion; portionen <= 0 -> null (Eingabeaufforderung, FA-800), kein Absturz. */
export function kcalProPortion(
  zeilen: RecipeLineBasis[],
  portionen: number,
): number | null {
  if (!Number.isFinite(portionen) || portionen <= 0) return null;
  const gesamt = zeilen.reduce((summe, z) => summe + (z.menge_basis / 100) * z.kcal_pro_100, 0);
  return roundKcal(gesamt / portionen);
}

/** skaliert einen Nährwert/Zeilenmenge auf N Portionen (x4, x0,5 …). */
export function skaliere(
  wert: number,
  portionen: number,
): number {
  return wert * portionen;
}

/** FA-302: 400–600 kcal Referenz-Hinweis – nur Anzeige (TC-POR-03). */
export function kcalReferenzHinweis(kcal: number | null): KcalReferenz {
  if (kcal == null) return { imBereich: false, text: 'kcal fehlen – Zutaten ergänzen (FA-800)' };
  const imBereich = kcal >= 400 && kcal <= 600;
  return {
    imBereich,
    text: imBereich ? `${kcal} kcal – im Referenzbereich (400–600)` : `${kcal} kcal – außerhalb des Referenzbereichs (400–600), nur Hinweis`,
  };
}
