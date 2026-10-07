/**
 * A large building, generated, to time PRO's tables and panels on a model the size a real project
 * reaches: a grid of `nx × ny` bays and `storeys` floors, columns, beams both ways, a diagonal in
 * every perimeter bay, a meshed slab on every floor (one quadrilateral per bay), fixed bases, and
 * loads on all of it in four cases.
 *
 * With the defaults: 1,638 nodes, 4,245 members, 1,200 slab quadrilaterals, 273 supports and
 * 5,130 loads.
 */
export interface LargeModelSize { nx?: number; ny?: number; storeys?: number; bay?: number; height?: number }

export function largeBuilding(o: LargeModelSize = {}): Record<string, unknown> {
  const nx = o.nx ?? 20, ny = o.ny ?? 12, storeys = o.storeys ?? 5, bay = o.bay ?? 5, h = o.height ?? 3.2;
  const nodes: Array<{ id: number; x: number; y: number; z: number }> = [];
  const id = (i: number, j: number, k: number) => 1 + i + j * (nx + 1) + k * (nx + 1) * (ny + 1);
  for (let k = 0; k <= storeys; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    nodes.push({ id: id(i, j, k), x: i * bay, y: j * bay, z: k * h });
  }
  const elements: Array<Record<string, unknown>> = [];
  const member = (a: number, b: number, sectionId: number, type = 'frame') => {
    elements.push({ id: elements.length + 1, type, nodeI: a, nodeJ: b, materialId: 1, sectionId, hingeStart: false, hingeEnd: false });
    return elements.length;
  };
  const beams: number[] = [];
  for (let k = 1; k <= storeys; k++) {
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) member(id(i, j, k - 1), id(i, j, k), 1);
    for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) beams.push(member(id(i, j, k), id(i + 1, j, k), 2));
    for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) beams.push(member(id(i, j, k), id(i, j + 1, k), 2));
    // Perimeter bracing: a diagonal in every outer bay.
    for (let i = 0; i < nx; i++) { member(id(i, 0, k - 1), id(i + 1, 0, k), 3, 'truss'); member(id(i, ny, k - 1), id(i + 1, ny, k), 3, 'truss'); }
    for (let j = 0; j < ny; j++) { member(id(0, j, k - 1), id(0, j + 1, k), 3, 'truss'); member(id(nx, j, k - 1), id(nx, j + 1, k), 3, 'truss'); }
  }
  const quads: Array<Record<string, unknown>> = [];
  for (let k = 1; k <= storeys; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    quads.push({ id: quads.length + 1, nodes: [id(i, j, k), id(i + 1, j, k), id(i + 1, j + 1, k), id(i, j + 1, k)], materialId: 2, thickness: 0.15 });
  }
  const supports: Array<Record<string, unknown>> = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) supports.push({ id: supports.length + 1, nodeId: id(i, j, 0), type: 'fixed3d' });
  const loads: Array<Record<string, unknown>> = [];
  const add = (type: string, data: Record<string, unknown>) => loads.push({ type, data: { id: loads.length + 1, ...data } });
  for (const q of quads) { add('surface3d', { quadId: q.id, q: 2, caseId: 1 }); add('surface3d', { quadId: q.id, q: 3, caseId: 2 }); }
  for (const b of beams) add('distributed3d', { elementId: b, qYI: 0, qYJ: 0, qZI: -1.5, qZJ: -1.5, caseId: 1 });
  for (let j = 0; j <= ny; j++) for (let k = 1; k <= storeys; k++) add('nodal3d', { nodeId: id(0, j, k), fx: 4, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, caseId: 3 });
  for (let i = 0; i <= nx; i++) for (let k = 1; k <= storeys; k++) add('nodal3d', { nodeId: id(i, 0, k), fx: 0, fy: 4, fz: 0, mx: 0, my: 0, mz: 0, caseId: 4 });
  return {
    name: `Large building ${nx}×${ny}×${storeys}`,
    materials: [
      { id: 1, name: 'Acero A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 },
      { id: 2, name: 'H-30', e: 28000, nu: 0.2, rho: 25 },
    ],
    sections: [
      { id: 1, name: 'HEB 300', a: 0.0149, iy: 2.517e-4, iz: 8.56e-5, j: 1.85e-6, b: 0.3, h: 0.3 },
      { id: 2, name: 'IPE 400', a: 0.00845, iy: 2.313e-4, iz: 1.318e-5, j: 5.1e-7, b: 0.18, h: 0.4 },
      { id: 3, name: 'L 100x100x10', a: 0.00192, iy: 1.77e-6, iz: 1.77e-6, j: 6.4e-8, b: 0.1, h: 0.1 },
    ],
    nodes, elements, supports, loads, plates: [], quads, constraints: [],
    loadCases: [
      { id: 1, type: 'D', name: 'Dead' }, { id: 2, type: 'L', name: 'Live' },
      { id: 3, type: 'W', name: 'Wind X' }, { id: 4, type: 'W', name: 'Wind Y' },
    ],
    combinations: [{ id: 1, name: '1.2D + 1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] }],
  };
}
