/**
 * The unit load walked over the structure, one solve per position, and the quantities read from
 * each solve in the documents' signs (quantities.ts).
 *
 * A section is read twice from the solve with the load standing on it: with the load counted on
 * the section's right (the diagram's own reading at x) and on its left (read just past x). The
 * two are the ordinates either side of the jump a shear or a reaction line makes there.
 */
import { solve } from '../wasm-solver';
import { computeDiagramValueAt } from '../diagrams';
import { loadOnMember } from '../moving-loads';
import { transverseSign } from '../transverse-sign-2d';
import type { AnalysisResults, SolverInput, SolverLoad } from '../types';
import type { InfluenceQuantity } from '../../store/model.svelte';
import { canonicalQuantity, familyOf, type IlTarget } from './quantities';

export type Dir = { x: number; z: number };
/** `side`: on the section's two ordinates, which side of it the load stands on. */
export interface IlPoint { x: number; y: number; elementId: number; t: number; value: number; side?: 'left' | 'right' }

/** Past the section by this much (m), a load standing on it reads as on its left. */
const PAST = 1e-8;

/** The input with nothing on it: no loads and no imposed support displacements. */
export function unitSolver(input: SolverInput): SolverInput {
  const supports = new Map([...input.supports].map(([id, s]) => {
    const { dx: _dx, dz: _dz, dry: _dry, ...rest } = s;
    return [id, rest];
  }));
  return { ...input, loads: [], supports };
}

export function memberGeom(solver: SolverInput, id: number) {
  const e = solver.elements.get(id)!;
  const ni = solver.nodes.get(e.nodeI)!, nj = solver.nodes.get(e.nodeJ)!;
  const L = Math.hypot(nj.x - ni.x, nj.z - ni.z);
  return { e, ni, nj, L, c: (nj.x - ni.x) / L, s: (nj.z - ni.z) / L };
}

/** +1 when the member's drawn z is the solver's transverse axis (transverse-sign-2d.ts). */
export function drawnSign(solver: SolverInput, id: number): 1 | -1 {
  const { ni, nj } = memberGeom(solver, id);
  return transverseSign(nj.x - ni.x, nj.z - ni.z);
}

/** A reaction or an internal force from one solve, in the documents' signs. */
export function readForce(
  quantity: InfluenceQuantity, res: AnalysisResults, solver: SolverInput, target: IlTarget, loadOn: 'right' | 'left' = 'right',
): number {
  const q = canonicalQuantity(quantity);
  if (familyOf(q) === 'reaction') {
    if (target.kind !== 'node') return 0;
    const r = res.reactions.find((x) => x.nodeId === target.nodeId);
    if (!r) return 0;
    return q === 'Rz' ? r.rz : q === 'Rx' ? r.rx : r.my;
  }
  if (target.kind !== 'section') return 0;
  const ef = res.elementForces.find((f) => f.elementId === target.elementId);
  if (!ef) return 0;
  const sign = drawnSign(solver, target.elementId);
  if (q === 'M') return -sign * computeDiagramValueAt('moment', target.t, ef);
  const t = loadOn === 'left' ? target.t + PAST / Math.max(ef.length, 1e-9) : target.t;
  if (q === 'N') return computeDiagramValueAt('axial', t, ef);
  return sign * computeDiagramValueAt('shear', t, ef);
}

/** The sample positions along one member: k/n, and the section's own t on the target member. */
export function samplesOn(n: number, sectionT?: number): number[] {
  const ts = Array.from({ length: n + 1 }, (_, k) => k / n);
  if (sectionT === undefined) return ts;
  return [...ts.filter((t) => Math.abs(t - sectionT) > 1e-9), sectionT].sort((a, b) => a - b);
}

/**
 * The line of a reaction or an internal force, one solve per position. On a truss bar the load
 * reaches its two nodes by the lever rule, so its ordinates are the end nodes' interpolated.
 */
export function sweepForceLine(
  solver: SolverInput, quantity: InfluenceQuantity, target: IlTarget, n: number, dir: Dir,
): IlPoint[] {
  const solveWith = (loads: SolverLoad[]) => solve({ ...solver, loads });
  const nodeEta = new Map<number, number>();
  const atNode = (nodeId: number): number => {
    let v = nodeEta.get(nodeId);
    if (v === undefined) {
      v = readForce(quantity, solveWith([{ type: 'nodal', data: { nodeId, fx: dir.x, fz: dir.z, my: 0 } }]), solver, target);
      nodeEta.set(nodeId, v);
    }
    return v;
  };
  const points: IlPoint[] = [];
  for (const e of solver.elements.values()) {
    const { ni, nj, L } = memberGeom(solver, e.id);
    const onTarget = target.kind === 'section' && target.elementId === e.id;
    for (const t of samplesOn(n, onTarget ? target.t : undefined)) {
      const at = { x: ni.x + t * (nj.x - ni.x), y: ni.z + t * (nj.z - ni.z), elementId: e.id, t };
      if (e.type === 'truss') {
        points.push({ ...at, value: (1 - t) * atNode(e.nodeI) + t * atNode(e.nodeJ) });
        continue;
      }
      const res = solveWith(loadOnMember(solver, e.id, t * L, 1, dir));
      if (onTarget && Math.abs(t - (target as { t: number }).t) < 1e-12) {
        points.push({ ...at, value: readForce(quantity, res, solver, target, 'left'), side: 'left' });
        points.push({ ...at, value: readForce(quantity, res, solver, target), side: 'right' });
        continue;
      }
      points.push({ ...at, value: readForce(quantity, res, solver, target) });
    }
  }
  return points;
}

/**
 * The engine's sweep (solver convention, k/n samples) in the documents' signs, with the section's
 * two ordinates put in from one more solve.
 */
export function fromEngineSweep(
  solver: SolverInput, quantity: InfluenceQuantity, target: IlTarget, raw: IlPoint[], dir: Dir,
): IlPoint[] {
  const q = canonicalQuantity(quantity);
  const sign = target.kind === 'section' ? drawnSign(solver, target.elementId) : 1;
  const k = q === 'M' ? -sign : q === 'V' ? sign : 1;
  const points = raw.map((p) => ({ ...p, value: k * p.value }));
  if (target.kind !== 'section') return points;
  const { ni, nj, L } = memberGeom(solver, target.elementId);
  const res = solve({ ...solver, loads: loadOnMember(solver, target.elementId, target.t * L, 1, dir) });
  const at = { x: ni.x + target.t * (nj.x - ni.x), y: ni.z + target.t * (nj.z - ni.z), elementId: target.elementId, t: target.t };
  const pair = [
    { ...at, value: readForce(quantity, res, solver, target, 'left'), side: 'left' as const },
    { ...at, value: readForce(quantity, res, solver, target), side: 'right' as const },
  ];
  const kept = points.filter((p) => !(p.elementId === target.elementId && Math.abs(p.t - target.t) < 1e-9));
  const first = kept.findIndex((p) => p.elementId === target.elementId && p.t > target.t);
  const at0 = first >= 0 ? first : kept.findLastIndex((p) => p.elementId === target.elementId) + 1;
  kept.splice(at0, 0, ...pair);
  return kept;
}
