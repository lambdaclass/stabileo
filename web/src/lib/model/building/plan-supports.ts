import { modelStore } from '../../store/model.svelte';
import { PHYSICAL_GROUP_KIND } from '../physical/types';
import { beamsAtLevel, columnsAtLevel, type P2 } from './draw-on-plan';

/** A beam end farther than this from a column, a wall or a beam is not taken to frame into it. */
export const REACH_M = 0.3;
const TOL = 0.01;

export type SupportKind = 'column' | 'wall' | 'beam';
export interface Support {
  kind: SupportKind;
  /** Its outline in plan: a box about `center`, `hu` along `u` and `hv` across. */
  center: P2; u: P2; hu: number; hv: number;
  name?: string;
  /** A column's node on the level. */
  node?: number;
  /** A beam's bar: its nodes and its axis as drawn. */
  bar?: { id: number; a: P2; b: P2; A: P2; B: P2; i: number; j: number };
  /** A wall's nodes on the level. */
  nodes?: number[];
}

function namesOfMembers(): Map<number, string> {
  const out = new Map<number, string>();
  for (const g of modelStore.model.groups.values()) if (g.kind === PHYSICAL_GROUP_KIND) for (const id of g.members.elements ?? []) out.set(id, g.name);
  return out;
}

/** The walls on level `z`: their line, thickness and nodes there. */
export function wallsAtLevel(z: number): Array<{ A: P2; B: P2; width: number; nodes: number[]; name: string }> {
  const out: Array<{ A: P2; B: P2; width: number; nodes: number[]; name: string }> = [];
  for (const g of modelStore.model.groups.values()) {
    if (g.kind !== PHYSICAL_GROUP_KIND || (g.data as { kind?: string } | undefined)?.kind !== 'wall') continue;
    const ids = new Set<number>(g.members.nodes ?? []);
    for (const q of g.members.quads ?? []) for (const n of modelStore.quads.get(q)?.nodes ?? []) ids.add(n);
    for (const q of g.members.plates ?? []) for (const n of modelStore.plates.get(q)?.nodes ?? []) ids.add(n);
    const at = [...ids].filter((i) => Math.abs((modelStore.nodes.get(i)?.z ?? NaN) - z) < 1e-6);
    const pts = at.map((i) => { const n = modelStore.nodes.get(i)!; return { x: n.x, y: n.y }; });
    let best: [P2, P2] | null = null, far = 0;
    for (const p of pts) for (const q of pts) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d > far) { far = d; best = [p, q]; } }
    const t = (g.data as { surface?: { thickness?: number } } | undefined)?.surface?.thickness ?? 0.2;
    if (best && far > 0.05) out.push({ A: best[0], B: best[1], width: t, nodes: at, name: g.name });
  }
  return out;
}

function box(A: P2, B: P2, width: number): Pick<Support, 'center' | 'u' | 'hu' | 'hv'> {
  const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  return { center: { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, u: { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, hu: L / 2, hv: width / 2 };
}

/** What on level `z` a beam can frame into: the columns there, the walls and the beams already drawn. */
export function supportsAtLevel(z: number): Support[] {
  const out: Support[] = [];
  const names = namesOfMembers();
  for (const c of columnsAtLevel(z)) {
    const name = names.get(c.element);
    out.push({ kind: 'column', center: c.footprint.center, u: c.footprint.u, hu: c.footprint.b / 2, hv: c.footprint.h / 2, node: c.node, ...(name ? { name } : {}) });
  }
  for (const w of wallsAtLevel(z)) out.push({ kind: 'wall', ...box(w.A, w.B, w.width), nodes: w.nodes, name: w.name });
  for (const bm of beamsAtLevel(z)) {
    const e = modelStore.elements.get(bm.id)!;
    const name = names.get(bm.id);
    out.push({ kind: 'beam', ...box(bm.A, bm.B, bm.width), bar: { id: bm.id, a: bm.a, b: bm.b, A: bm.A, B: bm.B, i: e.nodeI, j: e.nodeJ }, ...(name ? { name } : {}) });
  }
  return out;
}

export const supportCorners = (s: Support): P2[] => {
  const v = { x: -s.u.y, y: s.u.x };
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => ({ x: s.center.x + s.u.x * i! * s.hu + v.x * j! * s.hv, y: s.center.y + s.u.y * i! * s.hu + v.y * j! * s.hv }));
};

/** Where the line `o + t·d` is inside the support's outline, as [t in, t out], or null. */
export function lineThrough(s: Support, o: P2, d: P2, tol = TOL): [number, number] | null {
  const v = { x: -s.u.y, y: s.u.x };
  const r = { x: o.x - s.center.x, y: o.y - s.center.y };
  let lo = -Infinity, hi = Infinity;
  for (const [ax, h] of [[s.u, s.hu + tol], [v, s.hv + tol]] as const) {
    const p = r.x * ax.x + r.y * ax.y, q = d.x * ax.x + d.y * ax.y;
    if (Math.abs(q) < 1e-12) { if (Math.abs(p) > h) return null; continue; }
    const t1 = (-h - p) / q, t2 = (h - p) / q;
    lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
  }
  return lo <= hi ? [lo, hi] : null;
}

const RANK: Record<SupportKind, number> = { column: 0, wall: 1, beam: 2 };

/**
 * What the end `p` of a beam running along `d` (outwards) frames into: a support it is inside, or
 * one it falls short of by `REACH_M` at most, and how far the end has to go on to reach its face.
 * A beam running along another frames into it only at that one's end.
 */
export function endSupport(p: P2, d: P2, supports: readonly Support[]): { support: Support; go: number } | null {
  let best: { support: Support; go: number } | null = null;
  for (const s of supports) {
    const span = lineThrough(s, p, d);
    if (!span || span[1] < 0) continue;
    const face = lineThrough(s, p, d, 0);
    const go = Math.max(0, face ? face[0] : 0);
    if (go > REACH_M) continue;
    if (s.kind === 'beam' && Math.abs(d.x * s.u.y - d.y * s.u.x) < Math.sin(Math.PI / 36)) {
      const along = Math.abs((p.x - s.center.x) * s.u.x + (p.y - s.center.y) * s.u.y);
      if (along < s.hu - 0.05) continue;
    }
    if (!best || go < best.go - 1e-6 || (Math.abs(go - best.go) <= 1e-6 && RANK[s.kind] < RANK[best.support.kind])) best = { support: s, go };
  }
  return best;
}

export interface BeamEnds { a: P2; b: P2; start: Support | null; end: Support | null }

/** A beam's axis from `a` to `b`, each end carried on to the face of what it frames into. */
export function beamEnds(a: P2, b: P2, supports: readonly Support[]): BeamEnds {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return { a, b, start: null, end: null };
  const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const s0 = endSupport(a, { x: -t.x, y: -t.y }, supports), s1 = endSupport(b, t, supports);
  return {
    a: s0 ? { x: a.x - t.x * s0.go, y: a.y - t.y * s0.go } : a,
    b: s1 ? { x: b.x + t.x * s1.go, y: b.y + t.y * s1.go } : b,
    start: s0?.support ?? null, end: s1?.support ?? null,
  };
}

/**
 * A band captured on the template, cut at the first support on each side of the point clicked:
 * the beam goes from the face of one to the face of the next, or to where the band stops.
 */
export function clipToSupports(a: P2, b: P2, at: P2, supports: readonly Support[]): { a: P2; b: P2 } {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return { a, b };
  const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const sc = (at.x - a.x) * t.x + (at.y - a.y) * t.y;
  let lo = 0, hi = L;
  for (const s of supports) {
    if (s.kind === 'beam' && Math.abs(t.x * s.u.y - t.y * s.u.x) < Math.sin(Math.PI / 36)) continue;
    const span = lineThrough(s, a, t, 0);
    if (!span || (span[0] < sc && span[1] > sc)) continue;
    if (span[1] <= sc && span[1] > lo - REACH_M) lo = Math.max(lo, span[1]);
    if (span[0] >= sc && span[0] < hi + REACH_M) hi = Math.min(hi, span[0]);
  }
  return { a: { x: a.x + t.x * lo, y: a.y + t.y * lo }, b: { x: a.x + t.x * hi, y: a.y + t.y * hi } };
}
