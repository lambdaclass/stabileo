/**
 * A member as the engineer sees it, whatever the analysis cut it into: a curved member drawn as
 * one arc (`curved-member.ts`, its segments tagged with the arc's id), or a straight member a
 * plate's mesh cut at its nodes (`store/physical-plates.ts`). Read as one piece: its segments in
 * order from its start, each with where it begins along the piece and how long it is there.
 *
 * ── The coordinate along the piece ────────────────────────────────
 *
 * For an arc, the length along the arc: the segments are chords, and a station t of segment k is
 * at s = s_k + t·ℓ_k with ℓ_k the arc length the chord stands for (the sweep shared out by the
 * chord lengths). For a straight piece the chords are the piece, so s is its length.
 *
 * ── Internal forces along it ──────────────────────────────────────
 *
 * Each segment's forces are its own, in its own local axes (`engine/diagrams-3d.ts`). An arc's
 * segments keep one section orientation relative to the curve (#418), so their local components
 * are the same components all along it: N along the tangent, V and M about the section's axes.
 * Nothing is added across segments, and where two segments meet each keeps its own end value,
 * so a jump at a joint (a point load, a support) stays a jump.
 *
 * Pure.
 */
import { arcThroughThree, type ArcSpec } from './curved-member';
import { computeDiagram3D, type Diagram3DKind } from '../engine/diagrams-3d';
import type { ElementForces3D } from '../engine/types-3d';

type Pt = { x: number; y: number; z?: number };
type El = { id: number; nodeI: number; nodeJ: number; arc?: { id: number; spec: ArcSpec } };
export interface PieceModel { nodes: ReadonlyMap<number, Pt>; elements: ReadonlyMap<number, El> }

export interface PieceSegment { elementId: number; s0: number; length: number; reversed: boolean }
export interface Piece {
  kind: 'arc' | 'chain' | 'single';
  /** The arc's id for an arc. */
  arcId?: number;
  segments: PieceSegment[];
  length: number;
  /** Start and end nodes. */
  start: number;
  end: number;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
const dir = (a: Pt, b: Pt) => { const l = dist(a, b) || 1; return [(b.x - a.x) / l, (b.y - a.y) / l, ((b.z ?? 0) - (a.z ?? 0)) / l]; };

/** Order a set of members into one chain from `start`, or null when they do not make one. */
function order(m: PieceModel, ids: readonly number[], start: number): Array<{ id: number; reversed: boolean }> | null {
  const at = new Map<number, number[]>();
  for (const id of ids) { const e = m.elements.get(id)!; for (const n of [e.nodeI, e.nodeJ]) (at.get(n) ?? at.set(n, []).get(n)!).push(id); }
  const out: Array<{ id: number; reversed: boolean }> = [];
  const used = new Set<number>();
  let cur = start;
  while (out.length < ids.length) {
    const next = (at.get(cur) ?? []).find((id) => !used.has(id));
    if (next === undefined) return null;
    const e = m.elements.get(next)!;
    used.add(next);
    out.push({ id: next, reversed: e.nodeJ === cur });
    cur = e.nodeJ === cur ? e.nodeI : e.nodeJ;
  }
  return out;
}

/** The end of a chain: a node held by one of its members only; the first member's I when it closes. */
function chainEnd(m: PieceModel, ids: readonly number[]): number {
  const count = new Map<number, number>();
  for (const id of ids) { const e = m.elements.get(id)!; for (const n of [e.nodeI, e.nodeJ]) count.set(n, (count.get(n) ?? 0) + 1); }
  const first = m.elements.get(ids[0]!)!;
  for (const id of ids) { const e = m.elements.get(id)!; if (count.get(e.nodeI) === 1) return e.nodeI; if (count.get(e.nodeJ) === 1) return e.nodeJ; }
  return first.nodeI;
}

/** The members of one arc, by its id. */
export function arcMembers(m: PieceModel, arcId: number): number[] {
  return [...m.elements.values()].filter((e) => e.arc?.id === arcId).map((e) => e.id);
}

/**
 * The whole piece a member belongs to. An arc's member: every member of the arc. A member a plate
 * mesh cut (`meshNodes`, the nodes the meshes created): the collinear members joined through
 * those nodes. Anything else: itself.
 */
export function pieceOf(m: PieceModel, elementId: number, meshNodes: ReadonlySet<number> = new Set()): Piece | null {
  const e = m.elements.get(elementId);
  if (!e) return null;
  let ids: number[];
  let kind: Piece['kind'];
  if (e.arc) { ids = arcMembers(m, e.arc.id); kind = 'arc'; }
  else {
    ids = [elementId];
    const at = new Map<number, number[]>();
    for (const x of m.elements.values()) for (const n of [x.nodeI, x.nodeJ]) (at.get(n) ?? at.set(n, []).get(n)!).push(x.id);
    const seen = new Set([elementId]);
    const grow = (from: number, to: number) => {
      let prev = from, cur = to;
      while (meshNodes.has(cur)) {
        const p0 = m.nodes.get(prev)!, p1 = m.nodes.get(cur)!;
        const d = dir(p0, p1);
        const next = (at.get(cur) ?? []).find((id) => {
          if (seen.has(id)) return false;
          const x = m.elements.get(id)!; if (x.arc) return false;
          const o = x.nodeI === cur ? x.nodeJ : x.nodeI;
          const d2 = dir(p1, m.nodes.get(o)!);
          return d[0]! * d2[0]! + d[1]! * d2[1]! + d[2]! * d2[2]! > 1 - 1e-6;
        });
        if (next === undefined) break;
        seen.add(next); ids.push(next);
        const x = m.elements.get(next)!;
        prev = cur; cur = x.nodeI === cur ? x.nodeJ : x.nodeI;
      }
    };
    grow(e.nodeJ, e.nodeI); grow(e.nodeI, e.nodeJ);
    kind = ids.length > 1 ? 'chain' : 'single';
  }
  // An arc starts where it was drawn from; a chain at the end its first member points away from.
  let start = chainEnd(m, ids);
  if (kind === 'arc') {
    const s = e.arc!.spec.start;
    const ends = ids.flatMap((id) => { const x = m.elements.get(id)!; return [x.nodeI, x.nodeJ]; });
    const near = ends.find((n) => dist(m.nodes.get(n)!, s) < 1e-6);
    if (near !== undefined) start = near;
  } else if (kind === 'chain') {
    // From the end its first member points away from, so the pieces read head to tail.
    const count = new Map<number, number>();
    for (const id of ids) { const x = m.elements.get(id)!; for (const n of [x.nodeI, x.nodeJ]) count.set(n, (count.get(n) ?? 0) + 1); }
    for (const [n, c] of count) { if (c !== 1) continue; const o = order(m, ids, n); if (o && !o[0]!.reversed) { start = n; break; } }
  }
  const ord = order(m, ids, start);
  if (!ord) return null;
  // Arc length each chord stands for: the arc's length shared out by chord length.
  const chords = ord.map((o) => { const x = m.elements.get(o.id)!; return dist(m.nodes.get(x.nodeI)!, m.nodes.get(x.nodeJ)!); });
  const chordSum = chords.reduce((a, b) => a + b, 0);
  let scale = 1;
  if (kind === 'arc') {
    const g = arcThroughThree(e.arc!.spec.start, e.arc!.spec.through, e.arc!.spec.end);
    if (g && chordSum > 0) scale = g.length / chordSum;
  }
  let s = 0;
  const segments = ord.map((o, k) => { const length = chords[k]! * scale; const seg = { elementId: o.id, s0: s, length, reversed: o.reversed }; s += length; return seg; });
  const last = ord[ord.length - 1]!; const le = m.elements.get(last.id)!;
  return { kind, ...(kind === 'arc' ? { arcId: e.arc!.id } : {}), segments, length: s, start, end: last.reversed ? le.nodeI : le.nodeJ };
}

export interface PieceStation { s: number; value: number; elementId: number }

/**
 * One internal force along a piece, from its segments' own diagrams: each segment's samples at
 * their place along the piece, its two ends both kept where segments meet. Null where a segment
 * has no forces in `forces`.
 */
export function pieceDiagram(piece: Piece, forces: ReadonlyMap<number, ElementForces3D>, kind: Diagram3DKind): PieceStation[] | null {
  const out: PieceStation[] = [];
  for (const seg of piece.segments) {
    const ef = forces.get(seg.elementId);
    if (!ef) return null;
    const d = computeDiagram3D(ef, kind);
    const pts = seg.reversed ? [...d.points].reverse().map((p) => ({ t: 1 - p.t, value: p.value })) : d.points;
    for (const p of pts) out.push({ s: seg.s0 + p.t * seg.length, value: p.value, elementId: seg.elementId });
  }
  return out;
}

/** The largest and smallest of a piece's diagram, where they are. */
export function pieceExtremes(st: readonly PieceStation[]): { max: PieceStation; min: PieceStation } | null {
  if (!st.length) return null;
  let max = st[0]!, min = st[0]!;
  for (const p of st) { if (p.value > max.value) max = p; if (p.value < min.value) min = p; }
  return { max, min };
}
