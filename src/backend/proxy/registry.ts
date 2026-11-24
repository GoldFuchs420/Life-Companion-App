/**
 * Provider-Registry (docs/proxy-api.md Abschnitt 3, FA-505/507):
 * Zustand je Adapter (aktiv, Reihenfolge, Einwilligung, letzte Nutzung).
 * Die protokollierte Wahrheit fuer Einwilligungen bleibt provider_consent in app.db –
 * die Registry spiegelt sie nur (P5).
 */
import type {
  ConsentStatus,
  EntityKind,
  ProviderAdapter,
  ProviderId,
} from './types';

export interface ProviderZustand {
  providerId: ProviderId;
  kind: ProviderAdapter['kind'];
  entities: readonly EntityKind[];
  enabled: boolean;
  order: number;
  consent: ConsentStatus;
  lastUsedAt: string | null;
}

export interface BootstrapProvider {
  providerId: ProviderId;
  enabled: boolean;
  order: number;
}

export interface BootstrapConsent {
  providerId: ProviderId;
  granted: boolean;
  grantedAt: string;
}

export class ProviderRegistry {
  private readonly adapters = new Map<ProviderId, ProviderAdapter>();
  private readonly enabled = new Map<ProviderId, boolean>();
  private readonly order = new Map<ProviderId, number>();
  private readonly consents = new Map<ProviderId, ConsentStatus>();
  private readonly lastUsedAt = new Map<ProviderId, string>();

  register(adapter: ProviderAdapter, defaultOrder: number): void {
    this.adapters.set(adapter.id, adapter);
    this.enabled.set(adapter.id, true);
    this.order.set(adapter.id, defaultOrder);
    this.consents.set(adapter.id, 'missing');
  }

  /**
   * E2: Startuebergabe aus der App (Konfiguration + Einwilligungslage, FA-505/507).
   * Voll-Spiegel: nicht aufgeführte Provider fallen auf 'missing'/aktiv zurueck,
   * denn die Wahrheit liegt komplett in provider_consent (app.db).
   */
  bootstrap(config: BootstrapProvider[], consents: BootstrapConsent[]): void {
    for (const id of this.adapters.keys()) {
      this.enabled.set(id, true);
      this.consents.set(id, 'missing');
    }
    for (const c of config) {
      if (!this.adapters.has(c.providerId)) continue;
      this.enabled.set(c.providerId, c.enabled);
      this.order.set(c.providerId, c.order);
    }
    for (const k of consents) {
      if (!this.adapters.has(k.providerId)) continue;
      this.consents.set(k.providerId, k.granted ? 'granted' : 'revoked');
      if (!k.granted) this.enabled.set(k.providerId, false);
    }
  }

  /** E4. */
  setConfig(providerId: ProviderId, enabled: boolean, order: number): void {
    this.nurBekannt(providerId);
    this.enabled.set(providerId, enabled);
    this.order.set(providerId, order);
  }

  /** E5: erteilen/widerrufen, live; Widerruf deaktiviert sofort, Erteilung reaktiviert (P5). */
  setConsent(providerId: ProviderId, granted: boolean): void {
    this.nurBekannt(providerId);
    this.consents.set(providerId, granted ? 'granted' : 'revoked');
    this.enabled.set(providerId, granted);
  }

  stateOf(providerId: ProviderId): ProviderZustand | null {
    const adapter = this.adapters.get(providerId);
    if (!adapter) return null;
    return {
      providerId: adapter.id,
      kind: adapter.kind,
      entities: adapter.entities,
      enabled: this.enabled.get(adapter.id)!,
      order: this.order.get(adapter.id)!,
      consent: this.consents.get(adapter.id)!,
      lastUsedAt: this.lastUsedAt.get(adapter.id) ?? null,
    };
  }

  stateList(): ProviderZustand[] {
    return [...this.adapters.keys()]
      .map((id) => this.stateOf(id)!)
      .sort((a, b) => a.order - b.order);
  }

  adapterFuer(providerId: ProviderId): ProviderAdapter | null {
    return this.adapters.get(providerId) ?? null;
  }

  zaehlung(kind: 'granted' | 'enabled'): number {
    let n = 0;
    for (const id of this.adapters.keys()) {
      if (kind === 'enabled' && this.enabled.get(id)) n++;
      if (kind === 'granted' && this.consents.get(id) === 'granted') n++;
    }
    return n;
  }

  letzteNutzung(providerId: ProviderId, ts: string): void {
    this.lastUsedAt.set(providerId, ts);
  }

  private nurBekannt(providerId: ProviderId): void {
    if (!this.adapters.has(providerId)) {
      throw new UnbekannterProviderFehler(providerId);
    }
  }
}

export class UnbekannterProviderFehler extends Error {
  constructor(readonly providerId: string) {
    super(`Unbekannter Provider: ${providerId}`);
  }
}
