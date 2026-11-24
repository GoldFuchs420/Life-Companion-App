/**
 * USDA FoodData Central (FA-504, Prioritaet 2): API-Adapter mit API-Key aus
 * der Backend-Config (nie in der App-DB, O-3). Ohne Key strukturiert
 * PROVIDER_UNAVAILABLE statt stiller Fallback (FA-800). Werte kommen per 100 g
 * mit unitName g/mg/\u00b5g \u2013 vor der Normierung in die Anzeigeeinheit des
 * Seed-Katalogs umrechnen (intern \u00b5g-normiert, FA-322).
 */
import {
  AdapterFehler,
  type IngredientDraft,
  type ProviderAdapter,
  type RawResult,
  type SearchQuery,
} from '../proxy/types';
import { draftNutrients, NUTRIENT_KATALOG, type NutrientDraft, type NutrientDefinition } from './nutrientMap';

const BASE_URL = 'https://api.nal.usda.gov';
export const USDA_ATTRIBUTION = 'Datenquelle: USDA FoodData Central';

/** USDA-Naehrstoffname -> Seed-Katalogname (FA-322). */
const USDA_MAP: Record<string, string> = {
  'Protein': 'Eiwei\u00df',
  'Total lipid (fat)': 'Fett',
  'Carbohydrate, by difference': 'Kohlenhydrate',
  'Sugars': 'Zucker',
  'Fiber, total dietary': 'Ballaststoffe',
  'Water': 'Wasser',
  'Sodium, Na': 'Natrium',
  'Potassium, K': 'Kalium',
  'Calcium, Ca': 'Calcium',
  'Magnesium, Mg': 'Magnesium',
  'Iron, Fe': 'Eisen',
  'Zinc, Zn': 'Zink',
  'Vitamin C, total ascorbic acid': 'Vitamin C',
};

/** Wert der USDA-Einheit in die Anzeigeeinheit des Katalogs (g<->mg/\u00b5g). */
function inAnzeigeEinheit(
  wert: number,
  von: NutrientDefinition['einheit'],
  nach: NutrientDefinition['einheit'],
): number {
  if (von === nach) return wert;
  if (von === 'g') return wert / 1000;
  if (nach === 'g') return wert * 1000;
  return wert;
}

export class UsdaAdapter implements ProviderAdapter {
  readonly id = 'usda' as const;
  readonly kind = 'api' as const;
  readonly entities = ['ingredient'] as const;
  readonly attribution = USDA_ATTRIBUTION;

  constructor(
    private readonly fetchImpl: (url: string, init?: { signal?: AbortSignal }) => Promise<{
      ok: boolean;
      status: number;
      text: () => Promise<string>;
    }>,
    private readonly apiKey: string | null,
  ) {}

  async search(query: SearchQuery): Promise<RawResult[]> {
    if (!this.apiKey) {
      throw new AdapterFehler('PROVIDER_UNAVAILABLE', 'USDA API-Key fehlt (Backend-Config)');
    }
    const url =
      `${BASE_URL}/fdc/v1/foods/search?api_key=${encodeURIComponent(this.apiKey)}` +
      `&query=${encodeURIComponent(query.query)}&pageSize=${query.limit}`;
    const daten = this.jsonAus(await this.lade(url));
    const foods = (daten as { foods?: unknown }).foods;
    if (!Array.isArray(foods)) {
      throw new AdapterFehler('PARSE_FAILED', 'Antwortstruktur der USDA-API geaendert (FA-503)');
    }
    return (foods as Record<string, unknown>[]).map((food) => {
      const id = String(food.fdcId ?? 'ohne-id');
      const beschreibung = typeof food.description === 'string' ? food.description : id;
      return {
        externalId: id,
        name: beschreibung,
        sourceUrl: `${BASE_URL}/fdc-food.html#${encodeURIComponent(id)}`,
        payload: food,
      } satisfies RawResult;
    });
  }

  toDraft(raw: RawResult): IngredientDraft {
    const gefundene = new Map<string, NutrientDraft>();
    const nutrients = raw.payload.foodNutrients;
    if (!Array.isArray(nutrients)) {
      throw new AdapterFehler('PARSE_FAILED', 'foodNutrients fehlen (FA-503)');
    }
    for (const eintrag of nutrients as Record<string, unknown>[]) {
      const usdaName = typeof eintrag.nutrientName === 'string' ? eintrag.nutrientName : '';
      const katalogname = USDA_MAP[usdaName];
      if (!katalogname) continue;
      const def = NUTRIENT_KATALOG[katalogname];
      const wert = typeof eintrag.value === 'number' && Number.isFinite(eintrag.value) ? eintrag.value : null;
      const unitName = einheitNormalisiert(eintrag.unitName);
      if (!def || wert == null) continue;
      const wertInAnzeige = inAnzeigeEinheit(wert, einheitNormalisiert(unitName) ?? def.einheit, def.einheit);
      gefundene.set(katalogname, {
        nutrientName: katalogname,
        wertNormiertPro100: Math.round(wertInAnzeige * def.normfaktor_nach_\u00b5g),
        einheit: def.einheit,
        stufe: def.stufe,
        angegeben: true,
      });
    }
    const gtin = raw.payload.gtinUpc;
    return {
      name: raw.name,
      basisEinheit: 'g',
      stueckgewichtG: null,
      dichteGProMl: null,
      barcode: typeof gtin === 'string' && gtin.length > 0 ? gtin : null,
      nutrients: draftNutrients(gefundene),
    };
  }

  private async lade(url: string): Promise<string> {
    let res;
    try {
      res = await this.fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') throw new AdapterFehler('TIMEOUT', 'Read-Timeout bei der USDA-API');
      throw new AdapterFehler('OFFLINE', 'USDA-API nicht erreichbar (FA-508)');
    }
    if (res.status === 429) throw new AdapterFehler('RATE_LIMITED', 'USDA drosselt');
    if (!res.ok) throw new AdapterFehler('PROVIDER_UNAVAILABLE', `HTTP ${res.status} von der USDA-API`);
    return res.text();
  }

  private jsonAus(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      throw new AdapterFehler('PARSE_FAILED', 'Ungueltiges JSON von der USDA-API (FA-503)');
    }
  }
}

function einheitNormalisiert(text: unknown): NutrientDraft['einheit'] | null {
  if (typeof text !== 'string') return null;
  const klein = text.trim().toLowerCase();
  if (klein === 'g') return 'g';
  if (klein === 'mg') return 'mg';
  if (klein === 'ug' || klein === '\u00b5g' || klein === '\u03bcg') return '\u00b5g';
  if (klein === 'ml') return 'ml';
  return null;
}
