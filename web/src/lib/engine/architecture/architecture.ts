/**
 * The architecture the structure carries: constructions by layers, walls and partitions, rooms.
 *
 *  · A construction is a stack of layers, each with its thickness, conductivity λ and density ρ
 *    as the person states them (the maker's or the code's values: none is assumed). Its thermal
 *    transmittance is U = 1 / (Rsi + Σ d/λ + Rse), with the surface resistances the person
 *    states; its surface mass m = Σ ρ·d and its weight m·g. Checked against the limits the
 *    project states: U ≤ Umax, m ≥ mmin, and Rw ≥ Rw,req when the construction's tested Rw is
 *    given. Rows carry `code: 'project-arch'`: the project's own requirements.
 *  · A wall runs from one plan point to another on a level, with its height and construction;
 *    its weight per metre is the construction's weight times its height.
 *  · A room is a plan polygon on a level, with its use (the room vocabulary the CAD import
 *    already reads, so it maps to the same live load) and its height.
 *  · Geometry check: walls of no length, walls that overlap, wall ends that almost meet,
 *    rooms whose outline crosses itself, rooms that overlap.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../design-contract';

export interface Layer { name: string; thickness: number; lambda: number; density: number }
export interface Construction {
  id: string; name: string; kind: 'wall' | 'floor' | 'roof';
  layers: Layer[];
  /** Inner and outer surface resistances, m²K/W. */
  rsi: number; rse: number;
  /** The project's limits: largest U (W/m²K), least surface mass (kg/m²), least Rw (dB). */
  uMax?: number; massMin?: number; rwRequired?: number;
  /** The construction's airborne sound reduction from tests, dB. */
  rw?: number;
}

export interface ArchWall { id: string; name: string; levelId: string; z: number; a: { x: number; y: number }; b: { x: number; y: number }; height: number; constructionId: string }
export interface Room { id: string; name: string; levelId: string; z: number; outline: Array<{ x: number; y: number }>; height: number; use?: string }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });

export function constructionProps(c: Construction): { thickness: number; r: number; u: number; mass: number; weight: number } {
  const thickness = c.layers.reduce((s, l) => s + l.thickness, 0);
  const r = c.rsi + c.layers.reduce((s, l) => s + (l.lambda > 0 ? l.thickness / l.lambda : 0), 0) + c.rse;
  const mass = c.layers.reduce((s, l) => s + l.density * l.thickness, 0);
  return { thickness, r, u: r > 0 ? 1 / r : Infinity, mass, weight: (mass * 9.81) / 1000 };
}

export function constructionRows(c: Construction): CheckRow[] {
  const p = constructionProps(c), rows: CheckRow[] = [];
  const base = { code: 'project-arch', clause: c.name };
  const row = (key: string, title: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[]): CheckRow => {
    const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
    return { ...base, title, titleKey: `check.arch.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio) };
  };
  const layers = c.layers.map((l) => inp(`d/λ ${l.name}`, l.lambda > 0 ? l.thickness / l.lambda : 0, 'm²K/W'));
  if (c.uMax !== undefined) rows.push(row('thermal', 'Thermal transmittance', 'U = 1/(Rsi + Σd/λ + Rse) ≤ Umax', p.u, c.uMax, 'W/m²K', [inp('Rsi', c.rsi, 'm²K/W'), ...layers, inp('Rse', c.rse, 'm²K/W')]));
  else rows.push({ ...base, title: 'Thermal transmittance', titleKey: 'check.arch.thermal', formula: 'U = 1/(Rsi + Σd/λ + Rse)', inputs: [inp('U', p.u, 'W/m²K')], demand: r3(p.u), unit: 'W/m²K', ratio: null, status: 'notVerified', derivation: ['no limit stated'] });
  if (c.massMin !== undefined) rows.push(row('mass', 'Surface mass', 'm = Σρ·d ≥ mmin', c.massMin, p.mass, 'kg/m²', [inp('m', p.mass, 'kg/m²')]));
  if (c.rwRequired !== undefined) {
    rows.push(c.rw === undefined
      ? { ...base, title: 'Airborne sound insulation', titleKey: 'check.arch.acoustic', formula: 'Rw ≥ Rw,req', inputs: [inp('Rw,req', c.rwRequired, 'dB')], ratio: null, status: 'notVerified', derivation: ['the construction\'s tested Rw is not stated'] }
      : row('acoustic', 'Airborne sound insulation', 'Rw ≥ Rw,req', c.rwRequired, c.rw, 'dB', [inp('Rw', c.rw, 'dB')]));
  }
  return rows;
}

// ─── Plan geometry ───

type P = { x: number; y: number };
export const wallLength = (w: { a: P; b: P }) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

/** Area (positive) and perimeter of a polygon. */
export function polygonArea(pts: readonly P[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i]!, b = pts[(i + 1) % pts.length]!; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}
export function polygonPerimeter(pts: readonly P[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i]!, b = pts[(i + 1) % pts.length]!; s += Math.hypot(b.x - a.x, b.y - a.y); }
  return s;
}
export function pointInPolygon(p: P, pts: readonly P[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
/** Proper crossing of two segments (touching at an end does not count). */
export function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}

export interface GeometryIssue { kind: 'zeroWall' | 'overlap' | 'gap' | 'selfCrossing' | 'roomOverlap'; ids: string[]; at: P }

/** What is wrong with the walls and rooms of one level; `tol` is the gap a wall end may leave, m. */
export function checkGeometry(walls: readonly ArchWall[], rooms: readonly Room[], tol = 0.05): GeometryIssue[] {
  const out: GeometryIssue[] = [];
  for (const w of walls) if (wallLength(w) < 1e-3) out.push({ kind: 'zeroWall', ids: [w.id], at: w.a });
  const same = (a: ArchWall, b: ArchWall) => a.levelId === b.levelId;
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
    const a = walls[i]!, b = walls[j]!;
    if (!same(a, b)) continue;
    // Overlap: collinear and sharing a stretch longer than the tolerance.
    const L = wallLength(a);
    if (L > 1e-3 && Math.abs(cross(a.a, a.b, b.a)) / L < 1e-3 && Math.abs(cross(a.a, a.b, b.b)) / L < 1e-3) {
      const ux = (a.b.x - a.a.x) / L, uy = (a.b.y - a.a.y) / L;
      const t = (p: P) => (p.x - a.a.x) * ux + (p.y - a.a.y) * uy;
      const lo = Math.max(0, Math.min(t(b.a), t(b.b))), hi = Math.min(L, Math.max(t(b.a), t(b.b)));
      if (hi - lo > tol) out.push({ kind: 'overlap', ids: [a.id, b.id], at: { x: a.a.x + ux * (lo + hi) / 2, y: a.a.y + uy * (lo + hi) / 2 } });
    }
  }
  // Ends that almost meet another wall's end without touching it.
  for (const w of walls) for (const e of [w.a, w.b]) {
    let near: { d: number; id: string } | null = null;
    for (const v of walls) {
      if (v === w || !same(v, w)) continue;
      for (const f of [v.a, v.b]) { const d = Math.hypot(f.x - e.x, f.y - e.y); if (d < 1e-6) { near = { d: 0, id: v.id }; break; } if (d < tol && (!near || d < near.d)) near = { d, id: v.id }; }
      if (near?.d === 0) break;
    }
    if (near && near.d > 0) out.push({ kind: 'gap', ids: [w.id, near.id], at: e });
  }
  for (const r of rooms) {
    const n = r.outline.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(r.outline[i]!, r.outline[(i + 1) % n]!, r.outline[j]!, r.outline[(j + 1) % n]!)) { out.push({ kind: 'selfCrossing', ids: [r.id], at: r.outline[i]! }); i = n; break; }
    }
  }
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i]!, b = rooms[j]!;
    if (a.levelId !== b.levelId) continue;
    const inside = b.outline.find((p) => pointInPolygon(p, a.outline)) ?? a.outline.find((p) => pointInPolygon(p, b.outline));
    if (inside) out.push({ kind: 'roomOverlap', ids: [a.id, b.id], at: inside });
  }
  return out;
}

/**
 * A point cloud's slice at a height: the points within ±band of z, kept one per `cell` on plan,
 * as small crosses (segments x1, y1, x2, y2…) to draw as a background. Reads "x y z" per line
 * (spaces, commas or semicolons; extra columns ignored), so XYZ, PTS and ASCII exports read.
 */
export function cloudSlice(text: string, z: number, band = 0.05, cell = 0.02, maxPoints = 50_000): { segments: number[]; read: number; kept: number } {
  const seen = new Set<string>(), segments: number[] = [];
  let read = 0, kept = 0;
  for (const line of text.split(/\r?\n/)) {
    const f = line.trim().split(/[\s,;]+/).map(Number);
    if (f.length < 3 || f.slice(0, 3).some((v) => !Number.isFinite(v))) continue;
    read++;
    const [x, y, pz] = f as [number, number, number];
    if (Math.abs(pz - z) > band || kept >= maxPoints) continue;
    const key = `${Math.round(x / cell)},${Math.round(y / cell)}`;
    if (seen.has(key)) continue;
    seen.add(key); kept++;
    const h = cell / 2;
    segments.push(x - h, y, x + h, y, x, y - h, x, y + h);
  }
  return { segments, read, kept };
}

/** A wall read from an IFC wall surface: its bottom edge on plan, its height and thickness. */
export function wallFromOutline(outline: ReadonlyArray<{ x: number; y: number; z: number }>): { a: P; b: P; z: number; height: number } | null {
  if (outline.length < 3) return null;
  const z0 = Math.min(...outline.map((p) => p.z)), z1 = Math.max(...outline.map((p) => p.z));
  const bottom = outline.filter((p) => Math.abs(p.z - z0) < 1e-3);
  if (bottom.length < 2) return null;
  let a = bottom[0]!, b = bottom[0]!, d = -1;
  for (const p of bottom) for (const q of bottom) { const e = Math.hypot(p.x - q.x, p.y - q.y); if (e > d) { d = e; a = p; b = q; } }
  return d > 1e-3 ? { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, z: z0, height: z1 - z0 } : null;
}
