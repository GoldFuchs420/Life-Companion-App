/**
 * RecurrenceResolver (FA-207a-d, FA-213, TC-REC). Expandiert Wiederholungs-
 * Regeln zu konkreten Einzel-Instanzen innerhalb eines Zeitfensters.
 *
 * Grundsaetze:
 * - Wanduhr-Basis (keine UTC-Konversion): eine 07:00-Instanz bleibt 07:00,
 *   auch ueber die DST-Grenze hinweg (TC-REC-09).
 * - Die Serienlogik bleibt in der App-DB; der Resolver liefert nur
 *   expandierte Einzel-Events (z. B. fuer den Systemkalender, FA-213/TC-REC-08).
 * - Nicht existierende Tage (31. im Februar, 29.02. im Normaljahr) werden
 *   nicht raten-ersetzt, sondern sauber gekennzeichnet (FA-800-Geist).
 */
export type Wochentag = 'Mo' | 'Di' | 'Mi' | 'Do' | 'Fr' | 'Sa' | 'So';

export interface RecurrenceRule {
  typ: 'intervall' | 'monatstag' | 'jahrstag' | 'wochentage';
  intervall?: number;
  einheit?: 'stunden' | 'tage' | 'wochen' | 'monate' | 'jahre';
  wochentage?: Wochentag[];
  tag_im_monat?: number;
  /** 'MM-DD', z. B. '02-29' (FA-207c). */
  tag_im_jahr?: string;
  startdatum: string;
  enddatum?: string | null;
}

export interface AktivitaetZeitrahmen {
  start: string;
  ende: string;
}

export interface SerieInstanz {
  /** Wanduhr 'YYYY-MM-DDTHH:MM' (kein Zeitzonen-Suffix, TC-REC-09). */
  start: string;
  ende: string;
}

export interface ExpansionErgebnis {
  instanzen: SerieInstanz[];
  ausgelassen: Array<{ datum: string; hinweis: string }>;
}

const WOCHENTAG_INDEX: Record<Wochentag, number> = { Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, So: 7 };

const pad2 = (n: number) => String(n).padStart(2, '0');

function utcDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Ungueltiges Datum (FA-800): ${iso}`);
  return new Date(Date.UTC(y, m - 1, d));
}

function addTage(iso: string, tage: number): string {
  const d = utcDate(iso);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

function tageZwischen(a: string, b: string): number {
  return Math.round((utcDate(b).getTime() - utcDate(a).getTime()) / 86400000);
}

function wochentagVon(iso: string): number {
  const tag = utcDate(iso).getUTCDay();
  return tag === 0 ? 7 : tag;
}

function monatLetzterTag(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

function isSchaltjahr(jahr: number): boolean {
  return (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
}

function startWochenMontag(iso: string): string {
  return addTage(iso, -(wochentagVon(iso) - 1));
}

/** Wanduhr: Instanz zum Datum mit Auftrag-Zeitpunkt + Dauer, ohne UTC-Konversion. */
function instanzFuer(datum: string, t0: AktivitaetZeitrahmen): SerieInstanz {
  const startZeit = `${datum}T${t0.start.slice(11, 16)}`;
  const dauer = Math.max(0,
    (Number(t0.ende.slice(11, 13)) * 60 + Number(t0.ende.slice(14, 16)))
    - (Number(t0.start.slice(11, 13)) * 60 + Number(t0.start.slice(14, 16)))
    + tageZwischen(t0.start.slice(0, 10), t0.ende.slice(0, 10)) * 1440);
  const minutenTag = Number(startZeit.slice(11, 13)) * 60 + Number(startZeit.slice(14, 16)) + dauer;
  const tageSpat = Math.floor(minutenTag / 1440);
  const reste = minutenTag % 1440;
  return { start: startZeit, ende: `${addTage(datum, tageSpat)}T${pad2(Math.floor(reste / 60))}:${pad2(reste % 60)}` };
}

function expandiereStunden(
  regel: RecurrenceRule,
  zeitrahmen: AktivitaetZeitrahmen,
  von: string,
  bis: string,
  intervall: number,
): ExpansionErgebnis {
  const instanzen: SerieInstanz[] = [];
  const epoch = Date.parse(`${regel.startdatum}T${zeitrahmen.start.slice(11, 16)}:00Z`);
  if (Number.isNaN(epoch)) throw new Error(`Ungueltiger Start (FA-800): ${zeitrahmen.start}`);
  const vonEpoch = Date.parse(`${von}T00:00:00Z`);
  const bisEpoch = Date.parse(`${bis}T23:59:59Z`);
  const dauer = Math.max(0,
    (Number(zeitrahmen.ende.slice(11, 13)) * 60 + Number(zeitrahmen.ende.slice(14, 16)))
    - (Number(zeitrahmen.start.slice(11, 13)) * 60 + Number(zeitrahmen.start.slice(14, 16))));
  for (let t = epoch; t <= bisEpoch; t += intervall * 3600000) {
    const datum = new Date(t).toISOString().slice(0, 10);
    if (datum < von) continue;
    if (regel.enddatum && datum > regel.enddatum) break;
    const uhr = new Date(t).toISOString().slice(11, 16);
    const minuten = Number(uhr.slice(0, 2)) * 60 + Number(uhr.slice(3, 5)) + dauer;
    const reste = minuten % 1440;
    instanzen.push({
      start: `${datum}T${uhr}`,
      ende: `${addTage(datum, Math.floor(minuten / 1440))}T${pad2(Math.floor(reste / 60))}:${pad2(reste % 60)}`,
    });
  }
  return { instanzen, ausgelassen: [] };
}

export function expandiere(
  regel: RecurrenceRule,
  zeitrahmen: AktivitaetZeitrahmen,
  von: string,
  bis: string,
): ExpansionErgebnis {
  const instanzen: SerieInstanz[] = [];
  const ausgelassen: Array<{ datum: string; hinweis: string }> = [];
  const markierteMonate = new Set<string>();
  const raw = regel.intervall ?? 1;
  if (!Number.isInteger(raw) || raw < 1) throw new Error(`Ungueltiges Intervall (FA-800): ${raw}`);
  const intervall = raw;

  if (regel.typ === 'intervall' && regel.einheit === 'stunden') {
    return expandiereStunden(regel, zeitrahmen, von, bis, intervall);
  }

  for (let datum = von <= regel.startdatum ? regel.startdatum : von; datum <= bis; datum = addTage(datum, 1)) {
    if (datum < von) continue;
    if (regel.enddatum && datum > regel.enddatum) break;

    if (regel.typ === 'monatstag') {
      const tag = regel.tag_im_monat ?? Number(regel.startdatum.slice(8, 10));
      const jahr = Number(datum.slice(0, 4));
      const monat = Number(datum.slice(5, 7));
      if (datum.slice(8, 10) === pad2(tag)) {
        instanzen.push(instanzFuer(datum, zeitrahmen));
        continue;
      }
      if (tag > monatLetzterTag(jahr, monat) && !markierteMonate.has(datum.slice(0, 7))) {
        markierteMonate.add(datum.slice(0, 7));
        ausgelassen.push({ datum: `${datum.slice(0, 7)}-${pad2(tag)}`, hinweis: `${tag}. existiert in ${jahr}-${pad2(monat)} nicht – übersprungen (FA-207b)` });
      }
      continue;
    }

    if (regel.typ === 'jahrstag') {
      const mmdd = regel.tag_im_jahr ?? regel.startdatum.slice(5, 10);
      if (datum.slice(5, 10) === mmdd && (mmdd !== '02-29' || isSchaltjahr(Number(datum.slice(0, 4))))) {
        instanzen.push(instanzFuer(datum, zeitrahmen));
        continue;
      }
      if (datum.slice(5, 10) === mmdd) {
        ausgelassen.push({ datum, hinweis: `${mmdd} existiert ${datum.slice(0, 4)} nicht – nur Schaltjahre (FA-207c)` });
      }
      continue;
    }

    if (regel.typ === 'wochentage') {
      const wocheAbstand = Math.floor(tageZwischen(startWochenMontag(regel.startdatum), startWochenMontag(datum)) / 7);
      if (wocheAbstand % intervall !== 0) continue;
      if (!(regel.wochentage ?? []).some((w) => WOCHENTAG_INDEX[w] === wochentagVon(datum))) continue;
      instanzen.push(instanzFuer(datum, zeitrahmen));
      continue;
    }

    if (regel.typ === 'intervall' && (regel.einheit === 'tage' || regel.einheit === 'wochen')) {
      const schritt = regel.einheit === 'wochen' ? intervall * 7 : intervall;
      if (tageZwischen(regel.startdatum, datum) % schritt !== 0) continue;
      const filter = regel.wochentage ?? [];
      if (filter.length > 0 && !filter.some((w) => WOCHENTAG_INDEX[w] === wochentagVon(datum))) continue;
      instanzen.push(instanzFuer(datum, zeitrahmen));
      continue;
    }

    if (regel.typ === 'intervall' && (regel.einheit === 'monate' || regel.einheit === 'jahre')) {
      const anchorTag = Number(regel.startdatum.slice(8, 10));
      const jahr = Number(datum.slice(0, 4));
      const monat = Number(datum.slice(5, 7));
      if (anchorTag > monatLetzterTag(jahr, monat) && !markierteMonate.has(datum.slice(0, 7))) {
        markierteMonate.add(datum.slice(0, 7));
        ausgelassen.push({ datum: `${datum.slice(0, 7)}-${pad2(anchorTag)}`, hinweis: `${anchorTag}. existiert in ${jahr}-${pad2(monat)} nicht – übersprungen` });
        continue;
      }
      if (markierteMonate.has(datum.slice(0, 7))) continue;
      if (datum.slice(8, 10) !== pad2(anchorTag)) continue;
      instanzen.push(instanzFuer(datum, zeitrahmen));
    }
  }

  return { instanzen, ausgelassen };
}

/** Vereinigungsmenge mehrerer Wiederholungen ohne Duplikate, sortiert (FA-207, TC-REC-06). */
export function expandiereAlle(
  regeln: RecurrenceRule[],
  zeitrahmen: AktivitaetZeitrahmen,
  von: string,
  bis: string,
): ExpansionErgebnis {
  const nachStart = new Map<string, SerieInstanz>();
  const ausgelassen: Array<{ datum: string; hinweis: string }> = [];
  for (const regel of regeln) {
    const r = expandiere(regel, zeitrahmen, von, bis);
    for (const instanz of r.instanzen) {
      nachStart.set(instanz.start, instanz);
    }
    ausgelassen.push(...r.ausgelassen);
  }
  return { instanzen: [...nachStart.values()].sort((a, b) => (a.start < b.start ? -1 : 1)), ausgelassen };
}
