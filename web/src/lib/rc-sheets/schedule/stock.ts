/**
 * A schedule's marks cut from commercial bars: per mark, how many stock lengths it takes and the
 * offcut left, and the totals by diameter an order is placed with.
 *
 * Pure.
 */

/** One mark as the stock count reads it: cutting length in m, mass of all its pieces in kg. */
export interface StockMark<R = string, P = string> {
  mark: string;
  diameterMm: number;
  cuttingLength: number;
  quantity: number;
  shape: string;
  massKg: number;
  role?: R;
  purpose?: P;
  ownerElementIds?: number[];
  zoneIds?: string[];
}

export interface StockRow<R = string, P = string> {
  mark: string;
  /**
   * What the item is, and where it belongs — carried from the mark, not re-derived.
   *
   * Optional because a caller outside coordinated detailing can legitimately hand-build a row
   * from a bill that has no assembly behind it. The exporter renders a blank rather than
   * throwing: a missing column is a thinner workbook, a thrown exporter is no workbook.
   */
  role?: R;
  /**
   * What the item is FOR. Absent means resistant reinforcement.
   *
   * Its own column rather than a suffix on `role`, because a bender reads `role` to know what
   * to fabricate and an engineer reads this to know what the bar answers for. Merging them
   * would make the fabrication column carry an engineering claim.
   */
  purpose?: P;
  ownerElementIds?: number[];
  zoneIds?: string[];
  diameterMm: number;
  shape: string;
  quantity: number;
  cuttingLengthM: number;
  totalLengthM: number;
  massKg: number;
  stockBars: number;
  offcutM: number;
}

export interface StockTable<R = string, P = string> {
  rows: Array<StockRow<R, P>>;
  totals: { quantity: number; totalLengthM: number; massKg: number; stockBars: number; wasteM: number };
  /** Per-diameter subtotals, for ordering. */
  byDiameter: Array<{ diameterMm: number; quantity: number; massKg: number; stockBars: number }>;
  notes: string[];
}

/**
 * Build the bar bending schedule from the marks.
 *
 * Stock and offcut are computed per mark, matching how a shop cuts: identical bars are
 * nested together, different marks are not mixed on one stock length. Presenting an
 * optimal cross-mark nesting the shop will not follow would understate the order.
 */
export function buildSchedule<R = string, P = string>(
  marks: ReadonlyArray<StockMark<R, P>>, stockLength = 12,
  extraNotes: readonly string[] = [],
): StockTable<R, P> {
  const rows: Array<StockRow<R, P>> = [];
  const notes = [...extraNotes];

  for (const m of marks) {
    const perStock = m.cuttingLength > stockLength ? 0 : Math.max(1, Math.floor(stockLength / m.cuttingLength));
    const stockBars = perStock === 0 ? m.quantity : Math.ceil(m.quantity / perStock);
    const offcut = perStock === 0 ? 0 : stockLength - perStock * m.cuttingLength;
    if (perStock === 0) {
      notes.push(
        `La marca ${m.mark} (${m.cuttingLength.toFixed(2)} m) excede la barra comercial de ` +
        `${stockLength} m y requiere empalme.`);
    }
    rows.push({
      mark: m.mark, diameterMm: m.diameterMm, shape: m.shape, quantity: m.quantity,
      role: m.role, purpose: m.purpose,
      ownerElementIds: m.ownerElementIds, zoneIds: m.zoneIds,
      cuttingLengthM: m.cuttingLength,
      totalLengthM: m.cuttingLength * m.quantity,
      massKg: m.massKg,
      stockBars,
      offcutM: offcut * stockBars,
    });
  }

  const byDia = new Map<number, { quantity: number; massKg: number; stockBars: number }>();
  for (const r of rows) {
    const g = byDia.get(r.diameterMm) ?? { quantity: 0, massKg: 0, stockBars: 0 };
    g.quantity += r.quantity; g.massKg += r.massKg; g.stockBars += r.stockBars;
    byDia.set(r.diameterMm, g);
  }

  return {
    rows,
    totals: {
      quantity: rows.reduce((s, r) => s + r.quantity, 0),
      totalLengthM: rows.reduce((s, r) => s + r.totalLengthM, 0),
      massKg: rows.reduce((s, r) => s + r.massKg, 0),
      stockBars: rows.reduce((s, r) => s + r.stockBars, 0),
      wasteM: rows.reduce((s, r) => s + r.offcutM, 0),
    },
    byDiameter: [...byDia.entries()]
      .map(([diameterMm, g]) => ({ diameterMm, ...g }))
      .sort((a, b) => a.diameterMm - b.diameterMm),
    notes,
  };
}
