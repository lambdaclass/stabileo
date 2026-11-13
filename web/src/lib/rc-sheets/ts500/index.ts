import type { SheetRules } from '../codes';
import { beamRow } from './beam';
import { beamLine } from './line';
import { columnRow } from './column';
import { slabRow } from './slab';
import { wallRow } from './wall';
import { punchingRow } from './punching';

export { TS500_LINE } from './line';

export const ts500Rules: SheetRules = { beamRow, beamLine, columnRow, slabRow, wallRow, punchingRow, seismic: false };
