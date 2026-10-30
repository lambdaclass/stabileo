// Influence line computation.
//
// The unit-load sweep over frame members runs in Rust/WASM (one factorization,
// one back-substitution per point). What it is handed is built here, and it is
// built by the same model→solver mapping the static solve uses, so the line
// can never be computed on a structure the solve does not see.

import { computeInfluenceLineWasm, solve, isWasmReady } from './wasm-solver';
import { advancedRefusal2D, buildSolverInput2D, variableRefusal2D, type ModelData } from './solver-service';
import { withoutSettlement } from './settlement-case';
import { modelHasSlidingJoints } from './sliding-joints';
import { errorText } from './moving-loads';
import type { SolverInput } from './types';
import { canonicalQuantity, familyOf, type IlTarget } from './influence/quantities';
import { fromEngineSweep, readForce, sweepForceLine, unitSolver, type Dir } from './influence/unit-sweep';
import { maxwellLine, MaxwellRefusal } from './influence/maxwell';
import type { InfluenceQuantity, InfluenceLineResult, InfluenceDirection } from '../store/model.svelte';
import { t } from '../i18n';

/** The unit load's direction, in global X and Z: down (gravity), or across to +X (a wall, a column). */
export const UNIT_LOAD_DIR: Record<InfluenceDirection, { x: number; z: number }> = {
  vertical: { x: 0, z: -1 },
  horizontal: { x: 1, z: 0 },
};

/**
 * The structure an influence line is drawn on: the model's own, with nothing on
 * it. An influence line is the response to a unit load and to nothing else, so
 * the model's loads (thermal included) and its support settlements go; the
 * sections, materials, hinges and support types and angles stay exactly as the
 * static solve maps them.
 */
function unitLoadModel(model: ModelData): ModelData {
  return { ...model, loads: [], supports: withoutSettlement(model.supports) };
}

/** The model's structure with nothing on it, as the lines are solved on; the refusal's text when it cannot be. */
export function unitInputOf(model: ModelData): SolverInput | string {
  if (model.nodes.size < 2 || model.elements.size < 1) return t('influence.needNodesElems');
  if (model.supports.size < 1) return t('influence.needSupport');
  const solver = buildSolverInput2D(unitLoadModel(model), false);
  if (!solver) return t('influence.needNodesElems');
  return advancedRefusal2D(solver) ?? unitSolver(solver);
}

/**
 * Compute influence line: move unit load P=1 across elements, downward or (`direction`
 * 'horizontal') to +X, and read `quantity` at the target: a reaction at a node, an internal force
 * at the section `targetPosition` (t ∈ [0, 1]) of a member, or a displacement at either. Signs as
 * in `influence/quantities.ts`.
 *
 * Refused, with the static solve's own message, wherever the static solve would refuse the
 * unloaded structure (a mechanism above all).
 *
 * Reactions and internal forces are swept one position at a time, by the engine where it can
 * (downward load, no constraints or connectors), here otherwise; displacements come from one
 * solve by Maxwell's reciprocity (`influence/maxwell.ts`).
 */
export function computeInfluenceLine(
  model: ModelData,
  quantity: InfluenceQuantity,
  targetNodeId?: number,
  targetElementId?: number,
  targetPosition: number = 0.5,
  nPointsPerElement: number = 20,
  direction: InfluenceDirection = 'vertical',
): InfluenceLineResult | string {
  if (model.nodes.size < 2 || model.elements.size < 1) return t('influence.needNodesElems');
  if (model.supports.size < 1) return t('influence.needSupport');
  if (!isWasmReady()) return t('toast.solverNotReady');
  // The static solve relaxes a sliding joint by constraints the sweep does not carry.
  if (modelHasSlidingJoints(model.elements.values())) return t('advanced.slidingUnsupported');
  // A member of variable section is not modelled by the plane solve (`variableRefusal2D`).
  const variable = variableRefusal2D(model);
  if (variable) return variable;
  if (!(targetPosition >= 0 && targetPosition <= 1)) return t('course.influence.err.position');

  const unit = unitInputOf(model);
  if (typeof unit === 'string') return unit;

  const family = familyOf(quantity);
  const target: IlTarget | null = family === 'reaction'
    ? (targetNodeId !== undefined ? { kind: 'node', nodeId: targetNodeId } : null)
    : targetElementId !== undefined
      ? { kind: 'section', elementId: targetElementId, t: targetPosition }
      : family === 'displacement' && targetNodeId !== undefined ? { kind: 'node', nodeId: targetNodeId } : null;
  if (!target) return t('course.influence.err.noTarget');
  if (target.kind === 'section' && !unit.elements.has(target.elementId)) return t('course.influence.err.noTarget');
  if (target.kind === 'node' && !unit.nodes.has(target.nodeId)) return t('course.influence.err.noTarget');

  const dir = UNIT_LOAD_DIR[direction];
  let points: InfluenceLineResult['points'];
  try {
    points = computePoints(unit, quantity, target, nPointsPerElement, dir, direction);
  } catch (err) {
    if (err instanceof MaxwellRefusal) return t(err.key);
    return t('influence.calcError').replace('{n}', errorText(err));
  }

  return {
    quantity, points, targetPosition,
    ...(target.kind === 'node' ? { targetNodeId: target.nodeId } : { targetElementId: target.elementId }),
    ...(direction !== 'vertical' ? { direction } : {}),
  };
}

export function computePoints(
  unit: SolverInput, quantity: InfluenceQuantity, target: IlTarget, n: number, dir: Dir, direction: InfluenceDirection,
): InfluenceLineResult['points'] {
  if (familyOf(quantity) === 'displacement') return maxwellLine(unit, quantity, target, n, dir);
  // The engine's sweep reads V, M and the reactions under a downward load, with no constraints or connectors.
  const coupled = (unit.constraints?.length ?? 0) > 0 || (unit.connectors?.size ?? 0) > 0;
  const q = canonicalQuantity(quantity);
  if (coupled || direction !== 'vertical' || q === 'N') return sweepForceLine(unit, quantity, target, n, dir);
  const raw = (computeInfluenceLineWasm({
    solver: unit, quantity: q,
    targetNodeId: target.kind === 'node' ? target.nodeId : undefined,
    targetElementId: target.kind === 'section' ? target.elementId : undefined,
    targetPosition: target.kind === 'section' ? target.t : 0.5,
    nPointsPerElement: n,
  }) as InfluenceLineResult).points;
  return withTrussOrdinates(unit, fromEngineSweep(unit, quantity, target, raw, dir), quantity, target, dir);
}

/** Replace the ordinates on truss bars by the lever rule between their end nodes. */
function withTrussOrdinates(
  solver: SolverInput, points: InfluenceLineResult['points'], quantity: InfluenceQuantity, target: IlTarget, dir: Dir,
): InfluenceLineResult['points'] {
  const eta = new Map<number, number>();
  const at = (nodeId: number): number => {
    let v = eta.get(nodeId);
    if (v === undefined) {
      v = readForce(quantity, solve({ ...solver, loads: [{ type: 'nodal', data: { nodeId, fx: dir.x, fz: dir.z, my: 0 } }] }), solver, target);
      eta.set(nodeId, v);
    }
    return v;
  };
  return points.map((p) => {
    const elem = solver.elements.get(p.elementId);
    if (!elem || elem.type !== 'truss') return p;
    return { ...p, value: (1 - p.t) * at(elem.nodeI) + p.t * at(elem.nodeJ) };
  });
}
