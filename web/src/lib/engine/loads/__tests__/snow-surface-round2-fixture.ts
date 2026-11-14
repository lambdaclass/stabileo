import { auditRoof } from './snow-slope-audit-fixture';
import { stepRoof } from './snow-step-fixture';

export function mesh(rings: number[][][]) {
  const m = auditRoof('mono', 0);
  m.nodes.clear(); m.elements.clear();
  const node = (p: number[]) => {
    const old = [...m.nodes.values()].find(n => n.x === p[0] && n.y === p[1] && n.z === p[2]);
    if (old) return old.id;
    const id = m.nodes.size + 1;
    m.nodes.set(id, { id, x: p[0]!, y: p[1]!, z: p[2]! });
    return id;
  };
  for (const ring of rings) for (let k = 0; k < ring.length; k++) {
    const nodeI = node(ring[k]!), nodeJ = node(ring[(k + 1) % ring.length]!);
    if ([...m.elements.values()].some(e => e.nodeI === nodeI && e.nodeJ === nodeJ || e.nodeI === nodeJ && e.nodeJ === nodeI)) continue;
    const id = m.elements.size + 1;
    m.elements.set(id, { id, nodeI, nodeJ, sectionId: 1, materialId: 1 });
  }
  return m;
}

export function asymmetric(rise = 0.3, far = 4) {
  return mesh([[[0, 0, 3], [6, 0, 3], [6, 1, 3 + rise], [0, 1, 3 + rise]], [[0, 1, 3 + rise], [6, 1, 3 + rise], [6, far, 3], [0, far, 3]], [[0, 0, 3], [6, 0, 3], [6, far, 3], [0, far, 3]]]);
}

export function concave() {
  return mesh([[[0, 0, 3], [4, 0, 3], [4, 1, 3.2], [1, 1, 3.2], [1, 4, 3.8], [0, 4, 3.8]]]);
}

export function disjoint() {
  const m = mesh([[[0, 0, 3], [2, 0, 3.2]], [[0, 1, 3], [2, 1, 3.2]], [[10, 10, 3], [12, 10, 3.2]], [[10, 11, 3], [12, 11, 3.2]]]);
  return m;
}

export function twoPitch() {
  const m = stepRoof(20, 0, 0.45);
  const src = mesh([[[0, 0, 3.6], [0, 2, 3.6], [-1, 2, 3.7], [-1, 0, 3.7]], [[-1, 0, 3.7], [-1, 2, 3.7], [-6, 2, 4.7], [-6, 0, 4.7]]]);
  for (const n of src.nodes.values()) m.nodes.set(n.id + 300, { ...n, id: n.id + 300 });
  for (const e of src.elements.values()) m.elements.set(e.id + 300, { ...e, id: e.id + 300, nodeI: e.nodeI + 300, nodeJ: e.nodeJ + 300 });
  return m;
}

export function transform(m: ReturnType<typeof mesh>, angle: number, shift = 1, mirror = 1) {
  for (const n of m.nodes.values()) {
    const x = mirror * n.x, y = n.y;
    n.x = x * Math.cos(angle) - y * Math.sin(angle) + 137 * shift;
    n.y = x * Math.sin(angle) + y * Math.cos(angle) - 91 * shift;
    n.z = (n.z ?? 0) + 11 * shift;
  }
  return m;
}
