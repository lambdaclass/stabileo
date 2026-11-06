/**
 * The load pattern of each Xᵢ = 1 on the primary structure, and the
 * displacement it measures: the work-conjugate Σ P·u of that pattern.
 */
import type { SolverInput, SolverLoad } from '../types';
import type { DSMStepData } from '../solver-detailed';
import type { Redundant } from './primary';
import { springDirection } from './terms';
import { memberEndRotation } from './hinge-rotation';

/** A unit force or couple at a node, or (with `member`) a couple on a member's own face at a hinge. */
export interface PatternItem {
  nodeId: number; fx: number; fz: number; my: number;
  member?: { elementId: number; end: 'I' | 'J' };
}

const dirOf = (input: SolverInput, nodeI: number, nodeJ: number) => {
  const a = input.nodes.get(nodeI)!;
  const b = input.nodes.get(nodeJ)!;
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  return { c: (b.x - a.x) / L, s: (b.z - a.z) / L, L };
};

export function unitPattern(original: SolverInput, r: Redundant, cutNode: Map<string, number>): PatternItem[] {
  if (r.kind === 'reaction') {
    const sup = [...original.supports.values()].find((s) => s.nodeId === r.nodeId)!;
    if (sup.type === 'inclinedRoller' && r.component === 1) {
      /* The analysis solver's normal: (sin α, cos α). */
      const a = sup.angle ?? 0;
      return [{ nodeId: r.nodeId, fx: Math.sin(a), fz: Math.cos(a), my: 0 }];
    }
    return [{ nodeId: r.nodeId, fx: r.component === 0 ? 1 : 0, fz: r.component === 1 ? 1 : 0, my: r.component === 2 ? 1 : 0 }];
  }
  if (r.kind === 'spring') {
    const sup = [...original.supports.values()].find((s) => s.nodeId === r.nodeId)!;
    const [fx, fz, my] = springDirection(sup, r.component ?? 0);
    return [{ nodeId: r.nodeId, fx, fz, my }];
  }
  const e = original.elements.get(r.elementId!)!;
  const { c, s } = dirOf(original, e.nodeI, e.nodeJ);
  if (r.kind === 'barForce') {
    /* Tension pulls each end toward the other. */
    return [{ nodeId: e.nodeI, fx: c, fz: s, my: 0 }, { nodeId: e.nodeJ, fx: -c, fz: -s, my: 0 }];
  }
  /* On the member's face the pair is the internal force it stands for: at end J the member feels (N, −V, −M), at I (−N, V, M). */
  const sign = r.end === 'J' ? 1 : -1;
  if (r.hinge) {
    const pm = -sign;
    return [
      { nodeId: r.nodeId, fx: 0, fz: 0, my: pm, member: { elementId: e.id, end: r.end! } },
      { nodeId: r.nodeId, fx: 0, fz: 0, my: -pm },
    ];
  }
  const px = r.kind === 'cutN' ? sign : 0;
  const py = r.kind === 'cutV' ? -sign : 0;
  const pm = r.kind === 'cutM' ? -sign : 0;
  const fx = px * c - py * s;
  const fz = px * s + py * c;
  const member = cutNode.get(`${e.id}:${r.end}`)!;
  return [
    { nodeId: member, fx, fz, my: pm },
    { nodeId: r.nodeId, fx: -fx, fz: -fz, my: -pm },
  ];
}

/** The pattern as loads: nodal ones, and a couple on a member's face as a couple at that end of the member. */
export function patternLoads(input: SolverInput, pattern: PatternItem[]): SolverLoad[] {
  return pattern.map((p): SolverLoad => {
    if (!p.member) return { type: 'nodal', data: { nodeId: p.nodeId, fx: p.fx, fz: p.fz, my: p.my } };
    const e = input.elements.get(p.member.elementId)!;
    const L = dirOf(input, e.nodeI, e.nodeJ).L;
    return { type: 'pointOnElement', data: { elementId: e.id, a: p.member.end === 'J' ? L : 0, p: 0, px: 0, my: p.my } };
  });
}

/** Work-conjugate displacement of a pattern on a solved state: Σ P·u, with a hinge face's own rotation. */
export function generalised(
  input: SolverInput, data: DSMStepData, disp: (nodeId: number) => [number, number, number], pattern: PatternItem[],
): number {
  let s = 0;
  for (const p of pattern) {
    if (p.member) { s += p.my * memberEndRotation(input, data, p.member.elementId, p.member.end); continue; }
    const [u, w, th] = disp(p.nodeId);
    s += p.fx * u + p.fz * w + p.my * th;
  }
  return s;
}
