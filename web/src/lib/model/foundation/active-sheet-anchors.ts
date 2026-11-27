import { modelStore } from '../../store/model.svelte';
import { planHalf } from '../building/build-on-grid';
import { anchorsOf, type PropertyLines } from './edges';

export function sheetAnchors(nodeIds: number[], lines: PropertyLines) {
  const points = [];
  for (const id of nodeIds) {
    const n = modelStore.nodes.get(id);
    if (!n) continue;
    let half = null;
    for (const e of modelStore.elements.values()) {
      if (e.nodeI !== id && e.nodeJ !== id) continue;
      const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
      if (a && b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) {
        half = planHalf(e.id);
        if (half) break;
      }
    }
    points.push({ id, x: n.x, y: n.y, ...(half ? { hx: half[0], hy: half[1] } : {}) });
  }
  return anchorsOf(points, lines);
}
