/**
 * A floor load: an area load on a floor, carried to its beams by tributary area.
 *
 * ── Panels ────────────────────────────────────────────────────────
 *
 * The floor's beams are drawn in plan, and every closed region they bound is a panel: the faces
 * of the plane graph whose edges are the beams and whose vertices are their nodes. Beams that end
 * in the air (a cantilever, a beam that stops at a column line) bound nothing and are left out
 * of the panels; they are counted and reported.
 *
 * ── Two way ───────────────────────────────────────────────────────
 *
 * Each point of a panel sends its load to the nearest side. On a convex panel that region is the
 * set where the distance to a side's line is the smallest of all, an intersection of half-planes,
 * so it is found exactly by clipping. On a rectangle it is the familiar 45° pattern: triangles on
 * the short sides and trapezoids on the long ones. The load a side receives per metre is q times
 * the depth of its region at that point, which is piecewise linear, so every beam gets a sum of
 * partial linear loads that integrates to exactly q times its tributary area.
 *
 * ── One way ───────────────────────────────────────────────────────
 *
 * The slab spans in one plan direction, as strips that rest on the two sides they reach. Each
 * strip sends half its load to each end. The sides parallel to the span receive nothing.
 *
 * ── What is not done ──────────────────────────────────────────────
 *
 * A panel that is not convex (an L) has a nearest-side pattern with curved boundaries, and it is
 * not loaded: it is reported, to be split with a beam or loaded by hand. Beams that cross in plan
 * without a shared node are not joined into panels and are reported too.
 *
 * Pure: no store.
 */
import { computeLocalAxes3D } from '../local-axes-3d';

type P2 = [number, number];

export interface FloorBeam {
  id: number;
  nodeI: number;
  nodeJ: number;
  type: 'frame' | 'truss';
  localYx?: number; localYy?: number; localYz?: number;
  rollAngle?: number;
  sectionId: number;
}

export interface FloorLoadInput {
  nodes: Map<number, { x: number; y: number; z?: number }>;
  beams: FloorBeam[];
  /** The section's own rotation, degrees, for the local frame. */
  sectionRotation?: (sectionId: number) => number;
  /** kN/m², downward. */
  q: number;
  distribution: 'twoWay' | 'oneWay';
  /** One way: the plan direction the slab spans. */
  spanAxis?: 'x' | 'y';
  /** The user's local-axis convention: a left-handed y is entered negated (`buildSolverLoads3D`). */
  leftHand?: boolean;
  tol?: number;
}

export interface FloorMemberLoad {
  elementId: number;
  /** From node I, m; absent on a load over the whole member. */
  a?: number;
  b?: number;
  /** kN/m, downward, at a and b. */
  qI: number;
  qJ: number;
  /** The same load in the member's local axes, as `distributed3d` stores it. */
  qYI: number; qYJ: number; qZI: number; qZJ: number;
}

export interface FloorPanel {
  polygon: P2[];
  area: number;
  loaded: boolean;
  reason?: 'nonConvex';
}

export interface FloorLoadResult {
  z: number | null;
  panels: FloorPanel[];
  loads: FloorMemberLoad[];
  /** kN per beam. */
  perBeam: Map<number, number>;
  loadedArea: number;
  totalKN: number;
  skipped: { trusses: number; notHorizontal: number; otherLevel: number; open: number; crossings: number; nonConvex: number };
}

const EPS = 1e-9;

export function floorLoad(input: FloorLoadInput): FloorLoadResult {
  const tol = input.tol ?? 1e-3;
  const skipped = { trusses: 0, notHorizontal: 0, otherLevel: 0, open: 0, crossings: 0, nonConvex: 0 };
  const res: FloorLoadResult = { z: null, panels: [], loads: [], perBeam: new Map(), loadedArea: 0, totalKN: 0, skipped };
  const pos = (id: number) => input.nodes.get(id);

  // ── The beams of one level ──
  const horizontal: FloorBeam[] = [];
  for (const b of input.beams) {
    const a = pos(b.nodeI), c = pos(b.nodeJ);
    if (!a || !c) continue;
    if (b.type === 'truss') { skipped.trusses++; continue; }
    if (Math.abs((a.z ?? 0) - (c.z ?? 0)) > tol || Math.hypot(a.x - c.x, a.y - c.y) < tol) { skipped.notHorizontal++; continue; }
    horizontal.push(b);
  }
  if (horizontal.length === 0) return res;
  const zCount = new Map<number, number>();
  for (const b of horizontal) { const z = Math.round((pos(b.nodeI)!.z ?? 0) / tol) * tol; zCount.set(z, (zCount.get(z) ?? 0) + 1); }
  const z = [...zCount].sort((p, q) => q[1] - p[1])[0]![0];
  res.z = z;
  const beams = horizontal.filter((b) => {
    const ok = Math.abs((pos(b.nodeI)!.z ?? 0) - z) <= tol * 1.5;
    if (!ok) skipped.otherLevel++;
    return ok;
  });

  const xy = (id: number): P2 => { const n = pos(id)!; return [n.x, n.y]; };
  const beamById = new Map(beams.map((b) => [b.id, b]));
  const raw = new Map<number, Array<{ a: number; b: number; qa: number; qb: number; len: number }>>();

  // ── Crossings without a node ──
  for (let i = 0; i < beams.length; i++) for (let j = i + 1; j < beams.length; j++) {
    const b1 = beams[i]!, b2 = beams[j]!;
    if (b1.nodeI === b2.nodeI || b1.nodeI === b2.nodeJ || b1.nodeJ === b2.nodeI || b1.nodeJ === b2.nodeJ) continue;
    if (properCross(xy(b1.nodeI), xy(b1.nodeJ), xy(b2.nodeI), xy(b2.nodeJ))) skipped.crossings++;
  }

  // ── The plane graph, without its dangling edges ──
  const adj = new Map<number, Map<number, number>>(); // node → neighbour → elementId
  const link = (u: number, v: number, e: number) => {
    if (u === v) return;
    (adj.get(u) ?? adj.set(u, new Map()).get(u)!).set(v, e);
    (adj.get(v) ?? adj.set(v, new Map()).get(v)!).set(u, e);
  };
  for (const b of beams) link(b.nodeI, b.nodeJ, b.id);
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [u, nb] of adj) {
      if (nb.size <= 1) {
        for (const v of nb.keys()) adj.get(v)?.delete(u);
        if (nb.size === 1) skipped.open++;
        adj.delete(u);
        pruned = true;
      }
    }
  }

  // Neighbours in counter-clockwise order.
  const ccw = new Map<number, number[]>();
  for (const [u, nb] of adj) {
    const [ux, uy] = xy(u);
    ccw.set(u, [...nb.keys()].sort((a, b) => {
      const [ax, ay] = xy(a), [bx, by] = xy(b);
      return Math.atan2(ay - uy, ax - ux) - Math.atan2(by - uy, bx - ux);
    }));
  }

  // ── Faces: each directed edge once; the face on its left ──
  const used = new Set<string>();
  const faces: number[][] = [];
  for (const [u, nb] of adj) for (const v of nb.keys()) {
    if (used.has(`${u}>${v}`)) continue;
    const cycle: number[] = [];
    let a = u, b = v, guard = 0;
    while (!used.has(`${a}>${b}`) && guard++ < 100000) {
      used.add(`${a}>${b}`);
      cycle.push(a);
      const around = ccw.get(b)!;
      const k = around.indexOf(a);
      const next = around[(k - 1 + around.length) % around.length]!;
      a = b; b = next;
    }
    faces.push(cycle);
  }

  for (const cycle of faces) {
    const poly = cycle.map(xy);
    const area = signedArea(poly);
    if (area <= EPS) continue; // the outer face, and anything degenerate
    // A face that runs along an edge both ways is a bridge between two panels, not a panel.
    const edges = cycle.map((n, i) => [n, cycle[(i + 1) % cycle.length]!] as const);
    const seen = new Set(edges.map(([p, q]) => (p < q ? `${p}-${q}` : `${q}-${p}`)));
    if (seen.size < edges.length) continue;

    const sides = mergeSides(cycle, poly, (p, q) => adj.get(p)!.get(q)!, (e, p) => beamById.get(e)!.nodeI === p);
    const panel: FloorPanel = { polygon: poly, area, loaded: false };
    res.panels.push(panel);
    if (!isConvex(sides.map((s) => s.a))) { panel.reason = 'nonConvex'; skipped.nonConvex++; continue; }
    panel.loaded = true;
    res.loadedArea += area;

    const pieces = input.distribution === 'oneWay'
      ? oneWayPieces(sides, input.spanAxis === 'y' ? [0, 1] : [1, 0], input.q)
      : twoWayPieces(sides, input.q);
    for (let k = 0; k < sides.length; k++) for (const pc of pieces[k]!) emit(sides[k]!, pc);
  }

  function emit(side: Side, pc: Piece) {
    for (const seg of side.segments) {
      const s0 = Math.max(pc.s0, seg.s0), s1 = Math.min(pc.s1, seg.s1);
      if (s1 - s0 < 1e-6) continue;
      const at = (s: number) => pc.q0 + ((pc.q1 - pc.q0) * (s - pc.s0)) / (pc.s1 - pc.s0 || 1);
      const q0 = at(s0), q1 = at(s1);
      const len = seg.s1 - seg.s0;
      // Along the member, from node I.
      const [a, b, qa, qb] = seg.forward ? [s0 - seg.s0, s1 - seg.s0, q0, q1] : [seg.s1 - s1, seg.s1 - s0, q1, q0];
      if (Math.abs(qa) < 1e-12 && Math.abs(qb) < 1e-12) continue;
      addLoad(seg.elementId, a, b, qa, qb, len);
    }
  }

  function addLoad(elementId: number, a: number, b: number, qa: number, qb: number, len: number) {
    (raw.get(elementId) ?? raw.set(elementId, []).get(elementId)!).push({ a, b, qa, qb, len });
  }

  for (const [elementId, list] of raw) {
    const beam = beamById.get(elementId)!;
    const ni = pos(beam.nodeI)!, nj = pos(beam.nodeJ)!;
    const axes = computeLocalAxes3D(
      { id: 0, x: ni.x, y: ni.y, z: ni.z ?? 0 }, { id: 0, x: nj.x, y: nj.y, z: nj.z ?? 0 },
      beam.localYx !== undefined && beam.localYy !== undefined && beam.localYz !== undefined ? { x: beam.localYx, y: beam.localYy, z: beam.localYz } : undefined,
      (beam.rollAngle ?? 0) + (input.sectionRotation?.(beam.sectionId) ?? 0), false,
    );
    const ySign = input.leftHand ? -1 : 1;
    // Downward load q along −Z, in local components.
    const fy = -axes.ey[2] * ySign, fz = -axes.ez[2];
    let total = 0;
    for (const p of mergePieces(list)) {
      const full = p.a < 1e-6 && p.b > p.len - 1e-6;
      res.loads.push({
        elementId,
        ...(full ? {} : { a: round(p.a), b: round(p.b) }),
        qI: round(p.qa), qJ: round(p.qb),
        qYI: round(fy * p.qa), qYJ: round(fy * p.qb), qZI: round(fz * p.qa), qZJ: round(fz * p.qb),
      });
      total += ((p.qa + p.qb) / 2) * (p.b - p.a);
    }
    res.perBeam.set(elementId, total);
    res.totalKN += total;
  }
  return res;
}

// ─── Geometry ─────────────────────────────────────────────────────

interface Side {
  /** Start and end of the side, counter-clockwise. */
  a: P2; b: P2;
  u: P2; len: number;
  /** Inward normal (left of u on a counter-clockwise panel). */
  n: P2;
  /** The members along it, by arc length from a. */
  segments: Array<{ elementId: number; s0: number; s1: number; forward: boolean }>;
}

interface Piece { s0: number; s1: number; q0: number; q1: number }

function mergeSides(cycle: number[], poly: P2[], elementOf: (p: number, q: number) => number, startsAt: (e: number, p: number) => boolean): Side[] {
  const m = cycle.length;
  // Start at a real corner, so a side is never split across the start of the loop.
  let start = 0;
  for (let i = 0; i < m; i++) if (!collinear(poly[(i - 1 + m) % m]!, poly[i]!, poly[(i + 1) % m]!)) { start = i; break; }
  const sides: Side[] = [];
  let cur: Side | null = null;
  for (let k = 0; k < m; k++) {
    const i = (start + k) % m, j = (i + 1) % m;
    const p = poly[i]!, q = poly[j]!;
    const e = elementOf(cycle[i]!, cycle[j]!);
    const segLen = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!cur || !collinear(poly[(i - 1 + m) % m]!, p, q)) {
      const u: P2 = [(q[0] - p[0]) / segLen, (q[1] - p[1]) / segLen];
      cur = { a: p, b: q, u, len: 0, n: [-u[1], u[0]], segments: [] };
      sides.push(cur);
    }
    cur.segments.push({ elementId: e, s0: cur.len, s1: cur.len + segLen, forward: startsAt(e, cycle[i]!) });
    cur.len += segLen;
    cur.b = q;
  }
  return sides;
}

function twoWayPieces(sides: Side[], q: number): Piece[][] {
  const corners = sides.map((s) => s.a);
  return sides.map((e, k) => {
    // The region nearer to side k than to any other: the panel clipped by d_k − d_f ≤ 0.
    let face: P2[] = corners;
    for (let f = 0; f < sides.length; f++) {
      if (f === k) continue;
      const g = sides[f]!;
      face = clip(face, (p) => dist(e, p) - dist(g, p));
      if (face.length < 3) break;
    }
    if (face.length < 3) return [];
    const ss = [...new Set(face.map((p) => clamp(along(e, p), 0, e.len)).map((s) => Math.round(s * 1e9) / 1e9))].sort((a, b) => a - b);
    const out: Piece[] = [];
    for (let i = 0; i + 1 < ss.length; i++) {
      const s0 = ss[i]!, s1 = ss[i + 1]!;
      if (s1 - s0 < 1e-9) continue;
      out.push({ s0, s1, q0: q * depth(face, e, s0), q1: q * depth(face, e, s1) });
    }
    return out;
  });
}

function oneWayPieces(sides: Side[], d: P2, q: number): Piece[][] {
  const out: Piece[][] = sides.map(() => []);
  const n: P2 = [-d[1], d[0]];
  const corners = sides.map((s) => s.a);
  const ts = [...new Set(corners.map((p) => Math.round(dot(n, p) * 1e9) / 1e9))].sort((a, b) => a - b);
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]!, t1 = ts[i + 1]!;
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    // The two sides the strip at tm reaches, the near one first along d.
    const hits: Array<{ k: number; r: number }> = [];
    sides.forEach((s, k) => {
      const un = dot(s.u, n);
      if (Math.abs(un) < 1e-12) return;
      const sAt = (tm - dot(n, s.a)) / un;
      if (sAt < -1e-9 || sAt > s.len + 1e-9) return;
      hits.push({ k, r: dot(d, [s.a[0] + s.u[0] * sAt, s.a[1] + s.u[1] * sAt]) });
    });
    if (hits.length < 2) continue;
    hits.sort((a, b) => a.r - b.r);
    const near = sides[hits[0]!.k]!, far = sides[hits[hits.length - 1]!.k]!;
    const at = (s: Side, t: number) => (t - dot(n, s.a)) / dot(s.u, n);
    const point = (s: Side, t: number): P2 => { const sa = at(s, t); return [s.a[0] + s.u[0] * sa, s.a[1] + s.u[1] * sa]; };
    const L = (t: number) => dot(d, point(far, t)) - dot(d, point(near, t));
    for (const [side, k] of [[near, hits[0]!.k], [far, hits[hits.length - 1]!.k]] as const) {
      const f = Math.abs(dot(side.u, n));
      const sa = at(side, t0), sb = at(side, t1);
      const [s0, s1, qa, qb] = sa <= sb ? [sa, sb, L(t0), L(t1)] : [sb, sa, L(t1), L(t0)];
      out[k]!.push({ s0: clamp(s0, 0, side.len), s1: clamp(s1, 0, side.len), q0: (q * qa * f) / 2, q1: (q * qb * f) / 2 });
    }
  }
  return out;
}

/** The deepest point of the (convex) face above side e at arc length s. */
function depth(face: P2[], e: Side, s: number): number {
  let best = 0;
  for (let i = 0; i < face.length; i++) {
    const p = face[i]!, q = face[(i + 1) % face.length]!;
    const sp = along(e, p), sq = along(e, q);
    if ((sp - s) * (sq - s) > 1e-12) continue;
    const t = Math.abs(sq - sp) < 1e-12 ? 0 : (s - sp) / (sq - sp);
    const pt: P2 = Math.abs(sq - sp) < 1e-12 ? (dist(e, p) > dist(e, q) ? p : q) : [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    best = Math.max(best, dist(e, pt));
  }
  return best;
}

/** Sutherland–Hodgman against g(p) ≤ 0, g linear. */
function clip(poly: P2[], g: (p: P2) => number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const gp = g(p), gq = g(q);
    if (gp <= 1e-12) out.push(p);
    if ((gp < -1e-12 && gq > 1e-12) || (gp > 1e-12 && gq < -1e-12)) {
      const t = gp / (gp - gq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Contiguous pieces with the same slope become one. */
function mergePieces(list: Array<{ a: number; b: number; qa: number; qb: number; len: number }>) {
  const s = [...list].sort((x, y) => x.a - y.a);
  const out: typeof s = [];
  for (const p of s) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.b - p.a) < 1e-6 && Math.abs(last.qb - p.qa) < 1e-6) {
      const slope1 = (last.qb - last.qa) / (last.b - last.a), slope2 = (p.qb - p.qa) / (p.b - p.a);
      if (Math.abs(slope1 - slope2) < 1e-6) { last.b = p.b; last.qb = p.qb; continue; }
    }
    out.push({ ...p });
  }
  return out;
}

const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const along = (e: Side, p: P2) => (p[0] - e.a[0]) * e.u[0] + (p[1] - e.a[1]) * e.u[1];
const dist = (e: Side, p: P2) => (p[0] - e.a[0]) * e.n[0] + (p[1] - e.a[1]) * e.n[1];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round = (v: number) => Math.round(v * 1e6) / 1e6;

function signedArea(p: P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]!; a += p[i]![0] * q[1] - q[0] * p[i]![1]; }
  return a / 2;
}

function collinear(a: P2, b: P2, c: P2): boolean {
  const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const dp = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
  return Math.abs(cr) <= 1e-6 * l1 * l2 && dp > 0;
}

function isConvex(p: P2[]): boolean {
  if (p.length < 3) return false;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!, c = p[(i + 2) % p.length]!;
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-9) return false;
  }
  return true;
}

function properCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12;
}
