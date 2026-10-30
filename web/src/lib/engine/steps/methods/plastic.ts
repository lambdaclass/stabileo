/**
 * Plastic analysis by hand: the kinematic method (least λ over the mechanisms)
 * and the static method (largest λ over admissible moment distributions), both
 * on the critical sections of a plane frame and both checked against the
 * step-by-step collapse analysis.
 */
import type { ExplainedMethod } from '../registry';
import { plasticApplies } from '../plastic-common';
import { buildPlasticKinematic } from '../plastic-kinematic';
import { buildPlasticStatic } from '../plastic-static';

export const methods: ExplainedMethod[] = [
  { id: 'plasticKinematic', group: 'plastic', example: 'portal-frame', applies: plasticApplies, build: buildPlasticKinematic },
  { id: 'plasticStatic', group: 'plastic', example: 'portal-frame', applies: plasticApplies, build: buildPlasticStatic },
];
