/**
 * The "deformation and energy" explained step-by-step methods: how much a
 * structure moves, computed by hand in four classical ways.
 *
 * - doubleIntegration: EI v'' = M(x) on a straight beam, with M(x) written
 *   once for the whole beam in singularity (Macaulay) brackets and every
 *   reaction kept as an unknown, so a propped cantilever or a continuous beam
 *   is solved by the same system as a simply supported one.
 * - momentArea: the two moment-area theorems on statically determinate
 *   straight beams, with the M/EI diagram split into rectangles, triangles
 *   and parabolic or cubic segments of known area and centroid.
 * - virtualWork: the unit-load method for one displacement component of a
 *   beam, frame or truss, member by member.
 * - castigliano: the second theorem (∂U/∂Xⱼ = 0) for the redundants of a
 *   statically indeterminate beam or frame, on the force method's primary
 *   structure and coefficients; the first theorem (δ = ∂U/∂P) when the
 *   structure is statically determinate.
 *
 * Conventions every document states in its introduction: deflection v and
 * displacements up positive, rotations counter-clockwise positive, bending
 * moments positive when they tension the bottom fibre of a beam read left to
 * right (the local −y face of a frame member), axial force tension positive.
 * Shear deformation is neglected; the engine's frame element neglects it too,
 * so the comparison with the matrix solve is exact up to round-off.
 */
import type { ExplainedMethod } from '../registry';
import { doubleIntegrationApplies, buildDoubleIntegration } from '../double-integration';
import { momentAreaApplies, buildMomentArea } from '../moment-area';
import { virtualWorkApplies, buildVirtualWork } from '../virtual-work';
import { castiglianoApplies, buildCastigliano } from '../castigliano';
import { AXIAL_OPTION } from '../deformation-common';

export const methods: ExplainedMethod[] = [
  { id: 'doubleIntegration', group: 'deformation', example: 'simply-supported', applies: doubleIntegrationApplies, build: buildDoubleIntegration },
  { id: 'momentArea', group: 'deformation', example: 'simply-supported', applies: momentAreaApplies, build: buildMomentArea },
  { id: 'virtualWork', group: 'deformation', example: 'portal-frame', applies: virtualWorkApplies, build: buildVirtualWork, options: [AXIAL_OPTION] },
  { id: 'castigliano', group: 'deformation', example: 'portal-frame', applies: castiglianoApplies, build: buildCastigliano, options: [AXIAL_OPTION] },
];
