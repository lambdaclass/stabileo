import type { SheetRules } from '../codes';
import { EC2_BENDS, EC2_SET, UK_SET, type Ec2Set } from './basis';
import { makeBeamRow } from './beam-row';
import { makeBeamLine } from './beam-line';
import { makeColumnRow } from './column-row';
import { makeSlabRow } from './slab-row';
import { makeWallRow } from './wall-row';
import { makePunchingRow } from './punching-row';

export function ec2RulesFor(set: Ec2Set): SheetRules {
  return {
    beamRow: makeBeamRow(set), beamLine: makeBeamLine(set), columnRow: makeColumnRow(set),
    slabRow: makeSlabRow(set), wallRow: makeWallRow(set), punchingRow: makePunchingRow(set), seismic: false, bends: EC2_BENDS,
  };
}

export const ec2Rules: SheetRules = ec2RulesFor(EC2_SET);
export const ukRules: SheetRules = ec2RulesFor(UK_SET);
