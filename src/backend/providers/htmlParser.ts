/**
 * Kleine, abhaengige HTML-Hilfsfunktionen fuer die Website-Parser-Adapter
 * (FA-504: ein Adapter = eine Datei; geteilte Helfer ohne Zustand).
 * Bewusst ohne Dependency: Fixtures und echte Seiten sind einfaches HTML,
 * Fehlen eines Markers fuehrt zu PARSE_FAILED statt Absturz (FA-503/FA-800).
 */

/** Entfernt Tags und fuehrt Entities wie &amp;/&auml;/&nbsp; zurueck. */
export function htmlUnescape(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&auml;/g, '\u00e4')
    .replace(/&ouml;/g, '\u00f6')
    .replace(/&uuml;/g, '\u00fc')
    .replace(/&Auml;/g, '\u00c4')
    .replace(/&Ouml;/g, '\u00d6')
    .replace(/&Uuml;/g, '\u00dc')
    .replace(/&szlig;/g, '\u00df')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, ziffern: string) => String.fromCodePoint(Number(ziffern)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deutsche Zahl "13,7" -> 13.7; unlesbar -> null (kein stiller Fallback, FA-800). */
export function parseDeZahl(text: string): number | null {
  const normalisiert = text.trim().replace(/\s+/g, '.').replace(',', '.');
  const wert = Number.parseFloat(normalisiert.replace(/[^0-9.]/g, ''));
  return Number.isFinite(wert) ? wert : null;
}

/** Erste Regex-Gruppe oder null. */
export function ersteGruppe(text: string, muster: RegExp): string | null {
  const treffer = muster.exec(text);
  return treffer?.[1] ?? null;
}

/** Alle Regex-Gruppenpaare ueber den Text (global), als Array der Captures. */
export function alleTreffer(text: string, muster: RegExp): RegExpMatchArray[] {
  const ergebnisse: RegExpMatchArray[] = [];
  for (const treffer of text.matchAll(muster)) ergebnisse.push(treffer);
  return ergebnisse;
}

 /** Zutaten-Zeile "500 g Mehl" / "1,5 TL Zucker" / "1 Zwiebel" / "1 Prise Salz". */
export function zutatenZeile(
  rohText: string,
): { menge: number; einheit: 'g' | 'kg' | 'ml' | 'l' | 'TL' | 'EL' | 'Tasse' | 'Stueck' } {
  const eingabe = rohText.trim().replace(/St\u00fcck/g, 'Stueck');
  const treffer = /^([\d,.]+)\s*(g|kg|ml|l|TL|EL|Tasse|Stueck)?\b\s*(.*)$/i.exec(eingabe);
  if (!treffer) return { menge: 0, einheit: 'Stueck' };
  const zahl = parseDeZahl(treffer[1] ?? '');
  const einheitsText = (treffer[2] ?? '').trim();
  const kanonisch: Record<string, 'g' | 'kg' | 'ml' | 'l' | 'TL' | 'EL' | 'Tasse' | 'Stueck'> = {
    g: 'g',
    kg: 'kg',
    ml: 'ml',
    l: 'l',
    tl: 'TL',
    el: 'EL',
    tasse: 'Tasse',
    stueck: 'Stueck',
  };
  const einheit = kanonisch[einheitsText.toLowerCase()];
  if (!einheit) return { menge: 0, einheit: 'Stueck' };
  return { menge: zahl ?? 0, einheit };
}
