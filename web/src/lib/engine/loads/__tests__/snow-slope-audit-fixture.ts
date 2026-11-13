import type { LoadModelData } from '../load-plan';

export function auditRoof(kind: 'mono' | 'gable', slopeDeg: number): LoadModelData {
  if (slopeDeg === 0 && kind === 'gable') return auditRoof('mono', 0);
  const nodes = new Map<number, { id: number; x: number; y: number; z?: number }>();
  const elements = new Map<number, { id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>();
  let n = 1, e = 1;
  const node = (x: number, y: number, z: number) => { nodes.set(n, { id: n, x, y, z }); return n++; };
  const bar = (i: number, j: number) => { elements.set(e, { id: e, nodeI: i, nodeJ: j, sectionId: 1, materialId: 1 }); return e++; };
  const eave: number[][] = [];
  for (const x of [0, 3, 6]) {
    const lo = node(x, 0, 3), hi = node(x, 6, 3), ridge = node(x, kind === 'mono' ? 6 : 3, 3 + (kind === 'mono' ? 6 : 3) * Math.tan(slopeDeg * Math.PI / 180));
    eave.push([lo, hi]);
    bar(lo, ridge); if (kind === 'gable') bar(ridge, hi);
    if (x !== 3) { bar(node(x, 0, 0), lo); bar(node(x, 6, 0), hi); }
  }
  for (const side of [0, 1]) { bar(eave[0]![side]!, eave[1]![side]!); bar(eave[1]![side]!, eave[2]![side]!); }
  bar(eave[0]![0]!, eave[0]![1]!); bar(eave[2]![0]!, eave[2]![1]!);
  return { nodes, elements, sections: new Map([[1, { id: 1, a: 0.01 }]]), materials: new Map([[1, { id: 1, rho: 78.5 }]]), loadCases: [] };
}


export function auditMultiSpan(slopeDeg: number): LoadModelData {
  const model = auditRoof('gable', slopeDeg);
  const second = auditRoof('gable', slopeDeg);
  const ids = new Map<number, number>();
  for (const n of second.nodes.values()) {
    const y = n.y + 6;
    const existing = [...model.nodes.values()].find(p => p.x === n.x && p.y === y && p.z === n.z);
    const id = existing?.id ?? model.nodes.size + 1;
    if (!existing) model.nodes.set(id, { ...n, id, y });
    ids.set(n.id, id);
  }
  for (const e of second.elements.values()) {
    const nodeI = ids.get(e.nodeI)!, nodeJ = ids.get(e.nodeJ)!;
    if ([...model.elements.values()].some(p => (p.nodeI === nodeI && p.nodeJ === nodeJ) || (p.nodeI === nodeJ && p.nodeJ === nodeI))) continue;
    const id = model.elements.size + 1;
    model.elements.set(id, { ...e, id, nodeI, nodeJ });
  }
  return model;
}
