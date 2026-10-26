/**
 * §9.7.3.8.2 as a row of the memoria, the workbook and the IFC: the positive steel's end in the
 * supports, and which reading of the member's role in the lateral-force-resisting system the
 * design used to set it (`model/lateral-system.ts`).
 *
 * The bar ends themselves are the verifier's support rows (`end-support-anchorage.ts`
 * `endSupportChecks`, one per row of bars); this row states what they were held to and why, so a
 * member whose role was not declared reads, wherever its design is read, that it was designed as
 * part of the system and that its bottom bars develop fy at the face. Its status is the worst of
 * those bottom rows: it repeats their verdict, it never adds a pass of its own.
 *
 * Pure: the caller translates.
 */
import { fromVerifStatus, type CheckRow } from '../../design-contract';
import { developsAtFace, type LateralReading } from '../../model/lateral-system';
import { lateralReadingNote } from './end-support-anchorage';
import type { ProvidedRebarResult } from '../station-design-forces';

type Tr = (key: string, params?: Record<string, string | number>) => string;

/** The verifier's rows of the bottom bars' ends in a column (`endSupportChecks`). */
const BOTTOM_SUPPORT_ROW = /^Anchorage at support \((start|end), bottom/;

/** The memoria's words for a reading: `lateral.reading.<role>`. */
export const lateralReadingKey = (r: LateralReading | undefined): string => `lateral.reading.${r?.role ?? 'undeclared'}`;

/** The row, or none where no bottom bar ends in a column (a line that continues, no column). */
export function lateralAnchorageRow(p: ProvidedRebarResult, reading: LateralReading | undefined, tr: Tr): CheckRow | null {
  const rows = p.checks.filter((c) => BOTTOM_SUPPORT_ROW.test(c.category));
  if (rows.length === 0) return null;
  const worst = rows.some((c) => c.status === 'fail') ? 'fail' : rows.some((c) => c.status === 'warn') ? 'warn' : 'ok';
  const develops = developsAtFace(reading);
  return {
    code: 'cirsoc-201', edition: '2025', clause: '9.7.3.8.2',
    title: 'Positive steel into the supports', titleKey: 'check.rc.lateralAnchorage',
    formula: develops ? 'ℓ ≥ ℓd, ℓdh (fy)' : 'ℓ ≥ 150 mm',
    inputs: [{ symbol: 'SRFL', description: tr('lateral.symbol'), value: tr(`lateral.role.${reading?.role ?? 'undeclared'}`) }],
    ratio: null, status: fromVerifStatus(worst),
    location: tr(lateralReadingKey(reading)),
    derivation: [lateralReadingNote(reading), ...rows.map((c) => `${c.category}: ${c.description}`)],
  };
}
