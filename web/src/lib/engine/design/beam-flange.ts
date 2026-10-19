/**
 * Which beams act with a slab, and how wide their flange is: the horizontal shells along a beam
 * (sharing its two end nodes), on one side or both, with their thickness and the clear distance
 * across their panel to the next web, over the beam's span (its physical element when it has one).
 *
 * ── Where the slab is, against the beam ────────────────────────────
 *
 * A flange is the slab in the beam's compression zone, cast with its TOP: that is what the
 * capacity reads it as (`station-design-forces` `topInCompression`). Sharing nodes says the two
 * are connected, not where either is. The model says where through their insertions — the beam's
 * `Element.offset`, the slab's `offset` — and the slab is taken as the flange where the beam's top
 * face lies within the slab's thickness (`datum: 'insertion'`): a top-flush beam under a slab on
 * the node line, or one whose top meets a slab offset down to it. Where neither declares one, both are on the node line,
 * which would put the slab at mid-depth of the beam; the ordinary intent of such a model is a
 * slab cast with the beam's top, and that is taken and SAID (`datum: 'assumed'`). Where the
 * insertions put the slab elsewhere (a beam hanging above it, an upturned beam), it is not taken.
 */
import { effectiveFlange, type Flange, type FlangeSide } from '../../codes/cirsoc201/effective-flange';
import { hasMemberOffset, memberReferenceLine, type OffsetCarrier } from '../member-offsets';
import { hasShellOffset, resolveShellOffsetGlobal } from '../shell-offsets';
import type { ShellOffset } from '../../model/element-3d-metadata';

type Node = { id: number; x: number; y: number; z?: number };
/** How far outside the slab's thickness the beam's top face may still be read as within it, m. */
const FLUSH_TOLERANCE = 0.005;
export interface FlangeModel {
  nodes: ReadonlyMap<number, Node>;
  elements: ReadonlyMap<number, { id: number; nodeI: number; nodeJ: number; sectionId: number } & OffsetCarrier>;
  sections: ReadonlyMap<number, { b?: number; h?: number; rotation?: number }>;
  quads: ReadonlyMap<number, { id: number; nodes: number[]; thickness: number; offset?: ShellOffset }>;
  /** The span of a beam: its physical element's bars, when it has one. */
  spanOf?: (elementId: number) => number[] | undefined;
}

/** A flange, and whether the model placed the slab at the beam's top or that was assumed. */
export type PlacedFlange = Flange & { datum: 'insertion' | 'assumed' };

export function beamFlanges(m: FlangeModel): Map<number, PlacedFlange> {
  const out = new Map<number, PlacedFlange>();
  const byNode = new Map<number, number[]>();
  for (const q of m.quads.values()) for (const n of q.nodes) (byNode.get(n) ?? byNode.set(n, []).get(n)!).push(q.id);
  const P = (id: number) => m.nodes.get(id)!;
  const len = (id: number) => { const e = m.elements.get(id)!; const a = P(e.nodeI), b = P(e.nodeJ); return Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)); };
  for (const e of m.elements.values()) {
    const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
    const bw = m.sections.get(e.sectionId)?.b;
    if (!a || !b || !bw || Math.abs((a.z ?? 0) - (b.z ?? 0)) > 1e-3) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) continue;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    const shared = (byNode.get(e.nodeI) ?? []).filter((q) => (byNode.get(e.nodeJ) ?? []).includes(q));
    const sides = new Map<1 | -1, FlangeSide>();
    // The beam's top face, on its own axis: the nodes plus its declared insertion.
    const h = m.sections.get(e.sectionId)?.h;
    const line = memberReferenceLine(e, a, b, m.sections);
    const beamTop = h ? Math.max(line.i.z, line.j.z) + h / 2 : undefined;
    let datum: PlacedFlange['datum'] = hasMemberOffset(e) ? 'insertion' : 'assumed';
    for (const qid of shared) {
      const q = m.quads.get(qid)!;
      const pts = q.nodes.map(P);
      if (pts.some((p) => Math.abs((p.z ?? 0) - (a.z ?? 0)) > 1e-3)) continue; // a horizontal slab at the beam's level
      if (hasShellOffset(q) || hasMemberOffset(e)) {
        // Placed by the model: a flange only where the slab's top is the beam's.
        const so = hasShellOffset(q) ? resolveShellOffsetGlobal(q.offset!, pts.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }))) : { x: 0, y: 0, z: 0 };
        if (!so || beamTop === undefined) continue;
        const slabMid = (a.z ?? 0) + so.z;
        if (Math.abs(beamTop - slabMid) > q.thickness / 2 + FLUSH_TOLERANCE) continue;
        datum = 'insertion';
      }
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length - a.x, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length - a.y;
      const side = (ux * cy - uy * cx) > 0 ? 1 : -1;
      // The clear distance to the next web: the nearest parallel beam on that side at the same
      // level; with none (a slab edge, a cantilever), the farthest node of the slab on that side.
      let next = Infinity;
      for (const o of m.elements.values()) {
        if (o.id === e.id) continue;
        const p = m.nodes.get(o.nodeI), r = m.nodes.get(o.nodeJ);
        if (!p || !r || Math.abs((p.z ?? 0) - (a.z ?? 0)) > 1e-3 || Math.abs((r.z ?? 0) - (a.z ?? 0)) > 1e-3) continue;
        const ol = Math.hypot(r.x - p.x, r.y - p.y);
        if (ol < 1e-6 || Math.abs(ux * (r.y - p.y) - uy * (r.x - p.x)) / ol > 1e-3) continue; // not parallel
        const off = ux * (p.y - a.y) - uy * (p.x - a.x);
        if (side * off > 1e-3) next = Math.min(next, side * off);
      }
      let far = next;
      if (!Number.isFinite(far)) {
        far = 0;
        for (const id of byNode.keys()) {
          const pp = P(id);
          if (Math.abs((pp.z ?? 0) - (a.z ?? 0)) > 1e-3) continue;
          const off = side * (ux * (pp.y - a.y) - uy * (pp.x - a.x));
          if (off > far) far = off;
        }
      }
      const prev = sides.get(side);
      const clear = Math.max(0, far - (Number.isFinite(next) ? bw : bw / 2));
      if (!prev || q.thickness < prev.hf) sides.set(side, { hf: q.thickness, clear });
    }
    if (sides.size === 0) continue;
    const span = m.spanOf?.(e.id);
    const ln = span && span.length ? span.reduce((s, id) => s + len(id), 0) : L;
    const f = effectiveFlange(bw, ln, [...sides.values()]);
    if (f && f.bf > bw + 1e-6) out.set(e.id, { ...f, datum });
  }
  return out;
}
