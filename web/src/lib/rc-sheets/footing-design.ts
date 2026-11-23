import { computeAsFlexure, slabProvisions, stripCapacity } from '../engine/codes/argentina/losas';
import { sqrtFcCapped } from '../engine/detailing/punching-shear';
import { presizeFooting } from '../model/foundation/presize';
import { barArea } from './bars';
import {
  ASSUMED_FILL_WEIGHT, bearingHolds, bearingStrength, bearingUse, faceReading, fieldOf, footingPunching, serviceBearing,
  type FootingPlan, type FootingPunching, type ServiceBearing,
} from './footing-mechanics';
import { bandShare, isBanded, layerAnchorage, meshArea, proposeLayer } from './footing-mesh';
import type { FootingAdopted, FootingContext, FootingDemand, FootingDirection, FootingLayers, FootingMesh } from './footing-types';
import type { Materials } from './types';

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
const STEP_PLAN = 0.1, STEP_H = 0.05, MAX_PLAN = 15, MAX_H = 2.5;
const up = (v: number, step = 0.05) => Math.ceil(v / step - 1e-9) * step;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The node's height above the base, m: the modelled footing's founding level, else the footing's own top at the node. */
export const leverOf = (d: FootingDemand, h: number): number => (d.footing ? Math.max(h, d.at.z - d.footing.founding) : h);

export const planOf = (d: FootingDemand, a: Pick<FootingAdopted, 'B' | 'L' | 'ex' | 'ey'>): FootingPlan =>
  ({ B: a.B, L: a.L, xc: -a.ex, yc: -a.ey, b: d.column?.b ?? 0, h: d.column?.h ?? 0 });

export function layersOf(a: Pick<FootingAdopted, 'B' | 'L' | 'h' | 'x' | 'y'>, cover: number): FootingLayers {
  const lower = a.B >= a.L ? 'x' : 'y';
  const dbL = (lower === 'x' ? a.x.dia : a.y.dia) / 1000, dbU = (lower === 'x' ? a.y.dia : a.x.dia) / 1000;
  const dLow = a.h - cover - dbL / 2, dUp = a.h - cover - dbL - dbU / 2;
  const dx = lower === 'x' ? dLow : dUp, dy = lower === 'x' ? dUp : dLow;
  return { lower, dx, dy, d: (dx + dy) / 2 };
}

export interface ComboReading { combo: string; N: number; mx: number; my: number; qMax: number; ratio: number }

export interface FootingAnalysis {
  plan: FootingPlan; lever: number; layers: FootingLayers;
  bearing: (ServiceBearing & { allowable: number | null; edgeFactor: number; use: number; ok: boolean }) | null;
  x: FootingDirection; y: FootingDirection;
  punching: (FootingPunching & { combo: string }) | null;
  bearingStrength: { column: number; footing: number; root: number; pu: number };
  dowels: { count: number; dia: number; area: number; required: number; ldc: number; ldh: number; available: number; lap: number; tension: boolean } | null;
  sMax: number;
  combos: ComboReading[];
}

const fillWeight = (d: FootingDemand) => d.soil?.unitWeight ?? ASSUMED_FILL_WEIGHT;

function direction(dir: 'x' | 'y', c: FootingContext, a: FootingAdopted, code: FootingRowCode, depth: number, mu: number, vu: number, cantilevers: number[]): FootingDirection {
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
  };
}

/** Every reading of a footing with these dimensions and bars: soil pressure, each combination's demands, the capacities and the dowels. */
export function analyseFooting(d: FootingDemand, c: FootingContext, a: FootingAdopted, code: FootingRowCode): FootingAnalysis {
  const plan = planOf(d, a), lever = leverOf(d, a.h), stub = lever - a.h;
  const layers = layersOf(a, c.cover);
  let bearing: FootingAnalysis['bearing'] = null;
  if (d.service) {
    const s = serviceBearing(plan, d.service, a.h, lever, fillWeight(d));
    const allowable = d.soil?.allowable ?? null, k = d.soil?.edgeFactor && d.soil.edgeFactor > 1 ? d.soil.edgeFactor : 1;
    bearing = { ...s, allowable, edgeFactor: k, use: allowable ? bearingUse(s, allowable, k) : 0, ok: allowable ? bearingHolds(s, allowable, k) : false };
  }
  let mx = 0, vx = 0, my = 0, vy = 0, pu = 0;
  let cx: number[] = [0, 0], cy: number[] = [0, 0];
  let punching: FootingAnalysis['punching'] = null;
  const perCombo: Array<{ combo: string; N: number; mx: number; my: number; qMax: number; fx: { mu: number; vu: number }; fy: { mu: number; vu: number }; pu: number }> = [];
  for (const k of d.combos) {
    if (!(k.N > 0)) continue;
    const f = fieldOf(plan, k, lever);
    const rx = faceReading(f, plan, 'x', layers.dx), ry = faceReading(f, plan, 'y', layers.dy);
    cx = rx.cantilevers; cy = ry.cantilevers;
    mx = Math.max(mx, rx.mu); vx = Math.max(vx, rx.vu); my = Math.max(my, ry.mu); vy = Math.max(vy, ry.vu); pu = Math.max(pu, k.N);
    const p = d.column ? footingPunching(f, plan, layers.d, k, stub, c.fc) : null;
    if (p && (!punching || p.utilization > punching.utilization)) punching = { ...p, combo: k.combo };
    perCombo.push({ combo: k.combo, N: k.N, mx: k.Mx, my: k.My, qMax: f.qMax, fx: rx, fy: ry, pu: p?.utilization ?? 0 });
  }
  const x = direction('x', c, a, code, layers.dx, mx, vx, cx);
  const y = direction('y', c, a, code, layers.dy, my, vy, cy);
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
    const required = Math.max(0.005 * plan.b * plan.h * 1e4, (10 * excess) / (0.65 * c.fy));
    const tension = c.columnBars?.tension ?? false;
    const mat = { fc: c.fc, fy: c.fy };
    const ldc = an.ldc(mat, dw.dia), ldh = tension ? an.ldh(mat, dw.dia) : 0;
    const lap = an.lap({ fc: c.columnFc ?? c.fc, fy: c.fy }, dw.dia, tension);
    dowels = { ...dw, area: dw.count * barArea(dw.dia), required, ldc, ldh, available: a.h - c.cover - (a.x.dia + a.y.dia) / 1000, lap, tension };
  }
  return { plan, lever, layers, bearing, x, y, punching, bearingStrength: { ...bs, pu }, dowels, sMax: slabProvisions(EDITION, c.fy, a.h).sTwoWay, combos };
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
  const need = 0.005 * d.column.b * d.column.h * 1e4, dia = 12;
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

export interface Proposal { adopted: FootingAdopted; from: 'model' | 'loads' | 'none'; reached: boolean }

/**
 * The size a footing is proposed with, by the sizing mode: `full` from the service load on the
 * allowable pressure (`presize.ts`), `minimum` from that but never under the modelled footing,
 * `reinforce` the modelled footing as it is. The plan grows 10 cm at a time until the soil holds,
 * then the thickness 5 cm at a time until shear, punching and the dowels do, in that order,
 * since a wider base changes the shear and a thicker one the weight. A footing held at a
 * property line keeps its column at the line.
 */
export function proposeFooting(d: FootingDemand, c: FootingContext, code: FootingRowCode): Proposal | null {
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
  const anchor = m?.anchor ?? d.footing?.anchor;
  const minH = Math.max(0.3, up(MIN_D + c.cover + 0.024));
  let h = c.sizing === 'minimum' && m ? Math.max(minH, m.h) : minH;
  const pre = presizeFooting({ kind: 'isolated', loads: [{ x: 0, y: 0, axial: service.N }], allowableKPa: soil.allowable, thickness: h, column: { x: col.b, y: col.h }, ...(anchor ? { anchor } : {}) });
  let B = 'refused' in pre ? Math.max(0.6, up(col.b + 0.4)) : pre.B, L = 'refused' in pre ? Math.max(0.6, up(col.h + 0.4)) : pre.L;
  if (c.sizing === 'minimum' && m) { B = Math.max(B, m.B); L = Math.max(L, m.L); }
  const ecc = (b: number, l: number) => (anchor
    ? { ex: anchor[0] ? -anchor[0] * (b / 2 - col.b / 2) : 0, ey: anchor[1] ? -anchor[1] * (l / 2 - col.h / 2) : 0 }
    : c.sizing === 'minimum' && m ? { ex: m.ex, ey: m.ey } : { ex: 0, ey: 0 });
  const k = soil.edgeFactor && soil.edgeFactor > 1 ? soil.edgeFactor : 1;
  for (let step = 0; step < 300; step++) {
    const size = { B: r3(B), L: r3(L), h: r3(h), ...ecc(B, L) };
    const s = serviceBearing(planOf(d, size), service, h, leverOf(d, h), fillWeight(d));
    if (!bearingHolds(s, soil.allowable, k)) {
      B += STEP_PLAN; L += STEP_PLAN;
    } else {
      const a = withBars(size);
      if (code.bearingOnly || thicknessHolds(analyseFooting(d, c, a, code))) return { adopted: a, from: 'loads', reached: true };
      h += STEP_H;
    }
    if (B > MAX_PLAN || L > MAX_PLAN || h > MAX_H) break;
  }
  return { adopted: withBars({ B: r3(Math.min(B, MAX_PLAN)), L: r3(Math.min(L, MAX_PLAN)), h: r3(Math.min(h, MAX_H)), ...ecc(B, L) }), from: 'loads', reached: false };
}
