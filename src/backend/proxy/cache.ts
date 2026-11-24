/**
 * Ergebnis-Cache (P2/FA-508): nur Suchantworten, keine Nutzerdaten.
 * Offline-Pfad: bei Netz-Ausfall/TIMEOUT antwortet der Cache mit fromCache=true
 * und originalem queriedAt (docs/proxy-api.md Abschnitt 6).
 */
import type { EntityKind, ProviderId, SearchResponse } from './types';

export interface CacheEintrag {
  response: SearchResponse;
  gespeichertAm: string;
}

export class SearchResultCache {
  private readonly map = new Map<string, CacheEintrag>();

  private schluessel(providerId: ProviderId, kind: EntityKind, query: string): string {
    return `${providerId}::${kind}::${query.trim().toLowerCase()}`;
  }

  get(providerId: ProviderId, kind: EntityKind, query: string): CacheEintrag | null {
    return this.map.get(this.schluessel(providerId, kind, query)) ?? null;
  }

  put(providerId: ProviderId, kind: EntityKind, query: string, response: SearchResponse, gespeichertAm: string): void {
    this.map.set(this.schluessel(providerId, kind, query), { response, gespeichertAm });
  }

  /** E9: komplett oder pro Provider; liefert die Zahl der entfernten Eintraege. */
  clear(providerId?: ProviderId): number {
    let n = 0;
    for (const [schluessel, eintrag] of [...this.map.entries()]) {
      if (providerId != null && eintrag.response.providerId !== providerId) continue;
      this.map.delete(schluessel);
      n++;
    }
    return n;
  }

  get groesse(): number {
    return this.map.size;
  }
}
