import fastClipping from 'polygon-clipping';
import BigNumber from 'bignumber.js';
import * as polygonClipping from 'polyclip-ts';
type MultiPolygon = Array<Array<Array<[number, number]>>>;
import { skeletonCells, type P2 } from './floor-skeleton';

export interface Side {

  a: P2; b: P2;
  u: P2; len: number;

  n: P2;

  segments: Array<{ elementId: number; s0: number; s1: number; forward: boolean }>;

  nodeA: number; nodeB: number;
}

export interface Piece { s0: number; s1: number; q0: number; q1: number }


export interface Zone2D { outer: P2[]; holes: P2[][] }

export interface SideShare {
  pieces: Piece[];

  atA: number; atB: number;
  eccentricFirst: P2;
  roundoffForce: number;
}

const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const along = (e: Side, p: P2) => (p[0] - e.a[0]) * e.u[0] + (p[1] - e.a[1]) * e.u[1];
const dist = (e: Side, p: P2) => (p[0] - e.a[0]) * e.n[0] + (p[1] - e.a[1]) * e.n[1];

function signedArea(p: readonly P2[]): number {
  let a = 0;
  const origin = p[0];
  if (!origin) return 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]!; a += (p[i]![0] - origin[0]) * (q[1] - origin[1]) - (q[0] - origin[0]) * (p[i]![1] - origin[1]); }
  return a / 2;
}


export function twoWayShares(sides: Side[], holes: Side[][], q: number, zone?: Zone2D, excluded: P2[][] = [], selection?: PhysicalRegion): SideShare[] | null {
  const all = [...sides, ...holes.flat()];
  let cells: P2[][][];
  if (!holes.length && isConvex(sides.map((s) => s.a))) {
    const corners = sides.map((s) => s.a);
    cells = sides.map((e, k) => {
      let face: P2[] = corners;
      for (let f = 0; f < sides.length && face.length >= 3; f++) {
        if (f !== k) { const g = sides[f]!; face = clipExact(face, (p) => dist(e, p) - dist(g, p)); }
      }
      return face.length >= 3 ? [face] : [];
    });
  } else {
    const c = skeletonCells([sides.map((s) => s.a), ...holes.map((h) => h.map((s) => s.a))]);
    if (!c) return null;
    cells = c;
  }
  const full = loadedRegion(sides, holes, zone, excluded);
  const region = selection ? intersectRegions(full, selection) : full;
  const out: SideShare[] = all.map(() => ({ pieces: [], atA: 0, atB: 0, roundoffForce: 0, eccentricFirst: [0, 0] }));
  const complete = (holes.length > 0 || !isConvex(sides.map(s => s.a))) && (!!zone || excluded.length > 0 || !!selection);
  let remaining = region;
  const put = (k: number, portion: PhysicalRegion) => {
    const sh = transferRegionToSide(all[k]!, portion, q), target = out[k]!;
    target.pieces.push(...sh.pieces); target.atA += sh.atA; target.atB += sh.atB; target.roundoffForce += sh.roundoffForce;
    target.eccentricFirst[0] += sh.eccentricFirst[0]; target.eccentricFirst[1] += sh.eccentricFirst[1];
  };
  all.forEach((_e, k) => {
    for (const cell of cells[k]!) {
      const raw = physicalRegion(cell);
      const clipped = complete ? intersectRegions(raw, remaining) : zone || excluded.length || selection ? intersectRegions(raw, region) : raw;
      put(k, clipped);
      if (complete) remaining = subtractRegions(remaining, clipped);
    }
  });
  if (complete) for (const cell of regionCells(remaining)) {
    const portion = physicalRegion(cell), integral = regionIntegral(portion);
    if (!(integral.area > 0)) continue;
    const c: P2 = [integral.first[0] / integral.area, integral.first[1] / integral.area];
    const distance = (side: Side) => {
      const s = Math.max(0, Math.min(side.len, along(side, c)));
      return Math.hypot(c[0] - side.a[0] - s * side.u[0], c[1] - side.a[1] - s * side.u[1]);
    };
    let nearest = 0;
    all.forEach((side, k) => { if (distance(side) < distance(all[nearest]!)) nearest = k; });
    put(nearest, portion);
  }
  return out;
}


export function oneWayShares(sides: Side[], holes: Side[][], d: P2, q: number, zone?: Zone2D, excluded: P2[][] = [], selection?: PhysicalRegion): SideShare[] | null {
  const all = [...sides, ...holes.flat()];
  const out: SideShare[] = all.map(() => ({ pieces: [], atA: 0, atB: 0, roundoffForce: 0, eccentricFirst: [0, 0] }));
  const n: P2 = [-d[1], d[0]];
  const full = loadedRegion(sides, holes, zone, excluded);
  const region = selection ? intersectRegions(full, selection) : full;
  const ts = [...new Set(all.map(s => dot(n, s.a)))].sort((a, b) => a - b);
  const cells = regionCells(region);
  const point = (s: Side, t: number): P2 => {
    const a = (t - dot(n, s.a)) / dot(s.u, n);
    return [s.a[0] + s.u[0] * a, s.a[1] + s.u[1] * a];
  };
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i]!, t1 = ts[i + 1]!;
    if (!(t1 > t0)) continue;
    const tm = (t0 + t1) / 2;
    const hits = all.flatMap((s, k) => {
      if (dot(s.u, n) === 0) return [];
      const a = (tm - dot(n, s.a)) / dot(s.u, n);
      return a >= 0 && a <= s.len ? [{ k, r: dot(d, point(s, tm)) }] : [];
    }).sort((a, b) => a.r - b.r);
    for (let j = 0; j + 1 < hits.length; j += 2) {
      const near = all[hits[j]!.k]!, far = all[hits[j + 1]!.k]!;
      for (const cell of cells) {
        let piece = clipExact(cell, p => t0 - dot(n, p));
        piece = clipExact(piece, p => dot(n, p) - t1);
        piece = clipExact(piece, p => -dist(near, p));
        piece = clipExact(piece, p => -dist(far, p));
        const strip = physicalRegion(piece);
        for (const k of [hits[j]!.k, hits[j + 1]!.k]) {
          const sh = transferRegionToSide(all[k]!, strip, q / 2, d);
          out[k]!.pieces.push(...sh.pieces);
          out[k]!.atA += sh.atA; out[k]!.atB += sh.atB; out[k]!.roundoffForce += sh.roundoffForce;
          out[k]!.eccentricFirst[0] += sh.eccentricFirst[0];
          out[k]!.eccentricFirst[1] += sh.eccentricFirst[1];
        }
      }
    }
  }
  return out;
}

export function isConvex(p: P2[]): boolean {
  if (p.length < 3) return false;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!, c = p[(i + 2) % p.length]!;
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -1e-9) return false;
  }
  return true;
}

export { signedArea };

const regionBrand: unique symbol = Symbol('physical region');
export interface PhysicalRegion { readonly [regionBrand]: true; readonly polygons: MultiPolygon }
function polygonOperation(fast: () => MultiPolygon, operation: () => MultiPolygon): MultiPolygon {
  try { return fast(); } catch {}
  const previous = BigNumber.config();
  BigNumber.config({ DECIMAL_PLACES: 80 });
  try { return operation(); } finally { BigNumber.config(previous); }
}
const regionOf = (polygons: MultiPolygon): PhysicalRegion => ({ [regionBrand]: true, polygons });

export function physicalRegion(outer: P2[], holes: P2[][] = []): PhysicalRegion {
  if (outer.length < 3 || signedArea(outer) === 0) return regionOf([]);
  const base = regionOf([[outer]]);
  return subtractRegions(base, unionRegions(holes.map(h => physicalRegion(h))));
}

export function unionRegions(regions: readonly PhysicalRegion[]): PhysicalRegion {
  const nonempty = regions.filter(r => r.polygons.length);
  if (!nonempty.length) return regionOf([]);
  return regionOf(polygonOperation(() => fastClipping.union(nonempty[0]!.polygons, ...nonempty.slice(1).map(r => r.polygons)), () => polygonClipping.union(nonempty[0]!.polygons, ...nonempty.slice(1).map(r => r.polygons))));
}

export function intersectRegions(a: PhysicalRegion, b: PhysicalRegion): PhysicalRegion {
  return regionOf(a.polygons.length && b.polygons.length ? polygonOperation(() => fastClipping.intersection(a.polygons, b.polygons), () => polygonClipping.intersection(a.polygons, b.polygons)) : []);
}

export function subtractRegions(a: PhysicalRegion, b: PhysicalRegion): PhysicalRegion {
  return regionOf(a.polygons.length && b.polygons.length ? polygonOperation(() => fastClipping.difference(a.polygons, b.polygons), () => polygonClipping.difference(a.polygons, b.polygons)) : a.polygons);
}

export function regionIntegral(region: PhysicalRegion): { area: number; first: P2 } {
  const origin = region.polygons[0]?.[0]?.[0];
  if (!origin) return { area: 0, first: [0, 0] };
  let area = 0, x = 0, y = 0;
  for (const polygon of region.polygons) for (const [k, ring] of polygon.entries()) {
    let a = 0, sx = 0, sy = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!, r = ring[(i + 1) % ring.length]!;
      const px = p[0] - origin[0], py = p[1] - origin[1], rx = r[0] - origin[0], ry = r[1] - origin[1];
      const cross = px * ry - rx * py;
      a += cross / 2; sx += (px + rx) * cross / 6; sy += (py + ry) * cross / 6;
    }
    const sign = (k === 0 ? 1 : -1) * Math.sign(a);
    area += sign * a; x += sign * sx; y += sign * sy;
  }
  return { area, first: [x + origin[0] * area, y + origin[1] * area] };
}

function loadedRegion(sides: Side[], holes: Side[][], zone: Zone2D | undefined, excluded: P2[][]): PhysicalRegion {
  let r = physicalRegion(sides.map(s => s.a), holes.map(h => h.map(s => s.a)));
  if (zone) r = intersectRegions(r, physicalRegion(zone.outer, zone.holes));
  return subtractRegions(r, unionRegions(excluded.map(p => physicalRegion(p))));
}

export function transferRegionToSide(e: Side, region: PhysicalRegion, q: number, direction: P2 = e.n): SideShare {
  const ratio = dot(direction, e.u) / dot(direction, e.n);
  const local = (p: P2): P2 => [along(e, p) - dist(e, p) * ratio, dist(e, p)];
  const rings = region.polygons.map(poly => poly.map(ring => ring.map(local)));
  const stations = [...new Set([0, e.len, ...rings.flat(2).map(p => p[0])].map(s => Math.round(s * 1e9) / 1e9))].sort((a, b) => a - b);
  const chord = (s: number, interior: number) => {
    let total = 0;
    for (const poly of rings) for (const [k, ring] of poly.entries()) {
      const edges: Array<{ at: (x: number) => number }> = [];
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        if ((a[0] <= interior) !== (b[0] <= interior)) edges.push({ at: x => a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]) });
      });
      edges.sort((a, b) => a.at(interior) - b.at(interior));
      for (let i = 0; i + 1 < edges.length; i += 2) total += (k === 0 ? 1 : -1) * (edges[i + 1]!.at(s) - edges[i]!.at(s));
    }
    return total;
  };
  const target = regionIntegral(region);
  const out: SideShare = { pieces: [], atA: 0, atB: 0, roundoffForce: 0, eccentricFirst: [q * target.first[0], q * target.first[1]] };
  let force = 0, first = 0;
  for (let i = 0; i + 1 < stations.length; i++) {
    const s0 = stations[i]!, s1 = stations[i + 1]!, h = s1 - s0;
    if (!(h > 0)) continue;
    const c1 = chord(s0 + h / 3, s0 + h / 3), c2 = chord(s0 + 2 * h / 3, s0 + 2 * h / 3);
    const q0 = q * (2 * c1 - c2), q1 = q * (2 * c2 - c1);
    if (q0 === 0 && q1 === 0) continue;
    const f = (q0 + q1) * h / 2;
    force += f;
    if (s1 <= 1e-9) out.atA += f;
    else if (s0 >= e.len - 1e-9) { out.atB += f; first += f * e.len; }
    else { out.pieces.push({ s0, s1, q0, q1 }); first += s0 * f + h * h * (q0 + 2 * q1) / 6; }
  }
  out.roundoffForce = q * target.area - force;
  force += out.roundoffForce;
  out.eccentricFirst[0] -= e.a[0] * force + e.u[0] * first;
  out.eccentricFirst[1] -= e.a[1] * force + e.u[1] * first;
  return out;
}

export function regionCells(region: PhysicalRegion): P2[][] {
  const cells: P2[][] = [];
  for (const polygon of region.polygons) {
    const xs = [...new Set(polygon.flat().map(p => p[0]))].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k++) {
      const lo = xs[k]!, hi = xs[k + 1]!, mid = (lo + hi) / 2;
      const edges: Array<(x: number) => number> = [];
      for (const ring of polygon) ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        if ((a[0] <= mid) !== (b[0] <= mid)) edges.push(x => a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
      });
      edges.sort((a, b) => a(mid) - b(mid));
      for (let j = 0; j + 1 < edges.length; j += 2) {
        const a = edges[j]!, b = edges[j + 1]!;
        cells.push([[lo, a(lo)], [hi, a(hi)], [hi, b(hi)], [lo, b(lo)]]);
      }
    }
  }
  return cells;
}

function clipExact(poly: P2[], g: (p: P2) => number): P2[] {
  const out: P2[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!, a = g(p), b = g(q);
    if (a <= 0) out.push(p);
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      const t = a / (a - b);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  });
  return out;
}

export function transferRegionToCarriers(model: { nodes: Map<number, { x: number; y: number }>; elements: Map<number, { nodeI: number; nodeJ: number }> }, region: PhysicalRegion, ids: number[]) {
  const pieces: Array<{ elementId: number; a: number; b: number; wI: number; wJ: number }> = [];
  const points: Array<{ nodeId: number; w: number; elementId: number }> = [];
  const couples: Array<{ nodeId: number; w: number; mx: number; my: number; elementId: number }> = [];
  const carriers = ids.flatMap(id => {
    const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return length > 0 ? [{ id, e, a, b, length }] : [];
  });
  if (!carriers.length && region.polygons.length) throw new Error('Physical load region has no carrier');
  for (const cell of regionCells(region)) {
    const { area, first } = regionIntegral(physicalRegion(cell));
    if (!(area > 0)) continue;
    const x = first[0] / area, y = first[1] / area;
    const candidates = carriers.map(c => {
      const s = Math.max(0, Math.min(c.length, ((x - c.a.x) * (c.b.x - c.a.x) + (y - c.a.y) * (c.b.y - c.a.y)) / c.length));
      const px = c.a.x + (c.b.x - c.a.x) * s / c.length, py = c.a.y + (c.b.y - c.a.y) * s / c.length;
      return { ...c, s, px, py, distance: Math.hypot(x - px, y - py) };
    }).sort((a, b) => a.distance - b.distance);
    const nearest = candidates.filter(c => c.distance === candidates[0]!.distance);
    for (const c of nearest) {
      const share = area / nearest.length, half = Math.min(c.s, c.length - c.s);
      let px = c.px, py = c.py;
      if (half > 0) pieces.push({ elementId: c.id, a: c.s - half, b: c.s + half, wI: share / (2 * half), wJ: share / (2 * half) });
      else {
        const nodeId = c.s === 0 ? c.e.nodeI : c.e.nodeJ, p = model.nodes.get(nodeId)!;
        points.push({ nodeId, elementId: c.id, w: share }); px = p.x; py = p.y;
      }
      couples.push({ nodeId: c.e.nodeI, elementId: c.id, w: 0, mx: -(first[1] / nearest.length - share * py), my: first[0] / nearest.length - share * px });
    }
  }
  return { pieces, points, couples };
}

export function sameCarrierPlane(a: Array<[number, number, number]>, b: Array<[number, number, number]>): boolean {
  const origin = a[0];
  if (!origin) return false;
  let normal: [number, number, number] = [0, 0, 0], scale = 0;
  for (let i = 1; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const u = a[i]!.map((x, k) => x - origin[k]!), v = a[j]!.map((x, k) => x - origin[k]!);
    const n: [number, number, number] = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const length = Math.hypot(...n);
    if (length > scale) { scale = length; normal = n; }
  }
  if (!(scale > 0)) return false;
  return [...a, ...b].every(p => {
    let value = 0, error = 0;
    normal.forEach((n, k) => { value += n * (p[k]! - origin[k]!); error += Math.abs(n) * (Math.abs(p[k]!) + Math.abs(origin[k]!)); });
    return Math.abs(value) <= 64 * Number.EPSILON * error;
  });
}
