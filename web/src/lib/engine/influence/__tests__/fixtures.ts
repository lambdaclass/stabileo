/** Plane models in the store's shape, for the influence-line tests. EI = 2·10⁴ kN·m², EA = 2·10⁶ kN. */
export const E = 200_000;
export const I = 1e-4;
export const A = 0.01;
export const EI = E * 1000 * I;

type Sup = 'fixed' | 'pinned' | 'rollerX';

export function planeModel(
  nodes: Array<[number, number, number]>,
  members: Array<[number, number, number, ('frame' | 'truss')?, { hingeI?: boolean; hingeJ?: boolean }?]>,
  supports: Array<[number, Sup]>,
) {
  return {
    nodes: new Map(nodes.map(([id, x, y]) => [id, { id, x, y }])),
    elements: new Map(members.map(([id, i, j, type, h]) => [id, {
      id, nodeI: i, nodeJ: j, materialId: 1, sectionId: 1, type: type ?? 'frame',
      releaseI: h?.hingeI ? { mz: true } : {}, releaseJ: h?.hingeJ ? { mz: true } : {},
    }])),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3, rho: 78.5 }]]),
    sections: new Map([[1, { id: 1, a: A, iz: I, iy: I }]]),
    supports: new Map(supports.map(([nodeId, type], k) => [k + 1, { id: k + 1, nodeId, type }])),
    loads: [], plates: new Map(), quads: new Map(),
  } as never;
}

export const simpleBeam = (L: number) => planeModel([[1, 0, 0], [2, L, 0]], [[1, 1, 2]], [[1, 'pinned'], [2, 'rollerX']]);
export const cantilever = (L: number) => planeModel([[1, 0, 0], [2, L, 0]], [[1, 1, 2]], [[1, 'fixed']]);
export const twoSpan = (L: number) => planeModel([[1, 0, 0], [2, L, 0], [3, 2 * L, 0]], [[1, 1, 2], [2, 2, 3]], [[1, 'pinned'], [2, 'rollerX'], [3, 'rollerX']]);
export const threeSpan = (L: number) => planeModel(
  [[1, 0, 0], [2, L, 0], [3, 2 * L, 0], [4, 3 * L, 0]], [[1, 1, 2], [2, 2, 3], [3, 3, 4]],
  [[1, 'pinned'], [2, 'rollerX'], [3, 'rollerX'], [4, 'rollerX']],
);
/** Two panels of 4 m, 3 m high: chords 1–2, 2–3, rafters 1–4, 4–3, post 2–4. */
export const kingPostTruss = () => planeModel(
  [[1, 0, 0], [2, 4, 0], [3, 8, 0], [4, 4, 3]],
  [[1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 1, 4, 'truss'], [4, 4, 3, 'truss'], [5, 2, 4, 'truss']],
  [[1, 'pinned'], [3, 'rollerX']],
);
