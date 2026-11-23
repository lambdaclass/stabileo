import { slabProvisions } from '../engine/codes/argentina/losas';
import { pressureField } from '../engine/foundation/pressure-field';
import { barArea } from './bars';
import { ASSUMED_FILL_WEIGHT, baseWeight, upliftOf, type UpliftReading, bearingHolds, bearingReading, bearingStrength, beyond, cantileverAcross, ceilTo, centred, edgeFactorOf, r3, footingPunching, serviceBearing, strips, type FootingPlan, type ServiceBearing } from './footing-mechanics';
import { layerAnchorage, meshArea, proposeLayer } from './footing-mesh';
import { needsOf } from './footing-needs';
import { MIN_D, footingSpacing, dowelArea, dowelLap, dowelReach, leverOf, layersOf, minThickness, preferredDiameters, stripReading, type FootingDowelReading, type FootingRowCode } from './footing-design';
import type { FootingAction, FootingAdopted, FootingContext, FootingDemand, FootingDirection, FootingDowels, FootingLayers, FootingMesh } from './footing-types';

const EDITION = '2025' as const;
const STEP = 0.1, STEP_H = 0.05, MAX_PLAN = 15, MAX_H = 2.5;
/** Past each outer column the footing runs on this far from its axis, m, as `presize.ts` does. */
const OVERHANG = 0.5;
/** Beside the columns across the line, m. */
const SIDE = 0.2;

export type Axis = 'x' | 'y';
export interface PlacedColumn { demand: FootingDemand; x: number; y: number; b: number; h: number }

/** The line of a combined footing's columns: the axis they lie farther apart along. */
export const combinedAxis = (d: FootingDemand): Axis => {
  const o = d.carried!;
  return Math.abs(o.at.x - d.at.x) >= Math.abs(o.at.y - d.at.y) ? 'x' : 'y';
};

/** Both columns from the footing's centroid, m. */
export function columnsOf(d: FootingDemand, a: Pick<FootingAdopted, 'ex' | 'ey'>): [PlacedColumn, PlacedColumn] {
  const o = d.carried!;
  return [
    { demand: d, x: -a.ex, y: -a.ey, b: d.column?.b ?? 0, h: d.column?.h ?? 0 },
    { demand: o, x: o.at.x - d.at.x - a.ex, y: o.at.y - d.at.y - a.ey, b: o.column?.b ?? 0, h: o.column?.h ?? 0 },
  ];
}

/** The two columns' actions as one at the centroid: N, and the moments that move the resultant there. */
export function atCentroid(cols: readonly PlacedColumn[], pick: (d: FootingDemand) => FootingAction | null | undefined, lever: number, combo: string): FootingAction {
  let N = 0, my = 0, mx = 0;
  for (const c of cols) {
    const a = pick(c.demand);
    if (!a) continue;
    N += a.N;
    my += a.My + lever * a.Vx + a.N * c.x;
    mx += a.Mx - lever * a.Vy - a.N * c.y;
  }
  return { combo, N, My: my, Mx: mx, Vx: 0, Vy: 0 };
}


export function combinedBearing(d: FootingDemand, a: Pick<FootingAdopted, 'B' | 'L' | 'h' | 'ex' | 'ey'>): ServiceBearing | null {
  if (!d.service || !d.carried?.service) return null;
  const lever = leverOf(d, a.h), cols = columnsOf(d, a);
  return serviceBearing(centred(a), atCentroid(cols, (x) => x.service, lever, 'D + L'), a.h, lever, d.soil?.unitWeight ?? ASSUMED_FILL_WEIGHT);
}

export interface LineReading {
  /** Largest sagging (bottom in tension) anywhere and hogging between the columns' axes along the line, kN·m; where the hogging peaks, m from the centroid. */
  mBottom: number; mTop: number; atTop: number;
  /** One-way shear at d from the columns' faces, kN. */
  vu: number;
  /** The moment along the line at its far end, kN·m: zero when the loads are in equilibrium. */
  closure: number;
}

/**
 * The footing along its columns as a beam on the soil: the soil's strips push up, each column
 * bears down over its width with its moment as a couple at its axis. M(s) is the moment of what
 * lies before the section; positive puts the bottom in tension.
 */
export function lineReading(f: ReturnType<typeof pressureField>, a: Pick<FootingAdopted, 'B' | 'L'>, axis: Axis, cols: ReadonlyArray<PlacedColumn & { N: number; w: number }>, d: number): LineReading {
  const st = strips(f, a, axis);
  const S = axis === 'x' ? a.B : a.L;
  const span = (c: PlacedColumn) => { const s = axis === 'x' ? c.x : c.y, half = (axis === 'x' ? c.b : c.h) / 2; return [s - half, s + half] as const; };
  const at = (s: number) => {
    const soil = beyond(st, s, -1);
    let M = soil.M, V = soil.V;
    for (const c of cols) {
      const [c0, c1] = span(c), axisAt = axis === 'x' ? c.x : c.y;
      const share = c1 - c0 > 1e-9 ? Math.min(1, Math.max(0, (s - c0) / (c1 - c0))) : s >= c0 ? 1 : 0;
      if (share <= 0) continue;
      const lo = c0, hi = Math.min(s, c1);
      M -= c.N * share * (s - (lo + hi) / 2);
      V -= c.N * share;
      if (s > axisAt) M += c.w;
    }
    return { M, V };
  };
  const xs = Array.from({ length: 97 }, (_, i) => -S / 2 + (i * S) / 96);
  for (const c of cols) xs.push(...span(c));
  let mBottom = 0, mTop = 0, atTop = 0;
  const axes = cols.map((c) => (axis === 'x' ? c.x : c.y)), a0 = Math.min(...axes), a1 = Math.max(...axes);
  for (const s of xs) {
    const { M } = at(s);
    if (M > mBottom) mBottom = M;
    if (-M > mTop && s >= a0 - 1e-9 && s <= a1 + 1e-9) { mTop = -M; atTop = s; }
  }
  let vu = 0;
  for (const c of cols) for (const s of [span(c)[0] - d, span(c)[1] + d]) if (Math.abs(s) < S / 2 - 1e-6) vu = Math.max(vu, Math.abs(at(s).V));
  return { mBottom, mTop, atTop, vu, closure: at(S / 2).M };
}

export interface CombinedAnalysis {
  axis: Axis; plan: FootingPlan; lever: number; layers: FootingLayers;
  cols: [PlacedColumn, PlacedColumn];
  bearing: (ServiceBearing & { allowable: number | null; edgeFactor: number; use: number; ok: boolean }) | null;
  /** Bottom bars along the line and across it (as bands under the columns), as directions. */
  along: FootingDirection; across: FootingDirection;
  top: { mu: number; asReq: number; asProvided: number; phiMn: number; anchorage: { ld: number; available: number; hooked: boolean; ok: boolean } };
  bands: Array<{ width: number; mu: number; vu: number; asReq: number; asProvided: number; phiMn: number; phiVc: number }>;
  punching: Array<{ vu: number; phiVc: number; utilization: number; bo: number; position: string; combo: string }>;
  bearingStrength: Array<{ column: number; footing: number; root: number; pu: number }>;
  dowels: Array<(FootingDowelReading & { area: number; required: number }) | null>;
  sMax: number;
  combos: Array<{ combo: string; N: number; mx: number; my: number; qMax: number; ratio: number }>;
  closure: number;
  /** The combination whose columns together pull the footing up the most, with the weight that holds it down. */
  uplift: UpliftReading | null;
}

export function analyseCombined(d: FootingDemand, c: FootingContext, a: FootingAdopted, code: FootingRowCode): CombinedAnalysis {
  const axis = combinedAxis(d), cross: Axis = axis === 'x' ? 'y' : 'x';
  const lever = leverOf(d, a.h), stub = lever - a.h;
  const layers = layersOf(a, c.cover);
  const cols = columnsOf(d, a);
  const plan = centred(a);
  const sb = combinedBearing(d, a);
  const bearing = sb ? bearingReading(sb, d.soil) : null;
  const dAlong = axis === 'x' ? layers.dx : layers.dy, dAcross = axis === 'x' ? layers.dy : layers.dx;
  const S = axis === 'x' ? a.B : a.L, W = axis === 'x' ? a.L : a.B;
  const prov = slabProvisions(EDITION, c.fy, a.h);
  const meshAlong = axis === 'x' ? a.x : a.y, meshAcross = axis === 'x' ? a.y : a.x;
  let line = { mBottom: 0, mTop: 0, atTop: 0, vu: 0, closure: 0 };
  const bandMu = [0, 0], bandVu = [0, 0];
  const punching: CombinedAnalysis['punching'] = [];
  const perCombo: Array<{ combo: string; N: number; mx: number; my: number; qMax: number; parts: number[] }> = [];
  const pu = [0, 0];
  const across = (p: PlacedColumn) => cantileverAcross(p, cross, W);
  const bandWidth = (p: PlacedColumn) => Math.min(S, (axis === 'x' ? p.b : p.h) + dAcross);
  const nets: Array<{ combo: string; N: number }> = [];
  for (const name of d.combos.map((x) => x.combo)) {
    const acts = cols.map((p) => p.demand.combos.find((x) => x.combo === name));
    const net = acts.every(Boolean) ? acts.reduce((t, x) => t + x!.N, 0) : NaN;
    nets.push({ combo: name, N: net });
    if (!(net > 0)) continue;
    const at = atCentroid(cols, (x) => x.combos.find((q) => q.combo === name), lever, name);
    const f = pressureField(a.B, a.L, at.N, at.My, -at.Mx);
    const placed = cols.map((p, i) => ({ ...p, N: acts[i]!.N, w: axis === 'x' ? acts[i]!.My + lever * acts[i]!.Vx : -(acts[i]!.Mx - lever * acts[i]!.Vy) }));
    const lr = lineReading(f, a, axis, placed, dAlong);
    if (lr.mBottom > line.mBottom) line = { ...line, mBottom: lr.mBottom };
    if (lr.mTop > line.mTop) line = { ...line, mTop: lr.mTop, atTop: lr.atTop };
    line.vu = Math.max(line.vu, lr.vu); line.closure = Math.max(line.closure, Math.abs(lr.closure));
    const parts: number[] = [];
    cols.forEach((p, i) => {
      const q = acts[i]!.N / W, cant = across(p);
      bandMu[i] = Math.max(bandMu[i]!, (q * cant * cant) / 2);
      bandVu[i] = Math.max(bandVu[i]!, q * Math.max(0, cant - dAcross));
      pu[i] = Math.max(pu[i]!, acts[i]!.N);
      const pp = footingPunching(f, { ...plan, xc: p.x, yc: p.y, b: p.b, h: p.h }, layers.d, acts[i]!, stub, c.fc);
      if (!punching[i] || pp.utilization > punching[i]!.utilization) punching[i] = { vu: pp.vu, phiVc: pp.phiVc, utilization: pp.utilization, bo: pp.bo, position: pp.position, combo: name };
      parts.push(pp.utilization);
    });
    perCombo.push({ combo: name, N: at.N, mx: at.Mx, my: at.My, qMax: f.qMax, parts: [lr.mBottom, lr.mTop, lr.vu, ...parts] });
  }
  const { asOf, capOf, vcOf } = stripReading(c, a.h, code);
  const sizeOf = { B: a.B, L: a.L, ex: 0, ey: 0 };
  const pAlong = meshArea(axis, sizeOf, { ...meshAlong, outer: undefined }, c.cover);
  const pAcross = meshArea(cross, sizeOf, { ...meshAcross, outer: undefined }, c.cover);
  const asMinAlong = prov.AsMin * W, asMinAcross = prov.AsMin * S;
  const spans = cols.map((p) => { const s = axis === 'x' ? p.x : p.y, half = (axis === 'x' ? p.b : p.h) / 2; return [s - half, s + half] as const; });
  const cantAlong = Math.min(S / 2 - Math.max(...spans.map((x) => x[1])), Math.min(...spans.map((x) => x[0])) + S / 2);
  const an = code.anchorage;
  const anchorAlong = layerAnchorage(an, { fc: c.fc, fy: c.fy }, meshAlong, a.h, c.cover, cantAlong > c.cover ? cantAlong : Infinity);
  const cantAcross = Math.min(...cols.map(across).filter((x) => x > c.cover));
  const anchorAcross = layerAnchorage(an, { fc: c.fc, fy: c.fy }, meshAcross, a.h, c.cover, Number.isFinite(cantAcross) ? cantAcross : Infinity);
  const fin = (x: { ld: number; available: number; hooked: boolean; ok: boolean }) => (Number.isFinite(x.available) ? x : { ...x, available: 0, ok: true });
  const along: FootingDirection = {
    dir: axis, mu: line.mBottom, vu: line.vu, width: W, d: dAlong, asReq: Math.max(asOf(line.mBottom, W, dAlong), asMinAlong), asMin: asMinAlong, asProvided: pAlong.area,
    phiMn: capOf(pAlong.area, W, dAlong), phiVc: vcOf(pAlong.area, W, dAlong), anchorage: fin(anchorAlong),
  };
  const bands = cols.map((p, i) => {
    const width = bandWidth(p), density = pAcross.area / S;
    const asReq = Math.max(asOf(bandMu[i]!, width, dAcross), prov.AsMin * width), asProvided = density * width;
    return { width, mu: bandMu[i]!, vu: bandVu[i]!, asReq, asProvided, phiMn: capOf(asProvided, width, dAcross), phiVc: vcOf(asProvided, width, dAcross) };
  });
  const worst = bands.reduce((w, b) => (b.mu / Math.max(b.phiMn, 1e-9) > w.mu / Math.max(w.phiMn, 1e-9) ? b : w), bands[0]!);
  const acrossDir: FootingDirection = {
    dir: cross, mu: worst.mu, vu: Math.max(...bands.map((b) => b.vu)), width: worst.width, d: dAcross,
    asReq: Math.max(asMinAcross, ...bands.map((b) => (b.asReq / b.width) * S)), asMin: asMinAcross, asProvided: pAcross.area,
    phiMn: worst.phiMn, phiVc: Math.min(...bands.map((b) => b.phiVc)), anchorage: fin(anchorAcross),
  };
  const topMesh = a.top ?? { dia: 0, spacing: 0 };
  const dTop = a.h - c.cover - topMesh.dia / 2000;
  const pTop = meshArea(axis, sizeOf, { ...topMesh, outer: undefined }, c.cover);
  const topReq = line.mTop > 1e-6 ? Math.max(asOf(line.mTop, W, dTop), asMinAlong) : 0;
  const topRoom = Math.max(0, S / 2 - Math.abs(line.atTop) - c.cover);
  const ldStraight = topMesh.dia > 0 && an ? 1.3 * an.ld({ fc: c.fc, fy: c.fy }, topMesh.dia, a.h, { cover: c.cover, spacing: topMesh.spacing }) : 0;
  const ldTop = ldStraight <= topRoom + 1e-9 || !an || !(topMesh.dia > 0) ? ldStraight : an.ldh({ fc: c.fc, fy: c.fy }, topMesh.dia);
  const top = {
    mu: line.mTop, asReq: topReq, asProvided: pTop.area, phiMn: capOf(pTop.area, W, dTop),
    anchorage: { ld: ldTop, available: topRoom, hooked: ldTop !== ldStraight, ok: !(line.mTop > 1e-6) || ldTop <= topRoom + 1e-9 },
  };
  const bearingStrengths = cols.map((p, i) => ({ ...bearingStrength({ ...plan, xc: p.x, yc: p.y, b: p.b, h: p.h }, (i === 0 ? c.columnFc : c.second?.columnFc) ?? c.fc, c.fc), pu: pu[i]! }));
  const dowels = cols.map((p, i) => {
    const dw = i === 0 ? a.dowels : a.dowels2 ?? a.dowels;
    if (!p.demand.column || !an || !dw || !(dw.count > 0)) return null;
    const bs = bearingStrengths[i]!;
    const excess = Math.max(0, pu[i]! - Math.min(bs.column, bs.footing));
    const required = Math.max(0.005 * p.b * p.h * 1e4, (10 * excess) / (0.65 * c.fy));
    const bars = i === 0 ? c.columnBars : c.second?.columnBars;
    const tension = bars?.tension ?? false, mat = { fc: c.fc, fy: c.fy };
    const ldc = an.ldc(mat, dw.dia), ldh = tension ? an.ldh(mat, dw.dia) : 0;
    const lap = dowelLap(an, bars, { fc: (i === 0 ? c.columnFc : c.second?.columnFc) ?? c.fc, fy: c.fy }, dw.dia, tension);
    return { ...dw, area: dowelArea(bars, dw), required, ldc, ldh, available: a.h - c.cover - (a.x.dia + a.y.dia) / 1000, lap, tension, ...dowelReach(bars, dw.dia, lever - a.h) };
  });
  const ratio = (u: number, cap: number) => (cap > 1e-9 ? u / cap : u > 1e-9 ? Infinity : 0);
  const combos = perCombo.map((k) => ({
    combo: k.combo, N: k.N, mx: k.mx, my: k.my, qMax: k.qMax,
    ratio: Math.max(ratio(k.parts[0]!, along.phiMn), ratio(k.parts[1]!, top.phiMn), ratio(k.parts[2]!, along.phiVc), ...k.parts.slice(3)),
  }));
  return {
    axis, plan, lever, layers, cols, bearing, along, across: acrossDir, top, bands, punching: punching.filter(Boolean), bearingStrength: bearingStrengths, dowels,
    sMax: footingSpacing(c, a.h).s, combos, closure: line.closure,
    uplift: upliftOf(nets, baseWeight(a.B, a.L, a.h, lever, d.soil?.unitWeight ?? ASSUMED_FILL_WEIGHT)),
  };
}

const holdsThickness = (r: CombinedAnalysis): boolean =>
  r.along.vu <= r.along.phiVc + 1e-9 && r.bands.every((b) => b.vu <= b.phiVc + 1e-9)
  && r.punching.every((p) => p.utilization <= 1 + 1e-9)
  && Math.min(r.layers.dx, r.layers.dy) >= MIN_D - 1e-9
  && r.dowels.every((dw) => !dw || Math.max(dw.ldc, dw.ldh) <= dw.available + 1e-9);

function proposeBars(d: FootingDemand, c: FootingContext, size: Omit<FootingAdopted, 'x' | 'y'>, code: FootingRowCode): Pick<FootingAdopted, 'x' | 'y' | 'top'> {
  const axis = combinedAxis(d), cross: Axis = axis === 'x' ? 'y' : 'x';
  const pick = (k: Axis) => preferredDiameters(c, k);
  const flat = { B: size.B, L: size.L, ex: 0, ey: 0 };
  const layer = (k: Axis, asReq: number, s: number): FootingMesh => { const m = proposeLayer(k, flat, asReq, s, pick(k), c.cover, true); return { dia: m.dia, spacing: m.spacing }; };
  let bars: Pick<FootingAdopted, 'x' | 'y' | 'top'> = { x: { dia: pick('x')[0] ?? 12, spacing: 0.2 }, y: { dia: pick('y')[0] ?? 12, spacing: 0.2 }, top: { dia: pick(axis)[0] ?? 12, spacing: 0.2 } };
  for (let k = 0; k < 3; k++) {
    const r = analyseCombined(d, c, { ...size, ...bars }, code);
    const along = layer(axis, r.along.asReq, r.sMax), across = layer(cross, r.across.asReq, r.sMax);
    const top = r.top.asReq > 0 ? layer(axis, r.top.asReq, r.sMax) : undefined;
    const next = { x: axis === 'x' ? along : across, y: axis === 'x' ? across : along, ...(top ? { top } : {}) };
    if (JSON.stringify(next) === JSON.stringify(bars)) break;
    bars = next;
  }
  return bars;
}

export function proposeCombinedDowels(d: FootingDemand, c: FootingContext): Pick<FootingAdopted, 'dowels' | 'dowels2'> {
  const one = (col: FootingDemand['column'], bars: FootingContext['columnBars']): FootingDowels | undefined => {
    if (!col) return undefined;
    if (bars && bars.count > 0) return { count: bars.count, dia: bars.dia };
    const need = 0.005 * col.b * col.h * 1e4;
    return { count: Math.max(4, 2 * Math.ceil(need / barArea(12) / 2)), dia: 12 };
  };
  const a = one(d.column, c.columnBars), b = one(d.carried?.column ?? null, c.second?.columnBars);
  return { ...(a ? { dowels: a } : {}), ...(b ? { dowels2: b } : {}) };
}

/**
 * A combined footing for two columns: centred on the resultant of their service loads, running
 * 50 cm past each outer column along their line, its end at a column's face where that column
 * stands at a property line; as wide across as the soil needs, 20 cm beside the columns at least.
 * Then as thick as shear, punching under each column and the dowels need, and as long and wide
 * as its bars need to anchor past the columns.
 */
export function proposeCombined(d: FootingDemand, c: FootingContext, code: FootingRowCode): { adopted: FootingAdopted; reached: boolean; needs?: number } | null {
  const o = d.carried;
  if (!o || !d.column || !o.column || !d.soil || !d.service || !o.service) return null;
  const axis = combinedAxis(d);
  const rel = { x: o.at.x - d.at.x, y: o.at.y - d.at.y };
  const N = d.service.N + o.service.N;
  if (!(N > 0)) return null;
  const res = { x: (o.service.N * rel.x) / N, y: (o.service.N * rel.y) / N };
  const pts = [{ p: { x: 0, y: 0 }, col: d.column, edge: d.edge?.anchor ?? [0, 0] }, { p: rel, col: o.column, edge: o.edge?.anchor ?? [0, 0] }];
  const extent = (k: Axis, margin: number) => {
    const half = (q: typeof pts[number]) => (k === 'x' ? q.col.b : q.col.h) / 2;
    let lo = Math.min(...pts.map((q) => q.p[k] - Math.max(half(q), margin)));
    let hi = Math.max(...pts.map((q) => q.p[k] + Math.max(half(q), margin)));
    const i = k === 'x' ? 0 : 1;
    const loLine = pts.filter((q) => q.edge[i]! < 0).map((q) => q.p[k] - half(q)), hiLine = pts.filter((q) => q.edge[i]! > 0).map((q) => q.p[k] + half(q));
    const span = Math.max(res[k] - lo, hi - res[k]);
    lo = Math.min(lo, res[k] - span); hi = Math.max(hi, res[k] + span);
    const atLo = loLine.length > 0, atHi = hiLine.length > 0;
    if (atLo) lo = Math.max(lo, Math.min(...loLine));
    if (atHi) hi = Math.min(hi, Math.max(...hiLine));
    return { lo, hi, at: atLo ? -1 : atHi ? 1 : 0 };
  };
  const cross: Axis = axis === 'x' ? 'y' : 'x';
  const e1 = extent(axis, OVERHANG), e2 = extent(cross, 0);
  let S = ceilTo(e1.hi - e1.lo);
  const cAlongOf = () => (e1.at < 0 ? e1.lo + S / 2 : e1.at > 0 ? e1.hi - S / 2 : (e1.lo + e1.hi) / 2);
  const minW = e2.hi - e2.lo + 2 * SIDE;
  const minH = minThickness(c.cover);
  let h = minH;
  const qNet = d.soil.allowable - 25 * h;
  let W = Math.max(ceilTo(minW), ceilTo(qNet > 0 ? N / qNet / S : minW));
  const crossCentre = () => (e2.at < 0 ? e2.lo + W / 2 : e2.at > 0 ? e2.hi - W / 2 : res[cross]);
  const dowels = proposeCombinedDowels(d, c);
  const sizeOf = () => {
    const cCross = crossCentre();
    const cAlong = cAlongOf();
    const centre = axis === 'x' ? { x: cAlong, y: cCross } : { x: cCross, y: cAlong };
    return { B: r3(axis === 'x' ? S : W), L: r3(axis === 'x' ? W : S), h: r3(h), ex: r3(centre.x), ey: r3(centre.y), ...dowels };
  };
  const k = edgeFactorOf(d.soil);
  for (let step = 0; step < 300; step++) {
    const size = sizeOf();
    const s = combinedBearing(d, size)!;
    if (!bearingHolds(s, d.soil.allowable, k)) W += STEP;
    else {
      const a = { ...size, ...proposeBars(d, c, size, code) };
      if (code.bearingOnly) return { adopted: { ...a, x: { dia: 0, spacing: 0 }, y: { dia: 0, spacing: 0 }, top: undefined }, reached: true };
      const r = analyseCombined(d, c, a, code);
      if (!holdsThickness(r)) h += STEP_H;
      else if (!r.along.anchorage.ok || !r.top.anchorage.ok) S += STEP;
      else if (!r.across.anchorage.ok) W += STEP;
      else return { adopted: a, reached: true };
    }
    if (W > MAX_PLAN || S > MAX_PLAN || h > MAX_H) break;
  }
  const last = sizeOf();
  const sb = combinedBearing(d, last);
  return { adopted: { ...last, ...(code.bearingOnly ? { x: { dia: 0, spacing: 0 }, y: { dia: 0, spacing: 0 } } : proposeBars(d, c, last, code)) }, reached: false, ...(sb && !bearingHolds(sb, d.soil.allowable, k) ? needsOf(sb, k) : {}) };
}

export { holdsThickness as combinedThicknessHolds };
