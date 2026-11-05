/**
 * The geometry a buckling mode is drawn on: the model's, or the cut model's when the analysis
 * cut the members (its modes then carry the interior nodes too). Built once per result, so the
 * mode drawing's per-geometry cache holds.
 */
import type { refinedGeometry } from './refine';

type Geometry = ReturnType<typeof refinedGeometry>;
interface DrawGeometry {
  nodes: Map<number, { x: number; y: number }>;
  elements: Map<number, { nodeI: number; nodeJ: number; type?: 'frame' | 'truss'; releaseI?: { mz?: boolean }; releaseJ?: { mz?: boolean } }>;
}

const cache = new WeakMap<Geometry, DrawGeometry>();

export function modeDrawGeometry(result: unknown, model: DrawGeometry): DrawGeometry {
  const g = (result as { secondOrder?: { geometry?: Geometry | null } } | null)?.secondOrder?.geometry;
  if (!g) return model;
  let out = cache.get(g);
  if (!out) {
    out = {
      nodes: new Map(g.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
      elements: new Map(g.elements.map((e) => [e.id, { nodeI: e.nodeI, nodeJ: e.nodeJ, type: e.type, releaseI: { mz: e.hingeStart }, releaseJ: { mz: e.hingeEnd } }])),
    };
    cache.set(g, out);
  }
  return out;
}
