/**
 * Converting part of a template into members, as a plan the reader confirms
 * (`store/underlay-convert.ts` applies it).
 *
 * ── What converts ─────────────────────────────────────────────────
 *
 * On the layers chosen for members: lines and the straight pieces of polylines become members;
 * arcs (an ARC, or a polyline piece with a bulge) become curved members through their middle. On
 * the layers chosen for columns: a circle or a small closed polyline becomes a column at its
 * centre, from the level below up to the template's. Blocks, texts and anything else are not
 * converted, and are counted: a label that names a section or a use is shown to the reader, never
 * read into the model.
 *
 * ── Tolerance, duplicates, connections ────────────────────────────
 *
 * Ends closer than `tol` are one point (the first met). A piece drawn twice is converted once; a
 * piece lying within another on the same line is left out. An end on another piece's middle
 * within `tol` cuts that piece there (a T). An end that meets nothing is reported, where it is.
 * A piece the model already has between the same two points, at the template's level, is not
 * converted again, so a conversion run twice adds nothing the second time.
 *
 * Pure: the template and the model in, the plan out.
 */
import type { Underlay } from './underlay';
import { laidPoint } from './underlay';
import type { UnderlayShape } from './underlay-regions';

type P2 = [number, number];

export interface ConvertOptions {
  /** Layers whose pieces become members, and whose circles and small closed outlines become columns. */
  memberLayers: readonly string[];
  columnLayers: readonly string[];
  /** Ends closer than this are one point, m. */
  tol: number;
  /** A closed outline no larger than this across is a column, m. */
  maxColumn: number;
  /** The level below, for the columns' feet; columns are left out without one. */
  columnFootZ: number | null;
}

export interface ConvertPlan {
  z: number;
  beams: Array<{ a: P2; b: P2 }>;
  arcs: Array<{ a: P2; mid: P2; b: P2 }>;
  columns: Array<{ at: P2 }>;
  /** Pieces drawn twice, or lying within another on its line, left out. */
  duplicates: number;
  /** Ends moved onto another end within the tolerance. */
  welded: number;
  /** Ends on another piece's middle, which is cut there. */
  tees: P2[];
  /** Ends that meet nothing. */
  loose: P2[];
  /** Pieces the model already has, left out. */
  existing: number;
  /** Shapes on the chosen layers that are not converted, by kind. */
  skipped: Record<string, number>;
  /** Columns left out because there is no level below. */
  columnsWithoutFoot: number;
}

export interface ConvertModel {
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>;
  elements: ReadonlyMap<number, { nodeI: number; nodeJ: number; arc?: { spec: { start: { x: number; y: number; z: number }; through: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } } } }>;
}

const d2 = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The arc of a bulged polyline piece: its middle point. */
function bulgeMid(a: P2, b: P2, bulge: number): P2 {
  const th = 4 * Math.atan(bulge), chord = d2(a, b);
  const r = chord / (2 * Math.sin(Math.abs(th) / 2));
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  // Sagitta, on the side the bulge's sign says (left of a→b for a positive bulge, counter-clockwise).
  const sag = r - Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
  const s = Math.abs(th) > Math.PI ? 2 * r - sag : sag;
  const nx = -(b[1] - a[1]) / chord, ny = (b[0] - a[0]) / chord;
  const sign = bulge > 0 ? -1 : 1;
  return [mx + sign * nx * s, my + sign * ny * s];
}

export function planConversion(u: Underlay, o: ConvertOptions, m: ConvertModel): ConvertPlan {
  const layers = u.layers ?? [];
  const memberL = new Set(o.memberLayers.map((n) => layers.indexOf(n)).filter((i) => i >= 0));
  const columnL = new Set(o.columnLayers.map((n) => layers.indexOf(n)).filter((i) => i >= 0));
  const lay = (p: P2): P2 => laidPoint(u, p[0], p[1]);
  const plan: ConvertPlan = { z: u.z, beams: [], arcs: [], columns: [], duplicates: 0, welded: 0, tees: [], loose: [], existing: 0, skipped: {}, columnsWithoutFoot: 0 };
  const skip = (k: string) => { plan.skipped[k] = (plan.skipped[k] ?? 0) + 1; };

  // Ends welded: a hash of cells as wide as the tolerance, the first point met in each cluster kept.
  const cell = Math.max(o.tol, 1e-6);
  const pts = new Map<string, P2[]>();
  const weld = (p: P2): P2 => {
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of pts.get(`${cx + i},${cy + j}`) ?? []) {
      if (d2(p, q) <= o.tol) { if (d2(p, q) > 1e-9) plan.welded++; return q; }
    }
    const key = `${cx},${cy}`;
    (pts.get(key) ?? pts.set(key, []).get(key)!).push(p);
    return p;
  };

  const raw: Array<{ a: P2; b: P2 }> = [];
  const rawArcs: Array<{ a: P2; mid: P2; b: P2 }> = [];
  for (const sh of u.shapes ?? []) {
    if (columnL.has(sh.L) && isColumnShape(sh, o.maxColumn)) {
      const c = columnCentre(sh);
      if (o.columnFootZ === null) plan.columnsWithoutFoot++;
      else plan.columns.push({ at: lay(c) });
      continue;
    }
    if (!memberL.has(sh.L)) continue;
    switch (sh.k) {
      case 'l': raw.push({ a: lay(sh.a), b: lay(sh.b) }); break;
      case 'a': {
        let a1 = sh.a1; if (a1 <= sh.a0) a1 += 2 * Math.PI;
        const at = (t: number): P2 => [sh.c[0] + sh.r * Math.cos(t), sh.c[1] + sh.r * Math.sin(t)];
        rawArcs.push({ a: lay(at(sh.a0)), mid: lay(at((sh.a0 + a1) / 2)), b: lay(at(a1)) });
        break;
      }
      case 'p': {
        const n = sh.pts.length, last = sh.closed ? n : n - 1;
        for (let i = 0; i < last; i++) {
          const a = sh.pts[i]!, b = sh.pts[(i + 1) % n]!, bulge = sh.bulges?.[i] ?? 0;
          if (d2(a, b) < 1e-9) continue;
          if (Math.abs(bulge) > 1e-9) rawArcs.push({ a: lay(a), mid: lay(bulgeMid(a, b, bulge)), b: lay(b) });
          else raw.push({ a: lay(a), b: lay(b) });
        }
        break;
      }
      case 'c': skip('circle'); break;
      case 't': skip('text'); break;
    }
  }

  // Weld every end, then drop the pieces drawn twice and the ones lying within another.
  const segs = raw.map((s) => ({ a: weld(s.a), b: weld(s.b) })).filter((s) => d2(s.a, s.b) > o.tol);
  const arcs = rawArcs.map((s) => ({ a: weld(s.a), mid: s.mid, b: weld(s.b) })).filter((s) => d2(s.a, s.b) > o.tol);
  const key = (a: P2, b: P2) => { const k1 = `${a[0].toFixed(6)},${a[1].toFixed(6)}`, k2 = `${b[0].toFixed(6)},${b[1].toFixed(6)}`; return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`; };
  const seen = new Set<string>();
  const unique: typeof segs = [];
  for (const s of segs) { const k = key(s.a, s.b); if (seen.has(k)) { plan.duplicates++; continue; } seen.add(k); unique.push(s); }
  const within = (s: { a: P2; b: P2 }, t: { a: P2; b: P2 }) => onSegment(s.a, t, o.tol) && onSegment(s.b, t, o.tol);
  const kept = unique.filter((s, i) => {
    const inside = unique.some((t, j) => j !== i && d2(t.a, t.b) > d2(s.a, s.b) + 1e-9 && within(s, t));
    if (inside) plan.duplicates++;
    return !inside;
  });
  const arcKeys = new Set<string>();
  const keptArcs = arcs.filter((s) => { const k = `${key(s.a, s.b)}|${s.mid[0].toFixed(4)},${s.mid[1].toFixed(4)}`; if (arcKeys.has(k)) { plan.duplicates++; return false; } arcKeys.add(k); return true; });

  // What the model already has at this level. A straight piece is there when the model's members
  // cover it from end to end through the nodes lying on it (a beam cut at a T, or by a mesh, still
  // counts); an arc when a curved member joins the same ends on the same circle.
  const levelNodes: Array<{ id: number; p: P2 }> = [];
  for (const [id, n] of m.nodes) if (Math.abs((n.z ?? 0) - u.z) <= o.tol) levelNodes.push({ id, p: [n.x, n.y] });
  const nodeCells = new Map<string, Array<{ id: number; p: P2 }>>();
  for (const n of levelNodes) { const k = `${Math.floor(n.p[0] / cell)},${Math.floor(n.p[1] / cell)}`; (nodeCells.get(k) ?? nodeCells.set(k, []).get(k)!).push(n); }
  const pairs = new Set<string>();
  const arcEnds: Array<{ a: P2; b: P2; c: P2; r: number }> = [];
  for (const e of m.elements.values()) {
    const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
    if (!a || !b || Math.abs((a.z ?? 0) - u.z) > o.tol || Math.abs((b.z ?? 0) - u.z) > o.tol) continue;
    pairs.add(e.nodeI < e.nodeJ ? `${e.nodeI}-${e.nodeJ}` : `${e.nodeJ}-${e.nodeI}`);
    if (e.arc) {
      const sp = e.arc.spec, c = circle([sp.start.x, sp.start.y], [sp.through.x, sp.through.y], [sp.end.x, sp.end.y]);
      if (c) arcEnds.push({ a: [sp.start.x, sp.start.y], b: [sp.end.x, sp.end.y], ...c });
    }
  }
  const nodesOn = (s: { a: P2; b: P2 }) => {
    const L = d2(s.a, s.b), steps = Math.min(100000, Math.ceil(L / cell) + 2);
    const found = new Map<number, number>();
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, x = s.a[0] + (s.b[0] - s.a[0]) * t, y = s.a[1] + (s.b[1] - s.a[1]) * t;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const n of nodeCells.get(`${cx + i},${cy + j}`) ?? []) {
        if (!found.has(n.id) && onSegment(n.p, s, o.tol)) found.set(n.id, ((n.p[0] - s.a[0]) * (s.b[0] - s.a[0]) + (n.p[1] - s.a[1]) * (s.b[1] - s.a[1])) / (L * L));
      }
    }
    return [...found].sort((x, y) => x[1] - y[1]).map(([id]) => id);
  };
  const covered = (s: { a: P2; b: P2 }) => {
    const on = nodesOn(s);
    if (on.length < 2) return false;
    const first = m.nodes.get(on[0]!)!, last = m.nodes.get(on[on.length - 1]!)!;
    if (d2([first.x, first.y], s.a) > o.tol || d2([last.x, last.y], s.b) > o.tol) return false;
    for (let k = 0; k + 1 < on.length; k++) { const i = on[k]!, j = on[k + 1]!; if (!pairs.has(i < j ? `${i}-${j}` : `${j}-${i}`)) return false; }
    return true;
  };
  const nearExisting = (a: P2, b: P2) => covered({ a, b });
  const arcExisting = (s: { a: P2; mid: P2; b: P2 }) => {
    const c = circle(s.a, s.mid, s.b);
    return !!c && arcEnds.some((x) => ((d2(x.a, s.a) <= o.tol && d2(x.b, s.b) <= o.tol) || (d2(x.a, s.b) <= o.tol && d2(x.b, s.a) <= o.tol)) && d2(x.c, c.c) <= o.tol && Math.abs(x.r - c.r) <= o.tol);
  };
  // A column already there: a member from the foot to the template's level at the same point.
  if (o.columnFootZ !== null) {
    const foot = o.columnFootZ;
    const upright = [...m.elements.values()].flatMap((e) => {
      const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
      if (!a || !b) return [];
      const [lo, hi] = (a.z ?? 0) <= (b.z ?? 0) ? [a, b] : [b, a];
      return Math.abs((lo.z ?? 0) - foot) <= o.tol && Math.abs((hi.z ?? 0) - u.z) <= o.tol && d2([lo.x, lo.y], [hi.x, hi.y]) <= o.tol ? [[lo.x, lo.y] as P2] : [];
    });
    plan.columns = plan.columns.filter((c) => { const there = upright.some((p) => d2(p, c.at) <= o.tol); if (there) plan.existing++; return !there; });
  }
  for (const s of kept) { if (nearExisting(s.a, s.b)) plan.existing++; else plan.beams.push(s); }
  for (const s of keptArcs) { if (arcExisting(s)) plan.existing++; else plan.arcs.push(s); }

  // Connections: ends on another piece's middle, and ends that meet nothing.
  const ends = [...plan.beams, ...plan.arcs].flatMap((s) => [s.a, s.b]);
  const count = new Map<string, number>();
  for (const p of ends) count.set(`${p[0]},${p[1]}`, (count.get(`${p[0]},${p[1]}`) ?? 0) + 1);
  const modelPts: P2[] = [...m.nodes.values()].filter((n) => Math.abs((n.z ?? 0) - u.z) <= o.tol).map((n) => [n.x, n.y]);
  for (const [k, c] of count) {
    if (c > 1) continue;
    const p = k.split(',').map(Number) as P2;
    const tee = plan.beams.some((s) => d2(s.a, p) > o.tol && d2(s.b, p) > o.tol && onSegment(p, s, o.tol));
    if (tee) { plan.tees.push(p); continue; }
    if (modelPts.some((q) => d2(p, q) <= o.tol) || plan.columns.some((c2) => d2(c2.at, p) <= o.tol)) continue;
    plan.loose.push(p);
  }
  return plan;
}

/** The circle through three plan points, or null in line. */
function circle(a: P2, b: P2, c: P2): { c: P2; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const x = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
  const y = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
  return { c: [x, y], r: Math.hypot(a[0] - x, a[1] - y) };
}

function onSegment(p: P2, s: { a: P2; b: P2 }, tol: number): boolean {
  const L = d2(s.a, s.b);
  if (L < 1e-12) return false;
  const t = ((p[0] - s.a[0]) * (s.b[0] - s.a[0]) + (p[1] - s.a[1]) * (s.b[1] - s.a[1])) / (L * L);
  if (t < -tol / L || t > 1 + tol / L) return false;
  const x = s.a[0] + t * (s.b[0] - s.a[0]), y = s.a[1] + t * (s.b[1] - s.a[1]);
  return Math.hypot(p[0] - x, p[1] - y) <= tol;
}

function isColumnShape(sh: UnderlayShape, max: number): boolean {
  if (sh.k === 'c') return 2 * sh.r <= max;
  if (sh.k !== 'p' || !sh.closed || sh.pts.length < 3 || sh.pts.length > 12) return false;
  const xs = sh.pts.map((p) => p[0]), ys = sh.pts.map((p) => p[1]);
  return Math.max(...xs) - Math.min(...xs) <= max && Math.max(...ys) - Math.min(...ys) <= max;
}

function columnCentre(sh: UnderlayShape): P2 {
  if (sh.k === 'c') return sh.c;
  if (sh.k !== 'p') return [0, 0];
  const xs = sh.pts.map((p) => p[0]), ys = sh.pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
