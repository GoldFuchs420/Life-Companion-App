/**
 * ActivityRepository – Wochenansicht der eigenen Kalender-DB (FA-202/204/214).
 *
 * Grundsaetze:
 * - Serien werden hier expandiert (FA-213/TC-AGG-02): die Instanzen einer Aktivitaet
 *   fallen per RecurrenceResolver in den Zeitraum; der Anker selbst kann davor liegen.
 * - Ueberlappungen sind reine Warn-/Anzeige-Logik (FA-203/211, TC-OVR): gleichzeitige
 *   Instanzen werden markiert, nicht verhindert; der Konflikt-Flag "konflikt_beschaeftigt"
 *   fasst Prioritäts-Konflikte (beschaeftigt) zusammen (TC-OVR-02), sonst Farbe/Anzeige (TC-OVR-03).
 * - Kategorie-Filter (FA-214/TC-OVR-04): alle Instanzen bleiben enthalten; die Instanzen
 *   der gewaehlten Kategorie bekommen `gefiltert = true` und werden im UI nur ausgegraut.
 */
import type { DbDriver } from '../db/driver';
import { ActivityDao, type AktivitaetZeile, type RecurrenceInput } from '../dao/ActivityDao';
import type { AktivitaetZeitrahmen, RecurrenceRule, Wochentag } from '../recurrence/RecurrenceResolver';
import { expandiereAlle } from '../recurrence/RecurrenceResolver';

export interface KalenderInstanz {
  aktivitaet_id: string;
  titel: string;
  typ: string;
  kategorie_id: number;
  prioritaet: 'beschaeftigt' | 'abwesend' | 'verfuegbar';
  vorlage_id: number | null;
  start: string;
  ende: string;
  /** FA-203/TC-OVR-01: überlappt mit mindestens einer anderen Instanz. */
  ueberlappt: boolean;
  /** FA-211/TC-OVR-02: Konflikt, an dem eine "beschaeftigt"-Instanz beteiligt ist. */
  konflikt_beschaeftigt: boolean;
  /** FA-214/TC-OVR-04: zur aktiven Filter-Kategorie gehoerig (UI: ausgegraut statt entfernt). */
  gefiltert: boolean;
}

export interface Wochenansicht {
  von: string;
  bis: string;
  instanzen: KalenderInstanz[];
  ueberlappungen: Array<{ a: string; b: string }>;
}

export interface WochenansichtFilter {
  kategorie_id?: number;
}

type Prioritaet = KalenderInstanz['prioritaet'];

function minutesBetween(start: string, ende: string): number {
  const ms = (iso: string) =>
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
      Number(iso.slice(11, 13)),
      Number(iso.slice(14, 16)),
    );
  const delta = ms(ende) - ms(start);
  return Number.isFinite(delta) ? Math.round(delta / 60000) : 0;
}

export function dauerMinuten(instanz: KalenderInstanz): number {
  const dauer = minutesBetween(instanz.start, instanz.ende);
  return dauer > 0 ? dauer : 0;
}

function regelnVon(recurrences: RecurrenceInput[]): RecurrenceRule[] {
  return recurrences.map((r) => ({
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

export class ActivityRepository {
  private readonly activities: ActivityDao;

  constructor(db: DbDriver) {
    this.activities = new ActivityDao(db);
  }

  /** FA-209: aus Vorlage instanziieren; Dauer übernimmt die Aktivität (Start/Ende durch den Nutzer). */
  ausVorlage(vorlageId: number, start: string, ende: string): string | null {
    return this.activities.createAusVorlage(vorlageId, start, ende);
  }

  wochenansicht(von: string, bis: string, filter: WochenansichtFilter = {}): Wochenansicht {
    const instanzen: Omit<KalenderInstanz, 'gefiltert'>[] = [];
    for (const akt of this.activities.listImZeitraum(von, bis)) {
      for (const zeitrahmen of this.instanzZeitrahmen(akt, von, bis)) {
        instanzen.push(this.zeile(akt, zeitrahmen));
      }
    }
    instanzen.sort((a, b) => (a.start < b.start ? -1 : 1));

    const ueberlappungen: Array<{ a: string; b: string }> = [];
    for (let i = 0; i < instanzen.length; i++) {
      for (let j = i + 1; j < instanzen.length; j++) {
        const a = instanzen[i]!;
        const b = instanzen[j]!;
        if (b.start >= a.ende) break;
        ueberlappungen.push({ a: a.aktivitaet_id, b: b.aktivitaet_id });
        a.ueberlappt = true;
        b.ueberlappt = true;
        if (a.prioritaet === 'beschaeftigt' || b.prioritaet === 'beschaeftigt') {
          a.konflikt_beschaeftigt = true;
          b.konflikt_beschaeftigt = true;
        }
      }
    }

    const ergebnis: KalenderInstanz[] = instanzen.map((i) => ({
      ...i,
      gefiltert: filter.kategorie_id != null && i.kategorie_id === filter.kategorie_id,
    }));

    return { von, bis, instanzen: ergebnis, ueberlappungen };
  }

  private instanzZeitrahmen(akt: AktivitaetZeile, von: string, bis: string): AktivitaetZeitrahmen[] {
    const recurrences = this.activities.recurrencesOf(akt.id);
    if (recurrences.length > 0) {
      return expandiereAlle(regelnVon(recurrences), { start: akt.start, ende: akt.ende }, von, bis).instanzen;
    }
    const datum = akt.start.slice(0, 10);
    if (datum < von || datum > bis) return [];
    return [{ start: akt.start, ende: akt.ende }];
  }

  private zeile(akt: AktivitaetZeile, zeitrahmen: AktivitaetZeitrahmen) {
    return {
      aktivitaet_id: akt.id,
      titel: akt.titel,
      typ: akt.typ,
      kategorie_id: akt.kategorie_id,
      prioritaet: akt.prioritaet as Prioritaet,
      vorlage_id: akt.vorlage_id,
      start: zeitrahmen.start,
      ende: zeitrahmen.ende,
      ueberlappt: false,
      konflikt_beschaeftigt: false,
    };
  }
}
