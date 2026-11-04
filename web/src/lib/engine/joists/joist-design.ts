/**
 * A joist-and-block panel designed joist by joist against the joist's data sheet.
 *
 * The floor is analysed as a one-way slab; along the joists each row of its elements gives the
 * moment per metre (the mean across the panel's width), and a joist takes that times its spacing,
 * shared between the joists of a double or triple. The joist is checked for the largest sagging
 * moment against its sheet's ultimate moment (plus any site bars added at the bottom), for the
 * shear of the panel's free body against its sheet's, and for its span against the sheet's; each
 * end that hogs gets site top bars (negatives), sized for the moment there and long enough to run
 * a quarter of the span and a development length (40·db) past it. The deflection follows the
 * construction: unpropped, the floor's own weight bends the joist alone, everything after bends
 * the finished floor (cracked once its moment passes the sheet's cracking moment); propped, the
 * finished floor carries it all; the long term multiplies the permanent part by 1 + λΔ = 3, against
 * span/240. The topping gets its distribution mat (§24.4.3.2 on the topping's thickness).
 *
 * Errors carry a code, a cause and a remedy (`joist.err.<code>.cause|fix`).
 */
import type { JoistSheet, BlockType } from './library';

export type JoistEnd = 'auto' | 'simple' | 'continuous';

export interface JoistSystem {
  typeId: string;
  /** Joists side by side at each position: single, double or triple. */
  multiplicity: 1 | 2 | 3;
  /** Spacing between joist positions, m. */
  spacing: number;
  block: BlockType;
  /** Topping thickness over the blocks, m. */
  topping: number;
  /** Direction the joists run: x or y. */
  direction: 'x' | 'y';
  propped: boolean;
  ends: { start: JoistEnd; end: JoistEnd };
  /** Site bars per joist position: top over each end that hogs, and extra bottom bars. */
  negatives?: { start?: { count: number; diameter: number; length: number }; end?: { count: number; diameter: number; length: number } };
  positives?: { count: number; diameter: number };
}

export interface JoistDemandRow { at: number; m: number }

export interface JoistPanelInput {
  panelId: string;
  /** Span along the joists and width across them, m. */
  span: number; width: number;
  /** Moment per metre along the joists at each row, kN·m/m (sagging positive), ordered along the span. */
  rows: JoistDemandRow[];
  /** Factored area load, kPa, for the shear's free body. */
  qu: number;
  /** Service loads, kPa: the floor's own weight is computed; superimposed dead and live given. */
  superDead: number; live: number;
  fc: number; fy: number; cover: number;
}

export type JoistErrorCode = 'J001' | 'J002' | 'J003' | 'J004' | 'J005' | 'J006' | 'J007';

export interface JoistDesign {
  mPos: number; mNegStart: number; mNegEnd: number; vu: number;
  capacity: { muPos: number; vu: number };
  utilization: { flexure: number; shear: number; deflection: number };
  deflection: { selfOnJoist: number; afterOnFloor: number; longTerm: number; total: number; limit: number };
  negatives: { start?: { count: number; diameter: number; length: number }; end?: { count: number; diameter: number; length: number } };
  distribution: { diameter: number; spacing: number };
  ends: { start: 'simple' | 'continuous'; end: 'simple' | 'continuous' };
  errors: JoistErrorCode[];
}

const area = (dMm: number) => Math.PI * (dMm / 2000) ** 2;
const HOG = 0.5; // kN·m/m: a hogging under this at an end reads as a simple support

/** Top bars per joist position for a hogging moment, kN·m: the fewest bars of the smallest diameter. */
export function siteNegatives(M: number, d: number, fy: number, span: number): { count: number; diameter: number; length: number } | null {
  const As = (M * 1000) / (0.9 * 0.9 * d * fy * 1e6);
  for (let n = 1; n <= 4; n++) for (const dia of [8, 10, 12, 16]) {
    if (n * area(dia) >= As - 1e-12) return { count: n, diameter: dia, length: +(span / 4 + 40 * dia / 1000).toFixed(2) };
  }
  return null;
}

export function floorSelfWeight(s: Pick<JoistSystem, 'block' | 'topping' | 'spacing' | 'multiplicity'>, joistWeight: number): number {
  // Blocks, the topping over the whole floor and the joists, per square metre.
  return s.block.weight + 25 * s.topping + (joistWeight * s.multiplicity) / s.spacing;
}

export function designJoistPanel(p: JoistPanelInput, s: JoistSystem, sheet: JoistSheet | undefined): JoistDesign {
  const errors: JoistErrorCode[] = [];
  const n = s.multiplicity, sp = s.spacing;
  const mPos = Math.max(0, ...p.rows.map((r) => r.m)) * sp;
  const quarter = p.span / 4;
  const first = p.rows.filter((r) => r.at <= (p.rows[0]?.at ?? 0) + quarter);
  const last = p.rows.filter((r) => r.at >= (p.rows[p.rows.length - 1]?.at ?? 0) - quarter);
  const hog = (rs: JoistDemandRow[]) => Math.max(0, ...rs.map((r) => -r.m));
  const ends = {
    start: s.ends.start === 'auto' ? (hog(first) > HOG ? 'continuous' : 'simple') : s.ends.start,
    end: s.ends.end === 'auto' ? (hog(last) > HOG ? 'continuous' : 'simple') : s.ends.end,
  } as const;
  const mNegStart = ends.start === 'continuous' ? hog(first) * sp : 0;
  const mNegEnd = ends.end === 'continuous' ? hog(last) * sp : 0;
  const vu = p.qu * sp * p.span / 2 * (ends.start !== ends.end ? 1.15 : 1);
  if (!p.rows.length) errors.push('J007');
  if (!sheet) {
    errors.push('J005');
    return { mPos, mNegStart, mNegEnd, vu, capacity: { muPos: 0, vu: 0 }, utilization: { flexure: Infinity, shear: Infinity, deflection: Infinity }, deflection: { selfOnJoist: 0, afterOnFloor: 0, longTerm: 0, total: 0, limit: p.span / 240 }, negatives: {}, distribution: { diameter: 6, spacing: 0.25 }, ends, errors };
  }
  const floorH = s.block.height + s.topping;
  const d = floorH - p.cover - 0.006;
  const extra = s.positives ? 0.9 * s.positives.count * area(s.positives.diameter) * p.fy * 1000 * 0.9 * d : 0;
  const muPos = n * sheet.muPos + extra;
  const flexure = muPos > 0 ? mPos / muPos : Infinity;
  if (flexure > 1 + 1e-9) errors.push('J001');
  const shear = sheet.vu > 0 ? vu / (n * sheet.vu) : Infinity;
  if (shear > 1 + 1e-9) errors.push('J002');
  if (p.span > sheet.maxSpan + 1e-9) errors.push('J004');

  // Negatives: the person's, or sized here.
  const negatives: JoistDesign['negatives'] = {};
  for (const [k, M] of [['start', mNegStart], ['end', mNegEnd]] as const) {
    if (!(M > 0)) continue;
    const given = s.negatives?.[k];
    const need = siteNegatives(M, d, p.fy, p.span);
    if (!need) { errors.push('J006'); continue; }
    if (given) {
      negatives[k] = given;
      if (given.count * area(given.diameter) < (M * 1000) / (0.9 * 0.9 * d * p.fy * 1e6) - 1e-12) errors.push('J006');
    } else negatives[k] = need;
  }

  // Deflection with the construction process.
  const L = p.span;
  const coef = ends.start === 'continuous' && ends.end === 'continuous' ? 2 : ends.start === 'continuous' || ends.end === 'continuous' ? 2.5 : 5;
  const delta = (w: number, EI: number) => (coef * w * L ** 4) / (384 * Math.max(EI, 1e-9));
  const own = floorSelfWeight(s, sheet.selfWeight) * sp;     // kN/m per joist position
  const dead = p.superDead * sp, live = p.live * sp;
  const Ma = ((own + dead + live) * L ** 2) / 8;
  const EIfloor = n * (Ma > n * sheet.mcr ? sheet.eiCracked : sheet.eiGross);
  const selfOnJoist = s.propped ? 0 : delta(own, n * sheet.eiJoist);
  const afterOnFloor = delta((s.propped ? own : 0) + dead + live, EIfloor);
  const permanent = selfOnJoist + delta((s.propped ? own : 0) + dead, EIfloor);
  const longTerm = 2 * permanent;
  const total = selfOnJoist + afterOnFloor + longTerm;
  const limit = L / 240;
  if (total > limit + 1e-12) errors.push('J003');

  // Distribution mat in the topping.
  const asMin = 0.0018 * s.topping;
  const dist = [6, 8].map((dia) => ({ diameter: dia, spacing: Math.min(0.3, Math.floor((area(dia) / asMin) / 0.025) * 0.025) })).find((x) => x.spacing >= 0.1) ?? { diameter: 8, spacing: 0.1 };

  return {
    mPos, mNegStart, mNegEnd, vu,
    capacity: { muPos, vu: n * sheet.vu },
    utilization: { flexure, shear, deflection: total / limit },
    deflection: { selfOnJoist, afterOnFloor, longTerm, total, limit },
    negatives, distribution: { diameter: dist.diameter, spacing: +dist.spacing.toFixed(3) }, ends, errors,
  };
}

/** The lightest type, then multiplicity, that carries the panel without an error of strength. */
export function proposeJoistSystem(p: JoistPanelInput, base: Omit<JoistSystem, 'typeId' | 'multiplicity'>, types: ReadonlyArray<{ id: string; sheet?: JoistSheet }>): JoistSystem {
  const ordered = types.filter((t) => t.sheet).sort((a, b) => a.sheet!.muPos - b.sheet!.muPos);
  for (const m of [1, 2, 3] as const) for (const t of ordered) {
    const s: JoistSystem = { ...base, typeId: t.id, multiplicity: m };
    const r = designJoistPanel(p, s, t.sheet);
    if (!r.errors.some((e) => e === 'J001' || e === 'J002' || e === 'J004' || e === 'J003')) return s;
  }
  return { ...base, typeId: ordered[ordered.length - 1]?.id ?? '', multiplicity: 3 };
}

/** Group values within a tolerance (sorted, greedy), each group taking its largest. */
export function equalizeWithin(values: ReadonlyArray<{ key: string; value: number }>, tol: number): Map<string, number> {
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const out = new Map<string, number>();
  let group: typeof sorted = [];
  const flush = () => { const top = Math.max(...group.map((g) => g.value)); for (const g of group) out.set(g.key, top); group = []; };
  for (const v of sorted) {
    if (group.length && v.value > group[0]!.value * (1 + tol) + 1e-12) flush();
    group.push(v);
  }
  if (group.length) flush();
  return out;
}
