/**
 * Atwater-Berechnung (FA-329, O-2) – insbesondere Ballaststoffe ×2 und Alkohol ×7 (nicht ×9).
 * Eingabe: µg-normierte Werte je 100 g/ml (FA-322), Ausgabe: kcal je 100 g/ml, 1 Nachkommastelle.
 * Entspricht der DB-View `v_ingredient_kcal_100` (TC-NRM-04: Parität).
 */
export interface MicrogramsPer100 {
  Eiweiß?: number;
  Kohlenhydrate?: number;
  Fett?: number;
  Ballaststoffe?: number;
  Alkohol?: number;
}

const KCAL_PER_G = {
  Eiweiß: 4,
  Kohlenhydrate: 4,
  Fett: 9,
  Ballaststoffe: 2,
  Alkohol: 7,
} as const;

export function kcalPer100(values: MicrogramsPer100): number {
  let uMicrograms = 0;
  for (const [name, factor] of Object.entries(KCAL_PER_G) as [keyof MicrogramsPer100, number][]) {
    const v = values[name] ?? 0;
    if (v < 0) throw new Error(`Negativer Nährwert für ${name}`);
    uMicrograms += v * factor;
  }
  return roundKcal(uMicrograms / 1_000_000);
}

export function roundKcal(kcal: number): number {
  return Math.round(kcal * 10) / 10;
}
