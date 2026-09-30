/**
 * The matrix stiffness solve of the same model, read in the documents'
 * conventions, so every explained method can end by comparing its numbers
 * with it (the "method vs matrix" table).
 *
 * The solver's element forces are in its own convention: M(x) = mStart −
 * vStart·x − (span loads), positive when it tensions the member's local +y
 * face; V equal to the classical beam shear. Here:
 * - end moments are counter-clockwise positive on the member (Mi = M(0),
 *   Mj = −M(L));
 * - end shears are the forces on the member along +y (Vi = V(0), Vj = −V(L));
 * - the bending moment is positive tensioning the local −y face, the bottom of
 *   a span traversed left to right ("sagging positive");
 * - axial force is positive in tension;
 * - reactions are global: Rx along +X, Rz up, My counter-clockwise.
 */
import type { AnalysisResults, SolverInput } from '../types';
import { computeDiagramValueAt } from '../diagrams';
import * as wasm from '../wasm-solver';

export interface Reference {
  reactions: Map<number, { rx: number; rz: number; my: number }>;
  displacements: Map<number, { ux: number; uz: number; ry: number }>;
  /** End moments, counter-clockwise positive on the member. */
  endMoments: Map<number, { Mi: number; Mj: number }>;
  /** End shears, the forces on the member along local +y. */
  endShears: Map<number, { Vi: number; Vj: number }>;
  /** Axial force, tension positive (at I; constant without axial span loads). */
  axial: Map<number, number>;
  /** Bending moment at t ∈ [0, 1] along the member, tensioning local −y positive. */
  momentAt(member: number, t: number): number;
  /** Classical shear at t. */
  shearAt(member: number, t: number): number;
}

export function referenceFrom(results: AnalysisResults): Reference {
  const reactions = new Map(results.reactions.map((r) => [r.nodeId, { rx: r.rx, rz: r.rz, my: r.my }]));
  const displacements = new Map(results.displacements.map((d) => [d.nodeId, { ux: d.ux, uz: d.uz, ry: d.ry }]));
  const byId = new Map(results.elementForces.map((f) => [f.elementId, f]));
  const endMoments = new Map<number, { Mi: number; Mj: number }>();
  const endShears = new Map<number, { Vi: number; Vj: number }>();
  const axial = new Map<number, number>();
  for (const f of results.elementForces) {
    endMoments.set(f.elementId, { Mi: computeDiagramValueAt('moment', 0, f), Mj: -computeDiagramValueAt('moment', 1, f) });
    endShears.set(f.elementId, { Vi: computeDiagramValueAt('shear', 0, f), Vj: -computeDiagramValueAt('shear', 1, f) });
    axial.set(f.elementId, f.nStart);
  }
  return {
    reactions, displacements, endMoments, endShears, axial,
    momentAt: (member, t) => { const f = byId.get(member); return f ? -computeDiagramValueAt('moment', t, f) : NaN; },
    shearAt: (member, t) => { const f = byId.get(member); return f ? computeDiagramValueAt('shear', t, f) : NaN; },
  };
}

/** Solve the input with the engine and read it; null when the solver is not ready or the model does not solve. */
export function solveReference(input: SolverInput): Reference | null {
  if (!wasm.isSolverReady()) return null;
  try {
    return referenceFrom(wasm.solve(input));
  } catch {
    return null;
  }
}
