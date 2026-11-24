/**
 * Vertrags-Typen der Proxy-API (docs/proxy-api.md, FA-500/504).
 * Das Backend ist ausschliesslich Provider-/Parser-Schicht: keine Nutzerdaten,
 * keine Nährwert-Berechnung (FA-329), kein SQLite-Zugriff (P2/P4).
 */
export type ProviderId = 'openfoodfacts' | 'usda' | 'naehrwertrechner' | 'fddb' | 'rewe';
export type ProviderKind = 'api' | 'website';
export type EntityKind = 'ingredient' | 'recipe';
export type Fidelity = 'vollstaendig' | 'teilweise' | 'minimal';
export type ConsentStatus = 'granted' | 'missing' | 'revoked';

export interface NutrientDraft {
  nutrientName: string;
  /** µg-normiert pro 100 g/ml (FA-322); null = nicht angegeben. */
  wertNormiertPro100: number | null;
  einheit: 'g' | 'ml' | 'mg' | 'µg';
  stufe: 'pflichtkern' | 'empfohlen' | 'optional';
  angegeben: boolean;
}

export interface IngredientDraft {
  name: string;
  basisEinheit: 'g' | 'ml';
  stueckgewichtG: number | null;
  dichteGProMl: number | null;
  barcode: string | null;
  nutrients: NutrientDraft[];
}

export interface RecipeStepDraft {
  laufnummer: number;
  titel: string;
  dauerMin: number;
}

export interface RecipeIngredientLine {
  rohText: string;
  menge: number;
  einheit: 'g' | 'kg' | 'ml' | 'l' | 'TL' | 'EL' | 'Tasse' | 'Stueck';
  /** 'local:ingredient:<id>' wenn lokal aufgeloest, sonst null (abbrechbarer Loop, FA-305). */
  resolved: string | null;
  suggestion: { resultId: string; name: string } | null;
}

export interface RecipeDraft {
  name: string;
  typ: string;
  portionen: number;
  steps: RecipeStepDraft[];
  ingredients: RecipeIngredientLine[];
  /** Nur Rückvergleich, nie gespeichert (FA-329). */
  providerKcal: number | null;
  providerKcalHinweis: string | null;
}

export type Draft = IngredientDraft | RecipeDraft;

export interface SearchResult {
  /** Stabil: providerId::externerKey (FA-504, abbrechbarer Loop FA-305). */
  resultId: string;
  kind: EntityKind;
  providerId: ProviderId;
  queriedAt: string;
  fromCache: boolean;
  sourceUrl: string | null;
  fidelity: Fidelity;
  draft: Draft;
  missingNutrients: string[];
  warnings: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  queryTerms: string[];
  providerId: ProviderId;
}

export type FehlerCode =
  | 'HANDSHAKE_FAILED'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_REVOKED'
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PARSE_FAILED'
  | 'OFFLINE'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'QUERY_REQUIRED'
  | 'TIMEOUT';

export type FallbackHint =
  | 'app_ohne_backend'
  | 'einwilligung_einholen'
  | 'lokale_suche'
  | 'anderer_provider'
  | 'manuelle_eingabe'
  | 'cache'
  | 'spaeter';

export interface FehlerKoerper {
  error: {
    code: FehlerCode;
    message: string;
    providerId?: ProviderId;
    retryable: boolean;
    fallback: FallbackHint;
    queriedAt: string;
  };
}

export interface RawResult {
  /** Stabiler externer Schluessel beim Provider (fuer resultId). */
  externalId: string;
  name: string;
  sourceUrl: string | null;
  payload: Record<string, unknown>;
}

export interface SearchQuery {
  query: string;
  limit: number;
  locale: string;
  allowCache: boolean;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly kind: ProviderKind;
  readonly entities: readonly EntityKind[];
  /** Pflicht nach FA-502, wenn der Provider Quellenangabe verlangt (z. B. Open Food Facts). */
  readonly attribution?: string;
  /** Nur auf ausdrueckliche Nutzeraktion (FA-508); Timeout-Vorgaben Abschnitt 2. */
  search(query: SearchQuery): Promise<RawResult[]>;
  /** Nur fuer Barcode-Provider (FA-410). */
  lookupBarcode?(code: string): Promise<RawResult | null>;
  toDraft(raw: RawResult): Draft;
}

/** Vom Adapter geworfene strukturierte Fehler (FA-503/800 – nie ein Absturz). */
export class AdapterFehler extends Error {
  constructor(
    readonly code: Extract<FehlerCode, 'OFFLINE' | 'TIMEOUT' | 'PARSE_FAILED' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE'>,
    message: string,
  ) {
    super(message);
  }
}

/** JSON-Zeile pro Anfrage (FA-505): nur Suchbegriff/Barcode, keine Nutzerdaten. */
export interface ProviderLogZeile {
  ts: string;
  providerId: ProviderId;
  query: string;
  status: number;
  dauerMs: number;
  bytes: number;
  cacheHit: boolean;
}
