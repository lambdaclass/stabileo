/**
 * A load along a plane member's axis, as the solve takes it (`axialDistributed`, kN/m positive
 * toward J, from qI at a to qJ at b), and its consistent equivalent at the member's ends.
 *
 * The solve is given the span load itself, so N varies along the member as the load says. Its
 * two end loads are what a reader that only takes nodal loads gets instead — the same
 * displacements and reactions, but a member that carries its average N along its length.
 */
import type { SolverInput, SolverLoad, SolverAxialDistributedLoad } from './types';

/** Consistent end loads (along the axis) of a linear axial load on [a, b] of a member of length L. */
export function axialEquivalentLoads(qI: number, qJ: number, a: number, b: number, length: number): [number, number] {
  // Integrate q(x) against the axial shape functions, 1-x/L and x/L.
  // Signed first moments remain valid when q crosses zero or its resultant
  // vanishes, unlike a centroid computed from absolute load magnitudes.
  const span = b - a;
  const total = (qI + qJ) * span / 2;
  const fJ = (a * total + span * span * (qI + 2 * qJ) / 6) / length;
  return [total - fJ, fJ];
}

/** ∫₀ˣ q: what of an axial span load lies between end I and x (x from I, in metres). */
export function axialLoadUpTo(d: { qI: number; qJ: number; a: number; b: number }, x: number): number {
  const span = d.b - d.a;
  if (!(span > 0)) return 0;
  const s = Math.max(0, Math.min(x - d.a, span));
  return d.qI * s + (d.qJ - d.qI) * s * s / (2 * span);
}

/** The axial span load as nodal loads at its member's ends, in global axes. */
export function axialSpanToNodal2D(input: Pick<SolverInput, 'nodes' | 'elements'>, d: SolverAxialDistributedLoad): SolverLoad[] {
  const e = input.elements.get(d.elementId);
  const ni = e && input.nodes.get(e.nodeI), nj = e && input.nodes.get(e.nodeJ);
  if (!e || !ni || !nj) return [];
  const dx = nj.x - ni.x, dz = nj.z - ni.z;
  const L = Math.hypot(dx, dz);
  if (L < 1e-12) return [];
  const [fI, fJ] = axialEquivalentLoads(d.qI, d.qJ, d.a ?? 0, d.b ?? L, L);
  const c = dx / L, s = dz / L;
  return [
    { type: 'nodal', data: { nodeId: e.nodeI, fx: fI * c, fz: fI * s, my: 0 } },
    { type: 'nodal', data: { nodeId: e.nodeJ, fx: fJ * c, fz: fJ * s, my: 0 } },
  ];
}
