/**
 * ActivityStatistics (FA-603, FA-608): Zeit und (orientierender) Kalorienverbrauch
 * je Kategorie im Zeitraum, Basis sind die Instanzen der Wochenansicht/Zeitraum-Abfrage.
 *
 * Grundsaetze:
 * - Zeit = Dauer je Instanz, summiert je Kategorie (Auswertung nach Kategorie, nicht nach Priorität – FA-211).
 * - Kalorienverbrauch NUR aus Vorlagen-kcal_pro_stunde × Dauer (FA-603, FA-208: leer/0 = keine Kalorien);
   kcal von Essen-Eintraegen sind Zufuhr (FA-610/Aggregator), hier nicht doppelt zu buchen.
 * - Aktivitaeten ohne Kategorie-Vorlage verursachen keine kcal; nie ein Abbruch (FA-800).
 */
import type { DbDriver } from '../db/driver';
import type { KalenderInstanz } from '../activity/ActivityRepository';
import { dauerMinuten } from '../activity/ActivityRepository';

export interface KategorieZeile {
  kategorie_id: number;
  name: string;
  minuten: number;
  kcal_verbrauch: number;
}

export class ActivityStatistics {
  constructor(private readonly db: DbDriver) {}

  zeitProKategorie(instanzen: KalenderInstanz[]): KategorieZeile[] {
    const vorlagen = new Map<number, number>();
    const zeilen = new Map<number, { minuten: number; kcal_verbrauch: number }>();

    for (const instanz of instanzen) {
      const dauer = dauerMinuten(instanz);
      if (dauer <= 0) continue;
      const zeile = zeilen.get(instanz.kategorie_id) ?? { minuten: 0, kcal_verbrauch: 0 };
      zeile.minuten += dauer;
      if (instanz.vorlage_id != null) {
        const kcalProStunde = vorlagen.get(instanz.vorlage_id) ?? this.vorlageKcal(instanz.vorlage_id);
        vorlagen.set(instanz.vorlage_id, kcalProStunde);
        zeile.kcal_verbrauch += (kcalProStunde * dauer) / 60;
      }
      zeilen.set(instanz.kategorie_id, zeile);
    }

    return [...zeilen.entries()]
      .map(([kategorie_id, v]) => {
        const name =
          this.db
            .all<{ name: string }>('SELECT name FROM category WHERE id = ?', [kategorie_id])
            .at(0)?.name ?? `(Kategorie ${kategorie_id})`;
        return {
          kategorie_id,
          name,
          minuten: v.minuten,
          kcal_verbrauch: Math.round(v.kcal_verbrauch * 10) / 10,
        };
      })
      .sort((a, b) => b.minuten - a.minuten);
  }

  private vorlageKcal(vorlageId: number): number {
    const kcal =
      this.db
        .all<{ kcal_pro_stunde: number | null }>('SELECT kcal_pro_stunde FROM activity_template WHERE id = ?', [vorlageId])
        .at(0)?.kcal_pro_stunde ?? null;
    return kcal != null && kcal > 0 ? kcal : 0;
  }
}
