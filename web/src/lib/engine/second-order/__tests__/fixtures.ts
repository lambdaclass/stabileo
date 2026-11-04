import type { SolverInput, SolverSupport, SolverLoad } from '../../types';

export const E = 200000;
export const I = 1e-4;
export const EI = E * 1000 * I;

const frame = (id: number, nodeI: number, nodeJ: number, hingeStart = false, hingeEnd = false) =>
  ({ id, type: 'frame' as const, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart, hingeEnd });

/** A vertical column of height L, under P (compression) and an optional lateral H at its top. */
export function column(base: SolverSupport['type'], top: SolverSupport['type'] | 'guided' | null, L: number, P: number, H = 0, A = 0.01): SolverInput {
  const supports = new Map<number, SolverSupport>([[1, { id: 1, nodeId: 1, type: base }]]);
  if (top === 'guided') supports.set(2, { id: 2, nodeId: 2, type: 'spring', kx: 1e12, ky: 0, kz: 1e12 });
  else if (top) supports.set(2, { id: 2, nodeId: 2, type: top });
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: L }]]),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I }]]),
    elements: new Map([[1, frame(1, 1, 2)]]),
    supports,
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: H, fz: -P, my: 0 } }],
  };
}

/** A fixed-base portal, columns h, beam b, each column under P, a lateral H at the top left. */
export function portal(h: number, b: number, P: number, H: number, opts: { hinged?: boolean; extraLoads?: SolverLoad[]; A?: number; Ib?: number } = {}): SolverInput {
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: h }], [3, { id: 3, x: b, z: h }], [4, { id: 4, x: b, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: opts.A ?? 0.01, iz: I }], [2, { id: 2, a: opts.A ?? 0.01, iz: opts.Ib ?? I }]]),
    elements: new Map([[1, frame(1, 1, 2)], [2, { ...frame(2, 2, 3, false, !!opts.hinged), sectionId: 2 }], [3, frame(3, 4, 3)]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 4, type: opts.hinged ? 'pinned' : 'fixed' }]]),
    loads: [
      { type: 'nodal', data: { nodeId: 2, fx: H, fz: -P, my: 0 } },
      { type: 'nodal', data: { nodeId: 3, fx: 0, fz: -P, my: 0 } },
      ...(opts.extraLoads ?? []),
    ],
  };
}

/** Same model, every section's area times k. */
export const scaleArea = (input: SolverInput, k: number): SolverInput =>
  ({ ...input, sections: new Map([...input.sections].map(([id, s]) => [id, { ...s, a: s.a * k }])) });
