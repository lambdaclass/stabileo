import { agrees, roundoff, Sum } from '../accounting-math';
import { ringArea } from './gravity-shell-partition';
import { MIN_COINCIDENT_ROOF_EDGE_OVERLAP, SNOW_EDGE_COINCIDENCE, STEP_DRIFT_REFUSAL, snowCoordinate, snowEdgeRoundoff, snowRoofComponents, snowRoofEdgePairs, snowRoofSurfaces, snowSegmentCuts, roofSurfaceModel } from './snow-roof-surfaces';
import { gravityLayout, widthSpans, type GravityLayout, type GravityModel } from './plan-gravity';
import { driftShapeMargins, stepDriftMargins, stepDrift, parapetDrift, slidingSnow, REF_DRIFT, REF_DRIFT_ADJACENT, REF_FIG9, REF_PARAPET, REF_SLIDING, type StepDrift } from '../../codes/cirsoc104/drift';
import { EngineMessageError, msg, round, type EngineMessage } from '../../codes/message';
import type { ClauseRef } from '../../codes/regulation';

type P2 = [number, number];

export interface SnowSurchargeLoad {
  elementId: number; q: number; qJ?: number; a?: number; b?: number; frame: 'projected';
}

interface Band { bounded?: boolean; margins: (d: number, t: number) => number[]; distanceBreaks?: number[]; p0: P2; u: P2; len: number; n: P2; on: number[]; p: (d: number, t: number) => number }

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

function edgeInterval(a: P2, b: P2, c: P2, d: P2, tolerance = SNOW_EDGE_COINCIDENCE): [number, number] | undefined {
  const delta = sub(b, a), len = Math.hypot(...delta);
  if (len < 1e-9) return;
  const u: P2 = [delta[0] / len, delta[1] / len], n: P2 = [-u[1], u[0]];
  if (Math.abs(dot(sub(c, a), n)) > tolerance || Math.abs(dot(sub(d, a), n)) > tolerance) return;
  const tc = dot(sub(c, a), u), td = dot(sub(d, a), u);
  const lo = Math.max(0, Math.min(tc, td)), hi = Math.min(len, Math.max(tc, td));
  return hi - lo > 1e-9 ? [lo, hi] : undefined;
}

function joined(A: P2[], B: P2[], continuous: (a: P2, b: P2) => boolean): boolean {
  return A.some((a, e) => {
    const b = A[(e + 1) % A.length]!, delta = sub(b, a), len = Math.hypot(...delta);
    const point = (t: number): P2 => [a[0] + t * delta[0] / len, a[1] + t * delta[1] / len];
    return B.some((c, f) => {
      const d = B[(f + 1) % B.length]!;
      const error = snowEdgeRoundoff(a, b, c, d);
      const interval = edgeInterval(a, b, c, d, error);
      return interval && interval[1] - interval[0] > MIN_COINCIDENT_ROOF_EDGE_OVERLAP
        && continuous(point(interval[0]), point(interval[1]));
    });
  });
}

function surcharge(bands: Band[], pt: P2, on: (panel: number) => boolean): number {
  let s = 0;
  for (const b of bands) {
    const t = snowCoordinate(pt, b.p0, b.u, [0, b.len]), d = snowCoordinate(pt, b.p0, b.n, b.distanceBreaks);
    const along = b.bounded ? dot(sub(pt, b.p0), b.u) : t;
    const allowance = b.bounded ? 0 : 1e-6;
    if (along < -allowance || along > b.len + allowance || d < -1e-6) continue;
    if (!b.on.some(on)) continue;
    s += b.p(d, t);
  }
  return s;
}

export interface DriftInputs {
  pg: number;
  balanced: number | ((panel: number, point: P2) => number);
  balancedConstantOnPlanes?: boolean;
  pf: number;
  pfFor?: (slope: number, W: number) => number;
  slippery: boolean;
  tributaryWidth: number;
  receivers?: ReadonlySet<number>;
  parapet?: { height: number };
  adjacent?: Array<{ side: '+x' | '-x' | '+y' | '-y'; topZ: number; separation: number; length: number }>;
}

export function snowDriftRefusal(model: GravityModel, layout?: GravityLayout, surfaceModel = roofSurfaceModel(model)): string | undefined {
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
          const d = other.polygon[(f + 1) % other.polygon.length]!;
          const interval = edgeInterval(a, b, c, d);
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

export { STEP_DRIFT_REFUSAL } from './snow-roof-surfaces';

function stepBearingLoads(
  model: GravityModel, layout: GravityLayout, panelIndices: number[], line: ReturnType<typeof lineInto>,
  drift: StepDrift, stationError: number,
): SnowSurchargeLoad[] {
  const fail = (): never => { throw new EngineMessageError(msg(STEP_DRIFT_REFUSAL)); };
  const { p0, u, n, len } = line;
  if (!Number.isFinite(len) || len <= stationError) return fail();
  const same = (a: number, b: number) => Math.abs(a - b) <= stationError;
  const local = (point: P2): P2 => [dot(sub(point, p0), u), dot(sub(point, p0), n)];
  const strips = panelIndices.flatMap(panelIndex => {
    const { polygon, oneWaySpan } = layout.panels[panelIndex]!;
    const rectangle = polygon.map(local);
    const ts = rectangle.map(([t]) => t), ds = rectangle.map(([, d]) => d);
    const lo = Math.min(...ts), hi = Math.max(...ts);
    const base = Math.min(...ds), far = Math.max(...ds);
    const from = Math.max(0, lo), to = Math.min(len, hi);
    const near = same(base, 0) ? 0 : base;
    if (to - from <= stationError || far <= stationError || near >= drift.w) return [];
    const area = (hi - lo) * (far - base);
    if (!oneWaySpan || Math.abs(n[oneWaySpan === 'x' ? 1 : 0]) * len > stationError
      || near < 0 || far - near <= stationError || !agrees(ringArea(rectangle), area, area)
      || rectangle.some(([t, d]) => !same(t, lo) && !same(t, hi) && !same(d, base) && !same(d, far))) return fail();
    return [{ panelIndex, from, to, near, far }];
  }).sort((a, b) => a.near - b.near);

  const profile = (near: number, far: number) => {
    const end = Math.min(far, drift.w), depth = end - near;
    const p0 = drift.pd * ((drift.w - near) / drift.w);
    const p1 = drift.pd * ((drift.w - end) / drift.w);
    return { force: depth * (p0 / 2 + p1 / 2), first: depth ** 2 * (p0 / 6 + p1 / 3) };
  };
  const cuts = [...new Set([0, len, ...strips.flatMap(({ from, to }) => [from, to])])].sort((a, b) => a - b);
  const target = [new Sum(), new Sum(), new Sum()];
  let start = 0;
  for (const end of cuts) {
    if (end - start <= stationError) continue;
    const station = (start + end) / 2;
    let depth = 0;
    for (const strip of strips) {
      if (station <= strip.from || station >= strip.to) continue;
      if (!same(depth, strip.near)) return fail();
      depth = strip.far;
    }
    if (!(depth > 0)) return fail();
    const { force, first } = profile(0, depth);
    target[0]!.add(force * (end - start));
    target[1]!.add(force * (end - start) * station);
    target[2]!.add(first * (end - start));
    start = end;
  }

  const piecesByPanel = new Map<number, GravityLayout['pieces']>();
  for (const piece of layout.pieces) {
    const pieces = piecesByPanel.get(piece.panel) ?? [];
    pieces.push(piece);
    piecesByPanel.set(piece.panel, pieces);
  }
  const rows: SnowSurchargeLoad[] = [];
  const assigned = [new Sum(), new Sum(), new Sum()];
  let elevation: number | undefined;
  for (const strip of strips) {
    const { near, far, from, to, panelIndex } = strip;
    const { force, first } = profile(near, far);
    const farReaction = first / (far - near);
    if (!(farReaction > 0 && force > farReaction)) return fail();
    for (const [side, q] of [[near, force - farReaction], [far, farReaction]] as const) {
      const spans: Array<{ from: number; to: number; row: SnowSurchargeLoad; meanT: number; meanD: number }> = [];
      for (const piece of piecesByPanel.get(panelIndex) ?? []) {
        const member = model.elements.get(piece.elementId);
        const a = member && model.nodes.get(member.nodeI), b = member && model.nodes.get(member.nodeJ);
        if (!member || !a || !b) return fail();
        const [ta, da] = local([a.x, a.y]), [tb, db] = local([b.x, b.y]);
        if (!same(da, side) || !same(db, side)) continue;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (!same(length, Math.abs(tb - ta)) || length <= stationError || (a.z ?? 0) !== (b.z ?? 0)) return fail();
        const tAt = (s: number) => ta + (tb - ta) * s / length;
        const tA = tAt(piece.a ?? 0), tB = tAt(piece.b ?? length);
        const lo = Math.max(from, Math.min(tA, tB)), hi = Math.min(to, Math.max(tA, tB));
        if (hi - lo <= stationError) continue;
        elevation ??= a.z ?? 0;
        if ((a.z ?? 0) !== elevation) return fail();
        const station = (t: number) => Math.min(length, Math.max(0, (t - ta) * length / (tb - ta)));
        const x0 = station(lo), x1 = station(hi);
        const meanT = tAt((x0 + x1) / 2);
        const meanD = da + (db - da) * ((x0 + x1) / 2) / length;
        const row = { elementId: member.id, a: Math.min(x0, x1), b: Math.max(x0, x1), q: -q, frame: 'projected' as const };
        spans.push({ from: lo, to: hi, row, meanT, meanD });
      }
      let end = from;
      for (const span of spans.sort((a, b) => a.from - b.from)) {
        if (!same(span.from, end)) return fail();
        end = span.to;
        const F = q * (span.row.b! - span.row.a!);
        assigned[0]!.add(F);
        assigned[1]!.add(F * span.meanT);
        assigned[2]!.add(F * span.meanD);
        rows.push(span.row);
      }
      if (!same(end, to)) return fail();
    }
  }
  if (target.some(({ value }, k) => !agrees(assigned[k]!.value, value, value))) return fail();
  return rows;
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
  const out: SnowSurchargeLoad[] = [];
  const modelScale = [...model.nodes.values()].reduce((scale, p) => Math.max(scale, Math.abs(p.x), Math.abs(p.y)), 1);
  const stationError = roundoff * modelScale;
  const roofs = snowRoofComponents(layout);
  const roofOf = (start: typeof roofs[number]): typeof roofs => {
    const group = [start];
    for (let i = 0; i < group.length; i++) {
      for (const p of roofs) {
        if (group.some(other => other.k === p.k && other.component === p.component)) continue;
        const current = group[i]!;
        if (joined(current.polygon, p.polygon, (a, b) => surfaceModel.edgeHeights(a, b, layout, current.k, p.k).every(h => Math.abs(h) <= 1e-8))) group.push(p);
      }
    }
    return group;
  };
  const deliverStep = (lower: typeof roofs, line: ReturnType<typeof lineInto>, drift: StepDrift) => {
    const bearings = stepBearingLoads(model, layout, [...new Set(lower.map(panel => panel.k))], line, drift, stationError);
    if (i.receivers && bearings.some(row => !i.receivers!.has(row.elementId))) throw new EngineMessageError(msg(STEP_DRIFT_REFUSAL));
    out.push(...bearings);
  };
  const modeledAdjacent: Array<{ pair: ReturnType<typeof snowRoofEdgePairs>[number]; fetch: number }> = [];
  for (const step of snowRoofEdgePairs(model, layout, surfaces)) {
    const { a, b, lowerComponent: L, upperComponent: U, lowerOutline, above, below, displaced, separation, elevations } = step;
    const line = lineInto(a, b, lowerOutline);
    if (lowerOutline !== L.polygon) {
      line.n = [-line.n[0], -line.n[1]];
    }
    if (separation > 0) line.n = step.inward;
    const reach = (group: typeof roofs, origin: P2, sign: number) =>
      Math.max(0, ...group.flatMap(p => p.polygon.map(v => sign * dot(sub(v, origin), line.n))));
    const lowerRoof = roofOf(L);
    const luUpper = reach(roofOf(U), above(a), -1), luLower = reach(lowerRoof, a, 1);
    if (separation > 0) modeledAdjacent.push({ pair: step, fetch: luUpper });
    const inputs = (pt: P2, height = surfaces(U.k).elevation(above(pt)) - surfaces(L.k).elevation(pt)) => ({
      pg: i.pg, balanced: balanced(L.k, pt), stepHeight: height, luUpper, luLower, separation,
    });
    if (typeof i.balanced !== 'number' && i.balancedConstantOnPlanes !== true) {
      throw new EngineMessageError(msg(STEP_DRIFT_REFUSAL));
    }
    const checkedDrift = (input: ReturnType<typeof inputs>): StepDrift => {
      const dr = stepDrift(input);
      if (![dr.hb, dr.hc, dr.pd, dr.w].every(Number.isFinite)) throw new EngineMessageError(msg(STEP_DRIFT_REFUSAL));
      return dr;
    };
    const ranges = surfaceModel.edgeRanges(a, b, layout, pt => stepDriftMargins(inputs(pt)));
    const samples: P2[] = [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b];
    const upperRanges = displaced ? surfaceModel.edgeRanges(above(a), above(b), layout, pt => stepDriftMargins(inputs(below(pt)))) : [];
    const checks = [
      ...[...ranges.map(range => range.point), ...upperRanges.map(range => below(range.point)), ...samples].map(pt => inputs(pt)),
      ...elevations.map(({ point, lowerZ, upperZ }) => inputs(point, upperZ - lowerZ)),
    ];
    const profiles = checks.map(checkedDrift);
    const first = profiles.find(dr => dr.applies && dr.pd > 0 && dr.w > 0);
    if (first) {
      const heights = displaced ? checks.map(check => check.stepHeight) : surfaceModel.edgeHeights(a, b, layout, U.k, L.k);
      const heightScale = Math.max(Math.abs(U.z), Math.abs(L.z));
      const sameHeight = heights.length > 0 && heights.every(h => agrees(h, heights[0]!, heightScale));
      if (!sameHeight || profiles.some(dr => !dr.applies || dr.pd !== first.pd || dr.w !== first.w)) throw new EngineMessageError(msg(STEP_DRIFT_REFUSAL));
      if ([...lowerRoof, U].some(panel => layout.panels[panel.k]!.footprint)) {
        throw new EngineMessageError(msg(STEP_DRIFT_REFUSAL));
      }
      deliverStep(lowerRoof, line, first);
    }
    for (const pt of samples) {
      const dr = checkedDrift(inputs(pt));
      const derivationKey = separation > 0
        ? (dr.applies ? 'snow.derivation.adjacent' : 'snow.derivation.noAdjacent')
        : (dr.applies ? 'snow.derivation.drift' : 'snow.derivation.noDrift');
      const top = round(surfaces(U.k).elevation(above(pt)), 2);
      const [nx, ny] = line.n;
      const side = Math.abs(nx) >= Math.abs(ny) ? (nx > 0 ? '-X' : '+X') : (ny > 0 ? '-Y' : '+Y');
      derivation.push(msg(derivationKey, {
        z: round(surfaces(L.k).elevation(pt), 2), up: top, top, side, s: round(separation, 3), from: 0, to: round(line.len, 3),
        hb: round(dr.hb, 3), hc: round(dr.hc, 3),
        lee: round(dr.hdLeeward, 3), wind: round(dr.hdWindward, 3), h: round(dr.height, 3), w: round(dr.w, 2), pd: round(dr.pd, 3),
      }));
    }
    const reference = separation > 0 ? REF_DRIFT_ADJACENT : REF_DRIFT;
    if (!refs.includes(reference)) refs.push(reference);
    if (!refs.includes(REF_FIG9)) refs.push(REF_FIG9);
  }
  const insideRing = (pt: P2, poly: P2[]) => {
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
        const edge = lineInto(start, end, L.polygon);
        if (edge.len < 0.1) continue;
        const edgeOut: P2 = [-edge.n[0], -edge.n[1]];
        const adjacent = (i.adjacent ?? []).filter(adj => {
          const want: P2 = adj.side === '+x' ? [1, 0] : adj.side === '-x' ? [-1, 0] : adj.side === '+y' ? [0, 1] : [0, -1];
          return dot(edgeOut, want) >= 0.95;
        });
        const modeled = modeledAdjacent.flatMap(({ pair, fetch }) => {
          if (pair.lowerComponent.k !== L.k || pair.lowerComponent.component !== L.component) return [];
          const interval = edgeInterval(start, end, pair.a, pair.b, snowEdgeRoundoff(start, end, pair.a, pair.b));
          return interval ? [{ pair, fetch, interval }] : [];
        });
        const atEdge = (t: number): P2 => [start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])];
        const outside = ([x, y]: P2): P2 => [x - edge.n[0] * 0.05, y - edge.n[1] * 0.05];
        const covers = roofs.filter(p => p.k !== L.k);
        const cutouts = covers.flatMap(p => p.holes.length ? [p.polygon, ...p.holes] : []);
        const cuts = snowSegmentCuts(outside(start), outside(end), cutouts);
        const ranges = surfaceModel.edgeRanges(start, end, layout, () => []).flatMap(({ from, to }) => {
          const boundaries = [from, ...cuts.filter(t => t > from && t < to), to];
          return boundaries.slice(1).map((end, k) => [boundaries[k]!, end] as const);
        });
        const emit = ([from, to]: readonly [number, number], adj?: NonNullable<DriftInputs['adjacent']>[number], bounded = false) => {
          const a = atEdge(from), b = atEdge(to), edgeStart = from * edge.len;
          const line = lineInto(a, b, L.polygon);
          if (line.len < 1e-9) return;
          const mid = outside(atEdge((from + to) / 2));
          if (covers.some(p => insideRing(mid, p.polygon) && !p.holes.some(hole => insideRing(mid, hole))
            && surfaceModel.edgeHeights(a, b, layout, p.k, L.k).every(h => h >= -0.05))) return;
          const lower = roofOf(L);
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
            if (adj && bounded && (typeof i.balanced === 'number' || i.balancedConstantOnPlanes)
              && lower.every(panel => !layout.panels[panel.k]!.footprint)) {
              const profile = local(a);
              if (profile.applies && profile.pd > 0 && profile.w > 0 && [b, ...ranges.map(range => range.point)].every(pt => {
                const sample = local(pt);
                return sample.applies && sample.pd === profile.pd && sample.w === profile.w;
              })) {
                deliverStep(lower, line, profile);
                return true;
              }
            }
            bands.push({ bounded, margins: (d, t) => [...margins(point(t)), ...driftShapeMargins(local(point(t)), clearHeight(point(t)), d)], p0: a, u: line.u, len: line.len, n: line.n, on: lower.map(p => p.k), p: (d, t) => {
              const dr = local(point(t));
              return dr.applies && d <= dr.w ? dr.pd * (1 - d / dr.w) : 0;
            } });
            return applies;
          };
          if (!adj && i.parapet && i.parapet.height > 0) {
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
          if (adj) {
            const beyond = layout.panels.some((p) => {
              const t = p.polygon.map((v) => dot(sub(v, a), line.u)), o = p.polygon.map((v) => dot(sub(v, a), edgeOut));
              return Math.max(...o) > 0.05 && Math.max(...t) > 0.05 && Math.min(...t) < line.len - 0.05;
            });
            if (beyond) return;
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
        };
        if (i.parapet) for (const range of ranges) emit(range);
        for (const adj of adjacent) {
          const covered = modeled.filter(({ pair, fetch }) =>
            agrees(adj.separation, pair.separation, pair.separation)
            && agrees(adj.length, fetch, fetch)
            && pair.elevations.every(({ upperZ }) => agrees(adj.topZ, upperZ, upperZ)))
            .map(({ interval: [lo, hi] }) => [lo / edge.len, hi / edge.len] as const)
            .sort(([a], [b]) => a - b);
          for (const [from, to] of ranges) {
            let remaining = from;
            for (const [lo, hi] of covered) {
              if (hi <= remaining) continue;
              if (lo >= to) break;
              if (remaining < lo) emit([remaining, lo], adj, true);
              remaining = Math.max(remaining, hi);
            }
            if (remaining < to) emit([remaining, to], adj, covered.length > 0);
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
          on: roofOf(L).map(p => p.k), p: (d, t) => {
            const pt: P2 = [a[0] + (t + t0) * line.u[0], a[1] + (t + t0) * line.u[1]];
            return d <= 4.5 && source.elevation(pt) > surfaces(L.k).elevation(pt) + 1e-8 ? sl.intensity : 0;
          } });
      }
    }
  }
  if (bands.length === 0) return { distributed: out, derivation, refs };
  const ranges = (a: P2, b: P2) => surfaceModel.edgeRanges(a, b, layout, pt => bands.flatMap(band => {
    const t = snowCoordinate(pt, band.p0, band.u, [0, band.len]), d = snowCoordinate(pt, band.p0, band.n, [0, ...(band.distanceBreaks ?? [])]);
    return [t, band.len - t, d, ...band.margins(d, t)];
  }));
  const stations = (a: P2, b: P2) => ranges(a, b).flatMap(r => [r.from, r.to]);
  const insideLimit = (x: number, toward: number) => x + Math.sign(toward - x) * Math.min(Math.abs(toward - x) / 2, stationError);
  const sortedCuts = (xs: number[]) => xs.sort((a, b) => a - b).filter((v, k, all) => k === 0 || v - all[k - 1]! > stationError);
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
