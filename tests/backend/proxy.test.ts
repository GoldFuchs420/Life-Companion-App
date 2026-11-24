/**
 * Contract-Tests E1–E9 (FA-854, TC-API-01..12). Kein echtes Netz: FakeAdapter.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SearchResultCache } from '../../src/backend/proxy/cache';
import { ProviderRegistry } from '../../src/backend/proxy/registry';
import { ProxyServer, starteProxyServer } from '../../src/backend/proxy/server';
import type { ProviderAdapter, ProviderId, ProviderLogZeile, SearchResponse } from '../../src/backend/proxy/types';
import { FakeAdapter } from './fakeAdapter';

const FESTUHR = new Date('2026-10-13T07:41:22Z');
const ALLE_PROVIDER: ProviderId[] = ['openfoodfacts', 'usda', 'naehrwertrechner', 'fddb', 'rewe'];

let registry: ProviderRegistry;
let cache: SearchResultCache;
let server: ProxyServer;
let logs: ProviderLogZeile[];
let off: FakeAdapter;
let rewe: FakeAdapter;
let fddb: FakeAdapter;

beforeAll(() => {
  registry = new ProviderRegistry();
  off = new FakeAdapter('openfoodfacts', 'api', ['ingredient']);
  registry.register(off, 1);
  registry.register(new FakeAdapter('usda', 'api', ['ingredient']), 2);
  registry.register(new FakeAdapter('naehrwertrechner', 'website', ['ingredient']), 3);
  fddb = new FakeAdapter('fddb', 'website', ['ingredient']);
  registry.register(fddb, 4);
  rewe = new FakeAdapter('rewe', 'website', ['recipe']);
  registry.register(rewe, 5);
  cache = new SearchResultCache();
  logs = [];
  server = new ProxyServer({
    registry,
    cache,
    jetzt: () => FESTUHR,
    logSink: (zeile) => logs.push(zeile),
  });
});

afterAll(async () => {
  await server.schliessen();
});

async function bootstrap(consented: ProviderId[] = ALLE_PROVIDER): Promise<void> {
  const res = await server.app.inject({
    method: 'POST',
    url: '/api/v1/bootstrap',
    payload: {
      appVersion: '1.2.0',
      clientApiVersion: '1.0.0',
      locale: 'de-DE',
      cacheDirectory: '/tmp/lc-cache',
      providers: registry.stateList().map((z) => ({ providerId: z.providerId, enabled: z.enabled, order: z.order })),
      consents: consented.map((p) => ({ providerId: p, granted: true, grantedAt: '2026-10-13T07:45:01Z' })),
    },
  });
  expect(res.statusCode).toBe(200);
}

describe('TC-API · Vertragstests E1-E9', () => {
  it('TC-API-01: bindet ausschliesslich 127.0.0.1 mit app-gewaehltem Port (FA-500)', async () => {
    const wegwerf = new ProxyServer({ registry: new ProviderRegistry(), cache: new SearchResultCache() });
    const gestartet = await starteProxyServer(wegwerf, 0);
    try {
      expect(gestartet.host).toBe('127.0.0.1');
      expect(gestartet.port).toBeGreaterThan(0);
    } finally {
      await wegwerf.schliessen();
    }
  });

  it('TC-API-02: Handshake passend – E1 liefert apiVersion, Folge-Endpunkte offen (FA-506)', async () => {
    const health = await server.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);
    const body = health.json();
    expect(body.status).toBe('ok');
    expect(body.apiVersion).toBe('1.0.0');
    expect(body.providers.configured).toBe(5);
    expect(body.providers.consented).toBe(0);
    await bootstrap();
    const providers = await server.app.inject({ method: 'GET', url: '/api/v1/providers' });
    expect(providers.statusCode).toBe(200);
    const zustand = providers.json();
    expect(zustand.map((z: { providerId: string }) => z.providerId)).toEqual(ALLE_PROVIDER);
    expect(zustand[0].consent).toBe('granted');
  });

  it('TC-API-03: Bootstrap mit falscher Major-Version blockiert alle anderen Endpunkte (FA-506)', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/v1/bootstrap',
      payload: { clientApiVersion: '2.0.0' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('HANDSHAKE_FAILED');
    const suche = await server.app.inject({
      method: 'GET',
      url: '/api/v1/search/ingredients?query=Hafer&providerId=openfoodfacts',
    });
    expect(suche.statusCode).toBe(503);
    expect(suche.json().error.code).toBe('HANDSHAKE_FAILED');
    await bootstrap();
    const offen = await server.app.inject({ method: 'GET', url: '/api/v1/providers' });
    expect(offen.statusCode).toBe(200);
  });

  it('TC-API-05: Suche ohne Einwilligung → CONSENT_REQUIRED mit fallback einwilligung_einholen (FA-507)', async () => {
    await bootstrap(['openfoodfacts', 'usda', 'naehrwertrechner', 'rewe']);
    const res = await server.app.inject({ method: 'GET', url: '/api/v1/search/ingredients?query=Hafer&providerId=fddb' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: 'CONSENT_REQUIRED', providerId: 'fddb', fallback: 'einwilligung_einholen' });
  });

  it('TC-API-06: nach Widerruf CONSENT_REVOKED und kein erneuter Adapter-Abruf (FA-507)', async () => {
    const zustandRes = await server.app.inject({ method: 'PUT', url: '/api/v1/providers/fddb/consent', payload: { granted: true } });
    expect(zustandRes.statusCode).toBe(200);
    await server.app.inject({ method: 'PUT', url: '/api/v1/providers/fddb/consent', payload: { granted: false } });
    const pre = fddb.aufrufe;
    const res = await server.app.inject({ method: 'GET', url: '/api/v1/search/ingredients?query=Hafer&providerId=fddb' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: 'CONSENT_REVOKED', fallback: 'lokale_suche', retryable: false });
    expect(fddb.aufrufe).toBe(pre);
    const zustand = await server.app.inject({ method: 'GET', url: '/api/v1/providers' });
    const fddbZustand = zustand.json().find((z: { providerId: string }) => z.providerId === 'fddb');
    expect(fddbZustand.consent).toBe('revoked');
    expect(fddbZustand.enabled).toBe(false);
  });

  it('TC-API-10: E6 liefert 1:1-vorbelegbaren IngredientDraft; E7 den RecipeDraft (FA-501/504)', async () => {
    const zutaten = await server.app.inject({
      method: 'GET',
      url: '/api/v1/search/ingredients?query=Haferflocken&providerId=openfoodfacts',
    });
    expect(zutaten.statusCode).toBe(200);
    const antwort = zutaten.json() as SearchResponse;
    expect(antwort.providerId).toBe('openfoodfacts');
    expect(antwort.results.length).toBe(1);
    const treffer = antwort.results[0]!;
    expect(treffer.resultId).toBe('openfoodfacts::haferflocken');
    expect(treffer.queriedAt).toBe('2026-10-13T07:41:22.000Z');
    expect(treffer.fromCache).toBe(false);
    expect(treffer.sourceUrl).toContain('example.test');
    const draft = treffer.draft as { name: string; basisEinheit: string; nutrients: Array<{ nutrientName: string; wertNormiertPro100: number | null; einheit: string; stufe: string; angegeben: boolean }> };
    expect(draft.name).toContain('Haferflocken');
    expect(draft.basisEinheit).toBe('g');
    expect(draft.nutrients).toHaveLength(7);
    expect(draft.nutrients.at(-1)).toMatchObject({ nutrientName: 'Vitamin B12', einheit: 'µg', stufe: 'empfohlen', angegeben: false });
    expect(treffer.fidelity).toBe('vollstaendig');
    expect(treffer.missingNutrients).toEqual([]);

    const rezept = await server.app.inject({
      method: 'GET',
      url: '/api/v1/search/recipes?query=Pizza&providerId=rewe',
    });
    expect(rezept.statusCode).toBe(200);
    const rezeptAntwort = rezept.json() as SearchResponse;
    const rezeptDraft = rezeptAntwort.results[0]!.draft as { steps: unknown[]; ingredients: Array<{ resolved: string | null }>; providerKcal: number; providerKcalHinweis: string | null };
    expect(rezeptDraft.steps).toHaveLength(1);
    expect(rezeptDraft.ingredients[0]!.resolved).toBeNull();
    expect(rezeptDraft.providerKcal).toBe(372);
    expect(rezeptDraft.providerKcalHinweis).toContain('FA-329');
  });

  it('TC-API-12: Rezept-Suche nur beim Rezept-Provider (O-3), Zutaten-Suche bei Zutaten-Providern', async () => {
    const falsch = await server.app.inject({ method: 'GET', url: '/api/v1/search/recipes?query=Pizza&providerId=openfoodfacts' });
    expect(falsch.statusCode).toBe(409);
    expect(falsch.json().error.code).toBe('PROVIDER_DISABLED');
    const ok = await server.app.inject({ method: 'GET', url: '/api/v1/search/recipes?query=Pizza&providerId=rewe' });
    expect(ok.statusCode).toBe(200);
  });

  it('TC-API-07: Offline-Suche antwortet aus dem Cache (fromCache), ohne Treffer OFFLINE (FA-508)', async () => {
    off.modus = 'offline';
    const mitCache = await server.app.inject({ method: 'GET', url: '/api/v1/search/ingredients?query=Haferflocken&providerId=openfoodfacts' });
    expect(mitCache.statusCode).toBe(200);
    const ausCache = mitCache.json() as SearchResponse;
    expect(ausCache.results[0]!.fromCache).toBe(true);
    expect(ausCache.results[0]!.queriedAt).toBe('2026-10-13T07:41:22.000Z');

    const ohneCache = await server.app.inject({ method: 'GET', url: '/api/v1/search/ingredients?query=Quinoa&providerId=openfoodfacts' });
    expect(ohneCache.statusCode).toBe(503);
    expect(ohneCache.json().error.code).toBe('OFFLINE');
    expect(ohneCache.json().error.retryable).toBe(true);
    off.modus = 'ok';
  });

  it('TC-API-09: PARSE_FAILED mit fallback manuelle_eingabe; Barcode ohne Treffer NOT_FOUND, Maske bleibt leer (FA-503)', async () => {
    off.modus = 'parse';
    const res = await server.app.inject({ method: 'GET', url: '/api/v1/search/ingredients?query=Bulgur&providerId=openfoodfacts' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: 'PARSE_FAILED', fallback: 'manuelle_eingabe', retryable: false });
    off.modus = 'ok';

    const keinTreffer = await server.app.inject({ method: 'GET', url: '/api/v1/barcode/0000000000000' });
    expect(keinTreffer.statusCode).toBe(404);
    expect(keinTreffer.json().error.code).toBe('NOT_FOUND');

    const treffer = await server.app.inject({ method: 'GET', url: '/api/v1/barcode/4006381333931' });
    expect(treffer.statusCode).toBe(200);
    expect(treffer.json().results[0].kind).toBe('ingredient');
  });

  it('TC-API-04: inaktiver Provider → PROVIDER_DISABLED samt fallback anderer_provider (FA-505, P9)', async () => {
    await server.app.inject({ method: 'PUT', url: '/api/v1/providers/usda/config', payload: { enabled: false, order: 2 } });
    const res = await server.app.inject({ method: 'GET', url: '/api/v1/search/ingredients?query=Linsen&providerId=usda' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'PROVIDER_DISABLED', providerId: 'usda', fallback: 'anderer_provider' });
    await server.app.inject({ method: 'PUT', url: '/api/v1/providers/usda/config', payload: { enabled: true, order: 2 } });
  });

  it('TC-API-11: jede Anfrage erzeugt eine JSON-Log-Zeile mit Dauer/Status/Cache-Hit/Bytes, ohne Nutzerdaten (FA-505)', async () => {
    logs.length = 0;
    await server.app.inject({ method: 'GET', url: '/api/v1/search/ingredients?query=Banane&providerId=openfoodfacts' });
    expect(logs.length).toBe(1);
    const zeile = logs[0]!;
    expect(zeile).toMatchObject({ providerId: 'openfoodfacts', query: 'Banane', status: 200, cacheHit: false });
    expect(typeof zeile.dauerMs).toBe('number');
    expect(zeile.bytes).toBeGreaterThan(0);
    expect(Object.keys(zeile).sort()).toEqual(['bytes', 'cacheHit', 'dauerMs', 'providerId', 'query', 'status', 'ts']);
    expect(JSON.stringify(zeile)).not.toContain('profil');
  });

  it('TC-API-08: kein Hintergrund-Verkehr – ohne Nutzeraktion keine Adapter-Aufrufe (FA-508, P6)', async () => {
    const vor = off.aufrufe + rewe.aufrufe;
    await server.app.inject({ method: 'GET', url: '/api/v1/health' });
    await server.app.inject({ method: 'GET', url: '/api/v1/providers' });
    expect(off.aufrufe + rewe.aufrufe).toBe(vor);
  });

  it('E9: Cache leeren (pro Provider und komplett, FA-508)', async () => {
    expect(cache.groesse).toBeGreaterThanOrEqual(2);
    const proProvider = await server.app.inject({ method: 'DELETE', url: '/api/v1/cache?providerId=rewe' });
    expect(proProvider.json().deletedEntries).toBe(1);
    const vor = cache.groesse;
    const komplett = await server.app.inject({ method: 'DELETE', url: '/api/v1/cache' });
    expect(komplett.json().deletedEntries).toBe(vor);
    expect(cache.groesse).toBe(0);
  });

  it('Schlechte Anfragen: QUERY_REQUIRED bei fehlendem/kurzem Begriff, NOT_FOUND bei unbekanntem Provider (FA-800)', async () => {
    const ohne = await server.app.inject({ method: 'GET', url: '/api/v1/search/ingredients?providerId=openfoodfacts' });
    expect(ohne.statusCode).toBe(400);
    expect(ohne.json().error.code).toBe('QUERY_REQUIRED');
    const zuKurz = await server.app.inject({ method: 'GET', url: '/api/v1/search/ingredients?query=H&providerId=openfoodfacts' });
    expect(zuKurz.statusCode).toBe(400);
    const unbekannt = await server.app.inject({ method: 'GET', url: '/api/v1/search/ingredients?query=Hafer&providerId=gibsnicht' });
    expect(unbekannt.statusCode).toBe(404);
    expect(unbekannt.json().error.code).toBe('NOT_FOUND');
  });
});
