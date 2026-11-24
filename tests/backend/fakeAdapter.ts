/**
 * Fake-Adapter fuer Contract-Tests (kein Netz, FA-854): schaltet per `modus`
 * zwischen OK-/Fehlerpfaden; `aufrufe` erlaubt die Pruefung, dass es keinen
 * Hintergrund-Verkehr gibt (TC-API-08) und dass Widerruf keinen Abruf kostet (TC-API-06).
 */
import { AdapterFehler, type EntityKind, type ProviderAdapter, type ProviderId, type RawResult, type SearchQuery, type IngredientDraft, type RecipeDraft, type Draft } from '../../src/backend/proxy/types';

export type FakeModus = 'ok' | 'offline' | 'timeout' | 'parse' | 'rate' | 'leer' | 'unavailable';

export class FakeAdapter implements ProviderAdapter {
  modus: FakeModus = 'ok';
  aufrufe = 0;

  constructor(
    readonly id: ProviderId,
    readonly kind: ProviderAdapter['kind'],
    readonly entities: readonly EntityKind[],
  ) {}

  async search(query: SearchQuery): Promise<RawResult[]> {
    this.aufrufe++;
    if (this.modus === 'offline') throw new AdapterFehler('OFFLINE', 'Kein Netz / Flugmodus (FA-508)');
    if (this.modus === 'timeout') throw new AdapterFehler('TIMEOUT', 'Read-Timeout beim Provider');
    if (this.modus === 'parse') throw new AdapterFehler('PARSE_FAILED', 'Antwort nicht mehr parsbar (Selektor geaendert, FA-503)');
    if (this.modus === 'rate') throw new AdapterFehler('RATE_LIMITED', 'Provider drosselt');
    if (this.modus === 'unavailable') throw new AdapterFehler('PROVIDER_UNAVAILABLE', 'API/Website nicht erreichbar');
    if (this.modus === 'leer') return [];
    return [this.raw(query.query)];
  }

  async lookupBarcode(code: string): Promise<RawResult | null> {
    this.aufrufe++;
    if (this.modus !== 'ok') return null;
    if (code === '0000000000000') return null;
    return this.raw(`ean-${code}`);
  }

  private raw(externalKey: string): RawResult {
    return {
      externalId: externalKey.toLowerCase().replace(/\s+/g, '-'),
      name: `Fake-Treffer fuer "${externalKey}"`,
      sourceUrl: `https://example.test/${this.id}/${encodeURIComponent(externalKey)}`,
      payload: {},
    };
  }

  toDraft(raw: RawResult): Draft {
    if (this.entities.includes('recipe')) {
      const draft: RecipeDraft = {
        name: raw.name,
        typ: 'Hauptgericht',
        portionen: 1,
        steps: [{ laufnummer: 1, titel: 'Zubereitung', dauerMin: 20 }],
        ingredients: [
          { rohText: '1 Tasse Haferflocken', menge: 1, einheit: 'Tasse', resolved: null, suggestion: null },
        ],
        providerKcal: 372,
        providerKcalHinweis: 'nur Rueckvergleich, nie gespeichert (FA-329)',
      };
      return draft;
    }
    const draft: IngredientDraft = {
      name: raw.name,
      basisEinheit: 'g',
      stueckgewichtG: null,
      dichteGProMl: null,
      barcode: null,
      nutrients: [
        { nutrientName: 'Eiwei\u00df', wertNormiertPro100: 13_700_000, einheit: 'g', stufe: 'pflichtkern', angegeben: true },
        { nutrientName: 'Fett', wertNormiertPro100: 7_000_000, einheit: 'g', stufe: 'pflichtkern', angegeben: true },
        { nutrientName: 'Kohlenhydrate', wertNormiertPro100: 60_000_000, einheit: 'g', stufe: 'pflichtkern', angegeben: true },
        { nutrientName: 'davon Zucker', wertNormiertPro100: 1_000_000, einheit: 'g', stufe: 'pflichtkern', angegeben: true },
        { nutrientName: 'Ballaststoffe', wertNormiertPro100: 10_000_000, einheit: 'g', stufe: 'pflichtkern', angegeben: true },
        { nutrientName: 'Wasser', wertNormiertPro100: 9_000_000, einheit: 'ml', stufe: 'pflichtkern', angegeben: true },
        { nutrientName: 'Vitamin B12', wertNormiertPro100: null, einheit: '\u00b5g', stufe: 'empfohlen', angegeben: false },
      ],
    };
    return draft;
  }
}
