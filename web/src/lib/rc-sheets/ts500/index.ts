import type { SheetRules } from '../codes';
import { beamRow } from './beam';
import { beamLine } from './line';
import { columnRow } from './column';
import { slabRow } from './slab';
import { wallRow } from './wall';
import { punchingRow } from './punching';
import { TS500_LINE } from './line';
import { TS500_BENDS } from './basis';
import type { SlabPlanCode } from '../slab-plan';

const ts500SlabPlan: SlabPlanCode = {
  line: TS500_LINE,
  topReach: { interior: 0.25, end: 0.2, middle: 0.25 },
  bendAt: 0.2,
  bottomEmbed: (dia) => Math.max(0.15, 10 * dia / 1000),
  clause: { topReach: '11.4', cantilever: '9.1', bottomEmbed: '11.4', development: '9.1, 9.3' },
};

export { TS500_LINE } from './line';

export const ts500Rules: SheetRules = { beamRow, beamLine, columnRow, slabRow, wallRow, punchingRow, slabPlan: ts500SlabPlan, seismic: false, bends: TS500_BENDS };
