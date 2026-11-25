import { slabProvisions } from '../engine/codes/argentina/losas';
import { pileCapacity, pileCentres } from '../model/foundation/piles';
import { barArea } from './bars';
import { critOf } from './criteria';
import { shiftAt } from './footing-balance';
import { dowelArea, dowelLap, dowelReach, footingSpacing, foundingOf, layersOf, leverOf, stripReading, type FootingRowCode } from './footing-design';
import { alphaOfSides, bearingStrength, ceilTo, CONCRETE_WEIGHT, plainPunchingVc, r3 } from './footing-mechanics';
import { barPitch, layerAnchorage, meshArea, proposeLayer } from './footing-mesh';
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
const CAP_WEIGHT_UPLIFT = 0.9;
const STEP_H = 0.05, MAX_H = 3;
const PILE_BARS = [12, 16, 20, 25];
/** A hooked bottom bar rises about this many of its diameters over its axis: its bend and the hook's leg, which must stay under the cap's top cover. */
const HOOK_RISE = 17;
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
  return grid(rows, cols, s, along);
}

const grid = (rows: number, cols: number, s: number, along: Axis): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) out.push([(j - (cols - 1) / 2) * s, (i - (rows - 1) / 2) * s]);
  return along === 'x' ? out : out.map(([x, y]) => [y, x]);
};

/**
 * Every pattern of `n` piles worth trying under a footprint `aspect` times longer along `along`
 * than across: the classic two, three and four, five in a quincunx, full grids whose rows keep
 * near the footprint's proportion, and one line under a long wall. None for a count no such grid makes.
 */
export function pilePatterns(n: number, s: number, along: Axis, aspect = 1): P2[][] {
  const out: P2[][] = [];
  if (n <= 4) out.push(pilePattern(n, s, along));
  if (n === 5) { const k = s / Math.SQRT2; out.push([[-k, -k], [k, -k], [0, 0], [-k, k], [k, k]]); }
  const want = Math.min(4, Math.max(1, aspect));
  for (let rows = 2; rows * rows <= n; rows++) {
    const cols = n / rows;
    if (!Number.isInteger(cols) || (n <= 4 && rows * cols === 4)) continue;
    if (cols / rows <= 2 * want + 1e-9 && cols / rows >= want / 2 - 1e-9) out.push(grid(rows, cols, s, along));
  }
  if (n >= 3 && want >= 2.5 && n <= 2 * want + 1) out.push(grid(1, n, s, along));
  return out;
}
const COUNTS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 25, 30, 36];

/** How the cap's offset at a property line is taken: by a strap to the cap inward, by a tie at the first floor, or by the piles themselves. */
export interface CapBalance { axis: Axis; sign: number; kind: 'strap' | 'tie' | 'piles'; L?: number }

export function capBalance(d: FootingDemand): CapBalance[] {
  if (d.carried || !d.edge) return [];
  return (['x', 'y'] as const).flatMap((axis): CapBalance[] => {
    const sign = d.edge!.anchor[axis === 'x' ? 0 : 1];
    if (!sign) return [];
    const partner = d.edge!.partners.find((p) => p.axis === axis);
    if (d.edge!.balance === 'strap' && partner) return [{ axis, sign, kind: 'strap', L: partner.L }];
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
    const len = l.lo !== null && l.hi !== null ? hi - lo : ceilTo(hi - lo);
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
 * axis a strap balances, the offset and the column's moment are the structure's, and the strap
 * adds its end force V = (P·e + |w|)/(L − e). `unheld` is the moment about an axis the piles
 * stand in one line along, which they cannot take.
 */
export function pileLoads(cols: ReadonlyArray<CapColumn>, acts: ReadonlyArray<FootingAction | undefined>, piles: readonly P2[], weight: number, balance: readonly CapBalance[], lever: number): { R: number[]; V: number; unheld: number } {
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
    if (!q || b.kind === 'piles') continue;
    const e = Math.abs(b.axis === 'x' ? c.x - gx : c.y - gy), w = Math.abs(b.axis === 'x' ? shiftAt(q, lever).x : shiftAt(q, lever).y);
    if (b.axis === 'x') Sx = -weight * gx; else Sy = -weight * gy;
    if (b.kind === 'strap') { const v = (Math.abs(q.N) * e + w) / Math.max(0.1, (b.L ?? 0) - e); V += v; N += v; }
  }
  const sxx = piles.reduce((t, p) => t + (p[0] - gx) ** 2, 0), syy = piles.reduce((t, p) => t + (p[1] - gy) ** 2, 0);
  const unheld = Math.max(sxx > 1e-9 ? 0 : Math.abs(Sx), syy > 1e-9 ? 0 : Math.abs(Sy));
  return { R: piles.map((p) => N / n + (sxx > 1e-9 ? (Sx * (p[0] - gx)) / sxx : 0) + (syy > 1e-9 ? (Sy * (p[1] - gy)) / syy : 0)), V, unheld };
}

/** The mesh of a deep cap, spread over it, carries at least this share of its ties' steel; the rest is in bands over the piles. */
export const CAP_SECONDARY = 0.25;

/** The lines of piles the bars along `dir` cross over, m across from the cap's centroid: each holding two piles or more. */
export function bandLines(piles: readonly P2[], dir: Axis): number[] {
  const across = (p: P2) => Math.round(p[dir === 'x' ? 1 : 0] * 1000);
  const by = new Map<number, number>();
  for (const p of piles) by.set(across(p), (by.get(across(p)) ?? 0) + 1);
  return [...by].filter(([, n]) => n >= 2).map(([k]) => k / 1000).sort((p, q) => p - q);
}

/** A band's width over a line of piles, m: the pile's diameter and twice the height of the bars' axis over the pile heads. */
export const bandWidth = (D: number, cover: number, dia: number): number => D + 2 * Math.max(0, capCover(cover) + dia / 2000 - PILE_EMBED);

/** The share of a pile's reaction on the far side of a section at signed distance `t` past it (§13.4.6.7): all of it a half diameter past, none a half diameter short, linear between. */
export const beyondShare = (t: number, D: number): number => Math.max(0, Math.min(1, (t + D / 2) / D));

/** A cap's top face along one axis: the moment that bends it upward, kN·m, the steel it asks and has, cm², and the bars' φMn. */
export interface CapTop { m: number; as: number; provided: number; phiMn: number }

/** A top moment under this, kN·m, is rounding: no top bars are asked. */
export const CAP_TOP_TOL = 1;

/** φ of a pile's bars in tension (§21.2.2, tension-controlled). */
export const PILE_TENSION_PHI = 0.9;

export interface CapAnalysis {
  layers: FootingLayers; lever: number; weight: number;
  cols: CapColumn[];
  service: number[]; factored: number[]; byCombo: Array<{ combo: string; R: number[] }>;
  /** A tie was asked at the line: a cap takes its offset on its piles instead. */
  tieAsked: boolean;
  /** The least pile load under the factored combinations, kN: below zero a pile is pulled. */
  leastFactored: number;
  /** The largest moment, kN·m, about an axis the piles stand in one line along: what no pile load can take. */
  unheld: number;
  x: FootingDirection & { top: CapTop }; y: FootingDirection & { top: CapTop };
  result: CapResult;
  columnPunching: { vu: number; phiVc: number; utilization: number; bo: number; position: 'interior' | 'edge' | 'corner' } | null;
  dowels: { count: number; dia: number; ldc: number; ldh: number; available: number; lap: number; tension: boolean; above: number; offset: number; area: number; required: number } | null;
  bearing: { pu: number; phiBn: number };
  strap: { V: number; service: number } | null;
}

/** Every reading of a pile cap with these dimensions, piles and bars (CIRSOC 201 / ACI 318 §13.4, ch. 23). */
export function analyseCap(d: FootingDemand, c: FootingContext, a: FootingAdopted & { piles: CapPiles }, code: FootingRowCode): CapAnalysis {
  const spec = d.piles!, cr = critOf(c), cover = capCover(c.cover);
  const cols = placed(capColumns(d), a), lever = leverOf(d, a.h), stub = lever - a.h;
  const layers = layersOf(a, cover), dd = layers.d, D = spec.diameter, piles = a.piles.at;
  const weight = CONCRETE_WEIGHT * a.B * a.L * a.h;
  const head = Math.max(0, d.at.z - foundingOf(d, a.h));
  const read = spec.strata ? pileCapacity(spec.strata, D, a.piles.length, head) : null, capacity = read ? read.total : spec.capacity;
  const bottom = spec.strata?.reduce((t, s) => t + s.thickness, 0) ?? 0;
  const balance = capBalance(d);
  const sv = pileLoads(cols, cols.map((k) => k.demand.service ?? undefined), piles, weight, balance, lever);
  const names = d.combos.map((k) => k.combo);
  const byCombo = names.map((n) => ({ combo: n, acts: cols.map((k) => k.demand.combos.find((q) => q.combo === n)) })).filter((k) => k.acts.every(Boolean))
    .map((k) => { const l = pileLoads(cols, k.acts, piles, CAP_WEIGHT_FACTOR * weight, balance, lever); return { combo: k.combo, acts: k.acts as FootingAction[], R: l.R, unheld: l.unheld }; });
  const factored = piles.map((_, i) => Math.max(0, ...byCombo.map((k) => k.R[i]!)));
  const leastFactored = Math.min(...byCombo.flatMap((k) => pileLoads(cols, k.acts, piles, CAP_WEIGHT_UPLIFT * weight, balance, lever).R));
  const unheld = Math.max(sv.unheld, ...byCombo.map((k) => k.unheld));
  const pull = { service: Math.max(0, -Math.min(...sv.R)), factored: Math.max(0, -leastFactored), shaft: read ? read.shaft : null };
  const phi = 0.75, strip = stripReading(c, a.h, code);
  const plainVc = (beta: number, sides: number, bo: number) => plainPunchingVc(c.fc, beta, alphaOfSides(sides), dd, bo);
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
    const lines = [...new Set(piles.map((p) => along(dir, p)))].flatMap((s) => [[s, 1], [s, -1]] as Array<[number, 1 | -1]>);
    let mu = 0, mTop = 0, vu = 0, at = 0;
    for (const k of byCombo) for (const [s, sd] of lines) mTop = Math.max(mTop, -planeMoment(dir, s, sd, k));
    for (const k of byCombo) for (const [s, sd] of faces) {
      const mm = planeMoment(dir, s, sd, k);
      mu = Math.max(mu, mm); mTop = Math.max(mTop, -mm);
      const sv2 = s + sd * dD;
      if (Math.abs(sv2) < S / 2 - 1e-6) { const v = planeShear(dir, sv2, sd, k); if (v > vu) { vu = v; at = sv2; } }
    }
    const pArea = meshArea(dir, { B: a.B, L: a.L, ex: 0, ey: 0 }, m, cover).area;
    const asFlex = strip.asOf(mu, W, dD);
    const asMin = prov.AsMin * W, phiMn = strip.capOf(pArea, W, dD);
    const phiVc = strip.vcOf(pArea, W, dD);
    if (!deep) shear.push({ dir, at, vu, phiVc });
    const top = a.tops?.[dir], dTop = a.h - c.cover - (dir === 'y' && a.tops?.x ? a.tops.x.dia / 1000 : 0) - (top?.dia ?? 16) / 2000;
    const topArea = top ? meshArea(dir, { B: a.B, L: a.L, ex: 0, ey: 0 }, top, c.cover).area : 0;
    const topSide = { m: mTop, as: mTop > CAP_TOP_TOL ? strip.asOf(mTop, W, dTop) : 0, provided: topArea, phiMn: topArea > 0 ? strip.capOf(topArea, W, dTop) : 0 };
    const cant = Math.min(...cols.map((col) => Math.min(S / 2 - (along(dir, col) + (dir === 'x' ? col.b : col.h) / 2), along(dir, col) - (dir === 'x' ? col.b : col.h) / 2 + S / 2)));
    const anchorage = layerAnchorage(code.anchorage, { fc: c.fc, fy: c.fy }, m, a.h, cover, Math.max(cant, 0));
    return { dir, mu, vu, width: W, d: dD, asReq: Math.max(asFlex, asMin), asMin, asProvided: pArea, phiMn, phiVc, anchorage: { ...anchorage, hooked: true, ok: anchorage.ok || !code.anchorage }, mTop, top: topSide } as FootingDirection & { mTop: number; top: CapTop };
  });
  let stm: CapResult['stm'] = null;
  if (deep) {
    const z = 0.9 * dd, col = cols[0]!;
    const theta = Math.min(...piles.map((p) => Math.atan2(z, Math.max(1e-6, Math.hypot(p[0] - col.x, p[1] - col.y))))) * 180 / Math.PI;
    const tie = (dir: Axis) => Math.max(0, ...byCombo.map((k) => piles.reduce((t, p, i) => t + (along(dir, p) > along(dir, col) ? k.R[i]! * (along(dir, p) - along(dir, col)) / z : 0), 0)));
    const tx = tie('x'), ty = tie('y'), Ap = (Math.PI * D * D) / 4;
    const banded = (dir: Axis) => bandLines(piles, dir).length > 0;
    const laid = (dir: Axis) => meshArea(dir, { B: a.B, L: a.L, ex: 0, ey: 0 }, dir === 'x' ? a.x : a.y, cover);
    const between = (dir: Axis) => { if (bandLines(piles, dir).length < 2) return null; const l = laid(dir); return l.area - l.band; };
    const pitch = (dir: Axis) => { const b = (dir === 'x' ? a.x : a.y).bands; return b && b.count > 1 ? { at: (b.width - (dir === 'x' ? a.x : a.y).dia / 1000) / (b.count - 1), least: barPitch((dir === 'x' ? a.x : a.y).dia) } : null; };
    const inBand = (dir: Axis) => { const m = dir === 'x' ? a.x : a.y; return banded(dir) && m.bands ? meshArea(dir, { B: a.B, L: a.L, ex: 0, ey: 0 }, m, cover).band : directions[dir === 'x' ? 0 : 1]!.asProvided; };
    stm = { z, theta, tx, ty, asx: (tx * 10) / (phi * c.fy), asy: (ty * 10) / (phi * c.fy), banded: { x: banded('x'), y: banded('y') }, tie: { x: inBand('x'), y: inBand('y') }, mesh: { x: between('x'), y: between('y') }, pitch: { x: pitch('x'), y: pitch('y') }, node: {
      column: Math.max(0, ...byCombo.map((k) => k.acts[0]!.N)), columnCap: phi * 0.85 * 1.0 * c.fc * (col.demand.column?.area ?? col.b * col.h) * 1000,
      pile: Math.max(0, ...factored), pileCap: phi * 0.85 * 0.6 * c.fc * Ap * 1000,
    } };
    const share = (dir: Axis) => (!stm!.banded[dir] ? 1 : stm!.mesh[dir] === null ? 0 : CAP_SECONDARY);
    directions[0]!.asReq = Math.max(directions[0]!.asReq, share('x') * stm.asx);
    directions[1]!.asReq = Math.max(directions[1]!.asReq, share('y') * stm.asy);
  }
  const Ap = (Math.PI * D * D) / 4, pu = Math.max(0, ...factored);
  const asPile = a.piles.bars.count * barArea(a.piles.bars.dia), asMin = cr.footingPileMinSteel * Ap * 1e4;
  const tension = { ...pull, capacity: pull.shaft === null ? 0 : cr.footingPileTensionShare * pull.shaft, share: cr.footingPileTensionShare, phiTn: (PILE_TENSION_PHI * c.fy * asPile) / 10 };
  const Po = 0.85 * c.fc * (Ap - asPile * 1e-4) * 1000 + c.fy * asPile * 1e-4 * 1000;
  const service = sv.R, n = piles.length;
  const capFc = c.columnFc ?? c.fc;
  const first = cols[0]!, bs = bearingStrength({ B: a.B, L: a.L, xc: first.x, yc: first.y, b: first.b, h: first.h, ...(first.demand.column?.area ? { area: first.demand.column.area } : {}) }, capFc, c.fc);
  const pu1 = Math.max(0, ...d.combos.map((k) => k.N)), phiBn = Math.min(bs.column, bs.footing);
  const an = code.anchorage, dw = a.dowels;
  const dowels = d.column && an && dw && dw.count > 0 ? (() => {
    const tension = c.columnBars?.tension ?? false, mat = { fc: c.fc, fy: c.fy };
    return {
      ...dw, area: dowelArea(c.columnBars, dw), required: Math.max(d.column!.dowelMin ?? 0.005 * (d.column!.area ?? first.b * first.h) * 1e4, (10 * Math.max(0, pu1 - phiBn)) / (0.65 * c.fy)),
      ldc: an.ldc(mat, dw.dia), ldh: tension ? an.ldh(mat, dw.dia) : 0, available: a.h - cover - (a.x.dia + a.y.dia) / 1000,
      lap: dowelLap(an, c.columnBars, { fc: capFc, fy: c.fy }, dw.dia, tension), tension, ...dowelReach(c.columnBars, dw.dia, stub),
    };
  })() : null;
  const tieOn = !balance.some((b) => b.kind === 'strap');
  const tieForce = cr.footingPileTieShare * Math.max(0, ...d.combos.map((k) => k.N), ...(d.carried?.combos.map((k) => k.N) ?? []));
  const result: CapResult = {
    piles: piles.map((p, i) => ({ x: p[0], y: p[1], service: service[i]!, factored: factored[i]! })),
    diameter: D, length: a.piles.length, capacity, head, ...(read?.beyondStrata ? { beyond: bottom } : {}), source: spec.source, efficiency: spec.efficiency, spacing: critOf(c).footingPileSpacing * D, topCover: c.cover,
    group: { service: service.reduce((t, v) => t + v, 0), capacity: spec.efficiency * n * capacity },
    deep, stm, shear, punching, section: { pu, phiPn: PILE_PHI * 0.8 * Po, as: asPile, asMin }, tension,
    tie: tieOn ? { force: tieForce, as: (tieForce * 10) / (0.9 * c.fy) } : null,
  };
  return {
    layers, lever, weight, cols, service, factored, leastFactored: Number.isFinite(leastFactored) ? leastFactored : 0, unheld, tieAsked: d.edge?.balance === 'tie', byCombo: byCombo.map((k) => ({ combo: k.combo, R: k.R })),
    x: directions[0]! as FootingDirection & { top: CapTop }, y: directions[1]! as FootingDirection & { top: CapTop }, result, columnPunching, dowels, bearing: { pu: pu1, phiBn }, strap: sv.V > 0 ? { V: sv.V, service: sv.V } : null,
  };
}

/** Whether the cap holds: every pile under its allowable load and none pulled, service or factored, no moment across a line of piles, the group under its efficiency, each section's shear and punching, the struts and nodes of a deep cap, d ≥ 300 mm (§13.4.6.2). */
export const capHolds = (r: CapAnalysis, withSteel = true): boolean => {
  const k = r.result;
  return k.beyond === undefined && Math.max(...k.piles.map((p) => p.service)) <= k.capacity + 1e-6 && pullHolds(k.tension) && r.unheld <= PILE_UNHELD_TOL
    && [r.x, r.y].every((x) => x.top.m <= CAP_TOP_TOL || x.top.phiMn >= x.top.m - 1e-6) && k.group.service <= k.group.capacity + 1e-6
    && k.shear.every((s) => s.vu <= s.phiVc + 1e-6) && k.punching.every((p) => p.vu <= p.phiVc + 1e-6)
    && (!k.stm || (k.stm.theta >= 25 - 1e-9 && k.stm.node.column <= k.stm.node.columnCap + 1e-6 && k.stm.node.pile <= k.stm.node.pileCap + 1e-6))
    && Math.min(r.layers.dx, r.layers.dy) >= 0.3 - 1e-9
    && (!withSteel || k.section.pu <= k.section.phiPn + 1e-6);
};

/** Whether a pile pulled holds: its pull, service or factored, within the shaft friction the criterion lets it count (none by default, so no pile is pulled in any combination), and its factored pull within its bars. */
export const pullHolds = (t: CapResult['tension']): boolean => Math.max(t.service, t.factored) <= t.capacity + 1e-6 && t.factored <= t.phiTn + 1e-6;

/** The strength reduction of a cast-in-place pile without a casing (Table 13.4.3.2(a)), the pile the sheets presume. */
export const PILE_PHI = 0.55;

/** A moment across a line of piles under this, kN·m, is rounding. */
export const PILE_UNHELD_TOL = 0.5;

/** A pile's bars as columns are, the soil confining it (GA §8.5): at least the criterion's share of its section and six bars, enough that φ·0,80·Po carries the largest factored load (§22.4.2.1, φ of Table 13.4.3.2), and hoops at the code's spacing (§25.7.2.1). */
export function pileBars(D: number, pu: number, c: Pick<FootingContext, 'fc' | 'fy' | 'criteria'>, tu = 0): CapPiles['bars'] & { hoop: CapPiles['hoop'] } {
  const Ap = (Math.PI * D * D) / 4, min = critOf(c).footingPileMinSteel * Ap * 1e4;
  for (const dia of PILE_BARS) for (let count = 6; count <= 24; count += 2) {
    const as = count * barArea(dia), Po = 0.85 * c.fc * (Ap - as * 1e-4) * 1000 + c.fy * as * 1e-4 * 1000;
    const pitch = (Math.PI * (D - 2 * PILE_COVER - 0.016 - dia / 1000)) / count;
    if (as >= min - 1e-9 && PILE_PHI * 0.8 * Po >= pu - 1e-6 && (PILE_TENSION_PHI * c.fy * as) / 10 >= tu - 1e-6 && pitch >= 0.1) {
      const hd = dia > 25 ? 10 : 8;
      return { count, dia, hoop: { dia: hd, spacing: Math.floor(Math.min(16 * dia / 1000, 48 * hd / 1000, D, 0.3) / 0.025 + 1e-9) * 0.025 } };
    }
  }
  return { count: 24, dia: 25, hoop: { dia: 10, spacing: 0.3 } };
}

/**
 * The cap's bottom meshes for its moments, struts' ties and the least steel, the depths read again
 * from the bars chosen, of diameters whose end hooks stay inside the cap. A deep cap's ties lie in
 * bands over its lines of piles, each band with its share of the tie, its bars 10 cm apart or
 * 7,5 cm when no diameter fits, a bar's pitch at the least; the mesh between two bands or more carries a quarter of them.
 */
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
  const r = analyseCap(d, c, { ...a, x, y }, code), t = r.result.stm;
  if (!t) return { x, y };
  const size = { B: a.B, L: a.L, ex: 0, ey: 0 }, s = footingSpacing(c, a.h).s;
  const banded = (dir: Axis, m: FootingMesh): FootingMesh => {
    const lines = bandLines(a.piles.at, dir), tie = dir === 'x' ? t.asx : t.asy;
    if (!lines.length || tie <= 1e-9) return m;
    const tries = list.filter((dia) => dia >= m.dia), top = tries[tries.length - 1] ?? m.dia;
    const band = (dia: number) => { const width = bandWidth(a.piles.diameter, c.cover, dia), count = Math.max(2, Math.ceil(tie / lines.length / barArea(dia) - 1e-9)); return { width, count, pitch: (width - dia / 1000) / (count - 1) }; };
    const dia = [0.1, 0.075, 0].flatMap((floor) => tries.filter((k) => { const b = band(k); return b.pitch >= Math.max(floor, barPitch(k)) - 1e-9; }))[0] ?? top;
    const { width, count } = band(dia);
    const mesh = dia === m.dia ? m : proposeLayer(dir, size, (dir === 'x' ? r.x : r.y).asReq, s, [dia], capCover(c.cover), true);
    let out: FootingMesh = { dia, spacing: mesh.spacing, bands: { at: lines, width, count } };
    const between = (k: FootingMesh) => { const l = meshArea(dir, size, k, capCover(c.cover)); return l.area - l.band; };
    for (let i = 0; i < 20 && lines.length >= 2 && between(out) < CAP_SECONDARY * tie - 1e-9 && out.spacing > 0.075 + 1e-9; i++) out = { ...out, spacing: Math.round((out.spacing - 0.025) * 1000) / 1000 };
    return out;
  };
  return { x: banded('x', x), y: banded('y', y) };
}

/** The cap's top bars, along each axis a load off its piles bends it upward on: the lightest mesh of the diameters offered whose φMn takes that moment, the depth read again from the bars chosen. */
export function capTops(d: FootingDemand, c: FootingContext, a: FootingAdopted & { piles: CapPiles }, code: FootingRowCode): FootingAdopted['tops'] {
  const all = c.diameters.length ? [...c.diameters] : [12, 16, 20, 25], size = { B: a.B, L: a.L, ex: 0, ey: 0 }, s = footingSpacing(c, a.h).s;
  let tops: FootingAdopted['tops'] = undefined;
  for (let k = 0; k < 3; k++) {
    const r = analyseCap(d, c, { ...a, ...(tops ? { tops } : {}) }, code);
    const next: NonNullable<FootingAdopted['tops']> = {};
    for (const x of [r.x, r.y]) if (x.top.m > CAP_TOP_TOL) next[x.dir] = proposeLayer(x.dir, size, x.top.as, s, all, c.cover, true);
    const done = Object.keys(next).length ? next : undefined;
    if (JSON.stringify(done) === JSON.stringify(tops)) break;
    tops = done;
  }
  return tops;
}

export { STEP_H as CAP_STEP_H, MAX_H as CAP_MAX_H, COUNTS as PILE_COUNTS, ceilTo as upCap, r3 as r3Cap };
