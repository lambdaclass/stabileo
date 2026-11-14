/**
 * The code a sheet is designed to, as the functions that build its rows. Every code builds the same
 * row shapes (`BeamRow`, `ColumnRow`, …), so the workspace, the drawings and the workbook read any of
 * them; what a code does not check is said in its rows, never left out silently.
 */
import { beamRow } from '../beam-row';
import { beamLine } from '../beam-line';
import { columnRow } from '../column-row';
import { slabRow } from '../slab-row';
import { wallRow } from '../wall-row';
import { punchingRow } from '../punching-row';
import { CIRSOC_SLAB_PLAN, type SlabPlanCode } from '../slab-plan';
import { ec2Rules, ukRules } from '../ec2';
import { ts500Rules } from '../ts500';
import type { SheetCode } from '../types';
import { ACI_BENDS } from '../bars';
import type { BendRules } from '../shape';

export interface SheetRules {
  beamRow: typeof beamRow;
  beamLine: typeof beamLine;
  columnRow: typeof columnRow;
  slabRow: typeof slabRow;
  wallRow: typeof wallRow;
  punchingRow: typeof punchingRow;
  /** How a level's slab bars reach past their supports. */
  slabPlan: SlabPlanCode;
  /** Whether the special moment frame provisions are the code's (chapter 18 of ACI 318 and CIRSOC 201). */
  seismic: boolean;
  /** Mandrels and hooks of the bars the sheets bend. */
  bends: BendRules;
}

const aciFamily: SheetRules = { beamRow, beamLine, columnRow, slabRow, wallRow, punchingRow, slabPlan: CIRSOC_SLAB_PLAN, seismic: true, bends: ACI_BENDS };

const RULES: Record<SheetCode, SheetRules> = {
  'cirsoc201-2025': aciFamily,
  'aci318-19': aciFamily,
  'en1992-1-1': ec2Rules,
  'bs-en1992-1-1': ukRules,
  'ts500-2000': ts500Rules,
};

export const rulesFor = (code: SheetCode): SheetRules => RULES[code];
