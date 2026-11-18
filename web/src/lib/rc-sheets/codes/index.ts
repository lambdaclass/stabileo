/**
 * The code a sheet is designed to, as the functions that build its rows. Every code builds the same
 * row shapes (`BeamRow`, `ColumnRow`, …), so the workspace, the drawings and the workbook read any of
 * them; what a code does not check is said in its rows, never left out silently.
 */
import { beamRow } from '../beam-row';
import { beamLine, CIRSOC_2025_LINE } from '../beam-line';
import { ACI_COLUMN, CIRSOC_COLUMN, columnRowFor, tensionLap } from '../column-row';
import { CIRSOC_SLAB_ROW, cirsocSlabDevelopment, slabRow, slabRowFor } from '../slab-row';
import { wallRow } from '../wall-row';
import { punchingRow } from '../punching-row';
import { footingRowFor, type FootingRowFn } from '../footing-row';
import { ACI_ONE_WAY, CIRSOC_ONE_WAY, type FootingAnchorage } from '../footing-design';
import { ACI_SLAB_PLAN, CIRSOC_SLAB_PLAN, type SlabPlanCode } from '../slab-plan';
import { bentBarMandrel } from '../../codes/cirsoc201/bar-geometry';
import { compressionLapMm, deriveCompressionDevelopment, deriveHookedDevelopment } from '../../codes/cirsoc201/anchorage';
import { mainBarCoverMm } from '../../codes/cirsoc201/cover';
import { ec2Rules, ukRules } from '../ec2';
import { ts500Rules } from '../ts500';
import type { SheetCode } from '../types';
import { ACI_BENDS } from '../bars';
import type { BendRules } from '../shape';

export interface SheetRules {
  beamRow: typeof beamRow;
  beamLine: typeof beamLine;
  columnRow: ReturnType<typeof columnRowFor>;
  slabRow: typeof slabRow;
  wallRow: typeof wallRow;
  punchingRow: typeof punchingRow;
  footingRow: FootingRowFn;
  /** How a level's slab bars reach past their supports. */
  slabPlan: SlabPlanCode;
  /** Whether the special moment frame provisions are the code's (chapter 18 of ACI 318 and CIRSOC 201). */
  seismic: boolean;
  /** Mandrels and hooks of the bars the sheets bend. */
  bends: BendRules;
  /** Whether beam and column rows check their main bars' cover against CIRSOC 201 Table 20.5.1.3.1. */
  /** The code's cover table, by which the main bars' cover in mm is asked of a bar of `dbMm`. */
  coverTable?: { mainBarMm: (dbMm: number, control: boolean) => number };
  /** The least sway effective-length factor the storeys' ΣPc takes (1 by the chart when absent). */
  swayKMin?: number;
}

/** CIRSOC 201-2025's mandrels and hooks, and for bent-up bars the FIUBA course's 9·db, 12·db and 15·db (§11.4), which the code does not give. */
export const CIRSOC_BENDS: BendRules = { ...ACI_BENDS, bentMandrel: bentBarMandrel, clause: '§25.3.1, §25.3.2; FIUBA §11.4' };

/** CIRSOC 201-2025 chapter 25, which ACI 318-19 shares: ld by §25.4.2.4 (ψt = 1, bottom bars), ldh by §25.4.3, ldc by §25.4.9, a class B tension lap or §25.5.5.1 in compression. */
export const CIRSOC_FOOTING_ANCHORAGE: FootingAnchorage = {
  ld: (mat, dia, h, layout) => cirsocSlabDevelopment(mat, dia, false, h, layout).ldM,
  ldh: (mat, dia) => deriveHookedDevelopment({ diameterMm: dia, fy: mat.fy, fc: mat.fc, edition: '2025' }).ldhM,
  ldc: (mat, dia) => deriveCompressionDevelopment({ diameterMm: dia, fy: mat.fy, fc: mat.fc, edition: '2025' }).ldcM,
  lap: (mat, dia, tension) => (tension ? tensionLap(mat, dia) : compressionLapMm(mat.fy, dia) / 1000),
  clause: { straight: '§25.4.2', hooked: '§25.4.3', compression: '§25.4.9' },
};

const aciRules: SheetRules = { beamRow, beamLine, columnRow: columnRowFor(ACI_COLUMN), slabRow, wallRow, punchingRow, footingRow: footingRowFor({ ...ACI_ONE_WAY, anchorage: CIRSOC_FOOTING_ANCHORAGE }), slabPlan: ACI_SLAB_PLAN, seismic: true, bends: ACI_BENDS };
const cirsocRules: SheetRules = { ...aciRules, beamLine: (rows, c, a, fmt) => beamLine(rows, c, a, fmt, CIRSOC_2025_LINE), columnRow: columnRowFor(CIRSOC_COLUMN), slabRow: slabRowFor(CIRSOC_SLAB_ROW), footingRow: footingRowFor({ ...CIRSOC_ONE_WAY, anchorage: CIRSOC_FOOTING_ANCHORAGE }), slabPlan: CIRSOC_SLAB_PLAN, bends: CIRSOC_BENDS, coverTable: { mainBarMm: mainBarCoverMm }, swayKMin: CIRSOC_COLUMN.swayKMin };

const RULES: Record<SheetCode, SheetRules> = {
  'cirsoc201-2025': cirsocRules,
  'aci318-19': aciRules,
  'en1992-1-1': ec2Rules,
  'bs-en1992-1-1': ukRules,
  'ts500-2000': ts500Rules,
};

export const rulesFor = (code: SheetCode): SheetRules => RULES[code];
