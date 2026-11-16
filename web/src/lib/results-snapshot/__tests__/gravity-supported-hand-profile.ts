import { expect } from 'vitest';
import { solve_3d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';

type Profile = Array<[number, number, number, number]>;
interface Input {
  nodes: Record<number, { x: number; y: number; z?: number }>;
  elements: Record<number, { nodeI: number; nodeJ: number }>;
  loads: Array<{ type: string; data: { elementId: number; a?: number; b?: number; moments?: { x: number[]; y: number[]; z: number[] } } }>;
}
export function refusesMomentFringes(raw: unknown, solves?: Array<() => unknown>): boolean {
  const input = raw as Input;
  const unsupported = input.loads.some(({ data }) => {
    if (!data.moments || Object.values(data.moments).every(v => v.every(x => x === 0))) return false;
    const e = input.elements[data.elementId]!, i = input.nodes[e.nodeI]!, j = input.nodes[e.nodeJ]!;
    const length = Math.hypot(j.x - i.x, j.y - i.y, (j.z ?? 0) - (i.z ?? 0));
    return (data.b ?? length) - (data.a ?? 0) < 1e-10 * length;
  });
  if (unsupported) {
    for (const solve of solves ?? [() => solve_3d(input), () => solve_pdelta_3d(JSON.stringify(input), 100, 1e-10)]) expect(solve).toThrow(/distributed moment span.*1e-10/);
  }
  return unsupported;
}
export function handMemberLoads(ids: number[], starts: number[], length: number, profile: Profile, mirror: number) {
  return ids.flatMap((elementId, k) => profile.flatMap(([lo, hi, qa, qb]) => {
    const start = starts[k]!, end = starts[k + 1] ?? length, a = Math.max(start, lo), b = Math.min(end, hi);
    if (b <= a) return [];
    const at = (x: number) => qa + (qb - qa) * (x - lo) / (hi - lo);
    const torque = (x: number) => -mirror * at(x) ** 2 / 2;
    return [{ type: 'distributed', data: { elementId, a: a - start, b: b - start, qYI: 0, qYJ: 0, qZI: -at(a), qZJ: -at(b), moments: { x: [torque(a), torque((a + b) / 2), torque(b)], y: [0, 0, 0], z: [0, 0, 0] } } }];
  }));
}
