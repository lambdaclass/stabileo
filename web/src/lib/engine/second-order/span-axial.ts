import type { SolverInput } from '../types';
import type { PMember } from '../steps/plane-model';
import { axialEquivalentLoads, axialLoadUpTo } from '../axial-span-2d';
import { zeros, type Mat } from './dense';

const GAUSS_4 = [
  [-0.8611363115940526, 0.3478548451374539],
  [-0.3399810435848563, 0.6521451548625461],
  [0.3399810435848563, 0.6521451548625461],
  [0.8611363115940526, 0.3478548451374539],
];

export function spanAxialGeometric(m: PMember, loads: SolverInput['loads']): Mat | undefined {
  if (m.truss) return undefined;
  const spans: Array<{ qI: number; qJ: number; a: number; b: number }> = [];
  const points: Array<{ a: number; px: number }> = [];
  for (const load of loads) {
    if (load.type === 'axialDistributed' && load.data.elementId === m.id) {
      spans.push({ ...load.data, a: load.data.a ?? 0, b: load.data.b ?? m.L });
    } else if (load.type === 'pointOnElement' && load.data.elementId === m.id && load.data.px) {
      points.push({ a: load.data.a, px: load.data.px });
    }
  }
  if (!spans.length && !points.length) return undefined;
  const equivalentI = spans.reduce((s, q) => s + axialEquivalentLoads(q.qI, q.qJ, q.a, q.b, m.L)[0], 0)
    + points.reduce((s, p) => s + p.px * (1 - p.a / m.L), 0);
  const breaks = [...new Set([0, m.L, ...spans.flatMap((q) => [q.a, q.b]), ...points.map((p) => p.a)])].sort((a, b) => a - b);
  const k = zeros(6, 6);
  const indices = [1, 2, 4, 5];
  for (let j = 1; j < breaks.length; j++) {
    const mid = (breaks[j - 1] + breaks[j]) / 2;
    const half = (breaks[j] - breaks[j - 1]) / 2;
    for (const [g, weight] of GAUSS_4) {
      const x = mid + half * g, s = x / m.L;
      const delta = equivalentI - spans.reduce((v, q) => v + axialLoadUpTo(q, x), 0)
        - points.reduce((v, p) => v + (p.a < x ? p.px : 0), 0);
      const slope = [(6 * s * s - 6 * s) / m.L, 1 - 4 * s + 3 * s * s, (6 * s - 6 * s * s) / m.L, 3 * s * s - 2 * s];
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        k[indices[a]][indices[b]] += half * weight * delta * slope[a] * slope[b];
      }
    }
  }
  return k;
}
