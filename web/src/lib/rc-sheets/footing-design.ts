import { computeAsFlexure, slabProvisions, stripCapacity } from '../engine/codes/argentina/losas';
import { sqrtFcCapped } from '../engine/detailing/punching-shear';
import { presizeFooting } from '../model/foundation/presize';
import { barArea } from './bars';
import {
  ASSUMED_FILL_WEIGHT, bearingHolds, bearingStrength, bearingUse, faceReading, fieldOf, footingPunching, serviceBearing,
  type FootingPlan, type FootingPunching, type ServiceBearing,
} from './footing-mechanics';
import { bandShare, isBanded, layerAnchorage, meshArea, proposeLayer } from './footing-mesh';
import type { ColumnBarsAtBase, FootingAdopted, FootingContext, FootingDemand, FootingDirection, FootingLayers, FootingMesh } from './footing-types';
import type { Materials } from './types';
import { balanceOf, type Balance } from './footing-balance';
import { needsOf } from './footing-needs';
import { lapOffset } from './column-stack';
import { critOf, withCriterion } from './criteria';

const EDITION = '2025' as const;

/** How a code develops and laps the footing's bars, m: the mesh in tension straight or hooked, the dowels in compression, their laps with the column's bars. */
export interface FootingAnchorage {
  ld(mat: Materials, dia: number, h: number, layout: { cover: number; spacing: number }): number;
  ldh(mat: Materials, dia: number): number;
  ldc(mat: Materials, dia: number): number;
  lap(mat: Materials, dia: number, tension: boolean): number;
  clause: { straight: string; hooked: string; compression: string };
}

/** How a code reads a footing where the CIRSOC and ACI footings may part: one-way shear without stirrups, and the anchorage of the bars. */
export interface FootingRowCode {
  oneWayVc(fc: number, rhoW: number): number;
  oneWayClause: string;
  oneWayFormula: string;
  /** Absent only where no bars are designed. */
  anchorage?: FootingAnchorage;
  /** Size the plan for the soil and design nothing else. */
  bearingOnly?: true;
}

export type FootingShear = Pick<FootingRowCode, 'oneWayVc' | 'oneWayClause' | 'oneWayFormula'>;

/** CIRSOC 201-2025 §13.2.6.2(a). */
export const CIRSOC_ONE_WAY: FootingShear = {
  oneWayVc: (fc) => 0.17 * sqrtFcCapped(fc), oneWayClause: '§13.2.6.2(a)', oneWayFormula: "Vc = 0,17·λ·√f'c·bw·d",
};

/** ACI 318-19 Table 22.5.5.1(c) with λs = 1 (§13.2.6.2), no more than 0,42·λ·√f'c. */
export const ACI_ONE_WAY: FootingShear = {
  oneWayVc: (fc, rho) => Math.min(0.66 * Math.cbrt(Math.max(rho, 0)), 0.42) * sqrtFcCapped(fc),
  oneWayClause: '§22.5.5.1(c), §13.2.6.2', oneWayFormula: "Vc = 0,66·λ·ρw^(1/3)·√f'c·bw·d",
};

export const MIN_D = 0.15;

/** The bars' largest spacing in a footing, m: the code's (§8.7.2.2) or the criterion's where it is closer (FIUBA Cim. §4, GA §10), and the clause it comes from. */
/** The clause a footing's largest spacing comes from: the criterion's where it is closer than the code's. */
export const spacingClause = (sMax: number, h: number): string => (sMax < slabProvisions(EDITION, 420, h).sTwoWay - 1e-9 ? withCriterion('§8.7.2.2') : '§8.7.2.2');

export function footingSpacing(c: Pick<FootingContext, 'fy' | 'criteria'>, h: number): { s: number; clause: string } {
  const code = slabProvisions(EDITION, c.fy, h).sTwoWay, own = critOf(c).footingMaxSpacing;
  return own < code - 1e-9 ? { s: own, clause: withCriterion('§8.7.2.2') } : { s: code, clause: '§8.7.2.2' };
}
const STEP_PLAN = 0.1, STEP_H = 0.05, MAX_PLAN = 15, MAX_H = 2.5;
const up = (v: number, step = 0.05) => Math.ceil(v / step - 1e-9) * step;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Where the footing's underside is founded, m: the modelled footing's level, else the project's common one, else its top at the node. */
export const foundingOf = (d: Pick<FootingDemand, 'footing' | 'founding' | 'at'>, h: number): number => d.footing?.founding ?? d.founding ?? d.at.z - h;

/** The node's height above the base, m: from the founding level, never less than the footing itself. */
export const leverOf = (d: FootingDemand, h: number): number => Math.max(h, d.at.z - foundingOf(d, h));

/** The column's stretch below its node down to the footing's top, m. */
export const pedestalOf = (d: Pick<FootingDemand, 'footing' | 'founding' | 'at'>, h: number): number => Math.max(0, d.at.z - foundingOf(d, h) - h);

export const planOf = (d: FootingDemand, a: Pick<FootingAdopted, 'B' | 'L' | 'ex' | 'ey'>): FootingPlan =>
  ({ B: a.B, L: a.L, xc: -a.ex, yc: -a.ey, b: d.column?.b ?? 0, h: d.column?.h ?? 0, ...(d.column?.area ? { area: d.column.area } : {}) });

export function layersOf(a: Pick<FootingAdopted, 'B' | 'L' | 'h' | 'x' | 'y'>, cover: number): FootingLayers {
  const lower = a.B >= a.L ? 'x' : 'y';
  const dbL = (lower === 'x' ? a.x.dia : a.y.dia) / 1000, dbU = (lower === 'x' ? a.y.dia : a.x.dia) / 1000;
  const dLow = a.h - cover - dbL / 2, dUp = a.h - cover - dbL - dbU / 2;
  const dx = lower === 'x' ? dLow : dUp, dy = lower === 'x' ? dUp : dLow;
  return { lower, dx, dy, d: (dx + dy) / 2 };
}

/** A column's dowels as read: ldc and ldh against the room in the footing, their lap with the column's bars and how they reach it (`FootingRowDowels`). */
export interface FootingDowelReading { count: number; dia: number; ldc: number; ldh: number; available: number; lap: number; tension: boolean; above: number; offset: number }

/** The dowels' lap with the column's bars, m: a pier's longest where they are its bars', the column's own where its row gives it and the dowels are no thicker than its bars, else the code's for the dowel. */
export const dowelLap = (an: FootingAnchorage, bars: ColumnBarsAtBase | undefined, mat: Materials, dia: number, tension: boolean): number =>
  (bars?.at?.length ? Math.max(...bars.at.map((b) => b.lap)) : bars?.lap !== undefined && dia <= bars.dia ? bars.lap : an.lap(mat, dia, tension));

/** The dowels' area, cm²: each under its own bar where they are the pier's bars as proposed, else so many of one diameter. */
export const dowelArea = (bars: ColumnBarsAtBase | undefined, dw: { count: number; dia: number }): number =>
  (bars?.at && bars.area !== undefined && dw.count === bars.at.length && dw.dia === bars.dia ? bars.area : dw.count * barArea(dw.dia));

/** Where the dowels' lap starts over the footing's top (its pedestal `stub`, m, and where the column's lap starts), and how far they are cranked in to lap beside its bars: one bar's diameter. */
export const dowelReach = (bars: ColumnBarsAtBase | undefined, dia: number, stub: number): { above: number; offset: number } =>
  ({ above: Math.max(0, stub) + (bars?.lapFrom ?? 0), offset: lapOffset(dia, bars?.dia ?? dia) });

export interface ComboReading { combo: string; N: number; mx: number; my: number; qMax: number; ratio: number }

export interface FootingAnalysis {
  plan: FootingPlan; lever: number; layers: FootingLayers;
  balance: Balance;
  /** Per balanced axis, as `balance.axes`: the largest force and moment over the combinations and the one they come from, the service force, and the partner's relief there. */
  balanced: Array<{ force: number; moment: number; relief: number; combo: string | null; service: number; byCombo: Record<string, number> }>;
  bearing: (ServiceBearing & { allowable: number | null; edgeFactor: number; use: number; ok: boolean }) | null;
  x: FootingDirection; y: FootingDirection;
  punching: (FootingPunching & { combo: string }) | null;
  bearingStrength: { column: number; footing: number; root: number; pu: number };
  dowels: (FootingDowelReading & { area: number; required: number }) | null;
  sMax: number;
  combos: ComboReading[];
}

const fillWeight = (d: FootingDemand) => d.soil?.unitWeight ?? ASSUMED_FILL_WEIGHT;

function direction(dir: 'x' | 'y', c: FootingContext, a: FootingAdopted, code: FootingRowCode, depth: number, mu: number, vu: number, cantilevers: number[], lineEnd: -1 | 0 | 1, carried: boolean): FootingDirection {
  const W = dir === 'x' ? a.L : a.B, m = dir === 'x' ? a.x : a.y;
  const prov = slabProvisions(EDITION, c.fy, a.h);
  const asStrength = mu > 1e-6 ? computeAsFlexure(mu / W, a.h, depth, c.fc, c.fy, EDITION).As * W : 0;
  const asMin = prov.AsMin * W;
  const asReq = Math.max(asStrength, asMin);
  const p = meshArea(dir, a, m, c.cover);
  const phiMn = p.area > 0 ? stripCapacity(p.area / W, a.h, depth, c.fc, c.fy, EDITION) * W : 0;
  const rho = p.area * 1e-4 / Math.max(W * depth, 1e-9);
  const phiVc = 0.75 * code.oneWayVc(c.fc, rho) * W * depth * 1000;
  const loaded = cantilevers.filter((x) => x > c.cover + 1e-3);
  const anchorage = layerAnchorage(code.anchorage, { fc: c.fc, fy: c.fy }, m, a.h, c.cover, loaded.length ? Math.min(...loaded) : Infinity);
  const banded = isBanded(dir, a.B, a.L) && !!m.outer;
  const share = bandShare(a.B, a.L);
  return {
    dir, mu, vu, width: W, d: depth, asReq, asMin, asProvided: p.area, phiMn, phiVc,
    ...(banded ? { band: { share, width: Math.min(a.B, a.L), asReq: share * asReq, asProvided: p.band } } : {}),
    anchorage: Number.isFinite(anchorage.available) ? anchorage : { ...anchorage, available: 0, ok: true },
    ...(lineEnd ? { lineEnd } : {}), ...(carried ? { carried: true } : {}),
  };
}

/** Every reading of a footing with these dimensions and bars: soil pressure, each combination's demands, the capacities and the dowels. */
export function analyseFooting(d: FootingDemand, c: FootingContext, a: FootingAdopted, code: FootingRowCode): FootingAnalysis {
  const plan = planOf(d, a), lever = leverOf(d, a.h), stub = lever - a.h;
  const layers = layersOf(a, c.cover);
  const bal = balanceOf(d, a, plan, lever);
  let bearing: FootingAnalysis['bearing'] = null;
  if (d.service) {
    const s = serviceBearing(bal.soilPlan, bal.soil(d.service, lever), a.h, lever, fillWeight(d));
    const allowable = d.soil?.allowable ?? null, k = d.soil?.edgeFactor && d.soil.edgeFactor > 1 ? d.soil.edgeFactor : 1;
    bearing = { ...s, allowable, edgeFactor: k, use: allowable ? bearingUse(s, allowable, k) : 0, ok: allowable ? bearingHolds(s, allowable, k) : false };
  }
  let mx = 0, vx = 0, my = 0, vy = 0, pu = 0;
  let cx: number[] = [0, 0], cy: number[] = [0, 0];
  let punching: FootingAnalysis['punching'] = null;
  const balanced = bal.axes.map(() => ({ force: 0, moment: 0, relief: Infinity, combo: null as string | null, service: 0, byCombo: {} as Record<string, number> }));
  if (d.service) bal.forces(d.service, lever).force.forEach((f, i) => { balanced[i]!.service = f; });
  const carriedX = bal.carried.includes('x'), carriedY = bal.carried.includes('y');
  const perCombo: Array<{ combo: string; N: number; mx: number; my: number; qMax: number; fx: { mu: number; vu: number }; fy: { mu: number; vu: number }; pu: number }> = [];
  for (const k of d.combos) {
    if (!(k.N > 0)) continue;
    const f = fieldOf(bal.soilPlan, bal.soil(k, lever), lever);
    const t = bal.forces(k, lever);
    t.moment.forEach((m, i) => { const b = balanced[i]!; b.byCombo[k.combo] = t.force[i]!; if (m > b.moment) { b.moment = m; b.force = t.force[i]!; b.combo = k.combo; } b.relief = Math.min(b.relief, t.relief[i]!); });
    const rx = faceReading(f, bal.facePlan, 'x', layers.dx), ry = faceReading(f, bal.facePlan, 'y', layers.dy);
    const fx = carriedX ? { mu: 0, vu: 0 } : rx, fy = carriedY ? { mu: 0, vu: 0 } : ry;
    cx = rx.cantilevers; cy = ry.cantilevers;
    mx = Math.max(mx, fx.mu); vx = Math.max(vx, fx.vu); my = Math.max(my, fy.mu); vy = Math.max(vy, fy.vu); pu = Math.max(pu, k.N);
    const p = d.column ? footingPunching(f, plan, layers.d, bal.punch(k), stub, c.fc) : null;
    if (p && (!punching || p.utilization > punching.utilization)) punching = { ...p, combo: k.combo };
    perCombo.push({ combo: k.combo, N: k.N, mx: k.Mx, my: k.My, qMax: f.qMax, fx, fy, pu: p?.utilization ?? 0 });
  }
  for (const b of balanced) if (!Number.isFinite(b.relief)) b.relief = 0;
  const anchor = d.edge?.anchor ?? [0, 0];
  const x = direction('x', c, a, code, layers.dx, mx, vx, cx, anchor[0] as -1 | 0 | 1, carriedX);
  const y = direction('y', c, a, code, layers.dy, my, vy, cy, anchor[1] as -1 | 0 | 1, carriedY);
  const ratio = (u: number, cap: number) => (cap > 1e-9 ? u / cap : u > 1e-9 ? Infinity : 0);
  const combos = perCombo.map((k) => ({
    combo: k.combo, N: k.N, mx: k.mx, my: k.my, qMax: k.qMax,
    ratio: Math.max(ratio(k.fx.mu, x.phiMn), ratio(k.fy.mu, y.phiMn), ratio(k.fx.vu, x.phiVc), ratio(k.fy.vu, y.phiVc), k.pu),
  }));
  const bs = bearingStrength(plan, c.columnFc ?? c.fc, c.fc);
  const dw = a.dowels;
  let dowels: FootingAnalysis['dowels'] = null;
  const an = code.anchorage;
  if (d.column && an && dw && dw.count > 0 && dw.dia > 0) {
    const excess = Math.max(0, pu - Math.min(bs.column, bs.footing));
    const required = Math.max(d.column.dowelMin ?? 0.005 * (plan.area ?? plan.b * plan.h) * 1e4, (10 * excess) / (0.65 * c.fy));
    const tension = c.columnBars?.tension ?? false;
    const mat = { fc: c.fc, fy: c.fy };
    const ldc = an.ldc(mat, dw.dia), ldh = tension ? an.ldh(mat, dw.dia) : 0;
    const lap = dowelLap(an, c.columnBars, { fc: c.columnFc ?? c.fc, fy: c.fy }, dw.dia, tension);
    dowels = { ...dw, area: dowelArea(c.columnBars, dw), required, ldc, ldh, available: a.h - c.cover - (a.x.dia + a.y.dia) / 1000, lap, tension, ...dowelReach(c.columnBars, dw.dia, lever - a.h) };
  }
  return { plan, lever, layers, balance: bal, balanced, bearing, x, y, punching, bearingStrength: { ...bs, pu }, dowels, sMax: footingSpacing(c, a.h).s, combos };
}

/** What the thickness has to hold: one-way shear both ways, punching, the dowels' anchorage and d ≥ 150 mm (§13.3.1.2). */
export const thicknessHolds = (r: FootingAnalysis): boolean =>
  r.x.vu <= r.x.phiVc + 1e-9 && r.y.vu <= r.y.phiVc + 1e-9
  && (!r.punching || r.punching.utilization <= 1 + 1e-9)
  && Math.min(r.layers.dx, r.layers.dy) >= MIN_D - 1e-9
  && (!r.dowels || Math.max(r.dowels.ldc, r.dowels.ldh) <= r.dowels.available + 1e-9);

export function proposeDowels(d: FootingDemand, c: FootingContext): FootingAdopted['dowels'] {
  if (!d.column) return undefined;
  if (c.columnBars && c.columnBars.count > 0) return { count: c.columnBars.count, dia: c.columnBars.dia };
  const need = d.column.dowelMin ?? 0.005 * (d.column.area ?? d.column.b * d.column.h) * 1e4, dia = 12;
  return { count: Math.max(4, 2 * Math.ceil(need / barArea(dia) / 2)), dia };
}

/** Both bottom layers for a footing of this size, the depths read again from the bars chosen. */
export function proposeMeshes(d: FootingDemand, c: FootingContext, size: Omit<FootingAdopted, 'x' | 'y'>, code: FootingRowCode): { x: FootingMesh; y: FootingMesh } {
  const pick = (dir: 'x' | 'y') => {
    const pref = c.preferred?.[dir];
    return pref && c.diameters.includes(pref) ? [pref, ...c.diameters.filter((x) => x > pref)] : [...c.diameters];
  };
  let x: FootingMesh = { dia: pick('x')[0] ?? 12, spacing: 0.2 }, y: FootingMesh = { dia: pick('y')[0] ?? 12, spacing: 0.2 };
  for (let k = 0; k < 3; k++) {
    const r = analyseFooting(d, c, { ...size, x, y }, code);
    const nx = proposeLayer('x', size, r.x.asReq, r.sMax, pick('x'), c.cover), ny = proposeLayer('y', size, r.y.asReq, r.sMax, pick('y'), c.cover);
    if (JSON.stringify([nx, ny]) === JSON.stringify([x, y])) break;
    x = nx; y = ny;
  }
  return { x, y };
}

export interface Proposal { adopted: FootingAdopted; from: 'model' | 'loads' | 'none'; reached: boolean; /** The allowable pressure, kPa, the footing proposed verifies at, where the soil's does not hold it. */ needs?: number }

/** A cap on the plan along one axis, m: room left by a neighbour, so the footing grows the other way. */
export interface PlanCap { axis: 'x' | 'y'; max: number }

/** Service bearing under a footing of this size, its load read as its balance has it. */
export function bearingOf(d: FootingDemand, size: Pick<FootingAdopted, 'B' | 'L' | 'h' | 'ex' | 'ey' | 'straps'>): ServiceBearing | null {
  if (!d.service) return null;
  const lever = leverOf(d, size.h), plan = planOf(d, size);
  const bal = balanceOf(d, size, plan, lever);
  return serviceBearing(bal.soilPlan, bal.soil(d.service, lever), size.h, lever, fillWeight(d));
}

/**
 * The size a footing is proposed with, by the sizing mode: `full` from the service load on the
 * allowable pressure (`presize.ts`), `minimum` from that but never under the modelled footing,
 * `reinforce` the modelled footing as it is. The plan grows 10 cm at a time until the soil holds,
 * then the thickness 5 cm at a time until shear, punching and the dowels do, in that order,
 * since a wider base changes the shear and a thicker one the weight. A footing held at a
 * property line keeps its column at the line: twice as long along it as across when a strap or a
 * tie takes the offset, and as narrow across as its pressure can stay in contact (1,5 times the
 * column, or what a hooked bar needs past it) when the soil takes it alone, growing along the line only. A cap leaves one side short.
 */
export function proposeFooting(d: FootingDemand, c: FootingContext, code: FootingRowCode, cap?: PlanCap): Proposal | null {
  const m = d.footing && d.footing.B > 0 && d.footing.L > 0 ? d.footing : undefined;
  const col = d.column;
  if (!col) return null;
  const dowels = code.bearingOnly ? undefined : proposeDowels(d, c);
  const withBars = (s: Omit<FootingAdopted, 'x' | 'y' | 'dowels'>): FootingAdopted => {
    const size = { ...s, ...(dowels ? { dowels } : {}) };
    return { ...size, ...(code.bearingOnly ? { x: { dia: 0, spacing: 0 }, y: { dia: 0, spacing: 0 } } : proposeMeshes(d, c, size, code)) };
  };
  if (m && c.sizing === 'reinforce') return { adopted: withBars({ B: m.B, L: m.L, h: m.h, ex: m.ex, ey: m.ey }), from: 'model', reached: true };
  const soil = d.soil, service = d.service;
  if (!soil || !service || !(service.N > 0)) return m ? { adopted: withBars({ B: m.B, L: m.L, h: m.h, ex: m.ex, ey: m.ey }), from: 'model', reached: false } : null;
  const anchor = d.edge?.anchor ?? m?.anchor ?? d.footing?.anchor;
  const held = !!anchor && (anchor[0] !== 0 || anchor[1] !== 0);
  const alone = held && d.edge?.balance === 'eccentric';
  const minH = Math.max(0.3, up(MIN_D + c.cover + 0.024));
  let h = c.sizing === 'minimum' && m ? Math.max(minH, m.h) : minH;
  const pre = presizeFooting({ kind: 'isolated', loads: [{ x: 0, y: 0, axial: service.N }], allowableKPa: soil.allowable, thickness: h, column: { x: col.b, y: col.h }, ...(held ? { anchor } : {}) });
  let B = 'refused' in pre ? Math.max(0.6, up(col.b + 0.4)) : pre.B, L = 'refused' in pre ? Math.max(0.6, up(col.h + 0.4)) : pre.L;
  const first = (k: 'x' | 'y') => (c.preferred && c.diameters.includes(c.preferred[k]) ? c.preferred[k] : Math.min(...c.diameters));
  const hook = code.anchorage && c.diameters.length ? code.anchorage.ldh({ fc: c.fc, fy: c.fy }, Math.max(first('x'), first('y'))) + c.cover : 0;
  if (alone && anchor![0] && !anchor![1]) B = Math.max(0.6, up(1.5 * col.b), up(col.b + hook));
  if (alone && anchor![1] && !anchor![0]) L = Math.max(0.6, up(1.5 * col.h), up(col.h + hook));
  if (c.sizing === 'minimum' && m) { B = Math.max(B, m.B); L = Math.max(L, m.L); }
  if (cap) { if (cap.axis === 'x') B = Math.min(B, cap.max); else L = Math.min(L, cap.max); }
  const grows = { x: !(alone && anchor![0] && !anchor![1]) && !(cap?.axis === 'x'), y: !(alone && anchor![1] && !anchor![0]) && !(cap?.axis === 'y') };
  if (!grows.x && !grows.y) { if (cap?.axis === 'x') grows.y = true; else grows.x = true; }
  const ecc = (b: number, l: number) => (held
    ? { ex: anchor![0] ? -anchor![0] * (b / 2 - col.b / 2) : 0, ey: anchor![1] ? -anchor![1] * (l / 2 - col.h / 2) : 0 }
    : c.sizing === 'minimum' && m ? { ex: m.ex, ey: m.ey } : { ex: 0, ey: 0 });
  const k = soil.edgeFactor && soil.edgeFactor > 1 ? soil.edgeFactor : 1;
  for (let step = 0; step < 300; step++) {
    const size = { B: r3(B), L: r3(L), h: r3(h), ...ecc(B, L) };
    const s = bearingOf(d, size)!;
    if (!bearingHolds(s, soil.allowable, k)) {
      if (grows.x) B += STEP_PLAN;
      if (grows.y) L += STEP_PLAN;
    } else {
      const a = withBars(size);
      if (code.bearingOnly) return { adopted: a, from: 'loads', reached: true };
      const r = analyseFooting(d, c, a, code);
      const across = alone && !grows.x ? r.x : alone && !grows.y ? r.y : null;
      if (!thicknessHolds(r)) h += STEP_H;
      else if (across && !across.anchorage.ok) { if (across.dir === 'x') B += STEP_H; else L += STEP_H; }
      else return { adopted: a, from: 'loads', reached: true };
    }
    if (B > MAX_PLAN || L > MAX_PLAN || h > MAX_H) break;
  }
  const last = withBars({ B: r3(Math.min(B, MAX_PLAN)), L: r3(Math.min(L, MAX_PLAN)), h: r3(Math.min(h, MAX_H)), ...ecc(Math.min(B, MAX_PLAN), Math.min(L, MAX_PLAN)) });
  const sb = bearingOf(d, last);
  return { adopted: last, from: 'loads', reached: false, ...(sb && !bearingHolds(sb, soil.allowable, k) ? needsOf(sb, k) : {}) };
}
