import { snowCoordinate, snowRoofSteps, snowRoofSurfaces, roofSurfaceModel } from './snow-roof-surfaces';
import { gravityLayout, widthSpans, type GravityLayout, type GravityModel } from './plan-gravity';
import { driftShapeMargins, stepDriftMargins, stepDrift, parapetDrift, slidingSnow, REF_DRIFT, REF_DRIFT_ADJACENT, REF_FIG9, REF_PARAPET, REF_SLIDING, type StepDrift } from '../../codes/cirsoc104/drift';
import { msg, round, type EngineMessage } from '../../codes/message';
import type { ClauseRef } from '../../codes/regulation';

type P2 = [number, number];

export interface SnowSurchargeLoad {
  elementId: number; q: number; qJ?: number; a?: number; b?: number; frame: 'projected';
}

interface Band { margins: (d: number, t: number) => number[]; distanceBreaks?: number[]; p0: P2; u: P2; len: number; n: P2; on: number[]; p: (d: number, t: number) => number }

const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const descends = (gradient: P2, normal: P2) => dot(gradient, normal) < -16 * Number.EPSILON * Math.hypot(...gradient);

const centroid = (poly: P2[]): P2 => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];

function nearSeg(p: P2, a: P2, b: P2, tol: number): boolean {
  const d = sub(b, a), L2 = dot(d, d);
  const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * d[0]), p[1] - (a[1] + t * d[1])) <= tol;
}

function lineInto(a: P2, b: P2, poly: P2[]): { p0: P2; u: P2; len: number; n: P2 } {
  const d = sub(b, a), len = Math.hypot(d[0], d[1]);
  const u: P2 = [d[0] / len, d[1] / len];
  let n: P2 = [-u[1], u[0]];
  if (dot(sub(centroid(poly), a), n) < 0) n = [u[1], -u[0]];
  return { p0: a, u, len, n };
}

function within(pt: P2, poly: P2[]): boolean {
  let c = false;
  for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
    if (nearSeg(pt, poly[j]!, poly[k]!, 0.05)) return true;
    const [xi, yi] = poly[k]!, [xj, yj] = poly[j]!;
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function edgeInterval(a: P2, b: P2, c: P2, d: P2): [number, number] | undefined {
  const delta = sub(b, a), len = Math.hypot(...delta);
  if (len < 1e-9) return;
  const u: P2 = [delta[0] / len, delta[1] / len], n: P2 = [-u[1], u[0]];
  if (Math.abs(dot(sub(c, a), n)) > 0.01 || Math.abs(dot(sub(d, a), n)) > 0.01) return;
  const tc = dot(sub(c, a), u), td = dot(sub(d, a), u);
  const lo = Math.max(0, Math.min(tc, td)), hi = Math.min(len, Math.max(tc, td));
  return hi - lo > 1e-9 ? [lo, hi] : undefined;
}

function joined(A: P2[], B: P2[], continuous: (a: P2, b: P2) => boolean): boolean {
  return A.some((a, e) => {
    const b = A[(e + 1) % A.length]!, delta = sub(b, a), len = Math.hypot(...delta);
    const point = (t: number): P2 => [a[0] + t * delta[0] / len, a[1] + t * delta[1] / len];
    return B.some((c, f) => {
      const interval = edgeInterval(a, b, c, B[(f + 1) % B.length]!);
      return interval && interval[1] - interval[0] > 0.1
        && continuous(point(interval[0]), point(interval[1]));
    });
  });
}

function surcharge(bands: Band[], pt: P2, on: (panel: number) => boolean): number {
  let s = 0;
  for (const b of bands) {
    const t = snowCoordinate(pt, b.p0, b.u, [0, b.len]), d = snowCoordinate(pt, b.p0, b.n, b.distanceBreaks);
    if (t < -1e-6 || t > b.len + 1e-6 || d < -1e-6) continue;
    if (!b.on.some(on)) continue;
    s += b.p(d, t);
  }
  return s;
}

export interface DriftInputs {
  pg: number;
  balanced: number | ((panel: number, point: P2) => number);
  pf: number;
  pfFor?: (slope: number, W: number) => number;
  slippery: boolean;
  tributaryWidth: number;
  parapet?: { height: number };
  adjacent?: Array<{ side: '+x' | '-x' | '+y' | '-y'; topZ: number; separation: number; length: number }>;
}

export function snowDriftRefusal(model: GravityModel, layout?: GravityLayout, surfaceModel = roofSurfaceModel(model)): string | undefined {
  if (layout?.widthMembers.some(m=>m.spans?.some(s=>s.widthJ !== undefined && Math.abs(s.widthJ-s.width)>32*Number.EPSILON*(Math.abs(s.widthJ)+Math.abs(s.width))))) return 'snow.refused.roofPlane';
  if (!surfaceModel.resolves(layout)) return 'snow.refused.roofPlane';
  const coverage = layout?.panels.some(p => p.roof) ? layout : gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const coverageResolved = coverage === layout || surfaceModel.resolves(coverage);
  const surfaces = snowRoofSurfaces(model, coverage, surfaceModel);
  for (const [k, panel] of coverage.panels.entries()) {
    if (!panel.roof || !coverageResolved) continue;
    for (const other of coverage.panels.map((p, j) => ({ ...p, j })).filter(p => p.roof && p.j > k)) {
      for (const [e, a] of panel.polygon.entries()) {
        const b = panel.polygon[(e + 1) % panel.polygon.length]!, line = lineInto(a, b, panel.polygon);
        for (const [f, c] of other.polygon.entries()) {
          const interval = edgeInterval(a, b, c, other.polygon[(f + 1) % other.polygon.length]!);
          if (!interval) continue;
          const lo: P2 = [a[0] + interval[0] * line.u[0], a[1] + interval[0] * line.u[1]];
          const hi: P2 = [a[0] + interval[1] * line.u[0], a[1] + interval[1] * line.u[1]];
          const heights = surfaceModel.edgeHeights(lo, hi, coverage, k, other.j);
          if (!heights.length || heights.some(h => !Number.isFinite(h))) return 'snow.refused.roofPlane';
          if (heights.some(h => h > 1e-8) && heights.some(h => h < -1e-8)) return 'snow.refused.roofPlane';
        }
      }
    }
  }
  for (const [k, panel] of coverage.panels.entries()) {
    if (!panel.roof) continue;
    for (const [e, a] of panel.polygon.entries()) {
      const b = panel.polygon[(e + 1) % panel.polygon.length]!, line = lineInto(a, b, panel.polygon);
      for (const source of surfaceModel.planes) {
        if (!descends(source.gradient, line.n)) continue;
        const intervals: Array<[number, number]> = [];
        for (const [f, c] of source.polygon.entries()) {
          const d = source.polygon[(f + 1) % source.polygon.length]!, interval = edgeInterval(a, b, c, d);
          if (!interval) continue;
          if (!coverageResolved) return 'snow.refused.roofPlane';
          const higher = (t: number) => {
            const pt: P2 = [a[0] + t * line.u[0], a[1] + t * line.u[1]];
            return source.elevation(pt) > surfaces(k).elevation(pt) + 1e-8;
          };
          if (!interval.some(higher)) continue;
          if (!nearSeg(c, a, b, 0.01) || !nearSeg(d, a, b, 0.01)) return 'snow.refused.slidingOverlap';
          intervals.push(interval);
        }
        intervals.sort((x, y) => x[0] - y[0]);
        let end = intervals[0]?.[1] ?? 0;
        for (const interval of intervals.slice(1)) {
          if (interval[0] > end) return 'snow.refused.slidingOverlap';
          end = Math.max(end, interval[1]);
        }
        if (intervals.length && (intervals[0]![0] > 1e-9 || line.len - end > 1e-9)) return 'snow.refused.slidingOverlap';
      }
    }
  }
  return undefined;
}

export function driftAndSlidingLoads(model: GravityModel, layout: GravityLayout, i: DriftInputs, surfaceModel = roofSurfaceModel(model)): {
  distributed: SnowSurchargeLoad[]; derivation: EngineMessage[]; refs: ClauseRef[];
} {
  const refused = snowDriftRefusal(model, layout, surfaceModel);
  if (refused) throw new Error(refused);
  const surfaces = snowRoofSurfaces(model, layout, surfaceModel);
  const balanced = (panel: number, pt: P2) => typeof i.balanced === 'number' ? i.balanced : i.balanced(panel, pt);
  const bands: Band[] = [];
  const derivation: EngineMessage[] = [];
  const refs: ClauseRef[] = [];
  const roofs = layout.panels.map((p, k) => ({ ...p, k })).filter((p) => p.roof);
  const roofOf = (k: number): typeof roofs => {
    const start = roofs.find((p) => p.k === k);
    if (!start) return [];
    const group = [start];
    for (let i = 0; i < group.length; i++) {
      for (const p of roofs) {
        if (group.includes(p)) continue;
        const current = group[i]!;
        if (joined(current.polygon, p.polygon, (a, b) => surfaceModel.edgeHeights(a, b, layout, current.k, p.k).every(h => Math.abs(h) <= 1e-8))) group.push(p);
      }
    }
    return group;
  };
  for (const step of snowRoofSteps(model, layout, surfaces)) {
    const L = roofs.find(p => p.k === step.lower)!, U = roofs.find(p => p.k === step.upper)!;
    const { a, b } = step;
    const line = lineInto(a, b, L.polygon);
    const t0 = 0, t1 = line.len;
    const lower = roofOf(L.k);
    const reach = (group: typeof roofs, sign: number) => Math.max(0, ...group.flatMap((p) => p.polygon.map((v) => sign * dot(sub(v, a), line.n))));
    const atStep = (t: number): P2 => [a[0] + line.u[0] * (t0 + t), a[1] + line.u[1] * (t0 + t)];
    const luUpper = reach(roofOf(U.k), -1), luLower = reach(lower, 1);
    const inputs = (t: number) => {
      const pt = atStep(t);
      return { pg: i.pg, balanced: balanced(L.k, pt), stepHeight: surfaces(U.k).elevation(pt) - surfaces(L.k).elevation(pt), luUpper, luLower };
    };
    const local = (t: number): StepDrift => stepDrift(inputs(t));
    const samples = [0, (t1 - t0) / 2, t1 - t0].map(t => ({ t, dr: local(t) }));

    for (const { t, dr } of samples) derivation.push(msg(dr.applies ? 'snow.derivation.drift' : 'snow.derivation.noDrift', {
      z: round(surfaces(L.k).elevation(atStep(t)), 2), up: round(surfaces(U.k).elevation(atStep(t)), 2), hb: round(dr.hb, 3), hc: round(dr.hc, 3),
      lee: round(dr.hdLeeward, 3), wind: round(dr.hdWindward, 3), h: round(dr.height, 3), w: round(dr.w, 2), pd: round(dr.pd, 3),
    }));
    if (refs.length === 0) refs.push(REF_DRIFT, REF_FIG9);
    bands.push({ margins: (d, t) => [...stepDriftMargins(inputs(t)), ...driftShapeMargins(local(t), inputs(t).stepHeight - local(t).hb, d)], p0: atStep(0), u: line.u, len: t1 - t0, n: line.n,
      on: lower.map(p => p.k), p: (d, t) => {
        const dr = local(t);
        return dr.applies && d <= dr.w ? dr.pd * (1 - d / dr.w) : 0;
      } });
  }
  const inside = (pt: P2, poly: P2[]) => {
    let c = false;
    for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
      const [xi, yi] = poly[k]!, [xj, yj] = poly[j]!;
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  if (i.parapet || i.adjacent?.length) {
    for (const L of roofs) {
      for (let e = 0; e < L.polygon.length; e++) {
        const start = L.polygon[e]!, end = L.polygon[(e + 1) % L.polygon.length]!;
        if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.1) continue;
        for (const range of surfaceModel.edgeRanges(start, end, layout, () => [])) {
          const atEdge = (t: number): P2 => [start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])];
          const a = atEdge(range.from), b = atEdge(range.to), edgeStart = range.from * Math.hypot(end[0] - start[0], end[1] - start[1]);
          const line = lineInto(a, b, L.polygon);
          if (line.len < 1e-9) continue;
          const mid: P2 = [a[0] + line.u[0] * line.len / 2 - line.n[0] * 0.05, a[1] + line.u[1] * line.len / 2 - line.n[1] * 0.05];
          if (roofs.some(p => p.k !== L.k && inside(mid, p.polygon) && surfaceModel.edgeHeights(a, b, layout, p.k, L.k).every(h => h >= -0.05))) continue;
          const lower = roofOf(L.k);
          const lu = Math.max(0, ...lower.flatMap((p) => p.polygon.map((v) => dot(sub(v, a), line.n))));
          const point = (t: number): P2 => [a[0] + t * line.u[0], a[1] + t * line.u[1]];
          const reportBand = (local: (pt: P2) => StepDrift, margins: (pt: P2) => number[], clearHeight: (pt: P2) => number, report: (dr: StepDrift, pt: P2, from: number, to: number) => void) => {
            const ranges = surfaceModel.edgeRanges(a, b, layout, margins);
            let applies = false;
            for (const range of ranges) {
              const dr = local(range.point);
              applies ||= dr.applies;
              report(dr, range.point, edgeStart + range.from * line.len, edgeStart + range.to * line.len);
            }
            bands.push({ margins: (d, t) => [...margins(point(t)), ...driftShapeMargins(local(point(t)), clearHeight(point(t)), d)], p0: a, u: line.u, len: line.len, n: line.n, on: lower.map(p => p.k), p: (d, t) => {
              const dr = local(point(t));
              return dr.applies && d <= dr.w ? dr.pd * (1 - d / dr.w) : 0;
            } });
            return applies;
          };
          if (i.parapet && i.parapet.height > 0) {
            const local = (pt: P2) => parapetDrift({ pg: i.pg, balanced: balanced(L.k, pt), parapetHeight: i.parapet!.height, lu });
            const applies = reportBand(local, pt => stepDriftMargins({ pg: i.pg, balanced: balanced(L.k, pt), stepHeight: i.parapet!.height }), pt => i.parapet!.height - local(pt).hb, (dr, pt, from, to) => {
              derivation.push(msg('snow.derivation.edgeInterval', { from: round(from, 3), to: round(to, 3), at: round((from + to) / 2, 3) }));
              derivation.push(msg(dr.applies ? 'snow.derivation.parapet' : 'snow.derivation.noParapet', {
                z: round(surfaces(L.k).elevation(pt), 2), hp: round(i.parapet!.height, 2), lu: round(lu, 2), hb: round(dr.hb, 3), hc: round(dr.hc, 3),
                hd: round(dr.hdWindward, 3), h: round(dr.height, 3), w: round(dr.w, 2), pd: round(dr.pd, 3), from: round(from, 3), to: round(to, 3),
              }));
            });
            if (applies && !refs.includes(REF_PARAPET)) refs.push(REF_PARAPET, REF_FIG9);
          }
          for (const adj of i.adjacent ?? []) {
            const out: P2 = [-line.n[0], -line.n[1]];
            const want: P2 = adj.side === '+x' ? [1, 0] : adj.side === '-x' ? [-1, 0] : adj.side === '+y' ? [0, 1] : [0, -1];
            if (dot(out, want) < 0.95) continue;
            const beyond = layout.panels.some((p) => {
              const t = p.polygon.map((v) => dot(sub(v, a), line.u)), o = p.polygon.map((v) => dot(sub(v, a), out));
              return Math.max(...o) > 0.05 && Math.max(...t) > 0.05 && Math.min(...t) < line.len - 0.05;
            });
            if (beyond) continue;
            const inputs = (pt: P2) => ({ pg: i.pg, balanced: balanced(L.k, pt), stepHeight: adj.topZ - surfaces(L.k).elevation(pt), luUpper: adj.length, luLower: lu, separation: adj.separation });
            const local = (pt: P2) => stepDrift(inputs(pt));
            const applies = reportBand(local, pt => stepDriftMargins(inputs(pt)), pt => inputs(pt).stepHeight - local(pt).hb, (dr, pt, from, to) => {
              derivation.push(msg('snow.derivation.edgeInterval', { from: round(from, 3), to: round(to, 3), at: round((from + to) / 2, 3) }));
              derivation.push(msg(dr.applies ? 'snow.derivation.adjacent' : 'snow.derivation.noAdjacent', {
                z: round(surfaces(L.k).elevation(pt), 2), side: adj.side.toUpperCase(), top: round(adj.topZ, 2), s: round(adj.separation, 2),
                hb: round(dr.hb, 3), hc: round(dr.hc, 3), h: round(dr.height, 3), w: round(dr.w, 2), pd: round(dr.pd, 3), from: round(from, 3), to: round(to, 3),
              }));
            });
            if (applies && !refs.includes(REF_DRIFT_ADJACENT)) refs.push(REF_DRIFT_ADJACENT, REF_FIG9);
          }
        }
      }
    }
  }
  for (const L of roofs) {
    for (let e = 0; e < L.polygon.length; e++) {
      const a = L.polygon[e]!, b = L.polygon[(e + 1) % L.polygon.length]!;
      const line = lineInto(a, b, L.polygon);
      for (const source of surfaceModel.planes) {
        if (!descends(source.gradient, line.n)) continue;
        const eave = surfaceModel.roof.filter(m => source.members.has(m.id)).flatMap(m => {
          const low = (m.a.z ?? 0) <= (m.b.z ?? 0) ? m.a : m.b;
          const pt: P2 = [low.x, low.y];
          return nearSeg(pt, a, b, 0.01) && source.elevation(pt) > surfaces(L.k).elevation(pt) + 1e-8 ? [dot(sub(pt, a), line.u)] : [];
        });
        if (!eave.length) continue;
        const t0 = Math.max(0, Math.min(...eave)), t1 = Math.min(line.len, Math.max(...eave));
        if (t1 - t0 <= 1e-9) continue;
        const W = surfaceModel.sourceWidth(source);
        const sl = slidingSnow({ pf: i.pfFor?.(source.slope, W) ?? i.pf, slopePercent: Math.hypot(...source.gradient) * 100, slippery: i.slippery, W });
        derivation.push(msg(sl.applies ? 'snow.derivation.sliding' : 'snow.derivation.noSliding', {
          z: round(L.z, 2), W: round(W, 2), slope: round(Math.hypot(...source.gradient) * 100, 1), perMetre: round(sl.perMetre, 3), p: round(sl.intensity, 3),
        }));
        if (!sl.applies) continue;
        if (!refs.includes(REF_SLIDING)) refs.push(REF_SLIDING);
        bands.push({ margins: (d, t) => [4.5 - d, source.elevation([a[0] + (t + t0) * line.u[0], a[1] + (t + t0) * line.u[1]]) - surfaces(L.k).elevation([a[0] + (t + t0) * line.u[0], a[1] + (t + t0) * line.u[1]]) - 1e-8], distanceBreaks: [4.5], p0: [a[0] + line.u[0] * t0, a[1] + line.u[1] * t0], u: line.u, len: t1 - t0, n: line.n,
          on: roofOf(L.k).map(p => p.k), p: (d, t) => {
            const pt: P2 = [a[0] + (t + t0) * line.u[0], a[1] + (t + t0) * line.u[1]];
            return d <= 4.5 && source.elevation(pt) > surfaces(L.k).elevation(pt) + 1e-8 ? sl.intensity : 0;
          } });
      }
    }
  }
  if (bands.length === 0) return { distributed: [], derivation, refs };
  const ranges = (a: P2, b: P2) => surfaceModel.edgeRanges(a, b, layout, pt => bands.flatMap(band => {
    const t = snowCoordinate(pt, band.p0, band.u, [0, band.len]), d = snowCoordinate(pt, band.p0, band.n, [0, ...(band.distanceBreaks ?? [])]);
    return [t, band.len - t, d, ...band.margins(d, t)];
  }));
  const stations = (a: P2, b: P2) => ranges(a, b).flatMap(r => [r.from, r.to]);
  const stationError = 128 * Number.EPSILON * [...model.nodes.values()].reduce((scale, p) => Math.max(scale, Math.abs(p.x), Math.abs(p.y)), 1);
  const insideLimit = (x: number, toward: number) => x + Math.sign(toward - x) * Math.min(Math.abs(toward - x) / 2, stationError);
  const sortedCuts = (xs: number[]) => xs.sort((a, b) => a - b).filter((v, k, all) => k === 0 || v - all[k - 1]! > stationError);
  const out: SnowSurchargeLoad[] = [];
  const at = (id: number) => {
    const el = model.elements.get(id)!;
    const a = model.nodes.get(el.nodeI)!, b = model.nodes.get(el.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    return { a, b, L, zAt: (x: number) => (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * x / L, pt: (x: number): P2 => [a.x + ((b.x - a.x) * x) / L, a.y + ((b.y - a.y) * x) / L] };
  };
  for (const p of layout.pieces) {
    if (!p.roof) continue;
    const m = at(p.elementId);
    const c = centroid(layout.panels[p.panel]!.polygon);
    const x0 = p.a ?? 0, x1 = p.b ?? m.L;
    const dir: P2 = [(m.b.x - m.a.x) / Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y), (m.b.y - m.a.y) / Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y)];
    let inward: P2 = [-dir[1], dir[0]];
    if (dot(sub(c, m.pt(x0)), inward) < 0) inward = [dir[1], -dir[0]];
    const q = (x: number) => {
      const dep = p.wI + ((p.wJ - p.wI) * (x - x0)) / Math.max(x1 - x0, 1e-9);
      const s = m.pt(x);
      let sum = 0;
      const point = (f: number): P2 => [s[0] + inward[0] * f, s[1] + inward[1] * f];
      for (const range of ranges(point(0), point(dep))) {
        const lo = dep * range.from, hi = dep * range.to, mid = (lo + hi) / 2;
        const value = (f: number) => surcharge(bands, point(f), panel => panel === p.panel && within(point(f), layout.panels[panel]!.polygon));
        let integral = 0;
        for (let k = 0; k <= 8; k++) {
          const f = k === 0 ? insideLimit(lo, mid) : k === 8 ? insideLimit(hi, mid) : lo + (hi - lo) * k / 8;
          integral += (k === 0 || k === 8 ? 1 : k % 2 ? 4 : 2) * value(f);
        }
        sum += (hi - lo) * integral / 24;
      }
      return sum;
    };
    const cuts = sortedCuts([x0, x1, ...[1, 2, 3].map(k => x0 + (x1 - x0) * k / 4), ...[0, 1].flatMap(f => {
      const point = (x: number): P2 => {
        const pt = m.pt(x), dep = p.wI + (p.wJ - p.wI) * (x - x0) / (x1 - x0);
        return [pt[0] + inward[0] * dep * f, pt[1] + inward[1] * dep * f];
      };
      return stations(point(x0), point(x1)).map(t => x0 + (x1 - x0) * t);
    })]);
    for (let k = 1; k < cuts.length; k++) {
      const xa = cuts[k - 1]!, xb = cuts[k]!, mid = (xa + xb) / 2;
      const qa = q(insideLimit(xa, mid)), qb = q(insideLimit(xb, mid));
      if (qa < 1e-6 && qb < 1e-6) continue;
      out.push({ elementId: p.elementId, q: -qa, qJ: -qb, a: xa, b: xb, frame: 'projected' });
    }
  }
  for (const w of layout.widthMembers) {
    if (!layout.roof.has(w.elementId)) continue;
    const m = at(w.elementId);
    for (const s of widthSpans(w, i.tributaryWidth)) {
      const cuts = sortedCuts([s.t0, ...[1, 2, 3].map(k => k / 4).filter(t => t > s.t0 && t < s.t1), ...stations(m.pt(m.L * s.t0), m.pt(m.L * s.t1)).map(t => s.t0 + (s.t1 - s.t0) * t), s.t1]);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const xa = m.L * cuts[k]!, xb = m.L * cuts[k + 1]!, mid = (xa + xb) / 2;
        const value = (x: number) => surcharge(bands, m.pt(x), panel => within(m.pt(x), layout.panels[panel]!.polygon) && Math.abs(surfaces(panel).elevation(m.pt(x)) - m.zAt(x)) <= 0.05) * s.width;
        const qa = value(insideLimit(xa, mid)), qb = value(insideLimit(xb, mid));
        if (qa < 1e-6 && qb < 1e-6) continue;
        out.push({ elementId: w.elementId, q: -qa, qJ: -qb, a: xa, b: xb, frame: 'projected' });
      }
    }
  }
  return { distributed: out, derivation, refs };
}
