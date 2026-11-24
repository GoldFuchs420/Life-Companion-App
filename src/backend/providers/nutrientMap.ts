/**
 * Mapping-Basis der Provider-Adapter (FA-322/FA-504): Namen laut Seed-Katalog,
 * interne Speicherung µg-normiert pro 100 g/ml. Draft-Stufen laut proxy-api.md
 * ('pflichtkern'/'empfohlen'); kcal rechnet hier niemand (FA-329).
 */
import type { NutrientDraft } from '../proxy/types';
export type { NutrientDraft };

export interface NutrientDefinition {
  /** Anzeigeeinheit beim Provider-Normalfall (g|mg|µg|ml). */
  einheit: 'g' | 'mg' | 'µg' | 'ml';
  stufe: 'pflichtkern' | 'empfohlen' | 'optional';
  normfaktor_nach_µg: number;
}

export const PFLICHTKERN: readonly string[] = ['Eiweiß', 'Fett', 'Kohlenhydrate', 'Zucker', 'Ballaststoffe', 'Wasser'];

const werte = (einheit: NutrientDefinition['einheit'], stufe: NutrientDefinition['stufe'], faktor: number): NutrientDefinition =>
  ({ einheit, stufe, normfaktor_nach_µg: faktor });

/** Spiegel des Seed-Katalogs (seed/profile/002_nutrients.sql) für die von Providern gemeldeten Stoffe. */
export const NUTRIENT_KATALOG: Record<string, NutrientDefinition> = {
  'Eiweiß': werte('g', 'pflichtkern', 1_000_000),
  'Fett': werte('g', 'pflichtkern', 1_000_000),
  'Kohlenhydrate': werte('g', 'pflichtkern', 1_000_000),
  'Zucker': werte('g', 'pflichtkern', 1_000_000),
  'Ballaststoffe': werte('g', 'pflichtkern', 1_000_000),
  'Wasser': werte('ml', 'pflichtkern', 1),
  'Vitamin A': werte('µg', 'empfohlen', 1),
  'Vitamin D': werte('µg', 'empfohlen', 1),
  'Vitamin E': werte('mg', 'empfohlen', 1_000),
  'Vitamin K': werte('µg', 'empfohlen', 1),
  'Vitamin C': werte('mg', 'empfohlen', 1_000),
  'Vitamin B1': werte('mg', 'empfohlen', 1_000),
  'Vitamin B2': werte('mg', 'empfohlen', 1_000),
  'Vitamin B3': werte('mg', 'empfohlen', 1_000),
  'Vitamin B6': werte('mg', 'empfohlen', 1_000),
  'Folsäure': werte('µg', 'empfohlen', 1),
  'Vitamin B12': werte('µg', 'empfohlen', 1),
  'Biotin': werte('µg', 'empfohlen', 1),
  'Pantothensäure': werte('mg', 'empfohlen', 1_000),
  'Natrium': werte('mg', 'empfohlen', 1_000),
  'Kalium': werte('mg', 'empfohlen', 1_000),
  'Calcium': werte('mg', 'empfohlen', 1_000),
  'Magnesium': werte('mg', 'empfohlen', 1_000),
  'Phosphor': werte('mg', 'empfohlen', 1_000),
  'Chlorid': werte('mg', 'empfohlen', 1_000),
  'Schwefel': werte('mg', 'empfohlen', 1_000),
  'Eisen': werte('mg', 'empfohlen', 1_000),
  'Zink': werte('mg', 'empfohlen', 1_000),
  'Jod': werte('µg', 'empfohlen', 1),
  'Selen': werte('µg', 'empfohlen', 1),
  'Kupfer': werte('mg', 'empfohlen', 1_000),
};

/** Draft-Zeile µg-normiert aus Provider-Angabe (wert in der mitgegebenen Einheit). */
export function nutrientZeile(
  name: string,
  wert: number | null,
  providerEinheit: NutrientDefinition['einheit'] | null,
): NutrientDraft {
  const def = NUTRIENT_KATALOG[name];
  if (!def) {
    throw new Error(`Unbekannter Naehrstoff im Katalog: ${name}`);
  }
  const einheit = providerEinheit ?? def.einheit;
  const angegeben = wert != null && Number.isFinite(wert);
  return {
    nutrientName: name,
    wertNormiertPro100: angegeben ? Math.round(wert! * def.normfaktor_nach_µg) : null,
    einheit: def.einheit,
    stufe: def.stufe,
    angegeben,
  };
}

/** Pflichtkern ist immer vollstaendig vorhanden – Luecken als angegeben=false (FA-800 in der Maske). */
export function pflichtkernZeilen(gefundene: Map<string, NutrientDraft>): NutrientDraft[] {
  return PFLICHTKERN.map((name) => gefundene.get(name) ?? nutrientZeile(name, null, null));
}

/** Draft-Zeilen: Pflichtkern vollstaendig, gemeldete Empfohlene hinten dran. */
export function draftNutrients(gefundene: Map<string, NutrientDraft>): NutrientDraft[] {
  const rest = [...gefundene.values()].filter(
    (z) => z.stufe !== 'pflichtkern' && !PFLICHTKERN.includes(z.nutrientName),
  );
  return [...pflichtkernZeilen(gefundene), ...rest];
}

/** Website-Zeilenbezeichner (fddb "davon Zucker") -> Seed-Katalogname (FA-322). */
export const ZEILEN_ALIAS: Record<string, string> = {
  'davon Zucker': 'Zucker',
  'Kohlenhydrate, davon Zucker': 'Zucker',
  'Ballaststoffe': 'Ballaststoffe',
  'Eiweiß': 'Eiweiß',
  'Protein': 'Eiweiß',
  'Fett': 'Fett',
  'Kohlenhydrate': 'Kohlenhydrate',
  'Wasser': 'Wasser',
  'Vitamin A': 'Vitamin A',
  'Vitamin D': 'Vitamin D',
  'Vitamin E': 'Vitamin E',
  'Vitamin K': 'Vitamin K',
  'Vitamin C': 'Vitamin C',
  'Vitamin B1': 'Vitamin B1',
  'Vitamin B2': 'Vitamin B2',
  'Vitamin B3': 'Vitamin B3',
  'Vitamin B6': 'Vitamin B6',
  'Folsäure': 'Folsäure',
  'Vitamin B12': 'Vitamin B12',
  'Biotin': 'Biotin',
  'Pantothensäure': 'Pantothensäure',
  'Natrium': 'Natrium',
  'Kalium': 'Kalium',
  'Calcium': 'Calcium',
  'Magnesium': 'Magnesium',
  'Phosphor': 'Phosphor',
  'Chlorid': 'Chlorid',
  'Schwefel': 'Schwefel',
  'Eisen': 'Eisen',
  'Zink': 'Zink',
  'Jod': 'Jod',
  'Selen': 'Selen',
  'Kupfer': 'Kupfer',
};

/** Draft-Zeile aus einer Website-Tabellenzelle ("13,7 g"); Zeile ohne Katalognamen -> null (FA-800: Hinweis in der Maske). */
export function zeileAusWebsite(
  zeilenName: string,
  wert: number | null,
  einheit: NutrientDefinition['einheit'] | null,
): NutrientDraft | null {
  const katalogname = ZEILEN_ALIAS[zeilenName.trim()];
  if (!katalogname) return null;
  return nutrientZeile(katalogname, wert, einheit);
}
