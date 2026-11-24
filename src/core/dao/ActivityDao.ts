import type { DbDriver } from '../db/driver';
import { makeId } from './ids';

export interface AktivitaetInput {
  titel: string;
  typ?: 'normal' | 'essen_rezept' | 'essen_zutat';
  kategorie_id: number;
  prioritaet?: 'beschaeftigt' | 'abwesend' | 'verfuegbar';
  beschreibung?: string | null;
  /** Wanduhr 'YYYY-MM-DDTHH:MM' (FA-213, TC-REC-09). */
  start: string;
  ende: string;
  vorlage_id?: number | null;
  rezept_id?: string | null;
  portionen?: number;
  ingredient_id?: string | null;
  zutat_menge?: number | null;
  zutat_einheit?: 'g' | 'ml' | null;
}

export interface RecurrenceInput {
  typ: 'intervall' | 'monatstag' | 'jahrstag' | 'wochentage';
  intervall?: number;
  einheit?: 'stunden' | 'tage' | 'wochen' | 'monate' | 'jahre';
  wochentage?: string;
  tag_im_monat?: number;
  tag_im_jahr?: string;
  startdatum: string;
  enddatum?: string | null;
}

export interface AktivitaetZeile extends Required<Pick<AktivitaetInput, 'titel' | 'typ' | 'kategorie_id'>> {
  id: string;
  prioritaet: 'beschaeftigt' | 'abwesend' | 'verfuegbar';
  beschreibung: string | null;
  start: string;
  ende: string;
  vorlage_id: number | null;
  rezept_id: string | null;
  portionen: number;
  ingredient_id: string | null;
  zutat_menge: number | null;
  zutat_einheit: 'g' | 'ml' | null;
}

export class ActivityDao {
  constructor(private readonly db: DbDriver) {}

  create(input: AktivitaetInput, recurrences: RecurrenceInput[] = []): string {
    const id = makeId();
    this.db.run(
      'INSERT INTO activity (id, titel, beschreibung, typ, kategorie_id, prioritaet, start, ende, ' +
      'vorlage_id, rezept_id, portionen, ingredient_id, zutat_menge, zutat_einheit) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.titel,
        input.beschreibung ?? null,
        input.typ ?? 'normal',
        input.kategorie_id,
        input.prioritaet ?? 'verfuegbar',
        input.start,
        input.ende,
        input.vorlage_id ?? null,
        input.rezept_id ?? null,
        input.portionen ?? 1,
        input.ingredient_id ?? null,
        input.zutat_menge ?? null,
        input.zutat_einheit ?? null,
      ],
    );
    for (const regel of recurrences) this.addRecurrence(id, regel);
    return id;
  }

  addRecurrence(aktivitaetId: string, regel: RecurrenceInput): void {
    this.db.run(
      'INSERT INTO recurrence (aktivitaet_id, typ, intervall, einheit, wochentage, tag_im_monat, tag_im_jahr, ' +
      'startdatum, enddatum) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        aktivitaetId,
        regel.typ,
        regel.intervall ?? 1,
        regel.einheit ?? null,
        regel.wochentage ?? null,
        regel.tag_im_monat ?? null,
        regel.tag_im_jahr ?? null,
        regel.startdatum,
        regel.enddatum ?? null,
      ],
    );
  }

  /** FA-209: Aktivität aus Vorlage instanziieren; Werte (Titel/Kategorie) kommen aus der Vorlage. */
  createAusVorlage(vorlageId: number, start: string, ende: string): string | null {
    const vorlage = this.db
      .all<{ titel: string; beschreibung: string | null; kategorie_id: number }>(
        'SELECT titel, beschreibung, kategorie_id FROM activity_template WHERE id = ?',
        [vorlageId],
      )
      .at(0);
    if (!vorlage) return null;
    const id = makeId();
    this.db.run(
      'INSERT INTO activity (id, titel, beschreibung, typ, kategorie_id, prioritaet, start, ende, vorlage_id) ' +
      "VALUES (?, ?, ?, 'normal', ?, 'verfuegbar', ?, ?, ?)",
      [id, vorlage.titel, vorlage.beschreibung, vorlage.kategorie_id, start, ende, vorlageId],
    );
    return id;
  }

  get(id: string): AktivitaetZeile | null {
    return (
      this.db
        .all<AktivitaetZeile>(
          'SELECT id, titel, beschreibung, typ, kategorie_id, prioritaet, start, ende, vorlage_id, rezept_id, ' +
          'portionen, ingredient_id, zutat_menge, zutat_einheit FROM activity WHERE id = ?',
          [id],
        )
        .at(0) ?? null
    );
  }

  /**
   * Aktivitäten für die Wochenansicht: Anker im Zeitraum ODER mit Wiederholungs-Regeln
   * (der Anker kann vor dem Zeitraum liegen, die Instanzen fallen hinein – FA-213).
   */
  listImZeitraum(von: string, bis: string): AktivitaetZeile[] {
    return this.db.all<AktivitaetZeile>(
      'SELECT id, titel, beschreibung, typ, kategorie_id, prioritaet, start, ende, vorlage_id, rezept_id, ' +
      'portionen, ingredient_id, zutat_menge, zutat_einheit FROM activity ' +
      'WHERE substr(start, 1, 10) BETWEEN ? AND ? ' +
      '   OR id IN (SELECT DISTINCT aktivitaet_id FROM recurrence) ' +
      'ORDER BY start',
      [von, bis],
    );
  }

  recurrencesOf(aktivitaetId: string): RecurrenceInput[] {
    return this.db.all<{
      typ: RecurrenceInput['typ'];
      intervall: number | null;
      einheit: RecurrenceInput['einheit'] | null;
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
      .map((row) => ({
        typ: row.typ,
        intervall: row.intervall ?? 1,
        einheit: row.einheit ?? undefined,
        wochentage: row.wochentage ?? undefined,
        tag_im_monat: row.tag_im_monat ?? undefined,
        tag_im_jahr: row.tag_im_jahr ?? undefined,
        startdatum: row.startdatum,
        enddatum: row.enddatum,
      }));
  }
}
