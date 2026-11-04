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

/**
 * The beams that lie in the plane of a slab cast with their top, whether or not the slab's mesh
 * shares both their end nodes: the slab's diaphragm then carries their in-plane bending
 * (`withSlabDiaphragm`). A flange is a narrower question (the slab in the compression zone, which
 * needs the slab along the beam's edges); a beam embedded in a slab meshed past it, or joined to it
 * at its ends by rigid links, has no flange the model can measure, and still has the slab around it.
 *
 * Read in plan: the beam's midpoint inside a horizontal shell at its level or within half its width
 * of one (an edge beam whose axis lies past the slab's edge, the slab cast against its face), or an
 * end node shared with one, where the insertions put the slab's top at the beam's (as
 * `beamFlanges` reads them).
 */
export function beamsInSlabPlane(m: FlangeModel): Set<number> {
  const out = new Set<number>();
  type Q = { q: { id: number; nodes: number[]; thickness: number; offset?: ShellOffset }; pts: Node[]; x0: number; x1: number; y0: number; y1: number };
  const byLevel = new Map<number, Q[]>();
  const key = (z: number) => Math.round(z * 1000);
  for (const q of m.quads.values()) {
    const pts = q.nodes.map((id) => m.nodes.get(id)).filter((p): p is Node => !!p);
    if (pts.length < 3 || pts.some((p) => Math.abs((p.z ?? 0) - (pts[0]!.z ?? 0)) > 1e-3)) continue;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const e = { q, pts, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const k = key(pts[0]!.z ?? 0);
    (byLevel.get(k) ?? byLevel.set(k, []).get(k)!).push(e);
  }
  const near = (x: number, y: number, pts: readonly Node[], r: number) => {
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j]!, b = pts[i]!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
      if (Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)) <= r) return true;
    }
    return false;
  };
  const inside = (x: number, y: number, pts: readonly Node[]) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!, b = pts[j]!;
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  for (const e of m.elements.values()) {
    const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
    const h = m.sections.get(e.sectionId)?.h, r = (m.sections.get(e.sectionId)?.b ?? 0) / 2 + FLUSH_TOLERANCE;
    if (!a || !b || !h || Math.abs((a.z ?? 0) - (b.z ?? 0)) > 1e-3) continue;
    const line = memberReferenceLine(e, a, b, m.sections);
    const beamTop = Math.max(line.i.z, line.j.z) + h / 2;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    for (const s of byLevel.get(key(a.z ?? 0)) ?? []) {
      const touches = s.q.nodes.includes(e.nodeI) || s.q.nodes.includes(e.nodeJ)
        || (mx >= s.x0 - r && mx <= s.x1 + r && my >= s.y0 - r && my <= s.y1 + r && (inside(mx, my, s.pts) || near(mx, my, s.pts, r)));
      if (!touches) continue;
      if (hasShellOffset(s.q) || hasMemberOffset(e)) {
        const so = hasShellOffset(s.q) ? resolveShellOffsetGlobal(s.q.offset!, s.pts.map((p) => ({ x: p.x, y: p.y, z: p.z ?? 0 }))) : { x: 0, y: 0, z: 0 };
        if (!so || Math.abs(beamTop - ((a.z ?? 0) + so.z)) > s.q.thickness / 2 + FLUSH_TOLERANCE) continue;
      }
      out.add(e.id);
      break;
    }
  }
  return out;
}
