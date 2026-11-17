/**
 * CIRSOC 201-2025 Table 20.5.1.3.1: the specified cover of cast-in-place concrete that is not
 * prestressed, mm. The table has two columns: elements under execution control, and the rest,
 * which add 5 mm to every value and 10 mm instead of 5 to the db terms.
 */

export type CoverElement = 'beam' | 'column' | 'slab' | 'wall' | 'footing';

/** Not exposed to weather nor in contact with the ground; in vertical contact with the ground or exposed to weather; cast against the ground. */
export type CoverExposure = 'interior' | 'exterior' | 'ground';

export interface CoverCase {
  element: CoverElement;
  exposure: CoverExposure;
  /** The largest bar the element holds, mm. */
  dbMm: number;
  /** Beams and columns: the stirrup or tie the cover is measured to, mm. */
  stirrupMm?: number;
  /** Under execution control (the table's first column). Absent: true. */
  control?: boolean;
}

/** Row (c), beams and columns: the main bars' cover, 35 mm but at least db + 5 mm, under control. */
export const mainBarCoverMm = (dbMm: number, control = true): number => (control ? Math.max(35, dbMm + 5) : Math.max(40, dbMm + 10));

/**
 * The least clear cover to the outermost steel, mm: to the stirrups of a beam or column, where both
 * their own row (25 mm) and the main bars' row behind them (`mainBarCoverMm` less the stirrup) apply.
 */
export function specifiedCoverMm(c: CoverCase): number {
  const control = c.control ?? true;
  const add = control ? 0 : 5, dbAdd = control ? 5 : 10;
  if (c.element === 'footing') return 55 + add;
  if (c.exposure !== 'interior') return (c.dbMm > 16 ? 40 : 35) + add;
  if (c.element === 'slab' || c.element === 'wall') return c.dbMm > 32 ? c.dbMm + dbAdd : Math.max(25 + add, c.dbMm + dbAdd);
  const st = c.stirrupMm ?? 0;
  return Math.max(25 + add, mainBarCoverMm(c.dbMm, control) - st);
}
