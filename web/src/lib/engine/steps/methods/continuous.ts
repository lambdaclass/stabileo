/**
 * The "continuous" explained step-by-step methods: the three-moment equation
 * (three-moments.ts) and moment distribution (cross-beams.ts), on the beam as
 * continuous-common.ts reads it.
 */
import type { ExplainedMethod } from '../registry';
import { appliesContinuous } from '../continuous-common';
import { buildThreeMoments } from '../three-moments';
import { buildCross } from '../cross-beams';

export const methods: ExplainedMethod[] = [
  { id: 'threeMoments', group: 'continuous', example: 'continuous-beam-unequal', applies: appliesContinuous, build: buildThreeMoments },
  { id: 'crossBeams', group: 'continuous', example: 'continuous-beam-unequal', applies: appliesContinuous, build: buildCross },
];
