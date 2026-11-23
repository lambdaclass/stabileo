import type { JSONModel } from '../../../templates/load-fixture';

export function plateMeshExample() {
  const nodes: JSONModel['nodes'] = [];
  const quads: JSONModel['quads'] = [];
  for (const z of [0, 3, 6]) {
    for (const x of [0, 4]) {
      const slab = [[x, 0, z], [x + 2, 0, z], [x + 2, 2, z], [x, 2, z]];
      const wall = [[x, 4, z], [x + 2, 4, z], [x + 2, 4, z + 2], [x, 4, z + 2]];
      for (const corners of [slab, wall]) {
        const ids = corners.map(([x, y, z]) => nodes.push({ id: nodes.length + 1, x: x!, y: y!, z: z! }));
        quads.push({ id: quads.length + 1, nodes: ids, materialId: 1, thickness: 0.15 });
      }
    }
  }
  return {
    name: 'Separate slabs and walls on three levels',
    nodes,
    quads,
    materials: [],
    sections: [],
    elements: [],
    supports: [],
    loads: [],
    plates: [],
    constraints: [],
    loadCases: [],
    combinations: [],
  } satisfies JSONModel;
}
