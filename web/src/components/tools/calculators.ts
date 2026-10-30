import type { SolverInput } from '../../lib/engine/types';

export const TOOL_IDS = ['simply-supported-beam', 'cantilever-beam', 'column-buckling'] as const;
export type ToolId = typeof TOOL_IDS[number];
export type Parameters = { length: number; e: number; i: number; load: number; position: number; uniform: boolean; k: number };
export const EXAMPLE: Parameters = { length: 6, e: 200000, i: 0.00008, load: 10, position: 3, uniform: true, k: 1 };
export const format = (n: number) => Number(n.toPrecision(12)).toString();
export const FORMULAS = {
  'simply-supported-beam': 'δmax = 5wL⁴/(384EI); δmid = PL³/(48EI) (a = L/2); R₀ = Pb/L; R₁ = Pa/L; Mmax = Pab/L; b = L − a; R₀ = R₁ = wL/2; Mmax = wL²/8; δ(x≤a) = Pbx(L²−b²−x²)/(6LEI); δ(x≥a) = Pa(L−x)[L²−a²−(L−x)²]/(6LEI)',
  'cantilever-beam': 'δmax = PL³/(3EI) (a = L); δmax = Pa²(3L − a)/(6EI); δmax = wL⁴/(8EI); R = P / wL; |M₀| = Pa / (wL²/2)',
  'column-buckling': 'Pcr = π²EI/(KL)²',
};
export function formula(id: ToolId, p: Parameters) {
  const { length: L, load: P, position: a } = p;
  const EI = p.e * 1000 * p.i;
  if (id === 'column-buckling') return { value: Math.PI ** 2 * EI / (p.k * L) ** 2, x: L / 2 };
  if (id === 'cantilever-beam') return { value: p.uniform ? P * L ** 4 / (8 * EI) : P * a ** 2 * (3 * L - a) / (6 * EI), x: L };
  if (p.uniform) return { value: 5 * P * L ** 4 / (384 * EI), x: L / 2 };
  const b = L - a;
  const x = a >= L / 2 ? Math.sqrt((L * L - b * b) / 3) : L - Math.sqrt((L * L - a * a) / 3);
  const value = x <= a ? P * b * x * (L * L - b * b - x * x) / (6 * L * EI) : P * a * (L - x) * (L * L - a * a - (L - x) ** 2) / (6 * L * EI);
  return { value, x };
}
export function valid(p: Parameters) {
  return Object.values(p).every(v => typeof v === 'boolean' || Number.isFinite(v)) && p.length >= 0.1 && p.length <= 100 && p.e >= 1 && p.e <= 1000000 && p.i >= 1e-10 && p.i <= 10 && p.load > 0 && p.load <= 1000000 && (p.uniform || p.position >= 0 && p.position <= p.length) && [0.5, 0.7, 1, 2].includes(p.k);
}
export function buildModel(id: ToolId, p: Parameters): SolverInput {
  if (!valid(p)) throw new Error('Invalid calculator parameters');
  const column = id === 'column-buckling';
  const xs = column ? Array.from({ length: 33 }, (_, j) => p.length * j / 32) : [...new Set([0, formula(id, p).x, ...(!p.uniform ? [p.position] : []), p.length])].sort((a, b) => a - b);
  const nodes: SolverInput['nodes'] = new Map(xs.map((x, j) => [j + 1, { id: j + 1, x, z: 0 }]));
  const elements: SolverInput['elements'] = new Map(xs.slice(1).map((_, j) => [j + 1, { id: j + 1, type: 'frame', nodeI: j + 1, nodeJ: j + 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]));
  const supports: SolverInput['supports'] = new Map([[1, { id: 1, nodeId: 1, type: id === 'simply-supported-beam' || column && p.k === 1 ? 'pinned' : 'fixed' }]]);
  if (id === 'simply-supported-beam' || column && p.k !== 2) supports.set(2, { id: 2, nodeId: xs.length, type: (column && p.k === 0.5 ? 'guidedX' : 'rollerX') as import('../../lib/engine/types').SupportType });
  const loads: SolverInput['loads'] = column ? [{ type: 'nodal', data: { nodeId: xs.length, fx: -1, fz: 0, my: 0 } }] : p.uniform ? [...elements.keys()].map(elementId => ({ type: 'distributed', data: { elementId, qI: -p.load, qJ: -p.load } })) : [{ type: 'nodal', data: { nodeId: xs.indexOf(p.position) + 1, fx: 0, fz: -p.load, my: 0 } }];
  return { nodes, elements, supports, loads, materials: new Map([[1, { id: 1, e: p.e, nu: 0.3 }]]), sections: new Map([[1, { id: 1, a: 0.01, iz: p.i }]]) };
}
export const workedExamples = (id: ToolId) => id === 'column-buckling' ? [0.5, 0.7, 1, 2].map(k => ({ ...EXAMPLE, k })) : [{ ...EXAMPLE }, { ...EXAMPLE, uniform: false, position: id === 'cantilever-beam' ? EXAMPLE.length : EXAMPLE.length / 2 }];
