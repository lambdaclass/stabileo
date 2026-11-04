/**
 * "Calculate with n elements per member": every frame member cut, for the solve only, into n
 * equal pieces, and also wherever a force along it acts, so each piece carries one axial force.
 * A truss bar is left whole: a node inside it would hold nothing across the bar. The
 * model keeps its members; the cuts follow `model/edit/member-split.ts` (the same bounds and the
 * same rule for the loads), and the results are read back onto the members the model has.
 */
import type { AnalysisResults, ElementForces, SolverInput, SolverLoad } from '../types';
import type { Load } from '../../store/model.svelte';
import { segmentBounds, splitElementLoads } from '../../model/edit/member-split';
import { memberLoadsOf } from './pdelta';

export interface Piece { id: number; nodeI: number; nodeJ: number; x0: number; x1: number }

export interface Refined {
  input: SolverInput;
  n: number;
  /** Original member id → its pieces from I to J. */
  pieces: Map<number, Piece[]>;
  /** Piece id → original member id. */
  parent: Map<number, number>;
  originalNodes: Set<number>;
  /** Nothing was cut: the input is the model's. */
  identity: boolean;
}

const AXIAL = '__axial';

function cutsOf(input: SolverInput, id: number, L: number, n: number): number[] {
  const ts = Array.from({ length: n - 1 }, (_, k) => (k + 1) / n);
  for (const l of input.loads) {
    if (l.type === 'pointOnElement' && l.data.elementId === id && Math.abs(l.data.px ?? 0) > 1e-12) ts.push(l.data.a / L);
  }
  const sorted = ts.filter((t) => t > 1e-6 && t < 1 - 1e-6).sort((a, b) => a - b);
  return sorted.filter((t, k) => k === 0 || t - sorted[k - 1] > 1e-6);
}

export function refineInput(input: SolverInput, n: number): Refined {
  const per = Math.max(1, Math.floor(n));
  const nodes = new Map(input.nodes);
  const elements = new Map(input.elements);
  let loads: Load[] = input.loads.map((l, k) => ({
    type: l.type === 'axialDistributed' ? 'distributed' : l.type,
    data: { ...l.data, id: k + 1, ...(l.type === 'axialDistributed' ? { [AXIAL]: true } : {}) },
  }) as unknown as Load);
  let nextLoad = input.loads.length + 1;
  let nextNode = Math.max(0, ...input.nodes.keys()) + 1;
  let nextElem = Math.max(0, ...input.elements.keys()) + 1;
  const pieces = new Map<number, Piece[]>();
  const parent = new Map<number, number>();
  let identity = true;

  for (const [id, e] of [...input.elements].sort((a, b) => a[0] - b[0])) {
    const ni = input.nodes.get(e.nodeI)!, nj = input.nodes.get(e.nodeJ)!;
    const L = Math.hypot(nj.x - ni.x, nj.z - ni.z);
    const ts = L > 0 && e.type === 'frame' ? cutsOf(input, id, L, per) : [];
    if (!ts.length) {
      pieces.set(id, [{ id, nodeI: e.nodeI, nodeJ: e.nodeJ, x0: 0, x1: L }]);
      parent.set(id, id);
      continue;
    }
    identity = false;
    const bounds = segmentBounds(L, ts);
    const chain = [e.nodeI];
    for (const t of ts) {
      const nid = nextNode++;
      nodes.set(nid, { id: nid, x: ni.x + t * (nj.x - ni.x), z: ni.z + t * (nj.z - ni.z) });
      chain.push(nid);
    }
    chain.push(e.nodeJ);
    const ids = chain.slice(1).map((_, k) => (k === 0 ? id : nextElem++));
    const list: Piece[] = [];
    ids.forEach((pid, k) => {
      elements.set(pid, { ...e, id: pid, nodeI: chain[k], nodeJ: chain[k + 1], hingeStart: k === 0 && e.hingeStart, hingeEnd: k === ids.length - 1 && e.hingeEnd });
      list.push({ id: pid, nodeI: chain[k], nodeJ: chain[k + 1], x0: bounds[k], x1: bounds[k + 1] });
      parent.set(pid, id);
    });
    pieces.set(id, list);
    const split = splitElementLoads(loads, id, bounds, ids, () => nextLoad++);
    loads = [...split.kept, ...split.added];
  }

  const out: SolverLoad[] = loads.map((l) => {
    const { id: _id, [AXIAL]: axial, ...data } = l.data as unknown as Record<string, unknown>;
    return { type: axial ? 'axialDistributed' : l.type, data } as unknown as SolverLoad;
  });
  return {
    input: identity ? input : { ...input, nodes, elements, loads: out },
    n: per, pieces, parent, originalNodes: new Set(input.nodes.keys()), identity,
  };
}

/** A solve of the refined model read on the model's members: ends from the end pieces, the original loads. */
export function collapseResults(r: Refined, original: SolverInput, res: AnalysisResults): AnalysisResults {
  if (r.identity) return res;
  const byId = new Map(res.elementForces.map((f) => [f.elementId, f]));
  const elementForces: ElementForces[] = [];
  for (const [id, list] of r.pieces) {
    const first = byId.get(list[0].id), last = byId.get(list[list.length - 1].id);
    if (!first || !last) continue;
    const L = list[list.length - 1].x1;
    const e = original.elements.get(id)!;
    elementForces.push({
      ...first, elementId: id, length: L,
      nEnd: last.nEnd, vEnd: last.vEnd, mEnd: last.mEnd,
      hingeStart: e.hingeStart, hingeEnd: e.hingeEnd,
      ...memberLoadsOf(original, id, L),
    });
  }
  elementForces.sort((a, b) => a.elementId - b.elementId);
  return {
    ...res,
    displacements: res.displacements.filter((d) => r.originalNodes.has(d.nodeId)),
    elementForces,
  };
}

/** The refined geometry in the model's plane coordinates (x, y), for drawing a mode on it. */
export function refinedGeometry(r: Refined): { nodes: Array<{ id: number; x: number; y: number }>; elements: Array<{ id: number; nodeI: number; nodeJ: number; type: 'frame' | 'truss'; hingeStart: boolean; hingeEnd: boolean }> } {
  return {
    nodes: [...r.input.nodes.values()].map((nd) => ({ id: nd.id, x: nd.x, y: nd.z })),
    elements: [...r.input.elements.values()].map((e) => ({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: e.type, hingeStart: e.hingeStart, hingeEnd: e.hingeEnd })),
  };
}
