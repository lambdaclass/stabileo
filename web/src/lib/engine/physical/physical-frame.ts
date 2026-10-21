/**
 * The concrete of a reinforced-concrete frame as it is built: members cut face to face, one
 * solid per beam-column joint, slabs net of the frame. The one geometry the model viewer's
 * physical mode, the reinforcement workspace, the IFC export and the quantities read.
 *
 * ── What was wrong with node to node ───────────────────────────────
 *
 * Each of those four drew every member as its section swept from node to node. At a joint the
 * column and every beam framing in then stood in the same place, so the concrete of the joint
 * was measured and exported two or three times, and where the beams were wider than the column
 * or met at a corner with no column, or where a beam centred on the roof node rose above the
 * column's top, no member covered the corner and the views showed a hole in a solid that is
 * cast full.
 *
 * ── The rule, stated once ──────────────────────────────────────────
 *
 * Everything here is a stack of vertical prisms: a plan polygon swept between two heights. A
 * vertical column, a horizontal beam whose section sits square to the vertical and a horizontal
 * slab are each exactly that, and so is their union at a joint.
 *
 * - A column runs from the top of the joint below it (or its own base) to the bottom of the
 *   joint above it (or its own top).
 * - At a node where beams frame in, the joint is the band from the lowest beam soffit to the
 *   highest beam top (`jointBandOf`, the band the detailing ties). In plan it is the column's
 *   footprint where a column stands below (or, at the base of a column with nothing under it,
 *   that column's), plus each beam's own width over the stretch where it
 *   crosses the other members: from where its sides meet the far faces of the column and of each
 *   beam crossing it, to where they meet the near faces. A beam that ends there reaches the far
 *   faces, so two beams meeting at a corner with no column close the corner, and a beam wider
 *   than the column covers its full width beside it. Each beam's stretch stands only between its
 *   own soffit and top, so a shallow beam adds no concrete under itself.
 * - A beam runs between the faces of the joints at its ends.
 * - A slab is its shells' outline at its own thickness, less the frame where they overlap: the
 *   frame owns its whole section, the slab what is left. The frame therefore never depends on
 *   whether a slab is drawn, and nothing is counted twice.
 * - The joint is attributed to the column whose footprint fills it; with none, to the deepest beam
 *   framing in (the lowest id among equals). It stays a solid of its own, so the quantities can
 *   state it apart.
 *
 * Insertions are read through the member's reference line (`memberReferenceLine`, the line the
 * analysis and the bars use), so an eccentric column or a top-flush beam is cut where its
 * concrete is. A member that is neither vertical nor horizontal, or whose section is turned off
 * the square, is drawn as its section swept along its axis, uncut, and listed in `untrimmed`.
 *
 * ── What it does not do ────────────────────────────────────────────
 *
 * It changes nothing the analysis reads. Nodes, lengths, stiffnesses, loads, mass and self-weight
 * stay where the model put them; this module reads the model and builds solids beside it. Where
 * the measured concrete differs from what the analysis weighs, that is reported, not corrected.
 *
 * Pure: no store, no runes.
 */

import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';
import { memberReferenceLine, type OffsetCarrier } from '../member-offsets';
import { memberBase } from './member-frame';
import { jointBandOf } from './support-faces';

export interface P3 { x: number; y: number; z: number }
export type XY = [number, number];

/** A plan polygon: its outer ring counter-clockwise, its holes clockwise, no repeated point. */
export interface PlanPolygon { outer: XY[]; holes: XY[][] }

/** Part of a solid: plan polygons swept from `z0` up to `z1`, m. */
export interface PrismLayer { z0: number; z1: number; polygons: PlanPolygon[] }

export type PhysicalSolidKind = 'column' | 'beam' | 'joint' | 'slab' | 'member';

export interface PhysicalSolid {
  id: string;
  kind: PhysicalSolidKind;
  /** The members it is made of: the member itself, or a joint's columns and beams. */
  elementIds: number[];
  /** The shell a slab solid is made of. */
  shellKey?: string;
  /** The node a joint is made at. */
  nodeId?: number;
  /** Who the volume is attributed to: the member, or for a joint its column or deepest beam. */
  owner: { elementId?: number; shellKey?: string };
  /** Vertical prisms; empty for a `member` solid, which is `prism` instead. */
  layers: PrismLayer[];
  /** A member drawn as its section swept along its axis (`memberBase`), uncut. */
  prism?: { base: P3[]; extrude: P3 };
  /** m³. */
  volume: number;
  /**
   * m², the faces that need a form: sides and soffits not against other concrete. Absent on an
   * uncut `member` solid, which has no neighbours to read and is measured as before.
   */
  formwork?: number;
  /** For a cut member: where its concrete starts and ends along its reference line from the i end, m. */
  span?: { from: number; to: number; length: number };
  /**
   * For a cut member: its reference line between those two points, in the i → j sense, so a
   * view can sweep the section along it (`memberBase`) and read the member's axis as before.
   */
  axis?: { start: P3; end: P3 };
}

export interface PhysicalNode { id: number; x: number; y: number; z?: number }
export interface PhysicalElement extends OffsetCarrier { id: number; nodeI: number; nodeJ: number; sectionId: number }
export interface PhysicalSection { id: number; b?: number; h?: number; rotation?: number }
export interface PhysicalShell {
  key: string;
  nodes: readonly number[];
  thickness: number;
  offset?: { frame: 'global' | 'local'; x: number; y: number; z: number };
}

export interface PhysicalFrameInput {
  /** The concrete frame members to build. Members of other materials are the caller's to leave out. */
  elementIds: readonly number[];
  nodes: readonly PhysicalNode[];
  elements: readonly PhysicalElement[];
  sections: readonly PhysicalSection[];
  /** Concrete shells. Horizontal ones become slab solids; the rest are left to the caller. */
  shells?: readonly PhysicalShell[];
}

export interface PhysicalFrame {
  solids: PhysicalSolid[];
  /** The solid of each member built. */
  member: ReadonlyMap<number, PhysicalSolid>;
  /** The joint at each node that has one. */
  joint: ReadonlyMap<number, PhysicalSolid>;
  /** The joints attributed to each member. */
  owned: ReadonlyMap<number, readonly PhysicalSolid[]>;
  /** The net solid of each horizontal shell. */
  slab: ReadonlyMap<string, PhysicalSolid>;
  /** Members asked for that have no concrete outline, with the reason (as `membersFromModel`). */
  refused: Array<{ elementId: number; reason: 'noSection' | 'noRectangle' | 'noNodes' | 'zeroLength' }>;
  /** Members drawn uncut: inclined, or with the section turned off the square. */
  untrimmed: Array<{ elementId: number; reason: 'inclined' | 'rolled' }>;
  /** Members whose joints at the two ends overlap, so the beam between them has no length left. */
  consumed: number[];
}

const TOL = 1e-6;
/** Two plan directions closer than this to parallel are one line (about 0.06°). */
const PARALLEL = 1e-3;
/** |sin θ| under which two beams meeting at a node are read as one line (about 10°). */
const NEAR_COLLINEAR = 0.17;

// ─── Plan geometry ───────────────────────────────────────────────

const ringArea = (r: readonly XY[]): number => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i]!, [x2, y2] = r[(i + 1) % r.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};
const ccw = (r: XY[]): XY[] => (ringArea(r) < 0 ? [...r].reverse() : r);
const cw = (r: XY[]): XY[] => (ringArea(r) > 0 ? [...r].reverse() : r);

export const polygonArea = (p: PlanPolygon): number =>
  Math.abs(ringArea(p.outer)) - p.holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0);
export const layerVolume = (l: PrismLayer): number =>
  l.polygons.reduce((s, p) => s + polygonArea(p), 0) * (l.z1 - l.z0);

const open = (r: Ring): XY[] => {
  const out = r.map((p) => [p[0], p[1]] as XY);
  if (out.length > 1) {
    const a = out[0]!, b = out[out.length - 1]!;
    if (Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12) out.pop();
  }
  return out;
};
const fromMulti = (m: MultiPolygon): PlanPolygon[] => m
  .map((poly) => ({ outer: ccw(open(poly[0]!)), holes: poly.slice(1).map((h) => cw(open(h))) }))
  .filter((p) => p.outer.length >= 3 && polygonArea(p) > 1e-10);
const toGeom = (p: PlanPolygon, grid = 0): Polygon => {
  const snap = (r: readonly XY[]): XY[] => (grid > 0 ? r.map(([x, y]) => [Math.round(x / grid) * grid, Math.round(y / grid) * grid] as XY) : [...r]);
  return [snap(p.outer), ...p.holes.map(snap)] as Polygon;
};

/**
 * A plan boolean that does not take the geometry down with it. The clipping library refuses some
 * inputs whose edges nearly coincide (a ring it «cannot complete»): a building of rotated columns
 * and faceted slab edges gave it one, and the whole physical frame, the quantities, the physical
 * view and the IFC failed with it. The coordinates are snapped to 0,1 mm and, refused again, to
 * 1 mm; refused at both, `fallback` answers (the operand kept, conservative for what is measured).
 */
function robust(op: (grid: number) => MultiPolygon, fallback: () => PlanPolygon[]): PlanPolygon[] {
  for (const grid of [1e-4, 1e-3]) {
    try { return fromMulti(op(grid)); } catch { /* the next, coarser grid */ }
  }
  return fallback();
}

const union = (ps: readonly PlanPolygon[]): PlanPolygon[] => {
  if (ps.length === 0) return [];
  if (ps.length === 1) return [ps[0]!];
  return robust((g) => polygonClipping.union(toGeom(ps[0]!, g), ...ps.slice(1).map((p) => toGeom(p, g))), () => [...ps]);
};
const difference = (ps: readonly PlanPolygon[], cut: readonly PlanPolygon[]): PlanPolygon[] => {
  if (ps.length === 0) return [];
  if (cut.length === 0) return [...ps];
  return robust((g) => polygonClipping.difference(ps.map((p) => toGeom(p, g)) as MultiPolygon, ...cut.map((p) => toGeom(p, g))), () => [...ps]);
};
const intersection = (a: readonly PlanPolygon[], b: readonly PlanPolygon[]): PlanPolygon[] => {
  if (a.length === 0 || b.length === 0) return [];
  return robust((g) => polygonClipping.intersection(a.map((p) => toGeom(p, g)) as MultiPolygon, b.map((p) => toGeom(p, g)) as MultiPolygon), () => []);
};

function insideRing(p: XY, r: readonly XY[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!, [xj, yj] = r[j]!;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const insidePolygon = (p: XY, poly: PlanPolygon): boolean =>
  insideRing(p, poly.outer) && !poly.holes.some((h) => insideRing(p, h));

interface Box { x0: number; y0: number; x1: number; y1: number }
const boxOf = (ps: readonly PlanPolygon[]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ps) for (const [x, y] of p.outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};
const touches = (a: Box, b: Box, pad = 1e-4) => a.x0 <= b.x1 + pad && b.x0 <= a.x1 + pad && a.y0 <= b.y1 + pad && b.y0 <= a.y1 + pad;

/** A rectangle in plan: `s` from `s0` to `s1` along `d` from `p`, `t` within ±`w` across it. */
function stripRect(p: XY, d: XY, w: number, s0: number, s1: number): PlanPolygon {
  const n: XY = [-d[1], d[0]];
  const at = (s: number, t: number): XY => [p[0] + d[0] * s + n[0] * t, p[1] + d[1] * s + n[1] * t];
  return { outer: ccw([at(s0, -w), at(s1, -w), at(s1, w), at(s0, w)]), holes: [] };
}

// ─── Members ─────────────────────────────────────────────────────

interface ColumnPrep { kind: 'column'; id: number; foot: PlanPolygon; zLo: number; zHi: number; lowNode: number; highNode: number; at: XY; lowIsI: boolean }
interface BeamPrep {
  kind: 'beam'; id: number;
  /** Plan axis point at the i end, plan unit direction i → j, plan length. */
  a: XY; d: XY; L: number;
  /** Half width across, m; soffit and top, m. */
  w: number; z0: number; z1: number;
  nodeI: number; nodeJ: number;
  /** Axis point at each end, in plan. */
  pI: XY; pJ: XY;
  /** Reference-line length (3-D), for `span`. */
  len: number;
}
interface MemberPrep { kind: 'member'; id: number; prism: { base: P3[]; extrude: P3 }; volume: number; reason: 'inclined' | 'rolled' }

function prepare(input: PhysicalFrameInput, refused: PhysicalFrame['refused']): Array<ColumnPrep | BeamPrep | MemberPrep> {
  const nodes = new Map(input.nodes.map((n) => [n.id, n]));
  const elements = new Map(input.elements.map((e) => [e.id, e]));
  const sections = new Map(input.sections.map((s) => [s.id, s]));
  const out: Array<ColumnPrep | BeamPrep | MemberPrep> = [];
  for (const id of input.elementIds) {
    const el = elements.get(id);
    const ni = el && nodes.get(el.nodeI), nj = el && nodes.get(el.nodeJ);
    if (!el || !ni || !nj) { refused.push({ elementId: id, reason: 'noNodes' }); continue; }
    const sec = sections.get(el.sectionId);
    if (!sec) { refused.push({ elementId: id, reason: 'noSection' }); continue; }
    if (!(sec.b! > 0) || !(sec.h! > 0)) { refused.push({ elementId: id, reason: 'noRectangle' }); continue; }
    const line = memberReferenceLine(el, ni, nj, sections);
    const ax = { x: line.j.x - line.i.x, y: line.j.y - line.i.y, z: line.j.z - line.i.z };
    const len = Math.hypot(ax.x, ax.y, ax.z);
    if (len < 1e-9) { refused.push({ elementId: id, reason: 'zeroLength' }); continue; }
    const { base, extrude } = memberBase({ start: line.i, end: line.j, width: sec.b!, depth: sec.h!, rollDeg: sec.rotation });
    const plan = Math.hypot(ax.x, ax.y);
    if (plan < TOL * len) {
      const lowI = line.i.z <= line.j.z;
      out.push({
        kind: 'column', id,
        foot: { outer: ccw(base.map((p) => [p.x, p.y] as XY)), holes: [] },
        zLo: Math.min(line.i.z, line.j.z), zHi: Math.max(line.i.z, line.j.z),
        lowNode: lowI ? el.nodeI : el.nodeJ, highNode: lowI ? el.nodeJ : el.nodeI,
        at: [line.i.x, line.i.y], lowIsI: lowI,
      });
      continue;
    }
    if (Math.abs(ax.z) < TOL * len) {
      const d: XY = [ax.x / plan, ax.y / plan], n: XY = [-d[1], d[0]];
      // The section's corners across the axis: square to the vertical only if each sits at ±w, ±hv.
      const lat = base.map((p) => (p.x - line.i.x) * n[0] + (p.y - line.i.y) * n[1]);
      const ver = base.map((p) => p.z - line.i.z);
      const w = Math.max(...lat.map(Math.abs)), hv = Math.max(...ver.map(Math.abs));
      const square = lat.every((v) => Math.abs(Math.abs(v) - w) < 1e-6) && ver.every((v) => Math.abs(Math.abs(v) - hv) < 1e-6);
      if (square) {
        out.push({
          kind: 'beam', id, a: [line.i.x, line.i.y], d, L: plan, w, z0: line.i.z - hv, z1: line.i.z + hv,
          nodeI: el.nodeI, nodeJ: el.nodeJ, pI: [line.i.x, line.i.y], pJ: [line.j.x, line.j.y], len,
        });
        continue;
      }
      out.push({ kind: 'member', id, prism: { base, extrude }, volume: sec.b! * sec.h! * len, reason: 'rolled' });
      continue;
    }
    out.push({ kind: 'member', id, prism: { base, extrude }, volume: sec.b! * sec.h! * len, reason: 'inclined' });
  }
  return out;
}

// ─── Joints ──────────────────────────────────────────────────────

interface AtNode {
  beam: BeamPrep;
  /** Plan axis point at the node, plan unit direction from the node into the span. */
  p: XY; d: XY;
}

/** The parallelogram where two non-parallel beams' widths cross, each strip unbounded along its axis. */
function crossing(a: AtNode, b: AtNode): XY[] | null {
  const cross = a.d[0] * b.d[1] - a.d[1] * b.d[0];
  // Two beams meeting within a few degrees of one line (a polygonal beam's kink) do not cross:
  // their widths overlap along a sliver as long as w / sin θ, metres for a degree, and the joint
  // took it whole (60 m³ at one column of a building whose beams kink by 0,5°).
  if (Math.abs(cross) < Math.max(PARALLEL, NEAR_COLLINEAR)) return null;
  const na: XY = [-a.d[1], a.d[0]], nb: XY = [-b.d[1], b.d[0]];
  // Point where a's side line t = ta meets b's side line t = tb.
  const meet = (ta: number, tb: number): XY => {
    const pa: XY = [a.p[0] + na[0] * ta, a.p[1] + na[1] * ta], pb: XY = [b.p[0] + nb[0] * tb, b.p[1] + nb[1] * tb];
    // pa + s a.d = pb + u b.d  →  s = cross(pb − pa, b.d) / cross(a.d, b.d)
    const s = ((pb[0] - pa[0]) * b.d[1] - (pb[1] - pa[1]) * b.d[0]) / cross;
    return [pa[0] + a.d[0] * s, pa[1] + a.d[1] * s];
  };
  return [meet(-a.beam.w, -b.beam.w), meet(a.beam.w, -b.beam.w), meet(a.beam.w, b.beam.w), meet(-a.beam.w, b.beam.w)];
}

interface JointPrep {
  nodeId: number;
  lo: number; hi: number;
  /**
   * The column whose footprint fills the whole band: the one standing below, or, at the base of
   * a column with nothing under it at this node (ground beams framing into it), that column.
   */
  col?: ColumnPrep;
  /** Every column meeting the node, below and above. */
  columns: ColumnPrep[];
  /** Each beam's stretch through the joint, from the node along its own axis, m: [lo, hi]. */
  stubs: Array<{ at: AtNode; s0: number; s1: number }>;
}

function jointsOf(preps: Array<ColumnPrep | BeamPrep | MemberPrep>, nodeZ: (id: number) => number): Map<number, JointPrep> {
  const below = new Map<number, ColumnPrep[]>(), above = new Map<number, ColumnPrep[]>(), beamsAt = new Map<number, AtNode[]>();
  const push = <T>(m: Map<number, T[]>, k: number, v: T) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
  for (const p of preps) {
    if (p.kind === 'column') { push(below, p.highNode, p); push(above, p.lowNode, p); }
    if (p.kind === 'beam') {
      push(beamsAt, p.nodeI, { beam: p, p: p.pI, d: p.d });
      push(beamsAt, p.nodeJ, { beam: p, p: p.pJ, d: [-p.d[0], -p.d[1]] });
    }
  }
  const out = new Map<number, JointPrep>();
  for (const [nodeId, beams] of beamsAt) {
    const down = (below.get(nodeId) ?? []).sort((a, b) => a.id - b.id), up = (above.get(nodeId) ?? []).sort((a, b) => a.id - b.id);
    const col = down[0] ?? up[0];
    // Beams only, all on one line: a continuous beam split at a node, nothing to joint.
    if (!col && beams.every((b) => Math.abs(b.d[0] * beams[0]!.d[1] - b.d[1] * beams[0]!.d[0]) < PARALLEL)) continue;
    const band = jointBandOf(beams.map((b) => ({ nodeZ: nodeZ(nodeId), dz: (b.beam.z0 + b.beam.z1) / 2 - nodeZ(nodeId), h: b.beam.z1 - b.beam.z0 })));
    if (!band) continue;
    const stubs = beams.map((b) => {
      // Where the other members' concrete meets this beam's width, along its axis from the node.
      const strip = stripRect(b.p, b.d, b.beam.w, -1e3, 1e3);
      const ss: number[] = [0];
      const along = (q: XY) => (q[0] - b.p[0]) * b.d[0] + (q[1] - b.p[1]) * b.d[1];
      if (col) for (const poly of intersection([col.foot], [strip])) for (const q of poly.outer) ss.push(along(q));
      for (const c of beams) {
        if (c === b) continue;
        const par = crossing(b, c);
        if (par) for (const q of par) ss.push(along(q));
      }
      // Into the joint no further than the other members reach across it: a stub is the beam's
      // stretch inside the joint, never past its own length either way.
      return { at: b, s0: Math.max(Math.min(...ss), -b.beam.L), s1: Math.min(Math.max(...ss), b.beam.L) };
    });
    if (stubs.every((s) => s.s1 - s.s0 < TOL) && !col) continue;
    out.set(nodeId, { nodeId, lo: band.lo, hi: band.hi, col, columns: [...down, ...up], stubs });
  }
  return out;
}

/** The joint's layers: between every soffit and top in its band, the footprint and the stubs standing there. */
function jointLayers(j: JointPrep): PrismLayer[] {
  const zs = new Set<number>([j.lo, j.hi]);
  for (const s of j.stubs) { zs.add(Math.max(j.lo, s.at.beam.z0)); zs.add(Math.min(j.hi, s.at.beam.z1)); }
  const cuts = [...zs].sort((a, b) => a - b).filter((z, k, a) => k === 0 || z - a[k - 1]! > TOL);
  const layers: PrismLayer[] = [];
  let prevKey = '';
  for (let k = 0; k + 1 < cuts.length; k++) {
    const za = cuts[k]!, zb = cuts[k + 1]!;
    const standing = j.stubs.filter((s) => s.at.beam.z0 <= za + TOL && s.at.beam.z1 >= zb - TOL && s.s1 - s.s0 > TOL);
    const parts = [...(j.col ? [j.col.foot] : []), ...standing.map((s) => stripRect(s.at.p, s.at.d, s.at.beam.w, s.s0, s.s1))];
    if (parts.length === 0) { prevKey = ''; continue; }
    const key = `${j.col ? 'c' : ''}|${standing.map((s) => s.at.beam.id).join(',')}`;
    const last = layers[layers.length - 1];
    if (key === prevKey && last && Math.abs(last.z1 - za) < TOL) { last.z1 = zb; continue; }
    layers.push({ z0: za, z1: zb, polygons: union(parts) });
    prevKey = key;
  }
  return layers;
}

// ─── Slabs ───────────────────────────────────────────────────────

function slabPlan(sh: PhysicalShell, nodes: ReadonlyMap<number, PhysicalNode>): { poly: PlanPolygon; zMid: number } | null {
  const pts = sh.nodes.map((id) => nodes.get(id));
  if (pts.some((p) => !p) || pts.length < 3) return null;
  const zs = pts.map((p) => p!.z ?? 0);
  if (Math.max(...zs) - Math.min(...zs) > 1e-4) return null;
  let dz = 0;
  if (sh.offset) {
    if (sh.offset.frame === 'global') dz = sh.offset.z;
    else {
      // Local z is the shell's normal (node0→node1 × node0→nodeLast); flat, so ±global z.
      const [a, b, c] = [pts[0]!, pts[1]!, pts[pts.length - 1]!];
      const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      dz = Math.sign(nz || 1) * sh.offset.z;
    }
  }
  const outer = ccw(pts.map((p) => [p!.x, p!.y] as XY));
  return Math.abs(ringArea(outer)) > 1e-10 ? { poly: { outer, holes: [] }, zMid: zs[0]! + dz } : null;
}

// ─── Formwork ────────────────────────────────────────────────────

interface Indexed { solid: PhysicalSolid; layer: PrismLayer; box: Box }

/** The faces of `s` that need a form: sides not against other concrete, and soffits of what is not a column. */
function formworkOf(s: PhysicalSolid, near: readonly Indexed[]): number {
  let area = 0;
  for (const layer of s.layers) {
    const others = near.filter((o) => o.layer !== layer && o.layer.z0 < layer.z1 - TOL && o.layer.z1 > layer.z0 + TOL);
    // Heights at which what stands beside this layer changes.
    const cuts = [...new Set([layer.z0, layer.z1, ...others.flatMap((o) => [o.layer.z0, o.layer.z1])])]
      .filter((z) => z >= layer.z0 - TOL && z <= layer.z1 + TOL).sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const za = cuts[k]!, zb = cuts[k + 1]!;
      if (zb - za < TOL) continue;
      const beside = others.filter((o) => o.layer.z0 <= za + TOL && o.layer.z1 >= zb - TOL).flatMap((o) => o.layer.polygons);
      for (const poly of layer.polygons) for (const ring of [poly.outer, ...poly.holes]) area += exposedLength(ring, beside) * (zb - za);
    }
    if (s.kind === 'column') continue;
    // The soffit: what of this layer has nothing under it.
    const under = near.filter((o) => o.layer !== layer && o.layer.z0 < layer.z0 - TOL && o.layer.z1 >= layer.z0 - TOL).flatMap((o) => o.layer.polygons);
    area += difference(layer.polygons, under).reduce((a, p) => a + polygonArea(p), 0);
  }
  return area;
}

/** How much of a ring's boundary has no other concrete against it, m. */
function exposedLength(ring: readonly XY[], beside: readonly PlanPolygon[]): number {
  let total = 0;
  const pad = 1e-4;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-9) continue;
    const box: Box = { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
    const cands = beside.filter((p) => touches(boxOf([p]), box, pad));
    if (cands.length === 0) { total += L; continue; }
    // Split the edge where any neighbour's boundary starts, ends or crosses it.
    const ts = new Set<number>([0, 1]);
    const ux = dx / L, uy = dy / L;
    for (const p of cands) for (const r of [p.outer, ...p.holes]) for (let k = 0; k < r.length; k++) {
      const c = r[k]!, e = r[(k + 1) % r.length]!;
      for (const q of [c, e]) {
        const off = Math.abs((q[0] - a[0]) * uy - (q[1] - a[1]) * ux);
        if (off < 1e-6) { const t = ((q[0] - a[0]) * ux + (q[1] - a[1]) * uy) / L; if (t > 0 && t < 1) ts.add(t); }
      }
      const ex = e[0] - c[0], ey = e[1] - c[1], den = dx * ey - dy * ex;
      if (Math.abs(den) > 1e-12) {
        const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den, u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.add(t);
      }
    }
    const sorted = [...ts].sort((x, y) => x - y);
    // Outward normal of a counter-clockwise outer ring, and of a clockwise hole: (dy, −dx).
    const nx = uy, ny = -ux, eps = 2e-5;
    for (let k = 0; k + 1 < sorted.length; k++) {
      const t0 = sorted[k]!, t1 = sorted[k + 1]!;
      if (t1 - t0 < 1e-9) continue;
      const tm = (t0 + t1) / 2, m: XY = [a[0] + dx * tm + nx * eps, a[1] + dy * tm + ny * eps];
      if (!cands.some((p) => insidePolygon(m, p))) total += (t1 - t0) * L;
    }
  }
  return total;
}

interface IndexedLayers { list: Indexed[] }
const indexLayers = (solids: readonly PhysicalSolid[]): IndexedLayers =>
  ({ list: solids.flatMap((s) => s.layers.map((layer) => ({ solid: s, layer, box: boxOf(layer.polygons) }))) });

/**
 * A horizontal piece of concrete from `z0` to `z1` over `plan`, less every solid of the frame it
 * overlaps: the rule a slab follows, for any slab a view draws (a floor family's panel as much as
 * a model shell). Layers split where the frame's soffits and tops cross it.
 */
function netOfLayers(frame: IndexedLayers, plan: readonly PlanPolygon[], z0: number, z1: number): PrismLayer[] {
  const box = boxOf(plan);
  const over = frame.list.filter((f) => f.layer.z0 < z1 - TOL && f.layer.z1 > z0 + TOL && touches(f.box, box));
  const cuts = [...new Set([z0, z1, ...over.flatMap((f) => [f.layer.z0, f.layer.z1])])].filter((z) => z >= z0 - TOL && z <= z1 + TOL).sort((a, b) => a - b);
  const layers: PrismLayer[] = [];
  let prev = '';
  for (let k = 0; k + 1 < cuts.length; k++) {
    const za = Math.max(z0, cuts[k]!), zb = Math.min(z1, cuts[k + 1]!);
    if (zb - za < TOL) continue;
    const here = over.filter((f) => f.layer.z0 <= za + TOL && f.layer.z1 >= zb - TOL);
    const key = here.map((f) => f.solid.id).join(',');
    const last = layers[layers.length - 1];
    if (key === prev && last && Math.abs(last.z1 - za) < TOL) { last.z1 = zb; continue; }
    const polygons = difference(plan, here.flatMap((f) => f.layer.polygons));
    if (polygons.length) layers.push({ z0: za, z1: zb, polygons });
    prev = key;
  }
  return layers;
}

/** Plan polygon booleans, the ones this geometry is built with, for callers that re-attribute it. */
export const planUnion = union;
export const planDifference = difference;
export const planIntersection = intersection;

/** `netOfLayers` against a built frame, for a slab the frame was not given (a floor family's panel). */
export function netOfFrame(frame: PhysicalFrame, plan: readonly PlanPolygon[], z0: number, z1: number): PrismLayer[] {
  return netOfLayers(indexLayers(frame.solids.filter((s) => s.kind !== 'slab')), plan, z0, z1);
}

// ─── The frame ───────────────────────────────────────────────────

export function buildPhysicalFrame(input: PhysicalFrameInput): PhysicalFrame {
  const refused: PhysicalFrame['refused'] = [];
  const untrimmed: PhysicalFrame['untrimmed'] = [];
  const consumed: number[] = [];
  const nodes = new Map(input.nodes.map((n) => [n.id, n]));
  const nodeZ = (id: number) => nodes.get(id)?.z ?? 0;
  const preps = prepare(input, refused);
  const joints = jointsOf(preps, nodeZ);

  const solids: PhysicalSolid[] = [];
  const member = new Map<number, PhysicalSolid>(), joint = new Map<number, PhysicalSolid>(), slab = new Map<string, PhysicalSolid>();
  const solid = (s: Omit<PhysicalSolid, 'volume'>): PhysicalSolid => {
    const out = { ...s, volume: s.layers.reduce((v, l) => v + layerVolume(l), 0) };
    solids.push(out);
    return out;
  };

  for (const p of preps) {
    if (p.kind === 'member') {
      untrimmed.push({ elementId: p.id, reason: p.reason });
      const s = { id: `member:${p.id}`, kind: 'member' as const, elementIds: [p.id], owner: { elementId: p.id }, layers: [], prism: p.prism, volume: p.volume };
      solids.push(s); member.set(p.id, s);
      continue;
    }
    if (p.kind === 'column') {
      const top = joints.get(p.highNode), bot = joints.get(p.lowNode);
      // The joint above takes this column's top only where this column is the one filling it.
      const z1 = top && top.col?.id === p.id ? Math.max(p.zLo, Math.min(p.zHi, top.lo)) : p.zHi;
      const z0 = bot ? Math.min(z1, Math.max(p.zLo, bot.hi)) : p.zLo;
      const len = p.zHi - p.zLo;
      member.set(p.id, solid({
        id: `member:${p.id}`, kind: 'column', elementIds: [p.id], owner: { elementId: p.id },
        layers: z1 - z0 > TOL ? [{ z0, z1, polygons: [p.foot] }] : [],
        span: p.lowIsI ? { from: z0 - p.zLo, to: z1 - p.zLo, length: len } : { from: p.zHi - z1, to: p.zHi - z0, length: len },
        axis: (() => {
          const lo = { x: p.at[0], y: p.at[1], z: z0 }, hi = { x: p.at[0], y: p.at[1], z: z1 };
          return p.lowIsI ? { start: lo, end: hi } : { start: hi, end: lo };
        })(),
      }));
      continue;
    }
    const at = (nodeId: number) => joints.get(nodeId)?.stubs.find((s) => s.at.beam.id === p.id);
    const sI = Math.max(0, at(p.nodeI)?.s1 ?? 0), sJ = Math.max(0, at(p.nodeJ)?.s1 ?? 0);
    const from = sI, to = p.L - sJ;
    if (to - from < TOL) consumed.push(p.id);
    const scale = p.len / p.L;
    member.set(p.id, solid({
      id: `member:${p.id}`, kind: 'beam', elementIds: [p.id], owner: { elementId: p.id },
      layers: to - from > TOL ? [{ z0: p.z0, z1: p.z1, polygons: [stripRect(p.a, p.d, p.w, from, to)] }] : [],
      span: { from: from * scale, to: Math.max(from, to) * scale, length: p.len },
      axis: {
        start: { x: p.a[0] + p.d[0] * from, y: p.a[1] + p.d[1] * from, z: (p.z0 + p.z1) / 2 },
        end: { x: p.a[0] + p.d[0] * Math.max(from, to), y: p.a[1] + p.d[1] * Math.max(from, to), z: (p.z0 + p.z1) / 2 },
      },
    }));
  }

  for (const j of [...joints.values()].sort((a, b) => a.nodeId - b.nodeId)) {
    const layers = jointLayers(j);
    if (layers.length === 0) continue;
    const deepest = [...j.stubs].sort((a, b) => (b.at.beam.z1 - b.at.beam.z0) - (a.at.beam.z1 - a.at.beam.z0) || a.at.beam.id - b.at.beam.id)[0];
    const ownerId = j.col?.id ?? deepest!.at.beam.id;
    const ids = [...new Set([...j.columns.map((c) => c.id), ...j.stubs.map((s) => s.at.beam.id)])];
    joint.set(j.nodeId, solid({ id: `joint:${j.nodeId}`, kind: 'joint', elementIds: ids, nodeId: j.nodeId, owner: { elementId: ownerId }, layers }));
  }

  // Slabs, net of the frame where their thickness overlaps it.
  const frameLayers = indexLayers(solids);
  for (const sh of input.shells ?? []) {
    const plan = slabPlan(sh, nodes);
    if (!plan) continue;
    const layers = netOfLayers(frameLayers, [plan.poly], plan.zMid - sh.thickness / 2, plan.zMid + sh.thickness / 2);
    slab.set(sh.key, solid({ id: `slab:${sh.key}`, kind: 'slab', elementIds: [], shellKey: sh.key, owner: { shellKey: sh.key }, layers }));
  }

  // Formwork: every solid against its neighbours, slabs included. Worked out when it is read (the
  // quantities and the IFC read it; the model viewer, which asks for the frame on every edit, does not).
  let indexed: Indexed[] | null = null;
  const index = () => (indexed ??= solids.flatMap((s) => s.layers.map((layer) => ({ solid: s, layer, box: boxOf(layer.polygons) }))));
  for (const s of solids) {
    if (s.kind === 'member') continue;
    let value: number | undefined, known = false;
    Object.defineProperty(s, 'formwork', {
      enumerable: true, configurable: true,
      get() {
        if (!known) {
          const sb = s.layers.length ? boxOf(s.layers.flatMap((l) => l.polygons)) : null;
          value = formworkOf(s, sb ? index().filter((o) => touches(o.box, sb)) : []);
          known = true;
        }
        return value;
      },
      set(v: number | undefined) { value = v; known = true; },
    });
  }

  const owned = new Map<number, PhysicalSolid[]>();
  for (const j of joint.values()) { const id = j.owner.elementId!; owned.set(id, [...(owned.get(id) ?? []), j]); }
  return { solids, member, joint, owned, slab, refused, untrimmed, consumed };
}

/** Every concrete volume the frame states, m³: the sum the quantities must reproduce. */
export const frameVolume = (f: PhysicalFrame): number => f.solids.reduce((v, s) => v + s.volume, 0);
