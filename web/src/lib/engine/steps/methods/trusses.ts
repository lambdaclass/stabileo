/**
 * The "trusses" explained step-by-step methods, in catalog order:
 *
 * - `joints` (truss-joints): the method of joints.
 * - `sections` (truss-sections): the method of sections (Ritter).
 * - `compatibility` (truss-compatibility): the matrix method with a
 *   compatibility matrix, for plane trusses and frames.
 *
 * What they share (statics, applicability, figures, the closing comparison)
 * lives in truss-common.
 */
import type { ExplainedMethod } from '../registry';
import { solveGlobal, trussStatics } from '../truss-common';
import { buildJoints, jointsApplies, planJoints } from '../truss-joints';
import { buildSections, findCut, sectionTarget, sectionsApplies } from '../truss-sections';
import { buildCompat, compatApplies, compatSolve, momentAlong } from '../truss-compatibility';

export const methods: ExplainedMethod[] = [
  { id: 'joints', group: 'trusses', example: 'truss', applies: jointsApplies, build: buildJoints },
  { id: 'sections', group: 'trusses', example: 'truss', applies: sectionsApplies, build: buildSections },
  { id: 'compatibility', group: 'trusses', example: 'truss', applies: compatApplies, build: buildCompat },
];

/** For the tests: the plan the method of joints follows, the cut the method of sections takes, the compatibility solve. */
export const internals = { planJoints, solveGlobal, findCut, sectionTarget, compatSolve, trussStatics, momentAlong };
