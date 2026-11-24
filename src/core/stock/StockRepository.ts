/**
 * Bestand & FIFO (FA-400..404, TC-FIF). Bestand ist abgeleitet:
 * Einkaufsposten (intern g/ml, FA-333) minus Summe der FIFO-Verbuchungen.
 * Verbrauch ueber den Bestand hinaus erzeugt eine Deckungsluecke (TC-FIF-02),
 * der Bestand wird nie negativ angezeigt.
 */
import type { DbDriver } from '../db/driver';
import { makeId } from '../dao/ids';

export interface PurchaseItemInput {
  ingredient_id: string;
  menge: number;
  einheit: 'g' | 'kg' | 'ml' | 'l';
  zustand?: string | null;
  shopping_category_id?: number | null;
  preis?: number | null;
  mhd?: string | null;
}

const BASIS_FAKTOR: Record<PurchaseItemInput['einheit'], { faktor: number; basis: 'g' | 'ml' }> = {
  g: { faktor: 1, basis: 'g' },
  kg: { faktor: 1000, basis: 'g' },
  ml: { faktor: 1, basis: 'ml' },
  l: { faktor: 1000, basis: 'ml' },
};

export interface Zuteilung {
  purchase_item_id: string;
  einheit: 'g' | 'ml';
  menge: number;
}

export interface VerbrauchErgebnis {
  zuteilungen: Zuteilung[];
  /** Menge, die über den Bestand hinaus angefragt wurde (TC-FIF-02). */
  deckungsluecke: number;
}

interface OffenerPosten {
  id: string;
  ingredient_id: string;
  einheit: 'g' | 'ml';
  menge_basis: number;
  verbraucht: number;
}

export class StockRepository {
  constructor(private readonly db: DbDriver) {}

  createPurchase(
    input: { datum: string; markt_id?: number | null; notiz?: string | null },
    items: PurchaseItemInput[],
  ): { purchase_id: string; item_ids: string[] } {
    const purchase_id = makeId();
    this.db.run('INSERT INTO purchase (id, datum, markt_id, notiz) VALUES (?, ?, ?, ?)', [
      purchase_id,
      input.datum,
      input.markt_id ?? null,
      input.notiz ?? null,
    ]);
    const item_ids = items.map((item) => {
      const basis = BASIS_FAKTOR[item.einheit];
      const menge_basis = item.menge * basis.faktor;
      if (!Number.isFinite(menge_basis) || menge_basis <= 0) {
        throw new Error(`Ungueltige Menge fuer Posten (FA-800): ${item.menge} ${item.einheit}`);
      }
      const id = makeId();
      this.db.run(
        'INSERT INTO purchase_item (id, purchase_id, ingredient_id, menge, einheit, zustand, shopping_category_id, preis, mhd) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, purchase_id, item.ingredient_id, menge_basis, basis.basis, item.zustand ?? null,
         item.shopping_category_id ?? null, item.preis ?? null, item.mhd ?? null],
      );
      return id;
    });
    return { purchase_id, item_ids };
  }

  /** Verbraucht FIFO vom Bestand; Menge immer in der Basiseinheit (g/ml). */
  verbrauche(
    ingredient_id: string,
    menge_basis: number,
    datum: string,
    aktivitaet_id?: string | null,
  ): VerbrauchErgebnis {
    if (!Number.isFinite(menge_basis) || menge_basis <= 0) {
      return { zuteilungen: [], deckungsluecke: 0 };
    }
    const offene = this.db
      .all<OffenerPosten>(
        'SELECT pi.id, pi.ingredient_id, pi.einheit, pi.menge AS menge_basis, ' +
        'COALESCE((SELECT SUM(cp.menge) FROM stock_consumption cp WHERE cp.purchase_item_id = pi.id), 0) AS verbraucht ' +
        'FROM purchase_item pi JOIN purchase p ON p.id = pi.purchase_id ' +
        'WHERE pi.ingredient_id = ? ORDER BY p.datum ASC, pi.id ASC',
        [ingredient_id],
      )
      .map((r) => r)
      .filter((r) => r.menge_basis - r.verbraucht > 1e-9);

    const zuteilungen: Zuteilung[] = [];
    let rest = menge_basis;
    for (const posten of offene) {
      if (rest <= 1e-9) break;
      const verfuegbar = posten.menge_basis - posten.verbraucht;
      const teilnahme = Math.min(verfuegbar, rest);
      this.db.run(
        'INSERT INTO stock_consumption (purchase_item_id, aktivitaet_id, datum, menge, einheit) VALUES (?, ?, ?, ?, ?)',
        [posten.id, aktivitaet_id ?? null, datum, teilnahme, posten.einheit],
      );
      zuteilungen.push({ purchase_item_id: posten.id, einheit: posten.einheit, menge: teilnahme });
      rest -= teilnahme;
    }
    return { zuteilungen, deckungsluecke: rest > 1e-9 ? rest : 0 };
  }

  /** Offene Bestandsposten je Zutat (rest = menge − verbraucht, mindestens 0, TC-FIF-02). */
  bestand(ingredient_id?: string): Array<{
    purchase_item_id: string;
    ingredient_id: string;
    name: string;
    einheit: 'g' | 'ml';
    menge_basis: number;
    verbraucht: number;
    rest: number;
    mhd: string | null;
    preis: number | null;
    datum: string;
  }> {
    return this.db
      .all<{
        id: string; ingredient_id: string; name: string; einheit: 'g' | 'ml'; menge: number;
        verbraucht: number; mhd: string | null; preis: number | null; datum: string;
      }>(
        'SELECT pi.id, pi.ingredient_id, i.name, pi.einheit, pi.menge, ' +
        'COALESCE((SELECT SUM(cp.menge) FROM stock_consumption cp WHERE cp.purchase_item_id = pi.id), 0) AS verbraucht, ' +
        'pi.mhd, pi.preis, p.datum AS datum ' +
        'FROM purchase_item pi JOIN purchase p ON p.id = pi.purchase_id JOIN ingredient i ON i.id = pi.ingredient_id ' +
        'WHERE (? IS NULL OR pi.ingredient_id = ?) ORDER BY i.name, p.datum, pi.id',
        [ingredient_id ?? null, ingredient_id ?? null],
      )
      .map((r) => ({
        purchase_item_id: r.id,
        ingredient_id: r.ingredient_id,
        name: r.name,
        einheit: r.einheit,
        menge_basis: r.menge,
        verbraucht: r.verbraucht,
        rest: Math.max(0, r.menge - r.verbraucht),
        mhd: r.mhd,
        preis: r.preis,
        datum: r.datum,
      }))
      .filter((r) => r.rest > 1e-9);
  }

  /** MHD-Warnliste (FA-404, TC-FIF-04): ohne MHD bleibt der Posten ohne Warnung. */
  mhdWarnungen(
    heute: string,
    vorwarnung_tage = 3,
  ): Array<{ purchase_item_id: string; ingredient_id: string; name: string; mhd: string; art: 'abgelaufen' | 'laeuft_bald_ab'; rest: number }> {
    const grenze = addDays(heute, vorwarnung_tage);
    return this.bestand()
      .filter((r) => r.mhd != null && r.mhd <= grenze)
      .map((r) => ({
        purchase_item_id: r.purchase_item_id,
        ingredient_id: r.ingredient_id,
        name: r.name,
        mhd: r.mhd as string,
        art: r.mhd! < heute ? ('abgelaufen' as const) : ('laeuft_bald_ab' as const),
        rest: r.rest,
      }));
  }
}

function addDays(isoDatum: string, tage: number): string {
  const d = new Date(`${isoDatum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
