import { computeAsFlexure, slabProvisions, stripCapacity } from '../engine/codes/argentina/losas';
import { sqrtFcCapped } from '../engine/detailing/punching-shear';
import { pileCentres } from '../model/foundation/piles';
import { barArea } from './bars';
import { critOf } from './criteria';
import { shiftAt } from './footing-balance';
import { dowelLap, dowelReach, footingSpacing, leverOf, type FootingRowCode } from './footing-design';
import { bearingStrength, CONCRETE_WEIGHT } from './footing-mechanics';
import { layerAnchorage, meshArea, proposeLayer } from './footing-mesh';
import { sectionStress, sidesIn } from './footing-punching';
import type { CapPiles, CapResult, FootingAction, FootingAdopted, FootingContext, FootingDemand, FootingDirection, FootingLayers, FootingMesh, PileSpec } from './footing-types';

/** The pile heads stand this far into the cap, m, over the part cut off them. */
export const PILE_EMBED = 0.1;
/** The cap's bottom bars sit on the pile heads: their cover over the cap's underside, m. */
export const capCover = (cover: number): number => Math.max(cover, PILE_EMBED + 0.025);
/** A pile's own clear cover to its hoops, m. */
export const PILE_COVER = 0.075;
/** The factor on the cap's own weight in the factored pile loads. */
const CAP_WEIGHT_FACTOR = 1.2;
const STEP_H = 0.05, MAX_H = 3;
const PILE_BARS = [12, 16, 20, 25];
/** A hooked bottom bar rises about this many of its diameters over its axis: its bend and the hook's leg, which must stay under the cap's top cover. */
const HOOK_RISE = 17;
const up = (v: number) => Math.ceil(v / 0.05 - 1e-9) * 0.05;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
type Axis = 'x' | 'y';
type P2 = [number, number];

/** A column on the cap, m from the first column's axis, with its demand. */
export interface CapColumn { demand: FootingDemand; x: number; y: number; b: number; h: number }

export const capColumns = (d: FootingDemand): CapColumn[] => [
  { demand: d, x: 0, y: 0, b: d.column?.b ?? 0, h: d.column?.h ?? 0 },
  ...(d.carried ? [{ demand: d.carried, x: d.carried.at.x - d.at.x, y: d.carried.at.y - d.at.y, b: d.carried.column?.b ?? 0, h: d.carried.column?.h ?? 0 }] : []),
];

/** Pile patterns by count: up to four as `pileCentres` lays them, then full grids, the longer side along `along`. */
export function pilePattern(n: number, s: number, along: Axis): P2[] {
  if (n <= 4) { const c = pileCentres({ count: n, spacing: s }); return along === 'x' ? c : c.map(([x, y]) => [y, x]); }
  const cols = Math.ceil(Math.sqrt(n * (along === 'x' ? 1.5 : 1 / 1.5))), rows = Math.ceil(n / cols);
  const out: P2[] = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) out.push([(j - (cols - 1) / 2) * s, (i - (rows - 1) / 2) * s]);
  return along === 'x' ? out : out.map(([x, y]) => [y, x]);
}
const COUNTS = [1, 2, 3, 4, 6, 9, 12, 16, 20, 25, 30, 36];

/** How the cap's offset at a property line is taken: by a strap to the cap inward, by a tie at the first floor, or by the piles themselves. */
export interface CapBalance { axis: Axis; sign: number; kind: 'strap' | 'tie' | 'piles'; L?: number }

export function capBalance(d: FootingDemand): CapBalance[] {
  if (d.carried || !d.edge) return [];
  return (['x', 'y'] as const).flatMap((axis): CapBalance[] => {
    const sign = d.edge!.anchor[axis === 'x' ? 0 : 1];
    if (!sign) return [];
    const partner = d.edge!.partners.find((p) => p.axis === axis);
    if (d.edge!.balance === 'strap' && partner) return [{ axis, sign, kind: 'strap', L: partner.L }];
    if (d.edge!.balance === 'tie' && d.column?.storey) return [{ axis, sign, kind: 'tie' }];
    return [{ axis, sign, kind: 'piles' }];
  });
}

/** The cap's plan and its piles, m: the piles at the columns' resultant, kept `clear` off a line the cap is held at, the cap an edge distance past them and past the columns, its side at the line flush with the column. */
export function capPlan(cols: readonly CapColumn[], pattern: readonly P2[], spec: Pick<PileSpec, 'diameter'>, clear: number): Pick<FootingAdopted, 'B' | 'L' | 'ex' | 'ey'> & { piles: P2[] } {
  const N = cols.reduce((t, c) => t + Math.max(0, c.demand.service?.N ?? 0), 0) || 1;
  const g: P2 = [cols.reduce((t, c) => t + Math.max(0, c.demand.service?.N ?? 0) * c.x, 0) / N, cols.reduce((t, c) => t + Math.max(0, c.demand.service?.N ?? 0) * c.y, 0) / N];
  const D = spec.diameter, edge = Math.max(D, D / 2 + 0.15), keep = Math.max(clear, D / 2 + 0.1);
  const lines = (k: 0 | 1) => {
    const half = (c: CapColumn) => (k === 0 ? c.b : c.h) / 2, pos = (c: CapColumn) => (k === 0 ? c.x : c.y);
    const lo = cols.filter((c) => (c.demand.edge?.anchor[k] ?? 0) < 0).map((c) => pos(c) - half(c));
    const hi = cols.filter((c) => (c.demand.edge?.anchor[k] ?? 0) > 0).map((c) => pos(c) + half(c));
    return { lo: lo.length ? Math.min(...lo) : null, hi: hi.length ? Math.max(...hi) : null };
  };
  const piles = pattern.map(([x, y]) => [x + g[0], y + g[1]] as P2);
  const ext = { x: { lo: 0, hi: 0 }, y: { lo: 0, hi: 0 } };
  for (const k of [0, 1] as const) {
    const l = lines(k), ps = piles.map((p) => p[k]);
    let shift = 0;
    if (l.hi !== null) shift = Math.min(shift, l.hi - keep - Math.max(...ps));
    if (l.lo !== null) shift = Math.max(shift, l.lo + keep - Math.min(...ps));
    piles.forEach((p) => { p[k] += shift; });
    const half = (c: CapColumn) => (k === 0 ? c.b : c.h) / 2, pos = (c: CapColumn) => (k === 0 ? c.x : c.y);
    let lo = Math.min(...piles.map((p) => p[k] - edge), ...cols.map((c) => pos(c) - half(c) - 0.1));
    let hi = Math.max(...piles.map((p) => p[k] + edge), ...cols.map((c) => pos(c) + half(c) + 0.1));
    if (l.lo !== null) lo = l.lo;
    if (l.hi !== null) hi = l.hi;
    const len = l.lo !== null && l.hi !== null ? hi - lo : up(hi - lo);
    if (l.hi !== null && l.lo === null) lo = hi - len; else hi = lo + len;
    ext[k === 0 ? 'x' : 'y'] = { lo, hi };
  }
  const cx = (ext.x.lo + ext.x.hi) / 2, cy = (ext.y.lo + ext.y.hi) / 2;
  return { B: r3(ext.x.hi - ext.x.lo), L: r3(ext.y.hi - ext.y.lo), ex: r3(cx), ey: r3(cy), piles: piles.map(([x, y]) => [r3(x - cx), r3(y - cy)] as P2) };
}

/** Where each column stands from the cap's centroid. */
const placed = (cols: readonly CapColumn[], a: Pick<FootingAdopted, 'ex' | 'ey'>) => cols.map((c) => ({ ...c, x: c.x - a.ex, y: c.y - a.ey }));

/**
 * Each pile's load from one combination on a rigid cap (GA §8.3): the columns' loads and the
 * cap's weight over the piles' centroid, and their moments about it over Σx² and Σy². Along an
 * axis a strap or a tie balances, the offset and the column's moment are the structure's, and a
 * strap adds its end force V = (P·e + |w|)/(L − e).
 */
export function pileLoads(cols: ReadonlyArray<CapColumn>, acts: ReadonlyArray<FootingAction | undefined>, piles: readonly P2[], weight: number, balance: readonly CapBalance[], lever: number): { R: number[]; V: number } {
  const n = piles.length, gx = piles.reduce((t, p) => t + p[0], 0) / n, gy = piles.reduce((t, p) => t + p[1], 0) / n;
  let N = weight, Sx = -weight * gx, Sy = -weight * gy, V = 0;
  cols.forEach((c, i) => {
    const q = acts[i];
    if (!q) return;
    const w = shiftAt(q, lever);
    N += q.N; Sx += q.N * (c.x - gx) + w.x; Sy += q.N * (c.y - gy) + w.y;
  });
  for (const b of balance) {
    const q = acts[0], c = cols[0]!;
    if (!q) continue;
    const e = Math.abs(b.axis === 'x' ? c.x - gx : c.y - gy), w = Math.abs(b.axis === 'x' ? shiftAt(q, lever).x : shiftAt(q, lever).y);
    if (b.axis === 'x') Sx = -weight * gx; else Sy = -weight * gy;
    if (b.kind === 'strap') { const v = (Math.abs(q.N) * e + w) / Math.max(0.1, (b.L ?? 0) - e); V += v; N += v; }
  }
  const sxx = piles.reduce((t, p) => t + (p[0] - gx) ** 2, 0), syy = piles.reduce((t, p) => t + (p[1] - gy) ** 2, 0);
  return { R: piles.map((p) => N / n + (sxx > 1e-9 ? (Sx * (p[0] - gx)) / sxx : 0) + (syy > 1e-9 ? (Sy * (p[1] - gy)) / syy : 0)), V };
}

/** The share of a pile's reaction on the far side of a section at signed distance `t` past it (§13.4.2.5): all of it a half diameter past, none a half diameter short, linear between. */
export const beyondShare = (t: number, D: number): number => Math.max(0, Math.min(1, (t + D / 2) / D));

export interface CapAnalysis {
  layers: FootingLayers; lever: number; weight: number;
  cols: CapColumn[];
  service: number[]; factored: number[]; byCombo: Array<{ combo: string; R: number[] }>;
  x: FootingDirection; y: FootingDirection;
  result: CapResult;
  columnPunching: { vu: number; phiVc: number; utilization: number; bo: number; position: 'interior' | 'edge' | 'corner' } | null;
  dowels: { count: number; dia: number; ldc: number; ldh: number; available: number; lap: number; tension: boolean; above: number; offset: number; area: number; required: number } | null;
  bearing: { pu: number; phiBn: number };
  strap: { V: number; service: number } | null;
}

const layersOfCap = (a: FootingAdopted, cover: number): FootingLayers => {
  const lower = a.B >= a.L ? 'x' : 'y', dbL = (lower === 'x' ? a.x.dia : a.y.dia) / 1000, dbU = (lower === 'x' ? a.y.dia : a.x.dia) / 1000;
  const dLow = a.h - cover - dbL / 2, dUp = a.h - cover - dbL - dbU / 2;
  return { lower, dx: lower === 'x' ? dLow : dUp, dy: lower === 'x' ? dUp : dLow, d: (dLow + dUp) / 2 };
};

/** Every reading of a pile cap with these dimensions, piles and bars (CIRSOC 201 / ACI 318 §13.4, ch. 23). */
export function analyseCap(d: FootingDemand, c: FootingContext, a: FootingAdopted & { piles: CapPiles }, code: FootingRowCode): CapAnalysis {
  const spec = d.piles!, cr = critOf(c), cover = capCover(c.cover);
  const cols = placed(capColumns(d), a), lever = leverOf(d, a.h), stub = lever - a.h;
  const layers = layersOfCap(a, cover), dd = layers.d, D = spec.diameter, piles = a.piles.at;
  const weight = CONCRETE_WEIGHT * a.B * a.L * a.h;
  const balance = capBalance(d);
  const sv = pileLoads(cols, cols.map((k) => k.demand.service ?? undefined), piles, weight, balance, lever);
  const names = d.combos.map((k) => k.combo);
  const byCombo = names.map((n) => ({ combo: n, acts: cols.map((k) => k.demand.combos.find((q) => q.combo === n)) })).filter((k) => k.acts.every(Boolean))
    .map((k) => ({ combo: k.combo, acts: k.acts as FootingAction[], R: pileLoads(cols, k.acts, piles, CAP_WEIGHT_FACTOR * weight, balance, lever).R }));
  const factored = piles.map((_, i) => Math.max(0, ...byCombo.map((k) => k.R[i]!)));
  const root = sqrtFcCapped(c.fc), phi = 0.75;
  const plainVc = (beta: number, sides: number, bo: number) => Math.min(0.33, 0.17 * (1 + 2 / beta), 0.083 * (2 + ((sides >= 4 ? 40 : sides === 3 ? 30 : 20) * dd) / bo)) * root;
  const punching: CapResult['punching'] = [];
  let columnPunching: CapAnalysis['columnPunching'] = null;
  cols.forEach((col) => {
    const r = { x0: col.x - col.b / 2 - dd / 2, x1: col.x + col.b / 2 + dd / 2, y0: col.y - col.h / 2 - dd / 2, y1: col.y + col.h / 2 + dd / 2 };
    const sides = sidesIn(r, a.B, a.L);
    if (!sides.length) return;
    let worst = { vu: 0, phiVc: 1, bo: 0, combo: '' };
    for (const k of byCombo) {
      const q = k.acts[cols.indexOf(col)]!;
      const inside = piles.reduce((t, p, i) => t + k.R[i]! * (1 - beyondShare(Math.max(r.x0 - p[0], p[0] - r.x1, r.y0 - p[1], p[1] - r.y1), D)), 0);
      const st = sectionStress(sides, dd, Math.max(0, q.N - inside), q.Mx - stub * q.Vy, q.My + stub * q.Vx, col.x, col.y);
      const v = phi * plainVc(Math.max(col.b, col.h) / Math.max(1e-9, Math.min(col.b, col.h)), sides.length, st.bo);
      if (st.vu / v > worst.vu / worst.phiVc) worst = { vu: st.vu, phiVc: v, bo: st.bo, combo: k.combo };
    }
    punching.push({ at: col.demand.name, ...worst });
    if (!columnPunching || worst.vu / worst.phiVc > columnPunching.utilization) columnPunching = { vu: worst.vu, phiVc: worst.phiVc, utilization: worst.vu / worst.phiVc, bo: worst.bo, position: sides.length >= 4 ? 'interior' : sides.length === 3 ? 'edge' : 'corner' };
  });
  const side = 0.886 * D;
  piles.forEach((p, i) => {
    const sides = sidesIn({ x0: p[0] - side / 2 - dd / 2, x1: p[0] + side / 2 + dd / 2, y0: p[1] - side / 2 - dd / 2, y1: p[1] + side / 2 + dd / 2 }, a.B, a.L);
    if (!sides.length) return;
    const st = sectionStress(sides, dd, factored[i]!, 0, 0, p[0], p[1]);
    punching.push({ at: `P${i + 1}`, vu: st.vu, phiVc: phi * plainVc(1, sides.length, st.bo), bo: st.bo, combo: '' });
  });
  const farthest = Math.max(...cols.flatMap((col) => piles.map((p) => Math.hypot(p[0] - col.x, p[1] - col.y))));
  const deep = cols.length === 1 && farthest <= 2 * (a.h - PILE_EMBED) + 1e-9;
  const along = (dir: Axis, p: P2 | { x: number; y: number }) => (Array.isArray(p) ? p[dir === 'x' ? 0 : 1] : dir === 'x' ? p.x : p.y);
  const planeShear = (dir: Axis, s: number, side: 1 | -1, k: (typeof byCombo)[number]) =>
    Math.abs(piles.reduce((t, p, i) => t + k.R[i]! * beyondShare(side * (along(dir, p) - s), D), 0) - cols.reduce((t, col, j) => t + (side * (along(dir, col) - s) > 0 ? k.acts[j]!.N : 0), 0));
  const planeMoment = (dir: Axis, s: number, side: 1 | -1, k: (typeof byCombo)[number]) =>
    piles.reduce((t, p, i) => t + (side * (along(dir, p) - s) > 0 ? k.R[i]! * side * (along(dir, p) - s) : 0), 0) - cols.reduce((t, col, j) => t + (side * (along(dir, col) - s) > 0 ? k.acts[j]!.N * side * (along(dir, col) - s) : 0), 0);
  const shear: CapResult['shear'] = [];
  const prov = slabProvisions('2025', c.fy, a.h);
  const directions = (['x', 'y'] as const).map((dir) => {
    const W = dir === 'x' ? a.L : a.B, S = dir === 'x' ? a.B : a.L, dD = dir === 'x' ? layers.dx : layers.dy, m = dir === 'x' ? a.x : a.y;
    const faces = cols.flatMap((col) => { const half = (dir === 'x' ? col.b : col.h) / 2, s0 = along(dir, col); return [[s0 + half, 1], [s0 - half, -1]] as Array<[number, 1 | -1]>; });
    let mu = 0, mTop = 0, vu = 0, at = 0;
    for (const k of byCombo) for (const [s, sd] of faces) {
      const mm = planeMoment(dir, s, sd, k);
      mu = Math.max(mu, mm); mTop = Math.max(mTop, -mm);
      const sv2 = s + sd * dD;
      if (Math.abs(sv2) < S / 2 - 1e-6) { const v = planeShear(dir, sv2, sd, k); if (v > vu) { vu = v; at = sv2; } }
    }
    const pArea = meshArea(dir, { B: a.B, L: a.L, ex: 0, ey: 0 }, m, cover).area;
    const asFlex = mu > 1e-6 ? computeAsFlexure(mu / W, a.h, dD, c.fc, c.fy, '2025').As * W : 0;
    const asMin = prov.AsMin * W, phiMn = pArea > 0 ? stripCapacity(pArea / W, a.h, dD, c.fc, c.fy, '2025') * W : 0;
    const phiVc = phi * code.oneWayVc(c.fc, (pArea * 1e-4) / Math.max(W * dD, 1e-9)) * W * dD * 1000;
    if (!deep) shear.push({ dir, at, vu, phiVc });
    const cant = Math.min(...cols.map((col) => Math.min(S / 2 - (along(dir, col) + (dir === 'x' ? col.b : col.h) / 2), along(dir, col) - (dir === 'x' ? col.b : col.h) / 2 + S / 2)));
    const anchorage = layerAnchorage(code.anchorage, { fc: c.fc, fy: c.fy }, m, a.h, cover, Math.max(cant, 0));
    return { dir, mu, vu, width: W, d: dD, asReq: Math.max(asFlex, asMin), asMin, asProvided: pArea, phiMn, phiVc, anchorage: { ...anchorage, hooked: true, ok: anchorage.ok || !code.anchorage }, mTop } as FootingDirection & { mTop: number };
  });
  let stm: CapResult['stm'] = null;
  if (deep) {
    const z = 0.9 * dd, col = cols[0]!;
    const theta = Math.min(...piles.map((p) => Math.atan2(z, Math.max(1e-6, Math.hypot(p[0] - col.x, p[1] - col.y))))) * 180 / Math.PI;
    const tie = (dir: Axis) => Math.max(0, ...byCombo.map((k) => piles.reduce((t, p, i) => t + (along(dir, p) > along(dir, col) ? k.R[i]! * (along(dir, p) - along(dir, col)) / z : 0), 0)));
    const tx = tie('x'), ty = tie('y'), Ap = (Math.PI * D * D) / 4;
    stm = { z, theta, tx, ty, asx: (tx * 10) / (phi * c.fy), asy: (ty * 10) / (phi * c.fy), node: {
      column: Math.max(0, ...byCombo.map((k) => k.acts[0]!.N)), columnCap: phi * 0.85 * 1.0 * c.fc * (col.demand.column?.area ?? col.b * col.h) * 1000,
      pile: Math.max(0, ...factored), pileCap: phi * 0.85 * 0.6 * c.fc * Ap * 1000,
    } };
    directions[0]!.asReq = Math.max(directions[0]!.asReq, stm.asx);
    directions[1]!.asReq = Math.max(directions[1]!.asReq, stm.asy);
  }
  const Ap = (Math.PI * D * D) / 4, pu = Math.max(0, ...factored);
  const asPile = a.piles.bars.count * barArea(a.piles.bars.dia), asMin = cr.footingPileMinSteel * Ap * 1e4;
  const Po = 0.85 * c.fc * (Ap - asPile * 1e-4) * 1000 + c.fy * asPile * 1e-4 * 1000;
  const service = sv.R, n = piles.length;
  const capFc = c.columnFc ?? c.fc;
  const first = cols[0]!, bs = bearingStrength({ B: a.B, L: a.L, xc: first.x, yc: first.y, b: first.b, h: first.h, ...(first.demand.column?.area ? { area: first.demand.column.area } : {}) }, capFc, c.fc);
  const pu1 = Math.max(0, ...d.combos.map((k) => k.N)), phiBn = Math.min(bs.column, bs.footing);
  const an = code.anchorage, dw = a.dowels;
  const dowels = d.column && an && dw && dw.count > 0 ? (() => {
    const tension = c.columnBars?.tension ?? false, mat = { fc: c.fc, fy: c.fy };
    return {
      ...dw, area: dw.count * barArea(dw.dia), required: Math.max(d.column!.dowelMin ?? 0.005 * (d.column!.area ?? first.b * first.h) * 1e4, (10 * Math.max(0, pu1 - phiBn)) / (0.65 * c.fy)),
      ldc: an.ldc(mat, dw.dia), ldh: tension ? an.ldh(mat, dw.dia) : 0, available: a.h - cover - (a.x.dia + a.y.dia) / 1000,
      lap: dowelLap(an, c.columnBars, { fc: capFc, fy: c.fy }, dw.dia, tension), tension, ...dowelReach(c.columnBars, dw.dia, stub),
    };
  })() : null;
  const tieOn = !balance.some((b) => b.kind === 'strap');
  const tieForce = cr.footingPileTieShare * Math.max(0, ...d.combos.map((k) => k.N), ...(d.carried?.combos.map((k) => k.N) ?? []));
  const result: CapResult = {
    piles: piles.map((p, i) => ({ x: p[0], y: p[1], service: service[i]!, factored: factored[i]! })),
    diameter: D, length: a.piles.length, capacity: spec.capacity, source: spec.source, efficiency: spec.efficiency, spacing: critOf(c).footingPileSpacing * D, topCover: c.cover,
    group: { service: service.reduce((t, v) => t + v, 0), capacity: spec.efficiency * n * spec.capacity },
    deep, stm, shear, punching, section: { pu, phiPn: 0.65 * 0.8 * Po, as: asPile, asMin },
    tie: tieOn ? { force: tieForce, as: (tieForce * 10) / (0.9 * c.fy) } : null,
  };
  return {
    layers, lever, weight, cols, service, factored, byCombo: byCombo.map((k) => ({ combo: k.combo, R: k.R })),
    x: directions[0]!, y: directions[1]!, result, columnPunching, dowels, bearing: { pu: pu1, phiBn }, strap: sv.V > 0 ? { V: sv.V, service: sv.V } : null,
  };
}

/** Whether the cap holds: every pile under its allowable load and none pulled, the group under its efficiency, each section's shear and punching, the struts and nodes of a deep cap, d ≥ 300 mm (§13.3.1.2). */
export const capHolds = (r: CapAnalysis, withSteel = true): boolean => {
  const k = r.result;
  return Math.max(...k.piles.map((p) => p.service)) <= k.capacity + 1e-6 && Math.min(...k.piles.map((p) => p.service)) >= -1e-6 && k.group.service <= k.group.capacity + 1e-6
    && k.shear.every((s) => s.vu <= s.phiVc + 1e-6) && k.punching.every((p) => p.vu <= p.phiVc + 1e-6)
    && (!k.stm || (k.stm.theta >= 25 - 1e-9 && k.stm.node.column <= k.stm.node.columnCap + 1e-6 && k.stm.node.pile <= k.stm.node.pileCap + 1e-6))
    && Math.min(r.layers.dx, r.layers.dy) >= 0.3 - 1e-9
    && (!withSteel || k.section.pu <= k.section.phiPn + 1e-6);
};

/** A pile's bars as columns are, the soil confining it (GA §8.5): at least the criterion's share of its section and six bars, enough that φ·0,80·Po carries the largest factored load (§22.4.2.1), and hoops at the code's spacing (§25.7.2.1). */
export function pileBars(D: number, pu: number, c: Pick<FootingContext, 'fc' | 'fy' | 'criteria'>): CapPiles['bars'] & { hoop: CapPiles['hoop'] } {
  const Ap = (Math.PI * D * D) / 4, min = critOf(c).footingPileMinSteel * Ap * 1e4;
  for (const dia of PILE_BARS) for (let count = 6; count <= 24; count += 2) {
    const as = count * barArea(dia), Po = 0.85 * c.fc * (Ap - as * 1e-4) * 1000 + c.fy * as * 1e-4 * 1000;
    const pitch = (Math.PI * (D - 2 * PILE_COVER - 0.016 - dia / 1000)) / count;
    if (as >= min - 1e-9 && 0.65 * 0.8 * Po >= pu - 1e-6 && pitch >= 0.1) {
      const hd = dia > 25 ? 10 : 8;
      return { count, dia, hoop: { dia: hd, spacing: Math.floor(Math.min(16 * dia / 1000, 48 * hd / 1000, D, 0.3) / 0.025 + 1e-9) * 0.025 } };
    }
  }
  return { count: 24, dia: 25, hoop: { dia: 10, spacing: 0.3 } };
}

/** The cap's bottom meshes for its moments, struts' ties and the least steel, the depths read again from the bars chosen, of diameters whose end hooks stay inside the cap. */
export function capMeshes(d: FootingDemand, c: FootingContext, a: FootingAdopted & { piles: CapPiles }, code: FootingRowCode): { x: FootingMesh; y: FootingMesh } {
  const all = c.diameters.length ? [...c.diameters] : [12, 16, 20, 25], room = a.h - capCover(c.cover) - c.cover;
  const fit = all.filter((dia) => (HOOK_RISE * dia) / 1000 <= room + 1e-9), list = fit.length ? fit : [Math.min(...all)];
  let x: FootingMesh = { dia: list[0]!, spacing: 0.2 }, y: FootingMesh = { dia: list[0]!, spacing: 0.2 };
  for (let k = 0; k < 3; k++) {
    const r = analyseCap(d, c, { ...a, x, y }, code), s = footingSpacing(c, a.h).s;
    const nx = proposeLayer('x', { B: a.B, L: a.L, ex: 0, ey: 0 }, r.x.asReq, s, list, capCover(c.cover), true);
    const ny = proposeLayer('y', { B: a.B, L: a.L, ex: 0, ey: 0 }, r.y.asReq, s, list, capCover(c.cover), true);
    if (JSON.stringify([nx, ny]) === JSON.stringify([x, y])) break;
    x = { dia: nx.dia, spacing: nx.spacing }; y = { dia: ny.dia, spacing: ny.spacing };
  }
  return { x, y };
}

export { STEP_H as CAP_STEP_H, MAX_H as CAP_MAX_H, COUNTS as PILE_COUNTS, up as upCap, r3 as r3Cap };
