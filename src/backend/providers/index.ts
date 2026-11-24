/**
 * Standard-Verkabelung der Provider-Adapter (docs/proxy-api.md Abschnitt 3,
 * FA-505/P8): Reihenfolge = Prioritaet O-3. Der Backend-Server registriert
 * diese Eintraege; Einwilligungen/aktiv-Flags kommen per Bootstrap (E2).
 * Netz-Zugriffe bleiben auf die Provider-Hosts beschraenkt (FA-508).
 */
import type { ProviderAdapter, ProviderId } from '../proxy/types';
import { FddbAdapter } from './fddb';
import { NaehrwertrechnerAdapter } from './naehrwertrechner';
import { OFF_ATTRIBUTION, OpenFoodFactsAdapter, type FetchImpl } from './openfoodfacts';
import { ReweAdapter } from './rewe';
import { USDA_ATTRIBUTION, UsdaAdapter } from './usda';

export interface AdapterEintrag {
  readonly adapter: ProviderAdapter;
  readonly order: number;
}

export interface StandardAdapterOptionen {
  readonly fetchImpl?: FetchImpl;
  /** Backend-Config, nie App-DB (O-3). */
  readonly usdaApiKey?: string | null;
}

/** Hosts, die ein Adapter kontaktieren darf; fuer Hinweis/Fehlerbehandlung (FA-508). */
export const PROVIDER_HOSTS: Record<ProviderId, readonly string[]> = {
  openfoodfacts: ['world.openfoodfacts.org'],
  usda: ['api.nal.usda.gov'],
  naehrwertrechner: ['naehrwertrechner.de', 'www.naehrwertrechner.de'],
  fddb: ['fddb.info', 'www.fddb.info'],
  rewe: ['www.rewe.de', 'rewe.de'],
};

export function erzeugeStandardAdapter(optionen: StandardAdapterOptionen = {}): AdapterEintrag[] {
  const fetchImpl: FetchImpl =
    optionen.fetchImpl ??
    ((url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) }));
  const textFetch = async (url: string): Promise<string> => {
    const res = await fetchImpl(url);
    return res.text();
  };
  return [
    { adapter: new OpenFoodFactsAdapter(fetchImpl), order: 1 },
    { adapter: new UsdaAdapter(fetchImpl, optionen.usdaApiKey ?? null), order: 2 },
    { adapter: new NaehrwertrechnerAdapter(textFetch), order: 3 },
    { adapter: new FddbAdapter(textFetch), order: 4 },
    { adapter: new ReweAdapter(textFetch), order: 5 },
  ];
}

export { FddbAdapter, NaehrwertrechnerAdapter, OpenFoodFactsAdapter, ReweAdapter, UsdaAdapter };
export { OFF_ATTRIBUTION, USDA_ATTRIBUTION };
