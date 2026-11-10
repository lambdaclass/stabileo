import type { ModelSpec } from '../edu/exercise-spec';
import type { ParametricModelSpec, Variant, Expr } from '../edu/exercise-params';
import { resolveModel, evalExpr } from '../edu/exercise-params';
import type { SolverInput, SolverLoad, AnalysisResults, ElementForces, Displacement } from '../../lib/engine/types';
import { solve } from '../../lib/engine/wasm-solver';
import { transverseSign } from '../../lib/engine/transverse-sign-2d';

export interface PointLoad {
  element: number;
  /** Distance from the element's start node, in metres. */
  a: number;
  /** Transverse force in the drawn axes: negative pushes a left-to-right beam down. */
  p?: number;
  /** Couple, counter-clockwise positive. */
  m?: number;
}

export interface GameModel extends ModelSpec {
  pointLoads?: PointLoad[];
  /** Node indices with an internal hinge. */
  hinges?: number[];
  truss?: boolean;
}

export interface GameTemplateModel extends ParametricModelSpec {
  pointLoads?: Array<{ element: number; a: Expr; p?: Expr; m?: Expr }>;
  hinges?: number[];
  truss?: boolean;
}

export function resolveGameModel(model: GameTemplateModel, v: Variant): GameModel {
  const out: GameModel = resolveModel(model, v);
  if (model.pointLoads) {
    out.pointLoads = model.pointLoads.map((l) => {
      const r: PointLoad = { element: l.element, a: evalExpr(l.a, v.values) };
      if (l.p !== undefined) r.p = evalExpr(l.p, v.values);
      if (l.m !== undefined) r.m = evalExpr(l.m, v.values);
      return r;
    });
  }
  if (model.hinges) out.hinges = [...model.hinges];
  if (model.truss) out.truss = true;
  return out;
}

export const E_MPA = 200_000;
export const AREA = 0.01;
export const INERTIA = 1e-4;
export const EI = E_MPA * 1000 * INERTIA;

export function memberLength(m: GameModel, e: number): number {
  const [i, j] = m.elements[e]!;
  const [xi, yi] = m.nodes[i]!, [xj, yj] = m.nodes[j]!;
  return Math.hypot(xj - xi, yj - yi);
}

export function memberSign(m: GameModel, e: number): 1 | -1 {
  const [i, j] = m.elements[e]!;
  return transverseSign(m.nodes[j]![0] - m.nodes[i]![0], m.nodes[j]![1] - m.nodes[i]![1]);
}

/** Ends released by a hinge: at each hinged node every frame end but the first is freed. */
function hingeFlags(m: GameModel): Array<[boolean, boolean]> {
  const flags = m.elements.map((): [boolean, boolean] => [false, false]);
  for (const node of m.hinges ?? []) {
    let kept = false;
    m.elements.forEach(([i, j], e) => {
      for (const [end, n] of [[0, i], [1, j]] as const) {
        if (n !== node) continue;
        if (kept) flags[e]![end] = true;
        kept = true;
      }
    });
  }
  return flags;
}

export function toSolverInput(m: GameModel): SolverInput {
  const flags = hingeFlags(m);
  const nodes: SolverInput['nodes'] = new Map(m.nodes.map(([x, y], k) => [k + 1, { id: k + 1, x, z: y }]));
  const elements: SolverInput['elements'] = new Map(m.elements.map(([i, j], e) => [e + 1, {
    id: e + 1, type: m.truss ? 'truss' : 'frame', nodeI: i + 1, nodeJ: j + 1, materialId: 1, sectionId: 1,
    hingeStart: !m.truss && flags[e]![0], hingeEnd: !m.truss && flags[e]![1],
  }]));
  const supports: SolverInput['supports'] = new Map(m.supports.map((s, k) => [k + 1, {
    id: k + 1, nodeId: s.node + 1, type: s.type === 'rollerY' ? 'rollerZ' : s.type === 'rollerZ' ? 'rollerZ' : s.type === 'spring' ? 'pinned' : s.type,
  }]));
  const loads: SolverLoad[] = [];
  for (const l of m.nodalLoads ?? []) loads.push({ type: 'nodal', data: { nodeId: l.node + 1, fx: l.fx ?? 0, fz: l.fy ?? 0, my: l.mz ?? 0 } });
  for (const l of m.distributedLoads ?? []) {
    const s = memberSign(m, l.element);
    loads.push({ type: 'distributed', data: { elementId: l.element + 1, qI: s * l.qI, qJ: s * (l.qJ ?? l.qI) } });
  }
  for (const l of m.pointLoads ?? []) {
    const s = memberSign(m, l.element);
    loads.push({ type: 'pointOnElement', data: { elementId: l.element + 1, a: l.a, p: s * (l.p ?? 0), ...(l.m ? { my: l.m } : {}) } });
  }
  return { nodes, elements, supports, loads, materials: new Map([[1, { id: 1, e: E_MPA, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: AREA, iz: INERTIA }]]) };
}

export interface Solved {
  model: GameModel;
  /** Indexed like `model.elements`. */
  forces: ElementForces[];
  /** Indexed like `model.nodes`. */
  displacements: Displacement[];
}

/** Null for anything the engine refuses or answers with a non-finite or runaway field: a mechanism. */
export function solveGame(m: GameModel): Solved | null {
  let r: AnalysisResults;
  try {
    r = solve(toSolverInput(m)) as unknown as AnalysisResults;
  } catch {
    return null;
  }
  if (!r || !Array.isArray(r.elementForces) || !Array.isArray(r.displacements)) return null;
  const forces = m.elements.map((_, e) => r.elementForces.find((f) => f.elementId === e + 1));
  const displacements = m.nodes.map((_, k) => r.displacements.find((d) => d.nodeId === k + 1));
  if (forces.some((f) => !f) || displacements.some((d) => !d)) return null;
  const size = Math.max(...m.nodes.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]), 1);
  for (const d of displacements as Displacement[]) {
    if (![d.ux, d.uz, d.ry].every(Number.isFinite)) return null;
    if (Math.hypot(d.ux, d.uz) > size) return null;
  }
  for (const f of forces as ElementForces[]) {
    if (![f.nStart, f.nEnd, f.vStart, f.vEnd, f.mStart, f.mEnd].every(Number.isFinite)) return null;
  }
  return { model: m, forces: forces as ElementForces[], displacements: displacements as Displacement[] };
}
