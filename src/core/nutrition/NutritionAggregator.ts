/**
 * NutritionAggregator (FA-610, FA-341, TC-AGG): aggregiert Nahrungsaufnahme
 * aus Essen-Eintraegen im Zeitraum, jeweils multipliziert mit der Portionszahl.
 *
 * Grundsaetze:
 * - Intern alles in µg je 100 g/ml (FA-322); die Anzeige-Rueckrechnung (mg/µg/ml)
 *   macht der DgeComparator (normfaktor_nach_µg), nicht der Aggregator.
 * - Serien werden pro Instanz gezaehlt (FA-213, TC-AGG-02), nicht die Serie als
 *   Ganzes; Basis ist der RecurrenceResolver (Wanduhr, DST-fest).
 * - Fehlende Daten werden nie als 0 interpretiert (FA-341/TC-NRM-05, FA-800):
 *   - fehlende Zutat / nicht aufloesbare Rezeptzeile → Tag "unvollstaendig erfasst"
 *   - im Naehrstoffkatalog gefuehrter Wert ohne ingredient_nutrient-Zeile → "fehlt"
 *     und wird in fehlendeNutrientwerte gemeldet (Eingabeaufforderung, kein Absturz).
 * - Kategorie-Filter (FA-612, TC-AGG-04): gefilterte Anteile werden als
 *   `ausgegraut` zurueckgegeben und duerfen im UI nur ausgegraut, nie entfernt werden.
 */
import type { DbDriver } from '../db/driver';
import type { AktivitaetZeitrahmen, RecurrenceRule, Wochentag } from '../recurrence/RecurrenceResolver';
import { expandiereAlle } from '../recurrence/RecurrenceResolver';
import { RecipeRepository } from '../repo/RecipeRepository';

export interface NutrientIntakeIntern {
  name: string;
  stufe: string;
  wert_ug: number;
}

export interface NutrientAggregat {
  name: string;
  stufe: string;
  wert_total_ug: number;
  wert_pro_tag_ug: number;
}

export interface FehlenderWert {
  name: string;
  stufe: string;
  hinweis: string;
}

export interface EssenInstanz {
  aktivitaet_id: string;
  start: string;
  typ: 'essen_rezept' | 'essen_zutat';
  /** false → zaehlt als "unvollstaendig erfasst" (FA-341/FA-800), Beitraege ggf. teilweise. */
  erfasst: boolean;
  /** TC-AGG-04: gehoert zur gefilterten Kategorie → im UI ausgegraut. */
  gefiltert: boolean;
  fehlende_zeilen: number;
  fehlendeNutriente: FehlenderWert[];
  beitraege: NutrientIntakeIntern[];
}

export interface AggregatErgebnis {
  von: string;
  bis: string;
  tage: number;
  proNutrient: NutrientAggregat[];
  /** TC-AGG-04: Anteile der gefilterten Kategorie – Ausgrau-Logik, nicht Entfernung. */
  ausgegraut: NutrientAggregat[];
  unvollstaendigeTage: string[];
  fehlendeNutrientwerte: FehlenderWert[];
  instanzen: EssenInstanz[];
}

export interface AggregatFilter {
  kategorie_id?: number;
}

interface AktivitaetZeile {
  id: string;
  typ: 'essen_rezept' | 'essen_zutat';
  kategorie_id: number;
  start: string;
  ende: string;
  rezept_id: string | null;
  portionen: number;
  ingredient_id: string | null;
  zutat_menge: number | null;
}

/** Inklusive Tageszahl eines geschlossenen Datumsintervalls 'YYYY-MM-DD'. */
export function anzahlTage(von: string, bis: string): number {
  const a = Date.UTC(Number(von.slice(0, 4)), Number(von.slice(5, 7)) - 1, Number(von.slice(8, 10)));
  const b = Date.UTC(Number(bis.slice(0, 4)), Number(bis.slice(5, 7)) - 1, Number(bis.slice(8, 10)));
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function inZeitraum(iso: string, von: string, bis: string): boolean {
  const d = iso.slice(0, 10);
  return d >= von && d <= bis;
}

function aggregiere(instanzen: EssenInstanz[], tage: number): NutrientAggregat[] {
  const nachName = new Map<string, { stufe: string; wert: number }>();
  for (const instanz of instanzen) {
    for (const b of instanz.beitraege) {
      const alt = nachName.get(b.name);
      if (alt) alt.wert += b.wert_ug;
      else nachName.set(b.name, { stufe: b.stufe, wert: b.wert_ug });
    }
  }
  const tageSicher = Math.max(tage, 1);
  return [...nachName.entries()]
    .map(([name, v]) => {
      const wert_total_ug = Math.round(v.wert * 1000) / 1000;
      return {
        name,
        stufe: v.stufe,
        wert_total_ug,
        wert_pro_tag_ug: Math.round((wert_total_ug / tageSicher) * 1000) / 1000,
      };
    })
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

export class NutritionAggregator {
  private readonly recipes: RecipeRepository;

  constructor(private readonly db: DbDriver) {
    this.recipes = new RecipeRepository(db);
  }

  aggregate(von: string, bis: string, filter: AggregatFilter = {}): AggregatErgebnis {
    const tage = anzahlTage(von, bis);
    if (tage <= 0) throw new Error(`Ungueltiger Zeitraum (FA-800): ${von} bis ${bis}`);

    const instanzen: EssenInstanz[] = [];
    for (const akt of this.aktivitaeten()) {
      for (const start of this.instanzStarts(akt, von, bis)) {
        instanzen.push(this.essenzutatOderRezept(akt, start, filter));
      }
    }

    const proNutrient = aggregiere(instanzen, tage);
    const ausgegraut =
      filter.kategorie_id != null ? aggregiere(instanzen.filter((i) => i.gefiltert), tage) : [];

    const fehlendeMap = new Map<string, FehlenderWert>();
    for (const instanz of instanzen) {
      if (instanz.erfasst) continue;
      for (const f of instanz.fehlendeNutriente) fehlendeMap.set(f.name, f);
    }

    const unvollstaendigeTage = [
      ...new Set(instanzen.filter((i) => !i.erfasst).map((i) => i.start.slice(0, 10))),
    ].sort();

    return {
      von,
      bis,
      tage,
      proNutrient,
      ausgegraut,
      unvollstaendigeTage,
      fehlendeNutrientwerte: [...fehlendeMap.values()].sort((a, b) => (a.name < b.name ? -1 : 1)),
      instanzen,
    };
  }

  private aktivitaeten(): AktivitaetZeile[] {
    return this.db.all<AktivitaetZeile>(
      "SELECT id, typ, kategorie_id, start, ende, rezept_id, portionen, ingredient_id, zutat_menge " +
      "FROM activity WHERE typ IN ('essen_rezept','essen_zutat') ORDER BY start",
    );
  }

  /** FA-213/TC-AGG-02: Serieninstanzen im Zeitraum zaehlen, nicht die Serie. */
  private instanzStarts(akt: AktivitaetZeile, von: string, bis: string): string[] {
    const regeln = this.recurrencesOf(akt.id);
    if (regeln.length > 0) {
      const zeitrahmen: AktivitaetZeitrahmen = { start: akt.start, ende: akt.ende };
      return expandiereAlle(regeln, zeitrahmen, von, bis).instanzen.map((i) => i.start);
    }
    return inZeitraum(akt.start, von, bis) ? [akt.start] : [];
  }

  private recurrencesOf(aktivitaetId: string): RecurrenceRule[] {
    return this.db
      .all<{
        typ: RecurrenceRule['typ'];
        intervall: number | null;
        einheit: RecurrenceRule['einheit'];
        wochentage: string | null;
        tag_im_monat: number | null;
        tag_im_jahr: string | null;
        startdatum: string;
        enddatum: string | null;
      }>(
        'SELECT typ, intervall, einheit, wochentage, tag_im_monat, tag_im_jahr, startdatum, enddatum ' +
        'FROM recurrence WHERE aktivitaet_id = ? ORDER BY id',
        [aktivitaetId],
      )
      .map((r) => ({
        typ: r.typ,
        intervall: r.intervall ?? 1,
        einheit: r.einheit ?? undefined,
        wochentage: r.wochentage ? (r.wochentage.split(',').map((w) => w.trim()) as Wochentag[]) : undefined,
        tag_im_monat: r.tag_im_monat ?? undefined,
        tag_im_jahr: r.tag_im_jahr ?? undefined,
        startdatum: r.startdatum,
        enddatum: r.enddatum,
      }));
  }

  private essenzutatOderRezept(akt: AktivitaetZeile, start: string, filter: AggregatFilter): EssenInstanz {
    const instanz: EssenInstanz = {
      aktivitaet_id: akt.id,
      start,
      typ: akt.typ,
      erfasst: true,
      gefiltert: filter.kategorie_id != null && akt.kategorie_id === filter.kategorie_id,
      fehlende_zeilen: 0,
      fehlendeNutriente: [],
      beitraege: [],
    };
    const fehlende: FehlenderWert[] = [];

    if (akt.typ === 'essen_zutat') {
      if (!akt.ingredient_id || !akt.zutat_menge) {
        instanz.erfasst = false;
        return instanz;
      }
      instanz.beitraege = this.zutatBeitraege(akt.ingredient_id, akt.zutat_menge, fehlende);
      if (fehlende.length > 0) instanz.erfasst = false;
      instanz.fehlendeNutriente = fehlende;
      return instanz;
    }

    const resolved = akt.rezept_id ? this.recipes.resolveLines(akt.rezept_id) : null;
    if (!resolved) {
      instanz.erfasst = false;
      return instanz;
    }
    instanz.fehlende_zeilen = resolved.unresolvedCount;
    const portionen = akt.portionen > 0 ? akt.portionen : 1;
    for (const zeile of resolved.zeilen) {
      if (zeile.result.menge_basis == null) continue;
      for (const b of this.zutatBeitraege(zeile.ingredient_id, zeile.result.menge_basis * portionen, fehlende)) {
        instanz.beitraege.push(b);
      }
    }
    if (resolved.unresolvedCount > 0 || fehlende.length > 0) instanz.erfasst = false;
    instanz.fehlendeNutriente = fehlende;
    return instanz;
  }

  private zutatBeitraege(ingredientId: string, mengeBasis: number, fehlende: FehlenderWert[]): NutrientIntakeIntern[] {
    const vorhanden = this.db.all<{ name: string; stufe: string; wert: number }>(
      'SELECT n.name, n.stufe, inr.wert_normiert_pro_100 AS wert ' +
      'FROM ingredient_nutrient inr JOIN nutrient n ON n.id = inr.nutrient_id ' +
      'WHERE inr.ingredient_id = ? ORDER BY n.name',
      [ingredientId],
    );
    const fehlt = this.db
      .all<{ name: string; stufe: string }>(
        'SELECT n.name, n.stufe FROM nutrient n ' +
        'WHERE n.id NOT IN (SELECT nutrient_id FROM ingredient_nutrient WHERE ingredient_id = ?) ' +
        'ORDER BY n.name',
        [ingredientId],
      )
      .map((f) => ({ name: f.name, stufe: f.stufe, hinweis: 'Nährwert fehlt in den Zutatendaten – ergänzen (FA-800)' }));
    fehlende.push(...fehlt);
    return vorhanden.map((v) => ({ name: v.name, stufe: v.stufe, wert_ug: (mengeBasis / 100) * v.wert }));
  }
}
