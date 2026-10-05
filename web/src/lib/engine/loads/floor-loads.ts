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
 * ── Any outline, openings, zones ──────────────────────────────────
 *
 * A panel that is not convex, or that holds a closed ring of beams not connected to it (a framed
 * opening, an island), is shared by the straight skeleton (`floor-skeleton.ts`): on a convex
 * panel the same 45° pattern, around a re-entrant corner the corner's bisector. The ring's beams
 * take the ring panel's share, and the ring's own panel is loaded once, by itself. A zone limits
 * the load to its outline less its openings (`floor-tributary.ts`). Beams that cross in plan
 * without a shared node invalidate their connected components, which are reported and not loaded.
 *
 * ── The plane ─────────────────────────────────────────────────────
 *
 * A level's beams lie in a horizontal plane. Beams that all lie in one inclined plane (a ramp, a
 * sloped roof) are a floor too: the panels are found in that plane and the load is vertical, per
 * true area, or per plan area when asked (q times the cosine of the slope).
 *
 * Pure: no store.
 */
import { computeLocalAxes3D } from '../local-axes-3d';
import { twoWayShares, oneWayShares, signedArea, type Piece, type Side, type SideShare, type Zone2D } from './floor-tributary';
import type { P2 } from './floor-skeleton';

type P3 = [number, number, number];

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
  /** kN/m², downward; negative lifts (a suction). */
  q: number;
  /** Only inside this outline less its openings, projected vertically onto the floor. */
  zone?: { outer: P3[]; holes?: P3[][] };
  /** An inclined floor's q per plan area (q·cos of the slope) instead of per true area. */
  perPlanArea?: boolean;
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
  /** The members along its sides and its openings' sides. */
  members?: number[];
  reason?: 'crossing' | 'zoneAcrossSpan' | 'unresolved';
}

export interface FloorLoadResult {
  z: number | null;
  panels: FloorPanel[];
  loads: FloorMemberLoad[];
  /** Load of a panel's share past a side's end, at that end's node: kN along −Z; the side's member there. */
  nodal: Array<{ nodeId: number; fz: number; elementId: number }>;
  /** The plane's normal, upward (0, 0, 1 on a level). */
  normal: P3;
  /** kN per beam. */
  perBeam: Map<number, number>;
  loadedArea: number;
  totalKN: number;
  skipped: { trusses: number; notHorizontal: number; otherLevel: number; open: number; crossings: number; zoneAcrossSpan: number; unresolved: number };
}

const EPS = 1e-9;

export function floorLoad(input: FloorLoadInput): FloorLoadResult {
  const tol = input.tol ?? 1e-3;
  const skipped = { trusses: 0, notHorizontal: 0, otherLevel: 0, open: 0, crossings: 0, zoneAcrossSpan: 0, unresolved: 0 };
  const res: FloorLoadResult = { z: null, panels: [], loads: [], nodal: [], normal: [0, 0, 1], perBeam: new Map(), loadedArea: 0, totalKN: 0, skipped };
  const pos = (id: number) => input.nodes.get(id);
  const P = (id: number): P3 => { const n = pos(id)!; return [n.x, n.y, n.z ?? 0]; };

  // ── The beams of one inclined plane, or of one level ──
  const frames: FloorBeam[] = [];
  for (const b of input.beams) {
    if (!pos(b.nodeI) || !pos(b.nodeJ)) continue;
    if (b.type === 'truss') { skipped.trusses++; continue; }
    frames.push(b);
  }
  const plane = inclinedPlane(frames.flatMap((b) => [P(b.nodeI), P(b.nodeJ)]), tol);
  let beams: FloorBeam[];
  let toPlane: (p: P3) => P2;
  if (plane) {
    res.normal = plane.n;
    beams = frames.filter((b) => {
      const a = P(b.nodeI), c = P(b.nodeJ);
      const ok = Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]) >= tol;
      if (!ok) skipped.notHorizontal++;
      return ok;
    });
    toPlane = (p) => { const d: P3 = [p[0] - plane.o[0], p[1] - plane.o[1], p[2] - plane.o[2]]; return [dot3(d, plane.e1), dot3(d, plane.e2)]; };
  } else {
    const horizontal: FloorBeam[] = [];
    for (const b of frames) {
      const a = pos(b.nodeI)!, c = pos(b.nodeJ)!;
      if (Math.abs((a.z ?? 0) - (c.z ?? 0)) > tol || Math.hypot(a.x - c.x, a.y - c.y) < tol) { skipped.notHorizontal++; continue; }
      horizontal.push(b);
    }
    if (horizontal.length === 0) return res;
    const zCount = new Map<number, number>();
    for (const b of horizontal) { const z = Math.round((pos(b.nodeI)!.z ?? 0) / tol) * tol; zCount.set(z, (zCount.get(z) ?? 0) + 1); }
    const z = [...zCount].sort((p, q) => q[1] - p[1])[0]![0];
    res.z = z;
    beams = horizontal.filter((b) => {
      const ok = Math.abs((pos(b.nodeI)!.z ?? 0) - z) <= tol * 1.5;
      if (!ok) skipped.otherLevel++;
      return ok;
    });
    toPlane = (p) => [p[0], p[1]];
  }
  if (beams.length === 0) return res;

  const xy = (id: number): P2 => toPlane(P(id));
  /** A point of the zone, dropped vertically onto the floor's plane. */
  const dropped = (p: P3): P2 => {
    if (!plane) return [p[0], p[1]];
    const { o, n } = plane;
    return toPlane([p[0], p[1], o[2] - (n[0] * (p[0] - o[0]) + n[1] * (p[1] - o[1])) / n[2]]);
  };
  const zone: Zone2D | undefined = input.zone ? { outer: input.zone.outer.map(dropped), holes: (input.zone.holes ?? []).map((h) => h.map(dropped)) } : undefined;
  const qEff = input.q * (input.perPlanArea ? Math.abs(res.normal[2]) : 1);
  const spanAxis: P3 = input.spanAxis === 'y' ? [0, 1, 0] : [1, 0, 0];
  const spanDir = ((): P2 => { const d = plane ? [dot3(spanAxis, plane.e1), dot3(spanAxis, plane.e2)] : [spanAxis[0], spanAxis[1]]; const l = Math.hypot(d[0]!, d[1]!); return [d[0]! / l, d[1]! / l]; })();
  const beamById = new Map(beams.map((b) => [b.id, b]));
  const raw = new Map<number, Array<{ a: number; b: number; qa: number; qb: number; len: number }>>();

  // ── Crossings without a node ──
  const crossed = new Set<number>();
  for (let i = 0; i < beams.length; i++) for (let j = i + 1; j < beams.length; j++) {
    const b1 = beams[i]!, b2 = beams[j]!;
    if (b1.nodeI === b2.nodeI || b1.nodeI === b2.nodeJ || b1.nodeJ === b2.nodeI || b1.nodeJ === b2.nodeJ) continue;
    if (properCross(xy(b1.nodeI), xy(b1.nodeJ), xy(b2.nodeI), xy(b2.nodeJ))) {
      skipped.crossings++;
      crossed.add(b1.nodeI); crossed.add(b2.nodeI);
    }
  }

  // ── The plane graph, without its dangling edges ──
  const adj = new Map<number, Map<number, number>>(); // node → neighbour → elementId
  const link = (u: number, v: number, e: number) => {
    if (u === v) return;
    (adj.get(u) ?? adj.set(u, new Map()).get(u)!).set(v, e);
    (adj.get(v) ?? adj.set(v, new Map()).get(v)!).set(u, e);
  };
  for (const b of beams) link(b.nodeI, b.nodeJ, b.id);
  // A non-planar component cannot yield trustworthy faces. Mark it before pruning so a
  // dangling beam crossing a panel cannot disappear and make that panel appear valid.
  const invalid = new Set<number>(crossed);
  const pending = [...crossed];
  while (pending.length) {
    for (const v of adj.get(pending.pop()!)?.keys() ?? []) {
      if (!invalid.has(v)) { invalid.add(v); pending.push(v); }
    }
  }
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

  // The pieces of the beam graph, and one node of each: a piece lying inside another's panel is
  // an island in it (see the header).
  const component = new Map<number, number>();
  const representative: Array<[number, number]> = [];
  for (const u of adj.keys()) {
    if (component.has(u)) continue;
    const c = representative.length;
    representative.push([c, u]);
    component.set(u, c);
    const stack = [u];
    while (stack.length > 0) {
      const x = stack.pop()!;
      for (const y of adj.get(x)!.keys()) if (!component.has(y)) { component.set(y, c); stack.push(y); }
    }
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

  // The outer boundary of each piece of the graph (its face of negative area), and the panel
  // each lies in: the smallest panel of another piece around its first node.
  const outerOf = new Map<number, number[]>();
  const panelsFound: Array<{ cycle: number[]; poly: P2[]; area: number }> = [];
  for (const cycle of faces) {
    const poly = cycle.map(xy);
    const area = signedArea(poly);
    if (area > EPS) {
      // A face that runs along an edge both ways is a bridge between two panels, not a panel.
      const keys = cycle.map((n, i) => { const q = cycle[(i + 1) % cycle.length]!; return n < q ? `${n}-${q}` : `${q}-${n}`; });
      if (new Set(keys).size < keys.length) continue;
      panelsFound.push({ cycle, poly, area });
    } else if (area < -EPS) outerOf.set(component.get(cycle[0]!)!, cycle);
  }
  const holesOf = new Map<number, number[][]>();
  for (const [c, n] of representative) {
    const outer = outerOf.get(c);
    if (!outer) continue;
    let best = -1;
    panelsFound.forEach((pf, k) => {
      if (component.get(pf.cycle[0]!) === c || !insidePolygon(xy(n), pf.poly)) return;
      if (best < 0 || pf.area < panelsFound[best]!.area) best = k;
    });
    if (best >= 0) (holesOf.get(best) ?? holesOf.set(best, []).get(best)!).push(outer);
  }

  panelsFound.forEach(({ cycle, poly, area }, k) => {
    const sides = mergeSides(cycle, poly, (p, q) => adj.get(p)!.get(q)!, (e, p) => beamById.get(e)!.nodeI === p);
    const holeCycles = holesOf.get(k) ?? [];
    const panel: FloorPanel = { polygon: poly, area, loaded: false };
    res.panels.push(panel);
    if (cycle.some((n) => invalid.has(n))) { panel.reason = 'crossing'; return; }
    if (holeCycles.some((h) => h.some((n) => invalid.has(n)))) { panel.reason = 'crossing'; return; }
    const holes = holeCycles.map((h) => mergeSides(h, h.map(xy), (p, q) => adj.get(p)!.get(q)!, (e, p) => beamById.get(e)!.nodeI === p));
    // Shares at unit load: the area each side takes, scaled by q when written.
    const shares: SideShare[] | null = input.distribution === 'oneWay'
      ? oneWayShares(sides, holes, spanDir, 1, zone)
      : twoWayShares(sides, holes, 1, zone);
    if (!shares) {
      panel.reason = input.distribution === 'oneWay' && zone ? 'zoneAcrossSpan' : 'unresolved';
      if (panel.reason === 'zoneAcrossSpan') skipped.zoneAcrossSpan++; else skipped.unresolved++;
      return;
    }
    const all = [...sides, ...holes.flat()];
    panel.members = [...new Set(all.flatMap((sd) => sd.segments.map((g) => g.elementId)))];
    let carried = 0;
    all.forEach((side, i) => {
      const sh = shares[i]!;
      for (const pc of sh.pieces) { emit(side, { ...pc, q0: pc.q0 * qEff, q1: pc.q1 * qEff }); carried += (pc.q0 + pc.q1) / 2 * (pc.s1 - pc.s0); }
      for (const [node, a, seg] of [[side.nodeA, sh.atA, side.segments[0]!], [side.nodeB, sh.atB, side.segments[side.segments.length - 1]!]] as const) {
        if (Math.abs(a) < 1e-12) continue;
        res.nodal.push({ nodeId: node, fz: -qEff * a, elementId: seg.elementId });
        res.totalKN += qEff * a;
        carried += a;
      }
    });
    if (carried <= 1e-12) return;
    panel.loaded = true;
    res.loadedArea += carried;
  });

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
      cur = { a: p, b: q, u, len: 0, n: [-u[1], u[0]], segments: [], nodeA: cycle[i]!, nodeB: cycle[j]! };
      sides.push(cur);
    }
    cur.segments.push({ elementId: e, s0: cur.len, s1: cur.len + segLen, forward: startsAt(e, cycle[i]!) });
    cur.len += segLen;
    cur.b = q;
    cur.nodeB = cycle[j]!;
  }
  return sides;
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

const dot3 = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * The plane of points that are not all at one level and lie in one plane that is not vertical:
 * an origin, two axes in it (e1 level, e2 up the slope) and the upward normal. Null otherwise.
 */
function inclinedPlane(pts: P3[], tol: number): { o: P3; e1: P3; e2: P3; n: P3 } | null {
  if (pts.length < 3) return null;
  const zs = pts.map((p) => p[2]);
  if (Math.max(...zs) - Math.min(...zs) <= tol) return null;
  const o = pts[0]!;
  let n: P3 | null = null;
  for (let i = 1; i < pts.length && !n; i++) for (let j = i + 1; j < pts.length && !n; j++) {
    const a: P3 = [pts[i]![0] - o[0], pts[i]![1] - o[1], pts[i]![2] - o[2]], b: P3 = [pts[j]![0] - o[0], pts[j]![1] - o[1], pts[j]![2] - o[2]];
    const c: P3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const l = Math.hypot(...c);
    if (l > 1e-6 * Math.max(1, Math.hypot(...a) * Math.hypot(...b))) n = [c[0] / l, c[1] / l, c[2] / l];
  }
  if (!n) return null;
  if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
  if (n[2] < 0.1) return null;
  if (pts.some((p) => Math.abs(dot3([p[0] - o[0], p[1] - o[1], p[2] - o[2]], n!)) > tol)) return null;
  const h = Math.hypot(n[0], n[1]);
  const e1: P3 = [-n[1] / h, n[0] / h, 0];
  const e2: P3 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  return { o, e1, e2, n };
}
const round = (v: number) => (Math.round(v * 1e6) / 1e6) || 0;

/** Strictly inside a simple polygon, by the crossing count. */
function insidePolygon(pt: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function collinear(a: P2, b: P2, c: P2): boolean {
  const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const dp = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
  return Math.abs(cr) <= 1e-6 * l1 * l2 && dp > 0;
}

function properCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12;
}
