/**
 * naehrwertrechner.de-Website-Parser (FA-504, Prioritaet 3): Suchseite mit
 * Detail-Links, Detailseite mit dreispaltiger Tabelle (name/value/unit).
 * Prioritaet direkt hinter OFF, da fddb (FA-502) nur Quellennennung verlangt.
 * Fehlende Marker -> PARSE_FAILED (FA-503), Vorbefuellung als Draft (FA-501).
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
import { holeText } from './fddb';

const BASE_URL = 'https://naehrwertrechner.de';

export class NaehrwertrechnerAdapter implements ProviderAdapter {
  readonly id = 'naehrwertrechner' as const;
  readonly kind = 'website' as const;
  readonly entities = ['ingredient'] as const;

  constructor(private readonly fetchImpl: (url: string) => Promise<string>) {}

  async search(query: SearchQuery): Promise<RawResult[]> {
    const suchseite = await holeText(this.fetchImpl, `${BASE_URL}/suche/?q=${encodeURIComponent(query.query)}`);
    const links = alleTreffer(suchseite, /<a class="result-link" href="([^"]+)">([^<]+)<\/a>/g);
    if (links.length === 0) {
      throw new AdapterFehler('PARSE_FAILED', 'Suchseite von naehrwertrechner unlesbar (FA-503)');
    }
    const rohe: RawResult[] = [];
    for (const link of links.slice(0, query.limit)) {
      const pfad = link[1] ?? '';
      const url = pfad.startsWith('http') ? pfad : `${BASE_URL}${pfad}`;
      const detail = await holeText(this.fetchImpl, url);
      rohe.push({
        externalId: externerSchluessel(url),
        name: htmlUnescape(link[2] ?? url),
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
    const titelHtml = /<h1>([^<]+)<\/h1>/.exec(html);
    const gefundene = new Map<string, NutrientDraft>();
    for (const zeile of alleTreffer(
      html,
      /<tr><td class="name">([^<]+)<\/td><td class="value">([^<]+)<\/td><td class="unit">([^<]+)<\/td><\/tr>/g,
    )) {
      const name = htmlUnescape(zeile[1] ?? '');
      const zeileDraft = zeileAusWebsite(
        name,
        parseDeZahl(zeile[2] ?? ''),
        einheitNormalisiert(htmlUnescape(zeile[3] ?? '')),
      );
      if (zeileDraft) gefundene.set(zeileDraft.nutrientName, zeileDraft);
    }
    if (titelHtml === null || gefundene.size === 0) {
      throw new AdapterFehler('PARSE_FAILED', 'Naehrwert-Tabelle von naehrwertrechner unlesbar (FA-503)');
    }
    const name = htmlUnescape(titelHtml[1] ?? '');
    if (name.length === 0) {
      throw new AdapterFehler('PARSE_FAILED', 'Titel der Detailseite unlesbar (FA-503)');
    }
    return {
      name,
      basisEinheit: 'g',
      stueckgewichtG: null,
      dichteGProMl: null,
      barcode: null,
      nutrients: draftNutrients(gefundene),
    };
  }
}

function externerSchluessel(url: string): string {
  const teile = url.split('/').filter((t) => t.length > 0);
  const letzter = teile[teile.length - 1] ?? 'unbekannt';
  return letzter.replace(/\.html$/, '');
}

function einheitNormalisiert(text: string): NutrientDraft['einheit'] | null {
  if (text === 'g' || text === 'mg' || text === '\u00b5g' || text === 'ml') return text;
  return null;
}
