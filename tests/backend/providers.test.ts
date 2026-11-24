/**
 * TC-PRV-01..06 (docs/testkatalog.md, Gruppe PRV): Adapter mit Fixtures statt
 * Netz (FA-854/855), Golden-Drafts pro Provider, PARSE_FAILED bei unlesbaren
 * Seiten (FA-503), Attributions-/Quellpflicht (FA-502), Barcode uber OFF
 * (FA-410), Host-Whitelist pro Adapter (FA-508).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { erzeugeStandardAdapter, OFF_ATTRIBUTION, PROVIDER_HOSTS, USDA_ATTRIBUTION } from '../../src/backend/providers';
import { FddbAdapter } from '../../src/backend/providers/fddb';
import { NaehrwertrechnerAdapter } from '../../src/backend/providers/naehrwertrechner';
import { OpenFoodFactsAdapter, type FetchImpl } from '../../src/backend/providers/openfoodfacts';
import { ReweAdapter } from '../../src/backend/providers/rewe';
import { UsdaAdapter } from '../../src/backend/providers/usda';
import { AdapterFehler } from '../../src/backend/proxy/types';

const fixDir = join(__dirname, '../fixtures/provider');
const lies = (rel: string): string => readFileSync(join(fixDir, rel), 'utf-8');

interface Aufzeichnung {
  stub: FetchImpl;
  urls: string[];
}

function erzeugeFetch(zuordnung: (url: string) => string): Aufzeichnung {
  const urls: string[] = [];
  const stub: FetchImpl = (url) => {
    urls.push(url);
    const inhalt = lies(zuordnung(url));
    return Promise.resolve({ ok: true, status: 200, text: async () => inhalt });
  };
  return { stub, urls };
}

function erzeugeHttpFetch(zuordnung: (url: string) => { status: number; inhalt: string }): Aufzeichnung {
  const urls: string[] = [];
  const stub: FetchImpl = (url) => {
    urls.push(url);
    const { status, inhalt } = zuordnung(url);
    return Promise.resolve({ ok: status >= 200 && status < 300, status, text: async () => inhalt });
  };
  return { stub, urls };
}

const query = { query: 'haferflocken', limit: 5, locale: 'de-DE', allowCache: false };

function golden(name: string): unknown {
  return JSON.parse(lies(name)) as unknown;
}

describe('TC-PRV-01: Golden-Drafts je Provider (Fixtures statt Netz)', () => {
  it('Open Food Facts Suche', async () => {
    const adapter = new OpenFoodFactsAdapter(erzeugeFetch(() => 'openfoodfacts/search-haferflocken.json').stub);
    const rohe = await adapter.search(query);
    expect(rohe.length).toBe(1);
    expect(adapter.toDraft(rohe[0]!)).toEqual(golden('golden-off-ingredient.json'));
  });

  it('Open Food Facts Barcode', async () => {
    const adapter = new OpenFoodFactsAdapter(erzeugeFetch(() => 'openfoodfacts/barcode-4006381333931.json').stub);
    const roh = await adapter.lookupBarcode('4006381333931');
    expect(roh).not.toBeNull();
    expect(adapter.toDraft(roh!)).toEqual(golden('golden-off-barcode.json'));
  });

  it('USDA FoodData Central', async () => {
    const adapter = new UsdaAdapter(erzeugeFetch(() => 'usda/search-hafer.json').stub, 'test-key');
    const rohe = await adapter.search({ ...query, query: 'oats' });
    expect(rohe.length).toBe(1);
    expect(adapter.toDraft(rohe[0]!)).toEqual(golden('golden-usda-hafer.json'));
  });

  it('fddb', async () => {
    const adapter = new FddbAdapter(
      async (url) => lies(url.includes('suche') ? 'fddb/suche.html' : 'fddb/haferflocken.html'),
    );
    const rohe = await adapter.search(query);
    expect(rohe.length).toBe(1);
    expect(adapter.toDraft(rohe[0]!)).toEqual(golden('golden-fddb-haferflocken.json'));
  });

  it('naehrwertrechner', async () => {
    const adapter = new NaehrwertrechnerAdapter(
      async (url) => lies(url.includes('suche') ? 'naehrwertrechner/suche.html' : 'naehrwertrechner/haferflocken.html'),
    );
    const rohe = await adapter.search(query);
    expect(rohe.length).toBe(1);
    expect(adapter.toDraft(rohe[0]!)).toEqual(golden('golden-nwr-haferflocken.json'));
  });

  it('rewe (Rezept-Draft)', async () => {
    const adapter = new ReweAdapter(
      async (url) => lies(url.includes('suche') ? 'rewe/suche.html' : 'rewe/pizza-margherita.html'),
    );
    const rohe = await adapter.search(query);
    expect(rohe.length).toBe(1);
    expect(adapter.toDraft(rohe[0]!)).toEqual(golden('golden-rewe-pizza.json'));
  });
});

describe('TC-PRV-02: unlesbare Seiten -> PARSE_FAILED (FA-503)', () => {
  it('OFF: defektes JSON', async () => {
    const adapter = new OpenFoodFactsAdapter(erzeugeFetch(() => 'openfoodfacts/broken.json').stub);
    await expect(adapter.search(query)).rejects.toMatchObject({ code: 'PARSE_FAILED' });
  });

  it('fddb: Suchseite ohne Marker', async () => {
    const adapter = new FddbAdapter(async () => lies('fddb/broken.html'));
    await expect(adapter.search(query)).rejects.toMatchObject({ code: 'PARSE_FAILED' });
  });

  it('fddb: Detailseite ohne Tabelle', async () => {
    const adapter = new FddbAdapter(
      async (url) => lies(url.includes('suche') ? 'fddb/suche.html' : 'fddb/broken.html'),
    );
    const rohe = await adapter.search({ ...query, limit: 1 });
    expect(() => adapter.toDraft(rohe[0]!)).toThrow(AdapterFehler);
    try {
      adapter.toDraft(rohe[0]!);
      expect.unreachable();
    } catch (e) {
      expect((e as AdapterFehler).code).toBe('PARSE_FAILED');
    }
  });

  it('naehrwertrechner: Suchseite ohne Marker', async () => {
    const adapter = new NaehrwertrechnerAdapter(async () => lies('naehrwertrechner/broken.html'));
    await expect(adapter.search(query)).rejects.toMatchObject({ code: 'PARSE_FAILED' });
  });

  it('rewe: Detailseite ohne ld+json', async () => {
    const adapter = new ReweAdapter(
      async (url) => lies(url.includes('suche') ? 'rewe/suche.html' : 'rewe/broken.html'),
    );
    const rohe = await adapter.search({ ...query, limit: 1 });
    expect(() => adapter.toDraft(rohe[0]!)).toThrow(AdapterFehler);
    try {
      adapter.toDraft(rohe[0]!);
      expect.unreachable();
    } catch (e) {
      expect((e as AdapterFehler).code).toBe('PARSE_FAILED');
    }
  });
});

describe('TC-PRV-03: Quellennomung und Attribution (FA-502)', () => {
  it('OFF traegt Attributions-Warnung und Detail-URL', async () => {
    const adapter = new OpenFoodFactsAdapter(erzeugeFetch(() => 'openfoodfacts/search-haferflocken.json').stub);
    const rohe = await adapter.search(query);
    expect(rohe[0]!.sourceUrl).toContain('/product/4006381333931');
    expect(adapter.attribution).toBe(OFF_ATTRIBUTION);
  });

  it('USDA traegt Attributions-Warnung', () => {
    const adapter = new UsdaAdapter(erzeugeFetch(() => 'usda/search-hafer.json').stub, 'test-key');
    expect(adapter.attribution).toBe(USDA_ATTRIBUTION);
  });

  it('Website-Adapter liefern Quell-URL der Detailseite', async () => {
    const fddb = new FddbAdapter(
      async (url) => lies(url.includes('suche') ? 'fddb/suche.html' : 'fddb/haferflocken.html'),
    );
    const rohe = await fddb.search({ ...query, limit: 1 });
    expect(rohe[0]!.sourceUrl).toContain('fddb.info/db/de/lebensmittel/');
    expect(rohe[0]!.name).toBe('Haferflocken');
  });
});

describe('TC-PRV-04: Standard-Registry (P8, nur im Backend)', () => {
  it('fuenf Adapter in Prioritaet O-3', () => {
    const eintraege = erzeugeStandardAdapter();
    expect(eintraege.map((e) => [e.adapter.id, e.order])).toEqual([
      ['openfoodfacts', 1],
      ['usda', 2],
      ['naehrwertrechner', 3],
      ['fddb', 4],
      ['rewe', 5],
    ]);
    expect(eintraege.find((e) => e.adapter.id === 'openfoodfacts')!.adapter.kind).toBe('api');
    expect(eintraege.find((e) => e.adapter.id === 'rewe')!.adapter.entities).toEqual(['recipe']);
    expect(eintraege.find((e) => e.adapter.id === 'fddb')!.adapter.entities).toEqual(['ingredient']);
  });

  it('USDA ohne Key feuert strukturierten Fehler statt stiller Fallback (FA-800)', async () => {
    const adapter = new UsdaAdapter(erzeugeFetch(() => 'usda/search-hafer.json').stub, null);
    await expect(adapter.search(query)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});

describe('TC-PRV-05: Barcode uber Open Food Facts (FA-410)', () => {
  it('Treffer -> Draft mit Barcode', async () => {
    const adapter = new OpenFoodFactsAdapter(erzeugeFetch(() => 'openfoodfacts/barcode-4006381333931.json').stub);
    const roh = await adapter.lookupBarcode('4006381333931');
    expect(roh).not.toBeNull();
    const draft = adapter.toDraft(roh!) as { barcode: string | null };
    expect(draft.barcode).toBe('4006381333931');
  });

  it('Fehlbelegung -> null (kein Absturz, FA-800)', async () => {
    const adapter = new OpenFoodFactsAdapter(erzeugeFetch(() => 'openfoodfacts/barcode-0000000000000.json').stub);
    await expect(adapter.lookupBarcode('0000000000000')).resolves.toBeNull();
  });
});

describe('TC-PRV-06: Netz nur zu Provider-Hosts (FA-508)', () => {
  it('Suchvorgang kontaktiert ausschliesslich erlaubte Hosts', async () => {
    const fddb = new FddbAdapter(
      async (url) => lies(url.includes('suche') ? 'fddb/suche.html' : 'fddb/haferflocken.html'),
    );
    await fddb.search({ ...query, limit: 1 });
    const nwr = new NaehrwertrechnerAdapter(
      async (url) => lies(url.includes('suche') ? 'naehrwertrechner/suche.html' : 'naehrwertrechner/haferflocken.html'),
    );
    await nwr.search({ ...query, limit: 1 });
    const rewe = new ReweAdapter(
      async (url) => lies(url.includes('suche') ? 'rewe/suche.html' : 'rewe/pizza-margherita.html'),
    );
    await rewe.search({ ...query, limit: 1 });

    const aufzeichnung = erzeugeHttpFetch(() => ({ status: 200, inhalt: lies('usda/search-hafer.json') }));
    const usda = new UsdaAdapter(aufzeichnung.stub, 'test-key');
    await usda.search({ ...query, query: 'oats', limit: 1 });
    expect(aufzeichnung.urls[0]).toContain('test-key');

    const off = erzeugeHttpFetch(() => ({ status: 200, inhalt: lies('openfoodfacts/search-haferflocken.json') }));
    await new OpenFoodFactsAdapter(off.stub).search({ ...query, limit: 1 });
    for (const url of [...off.urls, ...aufzeichnung.urls]) {
      const host = new URL(url).host;
      const erlaubte = Object.values(PROVIDER_HOSTS).flat();
      expect(erlaubte).toContain(host);
    }
  });

  it('HTTP-Fehler werden strukturiert, nicht abstuerzend (FA-503)', async () => {
    const adapter = new OpenFoodFactsAdapter(
      erzeugeHttpFetch(() => ({ status: 500, inhalt: '' })).stub,
    );
    await expect(adapter.search(query)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    const drossel = new OpenFoodFactsAdapter(
      erzeugeHttpFetch(() => ({ status: 429, inhalt: '' })).stub,
    );
    await expect(drossel.search(query)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
