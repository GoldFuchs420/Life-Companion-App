/**
 * rewe.de/rezepte-Website-Parser (FA-504/FA-306, Prioritaet 5): Rezept-Seiten
 * tragen schema.org Recipe als ld+json. Rezepte gelten fuer eine Portion
 * (FA-306); kcal ist nur Rueckvergleich und wird nie gespeichert (FA-329).
 * Unparsebare Zutatenzeilen bleiben roh mit menge 0/'Stueck' (abbrechbarer
 * Loop, FA-305) \u2013 der Commit passiert erst in der Maske (FA-304).
 */
import {
  AdapterFehler,
  type ProviderAdapter,
  type RawResult,
  type RecipeDraft,
  type SearchQuery,
} from '../proxy/types';
import { alleTreffer, htmlUnescape, zutatenZeile } from './htmlParser';
import { holeText } from './fddb';

const BASE_URL = 'https://www.rewe.de';

export class ReweAdapter implements ProviderAdapter {
  readonly id = 'rewe' as const;
  readonly kind = 'website' as const;
  readonly entities = ['recipe'] as const;

  constructor(private readonly fetchImpl: (url: string) => Promise<string>) {}

  async search(query: SearchQuery): Promise<RawResult[]> {
    const suchseite = await holeText(
      this.fetchImpl,
      `${BASE_URL}/rezepte/suche/?text=${encodeURIComponent(query.query)}`,
    );
    const links = alleTreffer(suchseite, /<a class="rezept-link" href="(\/rezepte\/[^"]+)">([^<]+)<\/a>/g);
    if (links.length === 0) {
      throw new AdapterFehler('PARSE_FAILED', 'Rezept-Liste von rewe unlesbar (FA-503)');
    }
    const rohe: RawResult[] = [];
    for (const link of links.slice(0, query.limit)) {
      const url = `${BASE_URL}${link[1] ?? ''}`;
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

  toDraft(raw: RawResult): RecipeDraft {
    const html = raw.payload.html;
    if (typeof html !== 'string') {
      throw new AdapterFehler('PARSE_FAILED', 'Detailseite fehlt (FA-503)');
    }
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    if (!block?.[1]) {
      throw new AdapterFehler('PARSE_FAILED', 'Kein schema.org-Rezept gefunden (FA-503)');
    }
    let rezept: Record<string, unknown>;
    try {
      const geparst: unknown = JSON.parse(block[1]);
      if (typeof geparst !== 'object' || geparst === null) throw new Error('kein Objekt');
      rezept = geparst as Record<string, unknown>;
    } catch {
      throw new AdapterFehler('PARSE_FAILED', 'ld+json von rewe ungueltig (FA-503)');
    }

    const name = typeof rezept.name === 'string' ? rezept.name : '';
    if (name.length === 0) {
      throw new AdapterFehler('PARSE_FAILED', 'Rezept-Name fehlt (FA-503)');
    }

    const portionen = portionenAusYield(typeof rezept.recipeYield === 'string' ? rezept.recipeYield : '');
    const steps = stepsAusAnweisungen(rezept.recipeInstructions);
    const zutaten = zutatenAusListe(rezept.recipeIngredient);
    const kcal = kcalAusNutrition(rezept.nutrition);

    return {
      name,
      typ: 'Hauptgericht',
      portionen,
      steps,
      ingredients: zutaten,
      providerKcal: kcal,
      providerKcalHinweis:
        kcal != null ? 'kcal nur Rueckvergleich, nie gespeichert (FA-329)' : null,
    };
  }
}

function externerSchluessel(url: string): string {
  const teile = url.split('/').filter((t) => t.length > 0);
  return teile[teile.length - 1] ?? 'unbekannt';
}

function portionenAusYield(yieldText: string): number {
  const zahl = /^(\d+)/.exec(yieldText.trim())?.[1];
  const n = zahl != null ? Number.parseInt(zahl, 10) : NaN;
  return n >= 1 ? n : 1;
}

function stepsAusAnweisungen(anweisungen: unknown): RecipeDraft['steps'] {
  if (!Array.isArray(anweisungen)) return [];
  return anweisungen.map((eintrag, index) => {
    if (typeof eintrag === 'string') {
      return { laufnummer: index + 1, titel: eintrag, dauerMin: 0 };
    }
    const obj = (eintrag ?? {}) as Record<string, unknown>;
    const titel = typeof obj.name === 'string' ? obj.name : '';
    return { laufnummer: index + 1, titel, dauerMin: 0 };
  });
}

function zutatenAusListe(liste: unknown): RecipeDraft['ingredients'] {
  if (!Array.isArray(liste)) return [];
  return liste.filter((z): z is string => typeof z === 'string').map((zeile) => {
    const { menge, einheit } = zutatenZeile(zeile);
    return {
      rohText: zeile,
      menge,
      einheit,
      resolved: null,
      suggestion: null,
    };
  });
}

function kcalAusNutrition(nutrition: unknown): number | null {
  if (typeof nutrition !== 'object' || nutrition === null) return null;
  const kcal = (nutrition as Record<string, unknown>).calories;
  if (typeof kcal !== 'string') return null;
  const wert = Number.parseFloat(kcal.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(wert) ? wert : null;
}
