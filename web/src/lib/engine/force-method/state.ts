/** A solved state of the primary structure, read the way the force method reads it. */
import type { SolverInput, SolverLoad } from '../types';
import { solveDetailed, type DSMStepData } from '../solver-detailed';
import { restrainedComponents } from './primary';
import { barLoadsOf, axialLoadsOnly, sampleDiagram, type BarLoads } from './internal';
import type { BarState, StateResult, Geometry } from './result-types';
import type { PatternItem } from './patterns';
import { ForceMethodError } from './errors';

export interface Solved {
  data: DSMStepData;
  input: SolverInput;
  /** Global displacement (ux, uz, θ) of a node. */
  disp: (nodeId: number) => [number, number, number];
  /** Local end forces [Ni, Vi, Mi, Nj, Vj, Mj] of a bar (trusses padded). */
  forces: (elementId: number) => number[] | null;
  reactions: Array<{ nodeId: number; component: number; value: number }>;
}

export function geometryOf(input: SolverInput): Geometry {
  return {
    nodes: [...input.nodes.values()].map((n) => ({ id: n.id, x: n.x, z: n.z })),
    elements: [...input.elements.values()].map((e) => ({
      id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: e.type, hingeStart: !!e.hingeStart, hingeEnd: !!e.hingeEnd,
    })),
    supports: [...input.supports.values()].map((s) => ({
      nodeId: s.nodeId, restrained: restrainedComponents(s), spring: s.type === 'spring',
      angle: s.type === 'inclinedRoller' ? s.angle ?? 0 : undefined,
    })),
  };
}

export const lenOf = (input: SolverInput, nodeI: number, nodeJ: number) => {
  const a = input.nodes.get(nodeI)!;
  const b = input.nodes.get(nodeJ)!;
  return Math.hypot(b.x - a.x, b.z - a.z);
};

/** Which nodes a mechanism moves, from the solver's DOF labels. */
export function movingNodes(data: DSMStepData): number[] {
  const out = new Set<number>();
  for (const lab of data.nullModes) {
    const k = data.dofLabels.indexOf(lab);
    const d = data.dofNumbering.dofs.find((q) => q.globalIndex === k);
    if (d) out.add(d.nodeId);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Solve a state of the primary. A couple put on a member's own face at a
 * hinge (`fold`) is folded into that end's moment, so the bar's diagram is its
 * end forces alone, as for every other state.
 */
export function solveState(input: SolverInput, fold: PatternItem[] = []): Solved {
  const data = solveDetailed(input);
  /* A mechanism the loads happen not to excite is still a mechanism, and a primary structure with one is not one. */
  if (data.nullModes.length > 0) throw new ForceMethodError('unstable', data.nullModes, 0, { nodes: movingNodes(data) });
  const frames = new Map(data.nodeFrames.map((f) => [f.nodeId, f.angle]));
  const dof = new Map<string, number>();
  for (const d of data.dofNumbering.dofs) dof.set(`${d.nodeId}:${d.localDof}`, d.globalIndex);
  const val = (nodeId: number, ld: number) => {
    const g = dof.get(`${nodeId}:${ld}`);
    return g === undefined ? 0 : data.uAll[g];
  };
  const disp = (nodeId: number): [number, number, number] => {
    const a = val(nodeId, 0);
    const b = val(nodeId, 1);
    const ang = frames.get(nodeId);
    if (ang === undefined) return [a, b, val(nodeId, 2)];
    const c = Math.cos(ang), s = Math.sin(ang);
    return [c * a - s * b, s * a + c * b, val(nodeId, 2)];
  };
  const byElem = new Map(data.elementForces.map((f) => [f.elementId, f.fLocalFinal]));
  const folded = new Map<number, Array<{ end: 'I' | 'J'; my: number }>>();
  for (const p of fold) {
    if (!p.member) continue;
    const l = folded.get(p.member.elementId) ?? [];
    l.push({ end: p.member.end, my: p.my });
    folded.set(p.member.elementId, l);
  }
  const forces = (elementId: number) => {
    const f = byElem.get(elementId);
    if (!f) return null;
    const out = f.length === 6 ? [...f] : [f[0], 0, 0, f[2], 0, 0];
    for (const c of folded.get(elementId) ?? []) out[c.end === 'I' ? 2 : 5] += c.my;
    return out;
  };
  const reactions = data.dofNumbering.dofs
    .filter((d) => !d.isFree)
    .map((d) => ({ nodeId: d.nodeId, component: d.localDof, value: data.reactionsRaw[d.globalIndex - data.dofNumbering.nFree] }));
  return { data, input, disp, forces, reactions };
}

export function barState(elementId: number, L: number, f: number[], loads: BarLoads): BarState {
  return {
    elementId, L,
    ends: { nStart: -f[0], vStart: f[1], mStart: f[2], nEnd: f[3], vEnd: -f[4], mEnd: -f[5] },
    samples: sampleDiagram({ N: f[0], V: f[1], M: f[2] }, loads, L),
  };
}

/** A state as the steps show it; `loads` are the loads along the bars (none for a unit state). */
export function stateOf(s: Solved, loads: SolverLoad[]): StateResult {
  const withLoads = { ...s.input, loads };
  return {
    bars: [...s.input.elements.values()].map((e) => {
      const L = lenOf(s.input, e.nodeI, e.nodeJ);
      const bl = barLoadsOf(withLoads, e.id, L);
      return barState(e.id, L, s.forces(e.id)!, e.type === 'frame' ? bl : axialLoadsOnly(bl));
    }),
    reactions: s.reactions,
  };
}
