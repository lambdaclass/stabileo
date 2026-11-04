import { describe, it, expect } from 'vitest';
import { recognizePhysical, kindOfGeometry, levelAt } from '../recognize';

// A frame of two bays (6 m + 6 m) and two storeys (3 m each) along X, columns at x = 0, 6, 12.
function frame() {
  const nodes = new Map<number, { x: number; y: number; z: number }>();
  let id = 1;
  const at: Record<string, number> = {};
  for (const x of [0, 6, 12]) for (const zz of [0, 3, 6]) { nodes.set(id, { x, y: 0, z: zz }); at[`${x},${zz}`] = id++; }
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number }>();
  let e = 1;
  for (const x of [0, 6, 12]) for (const [z0, z1] of [[0, 3], [3, 6]]) { elements.set(e, { id: e, nodeI: at[`${x},${z0}`]!, nodeJ: at[`${x},${z1}`]! }); e++; }
  for (const zz of [3, 6]) for (const [x0, x1] of [[0, 6], [6, 12]]) { elements.set(e, { id: e, nodeI: at[`${x0},${zz}`]!, nodeJ: at[`${x1},${zz}`]! }); e++; }
  return { nodes, elements };
}

describe('physical elements read off a frame', () => {
  it('a column of two storeys is one column; a beam over two bays is one beam', () => {
    const d = recognizePhysical(frame());
    const cols = d.filter((x) => x.kind === 'column');
    const beams = d.filter((x) => x.kind === 'beam');
    expect(cols).toHaveLength(3);
    expect(cols.every((c) => c.elements.length === 2)).toBe(true);
    expect(beams).toHaveLength(2);
    expect(beams.every((b) => b.elements.length === 2)).toBe(true);
    expect(beams.map((b) => b.levelFrom)).toEqual(['z:3.000', 'z:6.000']);
    expect(cols[0]!.levelFrom).toBe('z:0.000');
    expect(cols[0]!.levelTo).toBe('z:6.000');
    expect(d.every((x) => x.provenance === 'inferred')).toBe(true);
    expect(d.map((x) => x.name)).toEqual(expect.arrayContaining(['C1', 'C2', 'C3', 'V1', 'V2']));
  });

  it('takes a generator\'s role over the geometry, and the grid\'s level names', () => {
    const f = frame();
    const d = recognizePhysical({
      ...f, generatorRoles: new Map([[7, 'rafter'], [8, 'rafter']]),
      levels: [{ id: 'N1', name: 'Planta 1', z: 3 }, { id: 'N2', name: 'Planta 2', z: 6 }],
    });
    const rafter = d.find((x) => x.elements.includes(7))!;
    expect(rafter.provenance).toBe('generator');
    expect(rafter.levelFrom).toBe('N1');
  });

  it('leaves alone what a person already declared', () => {
    const d = recognizePhysical({ ...frame(), taken: { elements: new Set([1, 2]), plates: new Set(), quads: new Set() } });
    expect(d.some((x) => x.elements.includes(1))).toBe(false);
  });

  it('groups coplanar shells: one slab per floor, one wall per storey', () => {
    const nodes = new Map<number, { x: number; y: number; z: number }>([
      [1, { x: 0, y: 0, z: 3 }], [2, { x: 3, y: 0, z: 3 }], [3, { x: 6, y: 0, z: 3 }],
      [4, { x: 0, y: 3, z: 3 }], [5, { x: 3, y: 3, z: 3 }], [6, { x: 6, y: 3, z: 3 }],
      [7, { x: 0, y: 0, z: 0 }], [8, { x: 3, y: 0, z: 0 }],
    ]);
    const quads = new Map([
      [10, { id: 10, nodes: [1, 2, 5, 4], thickness: 0.15 }],
      [11, { id: 11, nodes: [2, 3, 6, 5], thickness: 0.15 }],
      [20, { id: 20, nodes: [7, 8, 2, 1], thickness: 0.2 }],
    ]);
    const d = recognizePhysical({ nodes, elements: new Map(), quads });
    expect(d.filter((x) => x.kind === 'slab')).toEqual([expect.objectContaining({ quads: [10, 11] })]);
    expect(d.filter((x) => x.kind === 'wall')).toEqual([expect.objectContaining({ quads: [20] })]);
  });

  it('helpers', () => {
    expect(kindOfGeometry({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 3 })).toBe('column');
    expect(kindOfGeometry({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 1.5 })).toBe('brace');
    expect(levelAt(3.004, [{ id: 'N1', name: 'n', z: 3 }])).toBe('N1');
  });
});
