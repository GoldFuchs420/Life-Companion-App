/**
 * fddb.info-Website-Parser (FA-504, Prioritaet 4): Suche liefert Detail-Links,
 * je Detailseite wird die Naehrwert-Tabelle geparst und als Draft vorbereitet
 * (FA-501). Netz nur auf ausdrueckliche Nutzeraktion (FA-508); fehlende
 * Marker -> PARSE_FAILED statt Absturz (FA-503). Fddb nennt Zucker "davon
 * Zucker" (FA-322) \u2013 der Alias landet im Seed-Katalog-Namen.
 */
import {
  AdapterFehler,
  type IngredientDraft,
  type ProviderAdapter,
  type RawResult,
  type SearchQuery,
} from '../proxy/types';
import { draftNutrients, zeileAusWebsite, type NutrientDraft } from './nutrientMap';
import { alleTreffer, htmlUnescape, parseDeZahl } from './htmlParser';

const BASE_URL = 'https://fddb.info';

export class FddbAdapter implements ProviderAdapter {
  readonly id = 'fddb' as const;
  readonly kind = 'website' as const;
  readonly entities = ['ingredient'] as const;

  constructor(private readonly fetchImpl: (url: string) => Promise<string>) {}

  async search(query: SearchQuery): Promise<RawResult[]> {
    const suchseite = await holeText(this.fetchImpl, `${BASE_URL}/db/de/suche/?udd=${encodeURIComponent(query.query)}`);
    const links = alleTreffer(suchseite, /<a class="std" href="([^"]+\/lebensmittel\/[^"]+)">([^<]+)<\/a>/g);
    if (links.length === 0) {
      throw new AdapterFehler('PARSE_FAILED', 'Suchseite von fddb unlesbar (FA-503)');
    }
    const rohe: RawResult[] = [];
    for (const link of links.slice(0, query.limit)) {
      const url = link[1]!;
      const titel = htmlUnescape(link[2] ?? url);
      const detail = await holeText(this.fetchImpl, url);
      rohe.push({
        externalId: externerSchluessel(url),
        name: titel,
        sourceUrl: url,
        payload: { html: detail },
      });
    }
    return rohe;
  }

  toDraft(raw: RawResult): IngredientDraft {
    const html = raw.payload.html;
    if (typeof html !== 'string') {
      throw new AdapterFehler('PARSE_FAILED', 'Detailseite fehlt (FA-503)');
    }
    const titel = titelVon(html);
    const gefundene = new Map<string, NutrientDraft>();
    for (const zeile of alleTreffer(html, /<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)) {
      const name = htmlUnescape(zeile[1] ?? '');
      const [wertText, einheitText] = splitWertEinheit(zeile[2] ?? '');
      const zeileDraft = zeileAusWebsite(name, parseDeZahl(wertText), einheitNormalisiert(einheitText));
      if (zeileDraft) gefundene.set(zeileDraft.nutrientName, zeileDraft);
    }
    if (titel === null || gefundene.size === 0) {
      throw new AdapterFehler('PARSE_FAILED', 'Naehrwert-Tabelle von fddb unlesbar (FA-503)');
    }
    return {
      name: titel,
      basisEinheit: 'g',
      stueckgewichtG: null,
      dichteGProMl: null,
      barcode: null,
      nutrients: draftNutrients(gefundene),
    };
  }
}

function titelVon(html: string): string | null {
  const kopf = /<h2 class="heading1">([^<]+)<\/h2>/.exec(html);
  if (!kopf?.[1]) return null;
  const text = htmlUnescape(kopf[1]);
  const ohnePraefix = text.replace(/^Kalorien für\s*/i, '').trim();
  return ohnePraefix.length > 0 ? ohnePraefix : null;
}

function externerSchluessel(url: string): string {
  const teile = url.split('/').filter((t) => t.length > 0);
  return teile[teile.length - 2] ?? teile[teile.length - 1] ?? 'unbekannt';
}

function splitWertEinheit(zelle: string): [string, string] {
  const m = /^([\d,.]+)\s*(\S+)/.exec(zelle.trim());
  if (!m) return [zelle, ''];
  return [m[1] ?? '', m[2] ?? ''];
}

function einheitNormalisiert(text: string): NutrientDraft['einheit'] | null {
  if (text === 'g' || text === 'mg' || text === '\u00b5g' || text === 'ml') return text;
  return null;
}

export async function holeText(fetchImpl: (url: string) => Promise<string>, url: string): Promise<string> {
  try {
    return await fetchImpl(url);
  } catch {
    throw new AdapterFehler('OFFLINE', 'Website nicht erreichbar (FA-508)');
  }
}
