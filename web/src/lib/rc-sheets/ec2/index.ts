import type { SheetRules } from '../codes';
import { EC2_BENDS, EC2_SET, UK_SET, type Ec2Set } from './basis';
import { makeBeamRow } from './beam-row';
import { makeBeamLine } from './beam-line';
import { makeColumnRow } from './column-row';
import { makeSlabRow } from './slab-row';
import { makeWallRow } from './wall-row';
import { makePunchingRow } from './punching-row';
import { ec2LineCode } from './beam-line';
import type { SlabPlanCode } from '../slab-plan';

const ec2SlabPlan = (set: Ec2Set): SlabPlanCode => ({
  line: ec2LineCode(set),
  topReach: { interior: 0.3, end: 0.2, middle: 0.3 },
  bendAt: 0.2,
  bottomEmbed: (dia) => Math.max(0.15, 10 * dia / 1000),
  clause: { topReach: '9.3.1.2(2), 9.3.1.1(4)', cantilever: '8.4.4', bottomEmbed: '9.3.1.1(4), 9.2.1.4(3)', development: '8.4.3, 8.4.4, 8.7.3' },
});

export function ec2RulesFor(set: Ec2Set): SheetRules {
  return {
    beamRow: makeBeamRow(set), beamLine: makeBeamLine(set), columnRow: makeColumnRow(set),
    slabRow: makeSlabRow(set), wallRow: makeWallRow(set), punchingRow: makePunchingRow(set), slabPlan: ec2SlabPlan(set), seismic: false, bends: EC2_BENDS,
  };
}

export const ec2Rules: SheetRules = ec2RulesFor(EC2_SET);
export const ukRules: SheetRules = ec2RulesFor(UK_SET);
