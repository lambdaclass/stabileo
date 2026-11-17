import { coalesceQuadraticProfile } from '../member-moments';
import { linearProfile } from '../linear-profile';
import fastClipping from 'polygon-clipping';
import BigNumber from 'bignumber.js';
import * as polygonClipping from 'polyclip-ts';
type MultiPolygon = Array<Array<Array<[number, number]>>>;
import { type P2 } from './floor-skeleton';

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
  moments: Array<{ s0: number; s1: number; first: [P2, P2, P2] }>;
  pieces: Piece[];

}

const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const along = (e: Side, p: P2) => (p[0] - e.a[0]) * e.u[0] + (p[1] - e.a[1]) * e.u[1];
const dist = (e: Side, p: P2) => (p[0] - e.a[0]) * e.n[0] + (p[1] - e.a[1]) * e.n[1];

export function positionallyCollinear(a: P2, b: P2, c: P2, d: P2): boolean {
  const len = Math.hypot(b[0]-a[0],b[1]-a[1]), otherLen = Math.hypot(d[0]-c[0],d[1]-c[1]);
  if (!(len > 0 && otherLen > 0)) return false;
  const tolerance = 64*Number.EPSILON*Math.max(1,len,otherLen);
  const distance = (a: P2,b: P2,p: P2,length: number) => Math.abs((p[0]-a[0])*(a[1]-b[1])+(p[1]-a[1])*(b[0]-a[0]))/length;
  return len >= otherLen ? [c,d].every(p => distance(a,b,p,len) <= tolerance) : [a,b].every(p => distance(c,d,p,otherLen) <= tolerance);
}

function signedArea(p: readonly P2[]): number {
  let a = 0;
  const origin = p[0];
  if (!origin) return 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]!; a += (p[i]![0] - origin[0]) * (q[1] - origin[1]) - (q[0] - origin[0]) * (p[i]![1] - origin[1]); }
  return a / 2;
}


export function twoWayShares(sides: Side[], holes: Side[][], q: number, zone?: Zone2D, excluded: P2[][] = [], selection?: PhysicalRegion): SideShare[] | null {
  const all = [...sides, ...holes.flat()];
  const full = loadedRegion(sides, holes, zone, excluded);
  return partitionRegionToSides(all, selection ? intersectRegions(full, selection) : full).map((owned, k) => transferRegionToSide(all[k]!, owned, q));
}


export function oneWayShares(sides: Side[], holes: Side[][], d: P2, q: number, zone?: Zone2D, excluded: P2[][] = [], selection?: PhysicalRegion): SideShare[] | null {
  const all = [...sides, ...holes.flat()];
  const out: SideShare[] = all.map(() => ({ moments: [], pieces: [] }));
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
          const middle0 = point(near, t0), middle1 = point(far, t0), middle2 = point(near, t1), middle3 = point(far, t1);
          const m0: P2 = [(middle0[0]+middle1[0])/2,(middle0[1]+middle1[1])/2], m1: P2 = [(middle2[0]+middle3[0])/2,(middle2[1]+middle3[1])/2];
          const sign = k === hits[j]!.k ? 1 : -1;
          const halfway = (p: P2) => sign * ((m1[0]-m0[0])*(p[1]-m0[1])-(m1[1]-m0[1])*(p[0]-m0[0]));
          const sideSign = halfway(point(all[k]!, tm)) <= 0 ? 1 : -1;
          const half = unionRegions(regionCells(strip).map(cell => physicalRegion(clipExact(cell, p => sideSign * halfway(p)))));
          const sh = transferRegionToSide(all[k]!, half, q, d);
          out[k]!.moments.push(...sh.moments); out[k]!.pieces.push(...sh.pieces);
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

function coalesceMomentProfile(pieces: SideShare['moments']): SideShare['moments'] {
  return coalesceQuadraticProfile(pieces.map(p => ({ a: p.s0, b: p.s1, values: [0, 1].map(k => p.first.map(v => v[k]!) as [number, number, number]) })))
    .map(p => ({ s0: p.a, s1: p.b, first: [0, 1, 2].map(k => [p.values[0]![k]!, p.values[1]![k]!]) as [P2, P2, P2] }));
}

export function transferRegionToSide(e: Side, region: PhysicalRegion, q: number, direction: P2 = e.n): SideShare {
  const ratio = dot(direction, e.u) / dot(direction, e.n);
  const local = (p: P2): P2 => {
    const s=along(e,p)-dist(e,p)*ratio;
    const roundoff=64*Number.EPSILON*(Math.abs(p[0])+Math.abs(p[1])+Math.abs(e.a[0])+Math.abs(e.a[1])+e.len)*(1+Math.abs(ratio));
    if(s < -roundoff || s > e.len+roundoff) throw new Error('Physical load projects beyond its carrier member');
    return [Math.max(0,Math.min(e.len,s)),dist(e,p)];
  };
  const rings = region.polygons.map(poly => poly.map(ring => ring.map(local)));
  const stations = [...new Set([0, e.len, ...rings.flat(2).map(p => p[0])])].sort((a, b) => a - b);
  const chord = (lo: number, hi: number) => {
    const pairs: Array<{ lower: (x: number) => number; upper: (x: number) => number; sign: number }> = [];
    for (const poly of rings) for (const [k, ring] of poly.entries()) {
      const edges: Array<{ at: (x: number) => number }> = [];
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        if (Math.min(a[0],b[0]) <= lo && Math.max(a[0],b[0]) >= hi && a[0] !== b[0]) edges.push({ at: x => a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]) });
      });
      edges.sort((a, b) => (a.at(lo)+a.at(hi)) - (b.at(lo)+b.at(hi)));
      for (let i = 0; i + 1 < edges.length; i += 2) pairs.push({ lower: edges[i]!.at, upper: edges[i + 1]!.at, sign: k === 0 ? 1 : -1 });
    }
    return (s: number) => {
      let total = 0, moment = 0;
      for (const { lower, upper, sign } of pairs) {
        const lo = lower(s), hi = upper(s);
        total += sign * (hi - lo); moment += sign * (hi * hi - lo * lo) / 2;
      }
      return { total, moment };
    };
  };
  const out: SideShare = { moments: [], pieces: [] };
  for (let i = 0; i + 1 < stations.length; i++) {
    const s0 = stations[i]!, s1 = stations[i + 1]!, h = s1 - s0;
    if (!(h > 0)) continue;
    const at = chord(s0, s1), start = at(s0), end = at(s1);
    const q0 = q * start.total, q1 = q * end.total;
    if (q0 === 0 && q1 === 0) continue;
    {
      out.pieces.push({ s0, s1, q0, q1 });
      const momentAt = (moment: number): P2 => {
        const v = q * moment;
        return [v * (e.n[0] + ratio * e.u[0]), v * (e.n[1] + ratio * e.u[1])];
      };
      out.moments.push({ s0, s1, first: [momentAt(start.moment), momentAt(at((s0 + s1) / 2).moment), momentAt(end.moment)] });
    }
  }
  out.moments=coalesceMomentProfile(out.moments);
  out.pieces=linearProfile(out.pieces.map(p=>({a:p.s0,b:p.s1,qa:p.q0,qb:p.q1}))).map(p=>({s0:p.a,s1:p.b,q0:p.qa,q1:p.qb}));
  return out;
}

export function regionCells(region: PhysicalRegion): P2[][] {
  const cells: P2[][] = [];
  for (const polygon of region.polygons) {
    const xs = [...new Set(polygon.flat().map(p => p[0]))].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k++) {
      const lo = xs[k]!, hi = xs[k + 1]!;
      const edges: Array<(x: number) => number> = [];
      for (const ring of polygon) ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        if (Math.min(a[0],b[0]) <= lo && Math.max(a[0],b[0]) >= hi && a[0] !== b[0]) edges.push(x => a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
      });
      edges.sort((a, b) => (a(lo)+a(hi)) - (b(lo)+b(hi)));
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

function convexRing(region: PhysicalRegion): P2[] | null {
  if (region.polygons.length !== 1 || region.polygons[0]!.length !== 1) return null;
  let ring=region.polygons[0]![0]!;
  if (signedArea(ring)<0) ring=[...ring].reverse();
  return ring.every((a,i) => { const b=ring[(i+1)%ring.length]!,c=ring[(i+2)%ring.length]!; return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]) >= 0; }) ? ring : null;
}

function clipRegion(region: PhysicalRegion, g: (p: P2) => number): PhysicalRegion {
  const convex = convexRing(region);
  if (convex) return physicalRegion(clipExact(convex,g));
  return unionRegions(regionCells(region).map(cell => physicalRegion(clipExact(cell,g))));
}

function projectionStrip(region: PhysicalRegion, side: Side): PhysicalRegion {
  return clipRegion(clipRegion(region, p => -along(side,p)), p => along(side,p)-side.len);
}

function partitionRegionToSides(sides: Side[], region: PhysicalRegion): PhysicalRegion[] {
  const out = partitionRegionToSidesUnchecked(sides,region);
  const integral = regionIntegral(region), shares = out.map(regionIntegral);
  const expected = integral.area,actual = shares.reduce((sum,r) => sum+r.area,0);
  const coordinateError = 64*Number.EPSILON*region.polygons.flat().reduce((sum,ring) => sum+ring.reduce((perimeter,p,i) => { const next=ring[(i+1)%ring.length]!; return perimeter+Math.hypot(next[0]-p[0],next[1]-p[1])*Math.max(Math.abs(p[0]),Math.abs(p[1]),Math.abs(next[0]),Math.abs(next[1])); },0),0);
  if (Math.abs(expected-actual) > coordinateError+256*Number.EPSILON*Math.max(expected,actual)*Math.max(1,out.length)) throw new Error(`Incomplete physical carrier partition: ${JSON.stringify({expected,actual,sides:sides.map(s=>[s.a,s.b]),region:region.polygons})}`);
  for (const axis of [0,1] as const) {
    const actualFirst = shares.reduce((sum,r) => sum+r.first[axis],0);
    const scale = Math.max(1,...region.polygons.flat(2).map(p => Math.abs(p[axis])));
    if (Math.abs(integral.first[axis]-actualFirst) > (coordinateError+256*Number.EPSILON*Math.max(expected,actual)*Math.max(1,out.length))*scale) throw new Error('Incomplete physical carrier partition first moments');
  }
  return out;
}

function distanceDifference(side: Side, sign: number, other: Side, otherSign: number): (p: P2) => number {
  const shared = [side.a,side.b].find(p => [other.a,other.b].some(q => p[0] === q[0] && p[1] === q[1]));
  const origin = shared ?? side.a;
  const offset = shared ? 0 : -otherSign*dist(other,origin);
  let normal: P2 = [sign*side.n[0]-otherSign*other.n[0],sign*side.n[1]-otherSign*other.n[1]];
  if (shared && sign*otherSign*dot(side.u,other.u) > 0) {
    const dx = new BigNumber(side.b[0]).minus(side.a[0]), dy = new BigNumber(side.b[1]).minus(side.a[1]);
    const ox = new BigNumber(other.b[0]).minus(other.a[0]), oy = new BigNumber(other.b[1]).minus(other.a[1]);
    const orientation = dx.times(oy).minus(dy.times(ox)).comparedTo(0)!*sign*otherSign;
    normal = [orientation*(sign*side.u[0]+otherSign*other.u[0]),orientation*(sign*side.u[1]+otherSign*other.u[1])];
  }
  return p => (p[0]-origin[0])*normal[0]+(p[1]-origin[1])*normal[1]+offset;
}

function partitionRegionToSidesUnchecked(sides: Side[], region: PhysicalRegion): PhysicalRegion[] {
  const groups: Array<{ side: Side; members: number[] }> = [];
  for (const [k,side] of sides.entries()) {
    const group = groups.find(g => positionallyCollinear(g.side.a,g.side.b,side.a,side.b));
    if (!group) { groups.push({ side: { ...side }, members: [k] }); continue; }
    const endpoints = [group.side.a,group.side.b,side.a,side.b].sort((a,b) => along(group.side,a)-along(group.side,b));
    const a = endpoints[0]!, b = endpoints[endpoints.length-1]!;
    const len = Math.hypot(b[0]-a[0],b[1]-a[1]), u: P2 = [(b[0]-a[0])/len,(b[1]-a[1])/len];
    group.side = { ...group.side, a, b, u, n: [-u[1],u[0]], len };
    group.members.push(k);
  }
  const intervals = groups.map(({ side, members }) => {
    const sorted = members.map(i => [along(side, sides[i]!.a), along(side, sides[i]!.b)].sort((a,b) => a-b)).sort((a,b) => a[0]!-b[0]!);
    const union: Array<[number, number]> = [];
    for (const span of sorted) {
      const last = union.at(-1);
      if (last && span[0]! <= last[1]) last[1] = Math.max(last[1], span[1]!);
      else union.push([span[0]!, span[1]!]);
    }
    return union;
  });
  if (groups.length === 1) return sides.map(side => projectionStrip(region,side));
  const points = sides.flatMap(s => [s.a,s.b]).sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const cross = (a: P2,b: P2,c: P2) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const hull: P2[] = [];
  for (const point of points) { while (hull.length >= 2 && cross(hull[hull.length-2]!,hull[hull.length-1]!,point) <= 0) hull.pop(); hull.push(point); }
  const lower = hull.length;
  for (const point of points.slice(0,-1).reverse()) { while (hull.length > lower && cross(hull[hull.length-2]!,hull[hull.length-1]!,point) <= 0) hull.pop(); hull.push(point); }
  hull.pop();
  const signs = groups.map(({side}) => Math.sign(hull.reduce((sum,p) => sum+dist(side,p),0)));
  const compatible = groups.every(({side},k) => {
    if (intervals[k]!.length !== 1) return false;
    const dx = new BigNumber(side.b[0]).minus(side.a[0]), dy = new BigNumber(side.b[1]).minus(side.a[1]);
    const inside = (p: P2) => signs[k]!*dx.times(new BigNumber(p[1]).minus(side.a[1])).minus(dy.times(new BigNumber(p[0]).minus(side.a[0]))).comparedTo(0)! >= 0;
    return signs[k] !== 0 && hull.every(inside) && region.polygons.flat(2).every(inside);
  });
  const cells=regionCells(region);
  const out: P2[][][] = sides.map(() => []);
  groups.forEach(({side,members},k) => {
    const owned: P2[][]=[];
    if (compatible) {
      for (const cell of cells) {
        let part=cell;
        groups.forEach((other,j) => { if(j!==k) part=clipExact(part,distanceDifference(side,signs[k]!,other.side,signs[j]!)); });
        if(part.length>=3) owned.push(part);
      }
    } else for(const sign of [-1,1]) {
      let parts=intervals[k]!.flatMap(([lo,hi])=>cells.map(cell=>clipExact(clipExact(clipExact(cell,p=>lo-along(side,p)),p=>along(side,p)-hi),p=>-sign*dist(side,p)))).filter(p=>p.length>=3);
      for(const [j,other] of groups.entries()) {
        if(j===k) continue;
        for (const [lo,hi] of intervals[j]!) parts=parts.flatMap(part=>{
          const outside=[clipExact(part,p=>along(other.side,p)-lo),clipExact(part,p=>hi-along(other.side,p))];
          const eligible=clipExact(clipExact(part,p=>lo-along(other.side,p)),p=>along(other.side,p)-hi);
          const inside=[-1,1].map(s=>clipExact(clipExact(eligible,p=>-s*dist(other.side,p)),distanceDifference(side,sign,other.side,s)));
          return [...outside,...inside].filter(p=>p.length>=3);
        });
      }
      owned.push(...parts);
    }
    for(const i of members) for(const cell of owned) {
      const part=clipExact(clipExact(cell,p=>-along(sides[i]!,p)),p=>along(sides[i]!,p)-sides[i]!.len);
      if(part.length>=3 && signedArea(part)!==0) out[i]!.push(part);
    }
  });
  return out.map(parts=>regionOf(parts.map(part=>[part])));
}

export function transferRegionToCarriers(model: { nodes: Map<number, { x: number; y: number }>; elements: Map<number, { nodeI: number; nodeJ: number }> }, region: PhysicalRegion, ids: number[]) {
  const pieces: Array<{ elementId: number; a: number; b: number; wI: number; wJ: number }> = [];
  const points: Array<{ nodeId: number; w: number; elementId: number }> = [];
  const couples: Array<{ nodeId: number; w: number; mx: number; my: number; elementId: number }> = [];
  const moments: Array<{ elementId: number; a: number; b: number; first: [P2, P2, P2] }> = [];
  const carriers = ids.map(id => {
    const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > 0)) throw new Error('Physical load region has a zero-length carrier');
    const u: P2 = [(b.x - a.x) / len, (b.y - a.y) / len];
    const side: Side = { a: [a.x, a.y], b: [b.x, b.y], u, n: [-u[1], u[0]], len, nodeA: e.nodeI, nodeB: e.nodeJ, segments: [{ elementId: id, s0: 0, s1: len, forward: true }] };
    const length = Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2);
    return { id, side, length };
  });
  if (!carriers.length && region.polygons.length) throw new Error('Physical load region has no carrier');
  const owned = partitionRegionToSides(carriers.map(c => c.side), region);
  for (const [k,c] of carriers.entries()) {
    const share = transferRegionToSide(c.side, owned[k]!, 1);
    pieces.push(...share.pieces.map(p => ({ elementId: c.id, a: p.s0, b: p.s1, wI: p.q0, wJ: p.q1 })));
    const station = (s: number) => s === 0 ? 0 : s === c.side.len ? c.length : c.length === c.side.len ? s : s / c.side.len * c.length;
    const scale = c.side.len / c.length;
    moments.push(...share.moments.map(p => ({ elementId: c.id, a: station(p.s0), b: station(p.s1), first: p.first.map(v => v.map(x => x * scale) as P2) as [P2, P2, P2] })));
  }
  const expected = regionIntegral(region).area;
  const actual = pieces.reduce((s, p) => s + (p.wI + p.wJ) * (p.b - p.a) / 2, 0) + couples.reduce((s, p) => s + p.w, 0);
  if (Math.abs(expected - actual) > 256 * Number.EPSILON * Math.max(expected, actual, 1) * Math.max(1, pieces.length)) throw new Error('Physical load region extends beyond its carrier partition');
  return { pieces, points, couples, moments };
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
