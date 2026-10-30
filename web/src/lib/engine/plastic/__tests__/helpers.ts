import type { SolverInput, SolverLoad } from '../../types';

export const MP = 100;
type El = [number, number, number, ('frame' | 'truss')?];

export function model(nodes: Array<[number, number, number]>, elements: El[], supports: Array<[number, string]>, loads: SolverLoad[]): SolverInput {
  return {
    nodes: new Map(nodes.map(([id, x, z]) => [id, { id, x, z }])),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map(elements.map(([id, i, j, type]) => [id, { id, type: type ?? 'frame', nodeI: i, nodeJ: j, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }])),
    supports: new Map(supports.map(([nodeId, type], k) => [k + 1, { id: k + 1, nodeId, type: type as never }])),
    loads,
  } as unknown as SolverInput;
}
export const P = (nodeId: number, fx: number, fz: number): SolverLoad => ({ type: 'nodal', data: { nodeId, fx, fz, my: 0 } });
export const q = (elementId: number, v: number): SolverLoad => ({ type: 'distributed', data: { elementId, qI: v, qJ: v } });
export const pOn = (elementId: number, a: number, p: number): SolverLoad => ({ type: 'pointOnElement', data: { elementId, a, p } });
export const uniformMp = () => MP;

export const fixedBeam = (L = 6, P0 = 10) => model([[1, 0, 0], [2, L, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'fixed']], [pOn(1, L / 2, -P0)]);
export const proppedUdl = (L = 6, w = 10) => model([[1, 0, 0], [2, L, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'rollerX']], [q(1, -w)]);
/** Portal h = 4, L = 6, H at the top left, V at midspan (the classic: beam 8Mp/VL, sway 4Mp/Hh, combined 6Mp/(Hh + VL/2)). */
export const portal = (H = 1, V = 1, h = 4, L = 6) => model([[1, 0, 0], [2, 0, h], [3, L, h], [4, L, 0]], [[1, 1, 2], [2, 2, 3], [3, 3, 4]],
  [[1, 'fixed'], [4, 'fixed']], [P(2, H, 0), pOn(2, L / 2, -V)]);
export const twoSpanUdl = (L = 5, w = 10) => model([[1, 0, 0], [2, L, 0], [3, 2 * L, 0]], [[1, 1, 2], [2, 2, 3]],
  [[1, 'pinned'], [2, 'rollerX'], [3, 'rollerX']], [q(1, -w), q(2, -w)]);
