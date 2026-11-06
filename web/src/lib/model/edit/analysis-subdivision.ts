/**
 * Every member cut into `n` equal segments for one analysis, the model left as
 * it is: the same split the "Subdivide" command makes (member-split.ts), applied
 * to a copy. The first segment keeps the member's id.
 *
 * Members of variable section or curved are left whole: their pieces are made
 * elsewhere (variable-members.ts) and a straight cut would change their shape.
 */
import type { ModelData } from '../../engine/solver-service';
import type { Element, Load, Node } from '../../store/model.svelte';
import { segmentBounds, segmentFields, splitElementLoads } from './member-split';

export interface Subdivision {
  model: ModelData;
  /** Original member id → its segment ids, from end I to end J. */
  segments: Map<number, number[]>;
  /** Original member id → the nodes added along it, from end I to end J. */
  inner: Map<number, number[]>;
}

export function subdivideForAnalysis(model: ModelData, n: number): Subdivision {
  const segments = new Map<number, number[]>();
  const inner = new Map<number, number[]>();
  if (!(n >= 2)) {
    for (const id of model.elements.keys()) { segments.set(id, [id]); inner.set(id, []); }
    return { model, segments, inner };
  }
  const nodes = new Map(model.nodes);
  const elements = new Map<number, Element>();
  let loads: Load[] = [...model.loads];
  let nextNode = Math.max(0, ...nodes.keys()) + 1;
  let nextElem = Math.max(0, ...model.elements.keys()) + 1;
  let nextLoad = Math.max(0, ...model.loads.map((l) => (l.data as { id?: number }).id ?? 0)) + 1;

  for (const [id, e] of model.elements) {
    const ni = nodes.get(e.nodeI), nj = nodes.get(e.nodeJ);
    if (!ni || !nj || e.variableSection || (e as { arc?: unknown }).arc) {
      elements.set(id, e); segments.set(id, [id]); inner.set(id, []);
      continue;
    }
    const ts = Array.from({ length: n - 1 }, (_, k) => (k + 1) / n);
    const added: number[] = [];
    for (const t of ts) {
      const node: Node = { id: nextNode++, x: ni.x + t * (nj.x - ni.x), y: ni.y + t * (nj.y - ni.y), z: (ni.z ?? 0) + t * ((nj.z ?? 0) - (ni.z ?? 0)) };
      nodes.set(node.id, node);
      added.push(node.id);
    }
    const ends = [e.nodeI, ...added, e.nodeJ];
    const ids = ends.slice(1).map((_, k) => (k === 0 ? id : nextElem++));
    ids.forEach((sid, k) => elements.set(sid, { ...segmentFields(e, k, n), id: sid, nodeI: ends[k], nodeJ: ends[k + 1] } as Element));
    const L = Math.hypot(nj.x - ni.x, nj.y - ni.y, (nj.z ?? 0) - (ni.z ?? 0));
    const split = splitElementLoads(loads, id, segmentBounds(L, ts), ids, () => nextLoad++);
    loads = [...split.kept, ...split.added];
    segments.set(id, ids);
    inner.set(id, added);
  }
  return { model: { ...model, nodes, elements, loads }, segments, inner };
}
