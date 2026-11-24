/**
 * Open Food Facts (FA-502, Prioritaet 1): API-Adapter. Fetch ist injizierbar –
 * in Tests laufen Fixtures ohne Netz (FA-854/855); zur Laufzeit globalThis.fetch
 * mit Abort-Timeout. Kein kcal-Rueckvergleich hier (FA-329), Attribution Pflicht (FA-502).
 */
import { AdapterFehler, type Draft, type ProviderAdapter, type RawResult, type SearchQuery } from '../proxy/types';
import { draftNutrients, NUTRIENT_KATALOG, nutrientZeile, type NutrientDefinition } from './nutrientMap';

const BASE_URL = 'https://world.openfoodfacts.org';
export const OFF_ATTRIBUTION = 'Datenquelle: Open Food Facts (lizenz confidential/ODbL)';

export type FetchImpl = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

async function holeText(fetchImpl: FetchImpl, url: string): Promise<string> {
  let res;
  try {
    res = await fetchImpl(url, { signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(15_000) : undefined });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new AdapterFehler('TIMEOUT', 'Read-Timeout beim Provider');
    throw new AdapterFehler('OFFLINE', 'Provider nicht erreichbar (FA-508)');
  }
  if (res.status === 429) throw new AdapterFehler('RATE_LIMITED', 'Provider drosselt');
  if (!res.ok) throw new AdapterFehler('PROVIDER_UNAVAILABLE', `HTTP ${res.status} von Open Food Facts`);
  return res.text();
}

export class OpenFoodFactsAdapter implements ProviderAdapter {
  readonly id = 'openfoodfacts' as const;
  readonly kind = 'api' as const;
  readonly entities = ['ingredient'] as const;
  readonly attribution = OFF_ATTRIBUTION;

  constructor(private readonly fetchImpl: FetchImpl) {}

  async search(query: SearchQuery): Promise<RawResult[]> {
    const url =
      `${BASE_URL}/cgi/search.pl?search_terms=${encodeURIComponent(query.query)}` +
      `&search_simple=1&action=process&json=1&page_size=${query.limit}`;
    const daten = this.parseJson(await holeText(this.fetchImpl, url));
    const products = (daten as { products?: unknown }).products;
    if (!Array.isArray(products)) {
      throw new AdapterFehler('PARSE_FAILED', 'Antwortstruktur von Open Food Facts geaendert (FA-503)');
    }
    return (products as Record<string, unknown>[])
      .filter((p) => typeof (p.product_name ?? p.product_name_de) === 'string')
      .map((p) => this.rawVon(p));
  }

  async lookupBarcode(code: string): Promise<RawResult | null> {
    const daten = this.parseJson(await holeText(this.fetchImpl, `${BASE_URL}/api/v2/product/${encodeURIComponent(code)}.json`));
    const status = (daten as { status?: number }).status;
    if (status !== 1) return null;
    const product = (daten as { product?: Record<string, unknown> }).product;
    if (!product) return null;
    return this.rawVon(product);
  }

  private rawVon(product: Record<string, unknown>): RawResult {
    const code = typeof product.code === 'string' && product.code.length > 0 ? product.code : 'ohne-code';
    const name = String(product.product_name_de ?? product.product_name ?? code);
    return {
      externalId: code,
      name,
      sourceUrl: `${BASE_URL}/product/${encodeURIComponent(code)}`,
      payload: product,
    };
  }

  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      throw new AdapterFehler('PARSE_FAILED', 'Ungueltiges JSON von Open Food Facts (FA-503)');
    }
  }

  toDraft(raw: RawResult): Draft {
    const nutriments = (raw.payload.nutriments ?? {}) as Record<string, unknown>;
    const num = (k: string): number | null => {
      const v = nutriments[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };
    const gef = new Map<string, ReturnType<typeof nutrientZeile>>();
    const hinz = (name: string, wert: number | null, einheit: NutrientDefinition['einheit'] | null) => {
      if (!NUTRIENT_KATALOG[name]) return;
      gef.set(name, nutrientZeile(name, wert, einheit));
    };
    hinz('Eiweiß', num('proteins_100g'), 'g');
    hinz('Fett', num('fat_100g'), 'g');
    hinz('Kohlenhydrate', num('carbohydrates_100g'), 'g');
    hinz('Zucker', num('sugars_100g'), 'g');
    hinz('Ballaststoffe', num('fiber_100g'), 'g');
    hinz('Wasser', num('water_100g'), 'ml');
    hinz('Vitamin C', num('vitamin-c_100g'), 'mg');
    hinz('Vitamin B12', num('vitamin-b12_100g'), 'µg');
    const sodiumG = num('sodium_100g');
    hinz('Natrium', sodiumG != null ? sodiumG * 1000 : null, 'mg');

    return {
      name: raw.name,
      basisEinheit: 'g',
      stueckgewichtG: null,
      dichteGProMl: null,
      barcode: typeof raw.payload.code === 'string' ? raw.payload.code : null,
      nutrients: draftNutrients(gef),
    };
  }
}
