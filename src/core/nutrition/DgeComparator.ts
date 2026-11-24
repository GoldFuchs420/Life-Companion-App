/**
 * DgeComparator (FA-601, FA-602, TC-DGE): vergleicht die aggregierte Aufnahme
 * (durchschnitt pro Tag, siehe NutritionAggregator) mit den DGE-Referenzzeilen.
 *
 * Grundsaetze:
 * - Die Referenz wird aus reference_dge gelesen (nicht hart kodiert); der DGE-Seed
 *   speichert empfohlen_tag in der Anzeigeeinheit des Naehrstoffs pro TAG, intern
 *   wird auf µg normiert: empfohlen_ug = empfohlen_tag × normfaktor_nach_µg.
 * - Die Aufnahme kommt intern in µg/pro Tag und wird fuer die Anzeige in die
 *   Anzeigeeinheit rueckgerechnet: anzeige = wert_ug / normfaktor.
 * - Ampellogik (FA-602, TC-DGE-03): innerhalb = ±toleranz (K-Default 0,10 = ±10 %)
 *   um die Empfehlung; darunter 'unterhalb', darueber 'oberhalb'. Reine
 *   Anzeige-Logik – nie eine Sperre.
 * - Fehlende Referenzzeilen (z. B. unseeded Altersgruppe oder Geschlecht 'divers')
 *   fuehren zu 'referenz_fehlt' mit Hinweis (FA-800, TC-DGE-02) – nie zu einem Absturz.
 */
import type { DbDriver } from '../db/driver';
import type { NutrientAggregat } from './NutritionAggregator';

export type AmpelStatus = 'unterhalb' | 'innerhalb' | 'oberhalb';
export type DgeStatus = AmpelStatus | 'referenz_fehlt';

export interface DgeReferenz {
  altersgruppe: string;
  geschlecht: 'maennlich' | 'weiblich' | 'divers';
  /** Relative Toleranz fuer "innerhalb" (K-Default 0.10 = ±10 %). */
  toleranz?: number;
}

export interface DgeZeile {
  nutrient_name: string;
  stufe: string;
  einheit: 'mg' | 'µg' | 'ml';
  /** Aufnahme im Durchschnitt pro Tag (Anzeigeeinheit). */
  intake_pro_tag: number;
  /** DGE-Empfehlung pro Tag (Anzeigeeinheit). */
  empfohlen_tag: number;
  /** intake_pro_tag / empfohlen_tag. */
  ist_anteil: number;
  status: AmpelStatus;
}

export interface ReferenzFehlt {
  nutrient_name: string;
  hinweis: string;
}

export interface DgeErgebnis {
  altersgruppe: string;
  geschlecht: string;
  toleranz: number;
  zeilen: DgeZeile[];
  referenzFehlt: ReferenzFehlt[];
}

/** TC-DGE-03: Ampelschwellen um 1.0 mit relativer Toleranz. */
export function ampelStatus(ist_anteil: number, toleranz: number): AmpelStatus {
  if (ist_anteil < 1 - toleranz) return 'unterhalb';
  if (ist_anteil > 1 + toleranz) return 'oberhalb';
  return 'innerhalb';
}

/**
 * Altersgruppe aus dem Profil-Alter (K-Default-Gruppierung, an den DGE-Seed
 * '25-51' angelehnt). Gruppen ohne Seed-Zeilen fuehren zu 'referenz_fehlt'
 * (TC-DGE-02, FA-800) – bewusst kein stiller Fallback auf '25-51'.
 */
export function altersgruppeVonAlter(alter: number): string {
  if (!Number.isFinite(alter) || alter < 0) return 'unbekannt';
  if (alter < 19) return '15-19';
  if (alter < 25) return '19-25';
  if (alter < 51) return '25-51';
  if (alter < 65) return '51-65';
  return '65+';
}

/** Alter am Stichtag aus Geburtsdatum 'YYYY-MM-DD'. */
export function alterVonGeburtsdatum(geburtsdatum: string, heute = new Date()): number {
  const jahr = Number(geburtsdatum.slice(0, 4));
  const monat = Number(geburtsdatum.slice(5, 7));
  const tag = Number(geburtsdatum.slice(8, 10));
  if (!jahr || !monat || !tag) return -1;
  let alter = heute.getFullYear() - jahr;
  const vorDemGeburtstag =
    heute.getMonth() + 1 < monat || (heute.getMonth() + 1 === monat && heute.getDate() < tag);
  if (vorDemGeburtstag) alter -= 1;
  return alter;
}

export class DgeComparator {
  constructor(private readonly db: DbDriver) {}

  compare(proNutrient: NutrientAggregat[], referenz: DgeReferenz): DgeErgebnis {
    const toleranz = referenz.toleranz ?? 0.1;
    const rows = this.db.all<{
      name: string;
      stufe: string;
      einheit: 'mg' | 'µg' | 'ml';
      normfaktor: number;
      empfohlen: number;
    }>(
      'SELECT n.name, n.stufe, n.einheit, n.normfaktor_nach_µg AS normfaktor, dge.empfohlen_tag AS empfohlen ' +
      'FROM nutrient n JOIN reference_dge dge ' +
      '  ON dge.nutrient_id = n.id AND dge.altersgruppe = ? AND dge.geschlecht = ? ' +
      'ORDER BY n.name',
      [referenz.altersgruppe, referenz.geschlecht],
    );

    const intake = new Map(proNutrient.map((p) => [p.name, p]));
    const zeilen: DgeZeile[] = rows.map((r) => {
      const intake_ug = intake.get(r.name)?.wert_pro_tag_ug ?? 0;
      const empfohlen_ug = r.empfohlen * r.normfaktor;
      const ist_anteil = empfohlen_ug > 0 ? intake_ug / empfohlen_ug : 0;
      return {
        nutrient_name: r.name,
        stufe: r.stufe,
        einheit: r.einheit,
        intake_pro_tag: Math.round((intake_ug / r.normfaktor) * 1000) / 1000,
        empfohlen_tag: r.empfohlen,
        ist_anteil: Math.round(ist_anteil * 1000) / 1000,
        status: ampelStatus(ist_anteil, toleranz),
      };
    });

    const mitReferenz = new Set(rows.map((r) => r.name));
    const referenzFehlt: ReferenzFehlt[] = proNutrient
      .filter((p) => !mitReferenz.has(p.name))
      .map((p) => ({
        nutrient_name: p.name,
        hinweis: 'Referenzwert fehlt – ergänzen/überspringen (FA-800, TC-DGE-02)',
      }))
      .sort((a, b) => (a.nutrient_name < b.nutrient_name ? -1 : 1));

    return {
      altersgruppe: referenz.altersgruppe,
      geschlecht: referenz.geschlecht,
      toleranz,
      zeilen,
      referenzFehlt,
    };
  }
}
