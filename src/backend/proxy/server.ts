/**
 * Proxy-API-Server (FA-500): eingebettetes Node-Backend (Fastify), ausschliesslich 127.0.0.1
 * (P1, TC-API-01). Kein SQLite-Zugriff (P4), Einwilligung wird erzwungen (P5, FA-507),
 * externe Abrufe nur auf Nutzeraktion (P6/FA-508), strukturierte Fehler (P7, FA-503/800).
 *
 * Endpunkte E1–E9 gemäss docs/proxy-api.md; Deaktivierung geschieht app-seitig, indem der
 * Server gar nicht erst erzeugt/gestartet wird (P9).
 */
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { SearchResultCache } from './cache';
import {
  ProviderRegistry,
  UnbekannterProviderFehler,
  type BootstrapConsent,
  type BootstrapProvider,
} from './registry';
import {
  AdapterFehler,
  type Draft,
  type EntityKind,
  type FehlerCode,
  type FallbackHint,
  type ProviderAdapter,
  type ProviderId,
  type ProviderLogZeile,
  type RawResult,
  type SearchResponse,
  type SearchResult,
} from './types';

export interface ProxyServerOptionen {
  registry: ProviderRegistry;
  cache: SearchResultCache;
  /** utc-Zeitstempel-Funktion; Tests injizieren eine feste Uhr. */
  jetzt?: () => Date;
  /** FA-505: JSON-Zeilen-Sink; default: in-memory Array. */
  logSink?: (zeile: ProviderLogZeile) => void;
  apiVersion?: string;
  minClientApiVersion?: string;
  /** Erwartete Major-Version der App (FA-506); Bootstrap mit anderer Major blockiert. */
  erwarteteClientMajor?: number;
}

const FALLBACKS: Record<FehlerCode, FallbackHint> = {
  HANDSHAKE_FAILED: 'app_ohne_backend',
  CONSENT_REQUIRED: 'einwilligung_einholen',
  CONSENT_REVOKED: 'lokale_suche',
  PROVIDER_DISABLED: 'anderer_provider',
  PROVIDER_UNAVAILABLE: 'anderer_provider',
  PARSE_FAILED: 'manuelle_eingabe',
  OFFLINE: 'cache',
  NOT_FOUND: 'manuelle_eingabe',
  RATE_LIMITED: 'spaeter',
  QUERY_REQUIRED: 'manuelle_eingabe',
  TIMEOUT: 'cache',
};

const HTTP_STATUS: Record<FehlerCode, number> = {
  HANDSHAKE_FAILED: 503,
  CONSENT_REQUIRED: 403,
  CONSENT_REVOKED: 403,
  PROVIDER_DISABLED: 409,
  PROVIDER_UNAVAILABLE: 502,
  PARSE_FAILED: 422,
  OFFLINE: 503,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  QUERY_REQUIRED: 400,
  TIMEOUT: 504,
};

const RETRYABLE = new Set<FehlerCode>(['OFFLINE', 'TIMEOUT', 'RATE_LIMITED']);

export class ProxyServer {
  readonly app: FastifyInstance;
  private readonly cache: SearchResultCache;
  private readonly jetztFn: () => Date;
  private readonly logs: ProviderLogZeile[] = [];
  private readonly logSinkFn?: (zeile: ProviderLogZeile) => void;
  private readonly apiVersion: string;
  private readonly minClientApiVersion: string;
  private readonly erwarteteClientMajor: number;
  private clientMajorBlockiert = false;
  private readonly startedAtIso: string;

  constructor(readonly optionen: ProxyServerOptionen) {
    this.cache = optionen.cache;
    this.jetztFn = optionen.jetzt ?? (() => new Date());
    this.logSinkFn = optionen.logSink;
    this.apiVersion = optionen.apiVersion ?? '1.0.0';
    this.minClientApiVersion = optionen.minClientApiVersion ?? '1.0.0';
    this.erwarteteClientMajor = optionen.erwarteteClientMajor ?? 1;
    this.startedAtIso = this.jetztFn().toISOString();
    this.app = fastify({ logger: false });
    this.routen();
  }

  private iso(): string {
    return this.jetztFn().toISOString();
  }

  private fehler(reply: FastifyReply, code: FehlerCode, message: string, providerId?: ProviderId): FastifyReply {
    const body = {
      error: {
        code,
        message,
        providerId,
        retryable: RETRYABLE.has(code),
        fallback: FALLBACKS[code],
        queriedAt: this.iso(),
      },
    };
    return reply.status(HTTP_STATUS[code]).send(body);
  }

  private routen(): void {
    // E1 – Liveness + Versions-Handshake (FA-500/506)
    this.app.get('/api/v1/health', async () => ({
      status: 'ok',
      apiVersion: this.apiVersion,
      minClientApiVersion: this.minClientApiVersion,
      providers: {
        configured: this.optionen.registry.stateList().length,
        enabled: this.optionen.registry.zaehlung('enabled'),
        consented: this.optionen.registry.zaehlung('granted'),
      },
      startedAt: this.startedAtIso,
    }));

    // E2 – Startuebergabe (FA-500/505/507); falsche Major-Version blockiert (FA-506, TC-API-03)
    this.app.post('/api/v1/bootstrap', async (req, reply) => {
      const body = (req.body ?? {}) as {
        clientApiVersion?: string;
        providers?: BootstrapProvider[];
        consents?: BootstrapConsent[];
      };
      const major = Number(body.clientApiVersion?.split('.')[0] ?? Number.NaN);
      if (!Number.isFinite(major) || major !== this.erwarteteClientMajor) {
        this.clientMajorBlockiert = true;
        return this.fehler(reply, 'HANDSHAKE_FAILED', 'Client-API-Version stimmt nicht ueberein – bitte App aktualisieren (FA-506)');
      }
      this.optionen.registry.bootstrap(body.providers ?? [], body.consents ?? []);
      this.clientMajorBlockiert = false;
      return { accepted: true, effectiveConsents: this.optionen.registry.zaehlung('granted') };
    });

    // E3 – Adapter-Liste (FA-502/505)
    this.app.get('/api/v1/providers', async () => this.optionen.registry.stateList());

    // E4 – Adapter konfigurieren (FA-505)
    this.app.put('/api/v1/providers/:providerId/config', async (req, reply) => {
      if (this.blockiertNachHandshake(reply)) return reply;
      const { providerId } = req.params as { providerId: ProviderId };
      const body = (req.body ?? {}) as { enabled?: boolean; order?: number };
      if (typeof body.enabled !== 'boolean' || typeof body.order !== 'number') {
        return reply.status(400).send({
          error: { code: 'QUERY_REQUIRED', message: 'Booleans enabled und Zahl order erforderlich', retryable: false, fallback: 'manuelle_eingabe', queriedAt: this.iso() },
        });
      }
      try {
        this.optionen.registry.setConfig(providerId, body.enabled, body.order);
      } catch (e) {
        return this.unbekannterProvider(reply, e, providerId);
      }
      return this.optionen.registry.stateOf(providerId);
    });

    // E5 – Einwilligung spiegeln (FA-507), sofort wirkend (P5)
    this.app.put('/api/v1/providers/:providerId/consent', async (req, reply) => {
      if (this.blockiertNachHandshake(reply)) return reply;
      const { providerId } = req.params as { providerId: ProviderId };
      const body = (req.body ?? {}) as { granted?: boolean };
      if (typeof body.granted !== 'boolean') {
        return reply.status(400).send({
          error: { code: 'QUERY_REQUIRED', message: 'Boolean granted erforderlich', retryable: false, fallback: 'manuelle_eingabe', queriedAt: this.iso() },
        });
      }
      try {
        this.optionen.registry.setConsent(providerId, body.granted);
      } catch (e) {
        return this.unbekannterProvider(reply, e, providerId);
      }
      return this.optionen.registry.stateOf(providerId);
    });

    // E6 – Zutaten-Suche (FA-501/502/326)
    this.app.get('/api/v1/search/ingredients', async (req, reply) =>
      this.suche(reply, this.queryVon(req), 'ingredient'));

    // E7 – Rezept-Suche (FA-306/502)
    this.app.get('/api/v1/search/recipes', async (req, reply) =>
      this.suche(reply, this.queryVon(req), 'recipe'));

    // E8 – Barcode-Lookup (FA-410); kein Treffer → 404, Maske bleibt leer (FA-503)
    this.app.get('/api/v1/barcode/:code', async (req, reply) => {
      if (this.blockiertNachHandshake(reply)) return reply;
      const { code } = req.params as { code: string };
      const adapter = this.optionen.registry.adapterFuer('openfoodfacts');
      if (!adapter || !adapter.lookupBarcode) {
        return this.fehler(reply, 'PROVIDER_DISABLED', 'Barcode-Lookup ohne aktivierten Provider', 'openfoodfacts');
      }
      const raw = await adapter.lookupBarcode(code);
      if (!raw) {
        this.log('openfoodfacts', code, 404, 0, false);
        return this.fehler(reply, 'NOT_FOUND', 'Kein Treffer fuer Barcode', 'openfoodfacts');
      }
      const treffer = this.ergebnis('openfoodfacts', adapter, raw);
      const antwort = this.antwort('openfoodfacts', [treffer]);
      this.log('openfoodfacts', code, 200, 0, false, Buffer.byteLength(JSON.stringify(antwort)));
      return antwort;
    });

    // E9 – Cache leeren (FA-508)
    this.app.delete('/api/v1/cache', async (req, reply) => {
      if (this.blockiertNachHandshake(reply)) return reply;
      const { providerId } = req.query as { providerId?: ProviderId };
      return { deletedEntries: this.cache.clear(providerId) };
    });
  }

  private blockiertNachHandshake(reply: FastifyReply): boolean {
    if (!this.clientMajorBlockiert) return false;
    this.fehler(reply, 'HANDSHAKE_FAILED', 'Handshake nicht bestanden – alle Endpunkte blockiert (FA-506)');
    return true;
  }

  private unbekannterProvider(reply: FastifyReply, e: unknown, providerId: string): FastifyReply {
    if (e instanceof UnbekannterProviderFehler) {
      return this.fehler(reply, 'NOT_FOUND', `Unbekannter Provider: ${e.providerId}`);
    }
    throw e;
  }

  private queryVon(req: FastifyRequest): { query: string; providerId?: ProviderId; limit: number; allowCache: boolean } {
    const q = req.query as {
      query?: string;
      providerId?: ProviderId;
      limit?: string | number;
      allowCache?: string | boolean;
    };
    const limit = typeof q.limit === 'string' ? Number(q.limit) : (q.limit ?? 10);
    return {
      query: q.query ?? '',
      providerId: q.providerId,
      limit: Number.isFinite(limit) && Number(limit) > 0 ? Number(limit) : 10,
      allowCache: q.allowCache != null ? q.allowCache !== 'false' : true,
    };
  }

  private async suche(
    reply: FastifyReply,
    eingabe: { query: string; providerId?: ProviderId; limit: number; allowCache: boolean },
    kind: EntityKind,
  ): Promise<FastifyReply> {
    if (this.blockiertNachHandshake(reply)) return reply;
    const begriff = eingabe.query.trim();
    if (begriff.length < 2) {
      return this.fehler(reply, 'QUERY_REQUIRED', 'Suchbegriff fehlt oder ist kuerzer als 2 Zeichen');
    }
    if (!eingabe.providerId) {
      return this.fehler(reply, 'QUERY_REQUIRED', 'providerId erforderlich (Reihenfolge/default entscheidet die App, O-3)');
    }
    const zustand = this.optionen.registry.stateOf(eingabe.providerId);
    const adapter = this.optionen.registry.adapterFuer(eingabe.providerId);
    if (!zustand || !adapter) {
      return this.fehler(reply, 'NOT_FOUND', `Unbekannter Provider: ${eingabe.providerId}`);
    }
    // P5: Einwilligung vor Enabled pruefen – ein durch Widerruf deaktivierter
    // Adapter lautet CONSENT_REVOKED, nicht PROVIDER_DISABLED (FA-507, TC-API-06).
    if (zustand.consent === 'revoked') {
      return this.fehler(reply, 'CONSENT_REVOKED', `Einwilligung fuer "${eingabe.providerId}" wurde widerrufen (FA-507)`, zustand.providerId);
    }
    if (zustand.consent !== 'granted') {
      return this.fehler(reply, 'CONSENT_REQUIRED', `Fuer "${eingabe.providerId}" wurde noch keine Einwilligung erteilt (FA-507)`, zustand.providerId);
    }
    if (!zustand.enabled) {
      return this.fehler(reply, 'PROVIDER_DISABLED', `Provider "${eingabe.providerId}" ist inaktiv (FA-505)`, zustand.providerId);
    }
    if (!adapter.entities.includes(kind)) {
      return this.fehler(reply, 'PROVIDER_DISABLED', `Provider "${eingabe.providerId}" unterstuetzt ${kind} nicht (O-3)`, zustand.providerId);
    }

    const start = Date.now();
    try {
      const raws = await adapter.search({
        query: begriff,
        limit: Math.min(eingabe.limit, 25),
        locale: 'de-DE',
        allowCache: eingabe.allowCache,
      });
      const ergebnisse = raws
        .slice(0, Math.min(eingabe.limit, 25))
        .map((raw) => this.ergebnis(eingabe.providerId!, adapter, raw));
      const antwort: SearchResponse = {
        results: ergebnisse,
        queryTerms: [begriff],
        providerId: eingabe.providerId,
      };
      this.cache.put(eingabe.providerId, kind, begriff, antwort, this.iso());
      this.optionen.registry.letzteNutzung(eingabe.providerId, this.iso());
      this.log(eingabe.providerId, begriff, 200, Date.now() - start, false,
        Buffer.byteLength(JSON.stringify(antwort))); 
      return reply.send(antwort);
    } catch (e) {
      if (e instanceof AdapterFehler) {
        return this.adapterFehlerZuAntwort(reply, e, eingabe, kind, start);
      }
      throw e;
    }
  }

  private adapterFehlerZuAntwort(
    reply: FastifyReply,
    e: AdapterFehler,
    eingabe: { query: string; providerId?: ProviderId; limit: number; allowCache: boolean },
    kind: EntityKind,
    start: number,
  ): FastifyReply {
    const providerId = eingabe.providerId!;
    this.log(providerId, eingabe.query, HTTP_STATUS[e.code], Date.now() - start, e.code === 'OFFLINE');
    if ((e.code === 'OFFLINE' || e.code === 'TIMEOUT') && eingabe.allowCache) {
      const eintrag = this.cache.get(providerId, kind, eingabe.query);
      if (eintrag) {
        const ausCache: SearchResponse = {
          ...eintrag.response,
          results: eintrag.response.results.map((r) => ({ ...r, fromCache: true })),
        };
        this.log(providerId, eingabe.query, 200, Date.now() - start, true);
        return reply.send(ausCache);
      }
    }
    return this.fehler(reply, e.code, e.message, providerId);
  }

  private ergebnis(providerId: ProviderId, adapter: ProviderAdapter, raw: RawResult): SearchResult {
    const draft = adapter.toDraft(raw);
    const missing = this.fehlendeNutriente(draft);
    return {
      resultId: `${providerId}::${raw.externalId}`,
      kind: adapter.entities[0] ?? 'ingredient',
      providerId,
      queriedAt: this.iso(),
      fromCache: false,
      sourceUrl: raw.sourceUrl,
      fidelity: this.fidelity(draft, missing),
      draft,
      missingNutrients: missing,
      warnings: [],
    };
  }

  private fehlendeNutriente(draft: Draft): string[] {
    if (!('nutrients' in draft)) return [];
    return draft.nutrients.filter((n) => n.stufe === 'pflichtkern' && !n.angegeben).map((n) => n.nutrientName);
  }

  private fidelity(draft: Draft, missing: string[]): SearchResult['fidelity'] {
    if (!('nutrients' in draft)) return 'minimal';
    if (missing.length === 0) return 'vollstaendig';
    if (draft.nutrients.some((n) => n.angegeben)) return 'teilweise';
    return 'minimal';
  }

  private antwort(providerId: ProviderId, ergebnisse: SearchResult[]): SearchResponse {
    return {
      results: ergebnisse,
      queryTerms: [],
      providerId,
    };
  }

  private log(providerId: ProviderId, query: string, status: number, dauerMs: number, cacheHit: boolean, bytes = 0): void {
    const zeile: ProviderLogZeile = {
      ts: this.iso(),
      providerId,
      query,
      status,
      dauerMs,
      bytes,
      cacheHit,
    };
    this.logs.push(zeile);
    this.logSinkFn?.(zeile);
  }

  /** FA-505 in-memory Protokoll (Test-Sicht; bei logSink parallel weitergereicht). */
  get logZielen(): readonly ProviderLogZeile[] {
    return this.logs;
  }

  async schliessen(): Promise<void> {
    await this.app.close();
  }
}

/** Auf 127.0.0.1 mit appgewähltem Port binden (P1/FA-500, TC-API-01). */
export async function starteProxyServer(
  server: ProxyServer,
  port: number,
): Promise<{ port: number; host: '127.0.0.1' }> {
  await server.app.listen({ port, host: '127.0.0.1' });
  const adresse = server.app.server.address();
  if (adresse == null || typeof adresse === 'string') {
    throw new Error('Bind fehlgeschlagen (FA-800)');
  }
  return { port: adresse.port, host: '127.0.0.1' as const };
}
