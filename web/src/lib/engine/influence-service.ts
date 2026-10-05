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
import { computeDiagramValueAt } from './diagrams';
import { verticalLoadOnMember, errorText } from './moving-loads';
import type { AnalysisResults, SolverInput, SolverLoad } from './types';
import type { InfluenceQuantity, InfluenceLineResult } from '../store/model.svelte';
import { t } from '../i18n';

type ILPoint = InfluenceLineResult['points'][number];

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

/** The value of `quantity` in one solve, read the way the engine's sweep reads it (influence.rs extract_value). */
function quantityOf(
  quantity: InfluenceQuantity,
  res: AnalysisResults,
  targetNodeId: number | undefined,
  targetElementId: number | undefined,
  targetPosition: number,
): number {
  if (quantity === 'V' || quantity === 'M') {
    const ef = targetElementId === undefined ? undefined : res.elementForces.find((f) => f.elementId === targetElementId);
    return ef ? computeDiagramValueAt(quantity === 'V' ? 'shear' : 'moment', targetPosition, ef) : 0;
  }
  const r = targetNodeId === undefined ? undefined : res.reactions.find((x) => x.nodeId === targetNodeId);
  if (!r) return 0;
  if (quantity === 'Rz' || quantity === 'Ry') return r.rz;
  if (quantity === 'Rx') return r.rx;
  return r.my;
}

/**
 * Compute influence line: move unit load P=1 (downward) across elements.
 *
 * Refused, with the static solve's own message, wherever the static solve would
 * refuse the unloaded structure (a mechanism above all): the engine's sweep has
 * no such check, and on a mechanism it either threw a bare string or returned
 * ordinates of a structure that cannot carry the load.
 *
 * On a truss bar the unit load is applied as its two lever-rule nodal loads
 * (see `verticalLoadOnMember`): the engine drops a load placed on a bar, so the
 * sweep read zero along every non-vertical chord. By linearity the ordinate at
 * t on the bar is (1 − t)·η_I + t·η_J, with η the response to a unit load at
 * each end node, so the bar costs two solves, not one per point.
 */
export function computeInfluenceLine(
  model: ModelData,
  quantity: InfluenceQuantity,
  targetNodeId?: number,
  targetElementId?: number,
  targetPosition: number = 0.5,
  nPointsPerElement: number = 20,
): InfluenceLineResult | string {
  if (model.nodes.size < 2 || model.elements.size < 1) return t('influence.needNodesElems');
  if (model.supports.size < 1) return t('influence.needSupport');
  if (!isWasmReady()) return t('toast.solverNotReady');
  // The static solve relaxes a sliding joint by constraints the sweep does not carry.
  if (modelHasSlidingJoints(model.elements.values())) return t('advanced.slidingUnsupported');
  // A member of variable section is not modelled by the plane solve (`variableRefusal2D`).
  const variable = variableRefusal2D(model);
  if (variable) return variable;

  const unit = unitLoadModel(model);
  const solver = buildSolverInput2D(unit, false);
  if (!solver) return t('influence.needNodesElems');
  // The static solve's refusal of this model, without the static solve: its checks, the
  // kinematic one included, read the input alone. It was a full solve of the unloaded model,
  // thrown away, on every pick of a target.
  const gate = advancedRefusal2D(solver);
  if (gate) return gate;
  solver.loads = [];

  const solveWith = (loads: SolverLoad[]): number =>
    quantityOf(quantity, solve({ ...solver, loads }), targetNodeId, targetElementId, targetPosition);

  let points: ILPoint[];
  try {
    // The engine's sweep carries no constraints or connectors; with either, every
    // point is solved on the full input instead.
    const coupled = (solver.constraints?.length ?? 0) > 0 || (solver.connectors?.size ?? 0) > 0;
    points = coupled
      ? sweepPointByPoint(solver, nPointsPerElement, solveWith)
      : (computeInfluenceLineWasm({ solver, quantity, targetNodeId, targetElementId, targetPosition, nPointsPerElement }) as InfluenceLineResult).points;
    points = withTrussOrdinates(solver, points, solveWith);
  } catch (err) {
    return t('influence.calcError').replace('{n}', errorText(err));
  }

  return { quantity, targetNodeId, targetElementId, targetPosition, points };
}

/** The sweep, one solve per point, for inputs the engine's sweep cannot take whole. */
function sweepPointByPoint(solver: SolverInput, n: number, solveWith: (loads: SolverLoad[]) => number): ILPoint[] {
  const points: ILPoint[] = [];
  for (const elem of solver.elements.values()) {
    const ni = solver.nodes.get(elem.nodeI)!, nj = solver.nodes.get(elem.nodeJ)!;
    const L = Math.hypot(nj.x - ni.x, nj.z - ni.z);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      // Truss bars are filled in by withTrussOrdinates.
      const value = elem.type === 'truss' ? 0 : solveWith(verticalLoadOnMember(solver, elem.id, t * L, 1));
      points.push({ x: ni.x + t * (nj.x - ni.x), y: ni.z + t * (nj.z - ni.z), elementId: elem.id, t, value });
    }
  }
  return points;
}

/** Replace the ordinates on truss bars by the lever rule between their end nodes. */
function withTrussOrdinates(solver: SolverInput, points: ILPoint[], solveWith: (loads: SolverLoad[]) => number): ILPoint[] {
  const eta = new Map<number, number>();
  const at = (nodeId: number): number => {
    let v = eta.get(nodeId);
    if (v === undefined) {
      v = solveWith([{ type: 'nodal', data: { nodeId, fx: 0, fz: -1, my: 0 } }]);
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
