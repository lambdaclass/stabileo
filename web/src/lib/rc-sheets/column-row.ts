import { checkSlender, type ConcreteDesignParams } from '../engine/codes/argentina/cirsoc201';
import { COLUMN_STEEL_RATIO, shearFy } from '../engine/codes/argentina/cirsoc201-basis';
import { withSection, type Bar } from '../engine/codes/argentina/cirsoc201-section';
import { evaluateBeamSections, type BeamSectionQuery } from '../engine/codes/argentina/cirsoc201-beam-kernel';
import { columnTieSpacing } from '../codes/cirsoc201/transverse-spacing';
import { minClearSpacingColumn } from '../codes/cirsoc201/spacing';
import { barArea, roundDown } from './bars';
import { compressionLapMm, confinementOf, deriveDevelopment, deriveLap } from '../codes/cirsoc201/anchorage';
import { unbracedClearLimit } from '../codes/cirsoc201/transverse-cage';
import { mainCoverCheck } from './beam-row';
import { columnConfinementOf, columnSeismic, type ConfinedTies, type Seismic } from './seismic';
import { columnLeastMn } from '../engine/design/seismic/frame-checks';
import { highAxialColumn } from '../engine/design/seismic/capacity';
import type { Fmt } from './format';
import { aciDeltaS, firstOrderM2, storeySways, swayFactor, swayMagnified, type CaseSway } from './column-sway';
import { SWAY_Q_LIMIT } from '../engine/design/sway';
import { COLUMN_PITCH, COLUMN_PRACTICAL_CLEAR, barClearance, columnLayout, growColumn, growSymmetric, heldBars, heldOptions, innerTies, layoutDias, pickPractical, startCounts, tiedRule, type InnerRow } from './column-layout';
import { COLUMN_BAR_RANGE, allowedTie, check, listIn, nextTie, ratioOf, tieDiametersOf, tieFloorOf, type TransverseList, type CheckLine, type ColumnAdopted, type ComboTable, type Materials, type RowStatus, type Step, type StepGroup, isGenerous } from './types';

const EDITION = '2025' as const;
/** The FIUBA course's widest spacing of a column's bars along a face, m (§15.8). */
const COURSE_PITCH = 0.3;
/** §18.7.4.1: a special moment frame's column holds at most 6 % of steel. */
const SEISMIC_RHO_MAX = 0.06;

/** Moments about the section's x axis bend it over its depth h; about y, over its width b. */
export interface ColumnCase {
  combo: string;
  /** kN, positive in compression: the larger at the two ends, and the smaller (at the top). */
  pu: number; puMin?: number;
  /** The part of `pu` the dead load gives, factored as in the combination, kN. */
  puD?: number;
  mxTop: number; mxBot: number; myTop: number; myBot: number;
  /** Largest shear along the storey that pairs with Mx (acting along h) and with My (along b), kN. */
  vx?: number; vy?: number;
  /** Where a moment between the ends exceeds both ends' (a load along the storey): the axial force and moments there. */
  inner?: Array<{ pu: number; mx: number; my: number }>;
  /** Largest torsion along the storey, kN·m: read, not designed for (`sheetsLeftOut`). */
  tu?: number;
  /** The end moments the combination's wind and earthquake cases give, first order: the part that sways the storey (Ms). */
  sway?: EndMoments;
  /** Where the combination was solved with P-Delta, its end moments first order. */
  first?: EndMoments;
}

export interface EndMoments { mxTop: number; mxBot: number; myTop: number; myBot: number }

/**
 * The storey's stability as the analysis reads it (§6.6.4.4.1): Q, the largest over its
 * combinations; each combination's Q, ΣPu and ΣPc, kN; `secondOrder` where the moments come from a
 * P-Delta solve and so carry the sway already.
 */
export interface ColumnSway { Q: number; combo?: string; secondOrder?: true; byCombo: Record<string, { Q: number; sumPu: number; sumPc: number }> }

export interface ColumnDemand {
  key: string; name: string; level?: string;
  /** m: width (along the section's x) and depth (along y). */
  b: number; h: number;
  /** Storey height and clear height, m. */
  length: number; lu: number;
  psiTop: number; psiBot: number;
  cases: ColumnCase[];
  nodes?: { bottom: number; top: number };
  /** Depth of the deepest beam framing in at each end, m; 0 where none does. */
  joints?: { bottom: number; top: number };
  /** The combinations whose results lack a force of this storey: its demand is incomplete. */
  missing?: string[];
  /** Absent where no combination was read for it: the storey is then taken as braced. */
  sway?: ColumnSway;
}

export interface ColumnContext extends TransverseList {
  mat: Materials;
  cover: number;
  tieDia: number;
  diameters: readonly number[];
  seismic?: Seismic;
  /** Check the main bars' cover of CIRSOC 201 Table 20.5.1.3.1, under execution control or not. */
  coverTable?: { control: boolean };
  /** The least nominal moment its joints ask of it for the strong-column rule (§18.7.3.2), kN·m, as `columnLeastMn` reads it. */
  minMn?: number;
}

interface AxisResult { klr: number; lim: number; slender: boolean; m1: number; m2: number; delta: number; mc: number; k: number; cm: number }
interface CaseResult { c: ColumnCase; x: AxisResult; y: AxisResult; tuples: Tuple[]; ratio: number; sway: CaseSway; magnified: ColumnCase }
interface Tuple { pu: number; mx: number; my: number }

export interface ColumnRow {
  family: 'column';
  key: string; name: string; level?: string;
  b: number; h: number; length: number;
  /** Clear cover to the ties, m. */
  cover: number;
  demand: ColumnDemand;
  req: { rho: number; ast: number; impossible: boolean; governing: string; compressionDominated: boolean };
  proposed: ColumnAdopted;
  adopted: ColumnAdopted;
  isAdopted: boolean;
  checks: { ratio: number; ok: boolean; area: number; spacingOk: boolean; tieOk: boolean; tieMax: number; crossties: { x: number; y: number; inner?: { x: number; y: number }; confined?: { x: number; y: number } }; rhoOk: boolean; shearX: number; shearY: number };
  verifications: CheckLine[];
  combos: ComboTable;
  iterations: number;
  status: RowStatus;
  generous: boolean;
  steps: StepGroup[];
  /** The splice of the bars from the storey below, just above its floor. */
  lap?: { length: number; tension?: boolean };
  /** Chapter 18: the length lo from each joint face and the hoop spacing so in it. */
  confinement?: { lo: number; so: number };
  /** The closest spacing its ties were proposed at, m (`TransverseList`). */
  tieFloor?: number;
}

const coverToBar = (c: Pick<ColumnContext, 'cover'>, tie: number, dia: number) => c.cover + tie / 1000 + dia / 2000;

const innerRowsOf = (a: ColumnAdopted) => (a.inner && (a.inner.nx > 0 || a.inner.ny > 0) ? Math.max(1, a.inner.rows ?? 1) : 0);

/** The rows inside the faces, outermost first, from the section's centre, m (`columnLayout`). */
export const innerRows = (d: { b: number; h: number }, a: ColumnAdopted, c: Pick<ColumnContext, 'cover'>): InnerRow[] => columnLayout(d, a, c.cover).rows;

/** The crossties that hold the inner rows (`innerTies`). */
export const innerCrossties = (d: { b: number; h: number }, a: ColumnAdopted, c: Pick<ColumnContext, 'cover'>) => innerTies(d, a, c.cover);

/** The bars of a column's section with their areas, m and m², in `columnLayout`'s order: corners, b faces, h faces, inner rows. */
export function columnBars<C extends { cover: number }>(d: { b: number; h: number }, a: ColumnAdopted, c: C): Bar[] {
  return columnLayout(d, a, c.cover).bars.map((p) => ({ x: p.x, y: p.y, area: barArea(p.dia) * 1e-4 }));
}

export const columnArea = (a: ColumnAdopted): number => 4 * barArea(a.corner) + 2 * a.nx * barArea(a.dx) + 2 * a.ny * barArea(a.dy)
  + (a.inner ? 2 * innerRowsOf(a) * (a.inner.nx + a.inner.ny) * barArea(a.inner.dia) : 0);

export const columnLabel = (a: ColumnAdopted): string => {
  const parts = [`4 Ø${a.corner}`];
  if (a.nx > 0) parts.push(`2×${a.nx} Ø${a.dx} (b)`);
  if (a.ny > 0) parts.push(`2×${a.ny} Ø${a.dy} (h)`);
  const rows = innerRowsOf(a), which = rows > 1 ? `2–${rows + 1}` : '2', times = rows > 1 ? `${2 * rows}` : '2';
  if (a.inner?.nx) parts.push(`${times}×${a.inner.nx} Ø${a.inner.dia} (b, ${which})`);
  if (a.inner?.ny) parts.push(`${times}×${a.inner.ny} Ø${a.inner.dia} (h, ${which})`);
  return parts.join(' + ');
};

export const tieLabel = (a: ColumnAdopted, fmt?: Fmt): string => { const cm = Math.round(a.tieSpacing * 1000) / 10, d = Number.isInteger(cm) ? 0 : 1; return `Ø${a.tieDia} c/${fmt ? fmt(cm, d) : cm.toFixed(d)}`; };

/** The crossties along b · along h, the inner rows' added, and lo's where chapter 18 asks more there: what the table, the drawing and the workbook say alike. */
export const crosstiesText = (ct: ColumnRow['checks']['crossties']): string =>
  `${ct.x} · ${ct.y}${ct.inner ? ` + ${ct.inner.x + ct.inner.y}` : ''}${ct.confined ? ` (lo: ${ct.confined.x} · ${ct.confined.y})` : ''}`;

/** The bars a layout holds. */
export const barCount = (a: ColumnAdopted): number => 4 + 2 * a.nx + 2 * a.ny + (a.inner ? 2 * innerRowsOf(a) * (a.inner.nx + a.inner.ny) : 0);

function axis(d: ColumnDemand, c: ColumnContext, cs: ColumnCase, about: 'x' | 'y'): AxisResult {
  const top = about === 'x' ? cs.mxTop : cs.myTop, bot = about === 'x' ? cs.mxBot : cs.myBot;
  const big = Math.abs(top) >= Math.abs(bot) ? top : bot, small = big === top ? bot : top;
  const m2 = Math.abs(big);
  const m1 = m2 > 1e-9 ? Math.sign(big * small) * Math.abs(small) : 0;
  const params: ConcreteDesignParams = { fc: c.mat.fc, fy: c.mat.fy, cover: c.cover, stirrupDia: c.tieDia, b: about === 'x' ? d.b : d.h, h: about === 'x' ? d.h : d.b };
  const s = checkSlender(params, cs.pu, m2, d.lu, {
    M1: m1, M2: m2, psiA: d.psiTop, psiB: d.psiBot,
    ...(cs.puD !== undefined ? { PuD: cs.puD, PuL: Math.max(0, cs.pu - cs.puD) } : {}),
  });
  return { klr: s.klu_r, lim: s.lambda_lim, slender: s.isSlender, m1, m2, delta: s.delta_ns, mc: s.isSlender ? s.Mc : m2, k: s.k, cm: s.Cm };
}

function utilisation(d: ColumnDemand, c: ColumnContext, a: ColumnAdopted, demands: Array<{ pu: number; mx: number; my: number }>): number {
  return withSection({ kind: 'rect', b: d.b, h: d.h }, columnBars(d, a, c), { fc: c.mat.fc, fy: c.mat.fy, edition: EDITION }, (s) =>
    demands.reduce((w, q) => Math.max(w, s.biaxialFast(q.pu, q.mx, q.my).ratio), 0));
}

function evenLayout(d: ColumnDemand, c: ColumnContext, dia: number, tie: number, pitch: number): ColumnAdopted {
  const span = (side: number) => side - 2 * coverToBar(c, tie, dia);
  const n = (side: number) => Math.max(0, Math.ceil(span(side) / pitch) - 1);
  return { corner: dia, nx: n(d.b), dx: dia, ny: n(d.h), dy: dia, tieDia: tie, tieSpacing: 0 };
}

const columnMinClear = (dia: number) => minClearSpacingColumn(EDITION, { barDiameterMm: dia, maxAggregateSizeMm: 0 }).minClear;

/** The clear spacing of §25.2.3 between every pair of bars, the inner rows' included, and every bar inside the tie. */
function clearOk(d: ColumnDemand, c: ColumnContext, a: ColumnAdopted): boolean {
  const gap = (side: number, n: number, dia: number) => (side - 2 * coverToBar(c, a.tieDia, a.corner) - (n + 1) * dia / 1000) / (n + 1);
  const minX = columnMinClear(Math.max(a.corner, a.dx)), minY = columnMinClear(Math.max(a.corner, a.dy));
  if (!(gap(d.b, a.nx, Math.max(a.corner, a.dx)) >= minX - 1e-4 && gap(d.h, a.ny, Math.max(a.corner, a.dy)) >= minY - 1e-4)) return false;
  return !innerRowsOf(a) || barClearance(d, columnLayout(d, a, c.cover).bars, c.cover, a.tieDia, columnMinClear).ok;
}

const facePitch = (side: number, n: number, cornerDia: number, c: { cover: number }, tie: number) => (side - 2 * (c.cover + tie / 1000 + cornerDia / 2000)) / (n + 1);

/** The face bars (1 … n, between the corners) crossties hold under §25.7.2.3, symmetric about the face's middle (`heldBars`). */
export function bracedFaceBars(side: number, n: number, dia: number, cornerDia: number, c: { cover: number }, tie: number): number[] {
  return heldBars(n, facePitch(side, n, cornerDia, c, tie), dia, tiedRule(unbracedClearLimit(tie)));
}

const crossties = (side: number, n: number, dia: number, cornerDia: number, c: ColumnContext, tie: number): number => bracedFaceBars(side, n, dia, cornerDia, c, tie).length;

/** The face bars crossties hold in the confinement zones: §25.7.2.3's, or the symmetric set of `count` or more that spreads them most evenly. */
export function confinedFaceBars(side: number, n: number, dia: number, cornerDia: number, c: { cover: number }, tie: number, count: number): number[] {
  return heldBars(n, facePitch(side, n, cornerDia, c, tie), dia, tiedRule(unbracedClearLimit(tie), count));
}

/** The counts of crossties along b and along h the confinement zones can take, symmetric on each face, fewest first. */
export function confinedOptions(d: { b: number; h: number }, a: ColumnAdopted, c: { cover: number }): Array<{ x: number; y: number }> {
  const along = (side: number, n: number, dia: number) => heldOptions(n, facePitch(side, n, a.corner, c, a.tieDia), dia, tiedRule(unbracedClearLimit(a.tieDia))).map((x) => x.length);
  const xs = along(d.b, a.nx, a.dx), ys = along(d.h, a.ny, a.dy);
  const out = xs.flatMap((x) => ys.map((y) => ({ x, y })));
  return out.sort((p, q) => p.x + p.y - (q.x + q.y) || Math.max(p.x, p.y) - Math.max(q.x, q.y));
}

/** The crossties in the confinement zones, each face's bars held and the widest run between held bars, hx (§18.7.5.2), m. */
export function confinedTies(d: { b: number; h: number }, a: ColumnAdopted, c: { cover: number }): ConfinedTies & { along: { b: number[]; h: number[] } } {
  const alongB = confinedFaceBars(d.b, a.nx, a.dx, a.corner, c, a.tieDia, a.confined?.x ?? 0);
  const alongH = confinedFaceBars(d.h, a.ny, a.dy, a.corner, c, a.tieDia, a.confined?.y ?? 0);
  const run = (side: number, n: number, held: number[]) => {
    const pitch = (side - 2 * coverToBar(c, a.tieDia, a.corner)) / (n + 1), at = [0, ...held, n + 1];
    return Math.max(...at.slice(1).map((x, i) => (x - at[i]!) * pitch));
  };
  return {
    x: alongB.length, y: alongH.length, along: { b: alongB, h: alongH },
    hx: Math.max(run(d.b, a.nx, alongB), run(d.h, a.ny, alongH)),
    held: 4 + 2 * (alongB.length + alongH.length), perimeter: 4 + 2 * (a.nx + a.ny),
  };
}

/** Table 25.7.2.2 of CIRSOC 201-2025: Ø6 up to Ø16, Ø8 up to Ø25, Ø10 up to Ø32, Ø12 above and for bundles. */
export const tieDiaFor = (longDia: number): number => (longDia <= 16 ? 6 : longDia <= 25 ? 8 : longDia <= 32 ? 10 : 12);

/** What differs between the codes that design columns with this row: the least tie for a bar, and the least side and bar of §10.3.1 where the code has one. */
export interface ColumnCode {
  tieDia(longDia: number): number;
  tie: { clause: string; formula: string };
  minimum?: { side: number; bar: number; clause: string };
  /** The least sway effective-length factor taken: the FIUBA course's 1.20 (§15.3); 1 by the chart when absent. */
  swayKMin?: number;
  /** The FIUBA course's layout rules the code is silent on (§15.8): the thickest bars at the corners, bars at most 30 cm apart. */
  course?: true;
}

export const CIRSOC_COLUMN: ColumnCode = {
  swayKMin: 1.2,
  course: true,
  tieDia: tieDiaFor,
  tie: { clause: '§25.7.2.2', formula: 'db ≤ 16 → Ø6; ≤ 25 → Ø8; ≤ 32 → Ø10; > 32 → Ø12' },
  minimum: { side: 0.2, bar: 12, clause: '§10.3.1' },
};

/** ACI 318-19 §25.7.2.2: No. 10 ties for No. 32 bars and smaller, No. 13 (taken as Ø12) for larger bars and bundles. */
export const ACI_COLUMN: ColumnCode = {
  tieDia: (longDia) => (longDia <= 32 ? 10 : 12),
  tie: { clause: '§25.7.2.2', formula: 'db ≤ No. 32 → No. 10 (Ø10); > No. 32 → No. 13 (Ø12)' },
};



/**
 * The demands a case puts on the section: each end as it is and any peak between them, or where a
 * direction is slender the magnified moments with both end axial forces (δ read at the larger, the
 * one that magnifies most), a peak between the ends magnified with Cm = 1.
 */
function tuplesOf(cs: ColumnCase, x: AxisResult, y: AxisResult): Tuple[] {
  const inner = cs.inner ?? [];
  if (x.slender || y.slender) {
    const amp = (a: AxisResult) => (a.slender ? Math.max(1, a.delta / Math.max(a.cm, 1e-9)) : 1);
    return [
      { pu: cs.pu, mx: x.mc, my: y.mc },
      ...(cs.puMin !== undefined && cs.puMin < cs.pu - 1e-9 ? [{ pu: cs.puMin, mx: x.mc, my: y.mc }] : []),
      ...inner.map((t) => ({ pu: t.pu, mx: Math.max(x.mc, amp(x) * Math.abs(t.mx)), my: Math.max(y.mc, amp(y) * Math.abs(t.my)) })),
    ];
  }
  return [{ pu: cs.puMin ?? cs.pu, mx: cs.mxTop, my: cs.myTop }, { pu: cs.pu, mx: cs.mxBot, my: cs.myBot }, ...inner];
}

/** At most eight tuples that bound the others: the most and least compression, each moment and their sum, the largest eccentricity. */
function governing(tuples: Tuple[]): Tuple[] {
  if (tuples.length <= 8) return tuples;
  const by = (f: (t: Tuple) => number) => tuples.reduce((a, t) => (f(t) > f(a) ? t : a));
  return [...new Set([by((t) => t.pu), by((t) => -t.pu), by((t) => Math.abs(t.mx)), by((t) => Math.abs(t.my)), by((t) => Math.abs(t.mx) + Math.abs(t.my)),
    by((t) => (Math.abs(t.mx) + Math.abs(t.my)) / Math.max(Math.abs(t.pu), 1)), by((t) => Math.abs(t.mx) - t.pu * 1e-3), by((t) => Math.abs(t.my) - t.pu * 1e-3)])];
}

function shearQueries(d: ColumnDemand, c: ColumnContext, a: ColumnAdopted, ct: { x: number; y: number }, pu: number): BeamSectionQuery[] {
  const ab = barArea(a.tieDia) * 1e-4;
  const base = { edition: EDITION, fc: c.mat.fc * 1e6, fy: c.mat.fy * 1e6, s: a.tieSpacing, fyt: shearFy(c.mat.fy) * 1e6, Ag: d.b * d.h, NuCompression: pu * 1e3 };
  return [
    { ...base, b: d.b, h: d.h, d: d.h - coverToBar(c, a.tieDia, a.corner), As: (2 * barArea(a.corner) + a.nx * barArea(a.dx)) * 1e-4, Av: (2 + ct.x) * ab },
    { ...base, b: d.h, h: d.b, d: d.b - coverToBar(c, a.tieDia, a.corner), As: (2 * barArea(a.corner) + a.ny * barArea(a.dy)) * 1e-4, Av: (2 + ct.y) * ab },
  ];
}

function shearRatios(d: ColumnDemand, c: ColumnContext, a: ColumnAdopted, ct: { x: number; y: number }): Array<{ x: number; y: number; px: number; py: number }> {
  const qs = d.cases.flatMap((cs) => shearQueries(d, c, a, ct, cs.puMin ?? cs.pu));
  const ans = evaluateBeamSections(qs) ?? [];
  return d.cases.map((cs, i) => {
    const rx = ans[2 * i], ry = ans[2 * i + 1];
    const px = rx && rx.shearValid ? rx.phiVn / 1e3 : 0, py = ry && ry.shearValid ? ry.phiVn / 1e3 : 0;
    return { x: ratioOf(cs.vx ?? 0, px), y: ratioOf(cs.vy ?? 0, py), px, py };
  });
}

/** Where the storey sits in its stack: the pattern the bars below keep, whether bars come up from below, and how far its faces step in, m. */
export interface StackPlace { pattern?: { nx: number; ny: number; maxDia: number; inner?: { nx: number; ny: number; rows?: number } }; fromBelow?: boolean; offset?: number }

/** The pattern a storey's bars set for the storey above: its counts on each face and inside, and its thickest bar. */
export const stackPattern = (a: ColumnAdopted): NonNullable<StackPlace['pattern']> => ({
  nx: a.nx, ny: a.ny, maxDia: Math.max(...layoutDias(a)),
  ...(a.inner && a.inner.nx + a.inner.ny > 0 ? { inner: { nx: a.inner.nx, ny: a.inner.ny, ...(a.inner.rows && a.inner.rows > 1 ? { rows: a.inner.rows } : {}) } } : {}),
});

/** The inner rows a storey tries on the pattern from below: none first, so the rows inside stop where the storey no longer needs them; then those below. */
export const patternInner = (p: NonNullable<StackPlace['pattern']>): Array<NonNullable<StackPlace['pattern']>['inner'] | undefined> => (p.inner ? [undefined, p.inner] : [undefined]);

/** Where a column's bars are lapped: clear cover to them and the least centre spacing along a face, mm, and Ktr of the ties over the lap (§25.4.2.4). */
export interface LapLayout { clearCoverMm: number; spacingMm: number; ktrMm: number }

/** A class B tension splice (§25.5.2), m: by the general expression with the bars' cover, spacing and ties where they are known, else by Table 25.4.2.3's least favourable row. */
export const tensionLap = (mat: Materials, dia: number, layout?: LapLayout): number =>
  deriveLap(deriveDevelopment({
    diameterMm: dia, fy: mat.fy, fc: mat.fc, favourableSpacing: false, edition: EDITION,
    ...(layout ? { confinement: { ...confinementOf(dia, layout.clearCoverMm, layout.spacingMm), ktrMm: layout.ktrMm } } : {}),
  }), { edition: EDITION }).lapM;

/** A column's lap layout: its outer bars' cover and pitch, and Ktr = 40·Atr/(s·n) of the tie's two legs over the face with the most bars. */
export function columnLapLayout(d: { b: number; h: number }, c: Pick<ColumnContext, 'cover'>, a: ColumnAdopted): LapLayout {
  const pitch = (side: number, n: number) => (side - 2 * coverToBar(c, a.tieDia, a.corner)) / (n + 1);
  const n = Math.max(a.nx, a.ny) + 2;
  return {
    clearCoverMm: (c.cover + a.tieDia / 1000) * 1000,
    spacingMm: Math.min(pitch(d.b, a.nx), pitch(d.h, a.ny)) * 1000,
    ktrMm: a.tieSpacing > 0 ? (40 * 2 * barArea(a.tieDia) * 100) / (a.tieSpacing * 1000 * n) : 0,
  };
}

/** The largest tie spacing of §25.7.2.1, m. */
export const tieSpacingLimit = (longDia: number, tieDia: number, least: number): number => columnTieSpacing(EDITION, longDia, tieDia, least).spacing;

/** Whether any demand puts a bar in tension: the gross section's elastic stress at the bar, the moments taken the way that pulls it (§10.7.5.2.1 reads the bars' stress). */
export function barsInTension(d: { b: number; h: number }, bars: ReadonlyArray<{ x: number; y: number }>, demands: ReadonlyArray<{ pu: number; mx: number; my: number }>): boolean {
  const ag = d.b * d.h, ix = (d.b * d.h ** 3) / 12, iy = (d.h * d.b ** 3) / 12;
  return demands.some((q) => bars.some((p) => q.pu / ag - (Math.abs(q.mx) * Math.abs(p.y)) / ix - (Math.abs(q.my) * Math.abs(p.x)) / iy < -1e-9));
}

/** §25.5.5.1 in compression, or a class B tension splice (§25.5.2) where a bar is in tension. */
export function columnSplice(c: ColumnContext, dia: number, tension: boolean, layout?: LapLayout): { length: number; tension: boolean } {
  if (tension) return { length: tensionLap(c.mat, dia, layout), tension };
  return { length: compressionLapMm(c.mat.fy, dia) / 1000, tension };
}

export const columnRowFor = (code: ColumnCode) => (d: ColumnDemand, c: ColumnContext, adopted: ColumnAdopted | undefined, fmt: Fmt, stack: StackPlace = {}): ColumnRow =>
  designColumn(d, c, adopted, fmt, stack, code);

export const columnRow = columnRowFor(CIRSOC_COLUMN);

function designColumn(d: ColumnDemand, c: ColumnContext, adopted: ColumnAdopted | undefined, fmt: Fmt, stack: StackPlace, code: ColumnCode): ColumnRow {
  const tieDiaFor = code.tieDia;
  const Ag = d.b * d.h;
  const sways = storeySways(d, SWAY_Q_LIMIT);
  const kSway = swayFactor(d, code.swayKMin ?? 1);
  const klrSway = { x: (kSway * d.lu) / (0.3 * d.h), y: (kSway * d.lu) / (0.3 * d.b) };
  // §6.2.5.1(a): a column of a sway storey no more slender than 22 keeps its sway moments as they are.
  const swayAxes = { x: sways && klrSway.x > 22, y: sways && klrSway.y > 22 };
  const results: CaseResult[] = d.cases.map((cs) => {
    const sw = sways ? aciDeltaS(d, cs.combo) : { deltaS: 1, method: 'none' as const, Q: 0 };
    const magnified = swayMagnified(cs, sw.deltaS, swayAxes);
    const x = axis(d, c, magnified, 'x'), y = axis(d, c, magnified, 'y');
    return { c: cs, x, y, tuples: tuplesOf(magnified, x, y), ratio: 0, sway: sw, magnified };
  });
  const amplification = Math.max(1, ...results.map((r) => secondOrderShare(d, r)));
  const unstable = results.find((r) => r.sway.method === 'unstable');
  const all = results.flatMap((r) => r.tuples);
  const demands = governing(all);
  const puMax = Math.max(0, ...d.cases.map((cs) => cs.pu));
  const compressionDominated = puMax > 0.1 * c.mat.fc * 1000 * Ag;
  const klrMax = Math.max(0, ...results.flatMap((r) => [r.x.klr, r.y.klr]), ...(sways ? [klrSway.x, klrSway.y] : []));

  const ownDias = listIn(c.diameters, COLUMN_BAR_RANGE);
  const dias = ownDias.length ? ownDias : [...c.diameters].sort((p, q) => p - q);
  const tieOf = (longDia: number): number => allowedTie(c, tieDiaFor(longDia)) ?? tieDiametersOf(c).at(-1)!;
  const refDia = dias.includes(16) ? 16 : dias[0] ?? 16;
  const ref = evenLayout(d, c, refDia, tieOf(refDia), 0.2);
  const refArea = columnArea(ref);
  const ratioAt = (ast: number) => withSection({ kind: 'rect', b: d.b, h: d.h }, columnBars(d, ref, c).map((bar) => ({ ...bar, area: bar.area * ast / refArea })),
    { fc: c.mat.fc, fy: c.mat.fy, edition: EDITION }, (s) => demands.reduce((w, q) => Math.max(w, s.biaxialFast(q.pu, q.mx, q.my).ratio), 0));
  const lo0 = COLUMN_STEEL_RATIO.min * Ag * 1e4, hi0 = COLUMN_STEEL_RATIO.max * Ag * 1e4;
  let ast = lo0, impossible = false;
  if (demands.length && ratioAt(lo0) > 1) {
    if (ratioAt(hi0) > 1) { impossible = true; ast = hi0; }
    else {
      let lo = lo0, hi = hi0;
      for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (ratioAt(mid) <= 1) hi = mid; else lo = mid; }
      ast = hi;
    }
  }

  const pus = d.cases.map((cs) => cs.pu);
  const axial = { min: pus.length ? Math.min(...pus) : 0, max: pus.length ? Math.max(...pus) : 0 };
  const mnOf = (a: ColumnAdopted) => columnLeastMn({ outline: { kind: 'rect', b: d.b, h: d.h }, bars: columnBars(d, a, c) }, c.mat.fc, c.mat.fy, axial);
  const minMn = c.seismic && c.minMn ? c.minMn : 0;
  const rhoTop = c.seismic ? SEISMIC_RHO_MAX : COLUMN_STEEL_RATIO.max;
  const shortOf = (target: number) => (a: ColumnAdopted) => target > 0 && mnOf(a) < target - 1e-6;
  const proposeFor = (target: number) => {
    const first = proposeColumn(d, c, ast, dias, all, stack.pattern, tieOf, { short: shortOf(target), rhoMax: rhoTop });
    let layout = first.layout, iterations = first.iterations;
    if (c.seismic) {
      const fits = (a: ColumnAdopted) => clearOk(d, c, a) && !(demands.length && utilisation(d, c, a, demands) > 1 + 1e-6) && columnArea(a) <= rhoTop * Ag * 1e4 + 1e-6;
      let confined = confineColumn(d, c, layout, fmt, fits);
      for (const dia of dias.filter((x) => x > Math.max(layout.corner, layout.dx, layout.dy)).sort((p, q) => p - q)) {
        if (confined.ok) break;
        const thicker = proposeColumn(d, c, ast, dias.filter((x) => x >= dia), all, undefined, tieOf, { short: shortOf(target), rhoMax: rhoTop });
        if (thicker.exhausted) break;
        const again = confineColumn(d, c, thicker.layout, fmt, fits);
        if (again.ok) confined = { ...again, iterations: confined.iterations + again.iterations };
      }
      layout = confined.layout; iterations += confined.iterations;
    }
    return { layout, iterations, exhausted: first.exhausted };
  };
  let { layout: proposed, iterations, exhausted } = proposeFor(minMn);
  for (const margin of [1.02, 1.05, 1.1]) {
    if (!shortOf(minMn)(proposed)) break;
    const next = proposeFor(minMn * margin);
    if (!next.exhausted && mnOf(next.layout) > mnOf(proposed)) ({ layout: proposed, iterations, exhausted } = next);
  }
  const a = adopted ?? proposed;
  const perTuple = withSection({ kind: 'rect', b: d.b, h: d.h }, columnBars(d, a, c), { fc: c.mat.fc, fy: c.mat.fy, edition: EDITION }, (s) =>
    results.map((r) => r.tuples.reduce((w, q) => Math.max(w, s.biaxialFast(q.pu, q.mx, q.my).ratio), 0)));
  results.forEach((r, i) => { r.ratio = perTuple[i] ?? 0; });
  const ratio = Math.max(0, ...perTuple);
  const gov = results.reduce<CaseResult | undefined>((w, r) => (!w || r.ratio > w.ratio ? r : w), undefined);
  const area = columnArea(a);
  const rhoOk = area >= lo0 - 1e-6 && area <= hi0 + 1e-6;
  const spacingOk = clearOk(d, c, a);
  const longest = Math.max(...layoutDias(a)), thinnest = Math.min(...layoutDias(a));
  const tieMax = columnTieSpacing(EDITION, thinnest, a.tieDia, Math.min(d.b, d.h)).spacing;
  const smallest = thinnest;
  const tieDiaOk = a.tieDia >= tieDiaFor(longest);
  const floor = tieFloorOf(c);
  const listOf = (l: readonly number[]) => l.map((x) => `Ø${x}`).join(' ');
  const tieOk = a.tieSpacing <= tieMax + 1e-6 && tieDiaOk;
  const ct = { x: crossties(d.b, a.nx, a.dx, a.corner, c, a.tieDia), y: crossties(d.h, a.ny, a.dy, a.corner, c, a.tieDia) };
  const ict = innerCrossties(d, a, c);
  const cct = c.seismic ? confinedTies(d, a, c) : null;
  const ctText = `${ct.x} (b) · ${ct.y} (h)${ict.x + ict.y ? ` · ${ict.x} (b, 2) · ${ict.y} (h, 2)` : ''}${cct && (cct.x > ct.x || cct.y > ct.y) ? ` · lo: ${cct.x} (b) · ${cct.y} (h)` : ''}`;
  const sh = shearRatios(d, c, a, ct);
  const shearX = Math.max(0, ...sh.map((x) => x.x)), shearY = Math.max(0, ...sh.map((x) => x.y));
  const vxMax = Math.max(0, ...d.cases.map((cs) => cs.vx ?? 0)), vyMax = Math.max(0, ...d.cases.map((cs) => cs.vy ?? 0));
  const splice = columnSplice(c, longest, !!c.seismic || barsInTension(d, columnBars(d, a, c), all), columnLapLayout(d, c, a));
  const seis = c.seismic && cct ? columnSeismic(d, { ...c, overstrength: c.seismic.overstrength }, a, columnBars(d, a, c), cct, fmt) : null;

  const verifications: CheckLine[] = [
    check('rcSheets.v.biaxial', ratio <= 1 + 1e-6, { clause: '§22.4, §22.2', demand: gov?.c.combo ?? '', capacity: '', ratio }),
    check('rcSheets.v.rhoMin', area >= Math.max(ast, lo0) - 1e-6, { clause: '§10.6.1.1', demand: `${fmt(Math.max(ast, lo0))} cm²`, capacity: `${fmt(area)} cm²`, ratio: ratioOf(Math.max(ast, lo0), area) }),
    check('rcSheets.v.rhoMax', area <= hi0 + 1e-6, { clause: '§10.6.1.1', demand: `${fmt(area / (Ag * 1e4) * 100)} %`, capacity: '≤ 8 %' }),
    check('rcSheets.v.colSpacing', spacingOk, { clause: '§25.2.3' }),
    ...(!adopted && exhausted ? [check('rcSheets.v.colNoLayout', false, { clause: '§25.2.3, §10.6.1.1', demand: `${fmt(Math.max(ast, lo0))} cm²`, capacity: `≤ ${fmt(area)} cm²` })] : []),
    check('rcSheets.v.slenderMax', klrMax <= 100 + 1e-9, { clause: code.course ? 'FIUBA §15.2, §15.4' : '§6.2.6', demand: `k·lu/r = ${fmt(klrMax, 1)}`, capacity: '≤ 100' }),
    ...(amplification > 1 + 1e-6 ? [check('rcSheets.v.secondOrderLimit', amplification <= 1.4 + 1e-6, { clause: '§6.2.6', demand: `M₂/M₁ = ${fmt(amplification, 2)}`, capacity: '≤ 1.4', ratio: amplification / 1.4 })] : []),
    ...(unstable ? [check('rcSheets.v.swayStable', false, { clause: '§6.6.4.6.2(b)', demand: `ΣPu = ${fmt(d.sway!.byCombo[unstable.c.combo]!.sumPu, 0)} kN`, capacity: `< 0.75·ΣPc = ${fmt(0.75 * d.sway!.byCombo[unstable.c.combo]!.sumPc, 0)} kN` })] : []),
    ...(code.course ? courseChecks(d, c, a, fmt) : []),
    check('rcSheets.v.shearX', shearX <= 1 + 1e-6, { clause: '§22.5', demand: `${fmt(vxMax)} kN`, capacity: `${fmt(Math.min(...sh.map((x) => x.px)))} kN`, ratio: shearX }),
    check('rcSheets.v.shearY', shearY <= 1 + 1e-6, { clause: '§22.5', demand: `${fmt(vyMax)} kN`, capacity: `${fmt(Math.min(...sh.map((x) => x.py)))} kN`, ratio: shearY }),
    check('rcSheets.v.tieDia', tieDiaOk, { clause: code.tie.clause, demand: `Ø${a.tieDia}`, capacity: `≥ Ø${tieDiaFor(longest)}` }),
    ...(!tieDiaOk && allowedTie(c, tieDiaFor(longest)) === null ? [check('rcSheets.v.tieList', false, { clause: code.tie.clause, demand: `≥ Ø${tieDiaFor(longest)}`, capacity: listOf(tieDiametersOf(c)) })] : []),
    ...(!adopted && !ownDias.length ? [check('rcSheets.v.longList', false, { clause: code.minimum?.clause ?? code.tie.clause, demand: `Ø${COLUMN_BAR_RANGE.min} … Ø${COLUMN_BAR_RANGE.max}`, capacity: listOf(c.diameters) })] : []),
    ...(c.coverTable ? [mainCoverCheck(c.cover, a.tieDia, longest, c.coverTable.control, fmt)] : []),
    ...(code.minimum ? [
      check('rcSheets.v.colMinSide', Math.min(d.b, d.h) >= code.minimum.side - 1e-9, { clause: code.minimum.clause, demand: `${fmt(Math.min(d.b, d.h) * 100, 0)} cm`, capacity: `≥ ${fmt(code.minimum.side * 100, 0)} cm` }),
      check('rcSheets.v.colMinBar', smallest >= code.minimum.bar, { clause: code.minimum.clause, demand: `Ø${smallest}`, capacity: `≥ Ø${code.minimum.bar}` }),
    ] : []),
    check('rcSheets.v.tieSpacing', a.tieSpacing <= tieMax + 1e-6, { clause: '§25.7.2.1', demand: `${fmt(a.tieSpacing * 100, 1)} cm`, capacity: `≤ ${fmt(tieMax * 100, 1)} cm` }),
    check('rcSheets.v.crossties', true, { clause: '§25.7.2.3', capacity: ctText }),
    ...(stack.fromBelow ? [check(splice.tension ? 'rcSheets.v.colSpliceT' : 'rcSheets.v.colSpliceC', true, { clause: splice.tension ? '§25.5.2' : '§25.5.5.1', capacity: `${fmt(splice.length * 100, 0)} cm (Ø${longest})` })] : []),
    ...((stack.offset ?? 0) >= 0.075 - 1e-6 ? [check('rcSheets.v.colOffset', true, { clause: '§10.7.4.1', demand: `${fmt((stack.offset ?? 0) * 100, 1)} cm`, capacity: '≥ 7.5 cm' })] : []),
    ...(seis?.checks ?? []),
    ...(minMn > 0 ? [((mn) => check('rcSheets.v.seisColMn', mn >= minMn - 1e-6, { clause: '§18.7.3.2', demand: `Mn ≥ ${fmt(minMn)} kN·m`, capacity: `Mn = ${fmt(mn)} kN·m`, ratio: ratioOf(minMn, mn) }))(mnOf(a))] : []),
  ];
  const ok = verifications.every((v) => v.ok) && !impossible;
  const generous = isGenerous(verifications);

  const combos: ComboTable = {
    headers: ['Pu', 'Mx', 'My', 'Vx', 'Vy'],
    rows: results.map((r, i) => {
      const t = r.tuples.reduce((w, q) => (Math.abs(q.mx) + Math.abs(q.my) > Math.abs(w.mx) + Math.abs(w.my) ? q : w));
      const rr = Math.max(r.ratio, sh[i]?.x ?? 0, sh[i]?.y ?? 0);
      return { combo: r.c.combo, values: [fmt(r.c.pu, 1), fmt(t.mx, 1), fmt(t.my, 1), fmt(r.c.vx ?? 0, 1), fmt(r.c.vy ?? 0, 1)], ratio: rr, ok: rr <= 1 + 1e-6 };
    }),
  };

  const steps: StepGroup[] = [
    {
      title: 'rcSheets.g.data',
      steps: [
        { label: 'rcSheets.s.section', formula: 'b × h', value: `${fmt(d.b * 100, 0)} × ${fmt(d.h * 100, 0)} cm` },
        { label: 'rcSheets.s.materials', formula: "f'c · fy", value: `${fmt(c.mat.fc, 0)} · ${fmt(c.mat.fy, 0)} MPa` },
        { label: 'rcSheets.s.height', formula: 'L · lu', value: `${fmt(d.length)} · ${fmt(d.lu)} m` },
        { label: 'rcSheets.s.psi', formula: 'ΨA · ΨB', value: `${fmt(d.psiTop)} · ${fmt(d.psiBot)}` },
        { label: 'rcSheets.s.compressionDominated', formula: "Pu > 0.10·f'c·Ag", value: `${fmt(puMax, 1)} kN`, ok: compressionDominated },
        swayStep(d, results, sways, kSway, klrSway, code, fmt),
      ],
    },
    ...(gov ? [slenderSteps(gov, fmt)] : []),
    {
      title: 'rcSheets.g.interaction',
      steps: [
        { label: 'rcSheets.s.tuples', formula: (gov?.x.slender || gov?.y.slender) ? '(Pu, δ·Mx, δ·My)' : '(Pu, Mx, My) i · j', value: String(all.length) },
        { label: 'rcSheets.s.rhoReq', formula: 'ρ = Ast/Ag (Pu, Mcx, Mcy)', value: `${fmt(ast / (Ag * 1e4) * 100, 2)} % → ${fmt(ast)} cm²`, ok: !impossible },
        { label: 'rcSheets.s.rhoLimits', formula: '0.01 ≤ ρ ≤ 0.08', value: `${fmt(area / (Ag * 1e4) * 100, 2)} %`, ok: rhoOk },
        { label: 'rcSheets.s.adopted', formula: columnLabel(a), value: `${fmt(area)} cm²`, ok: area >= ast - 1e-6 },
        { label: 'rcSheets.s.colSpacing', formula: 'max(1.5·db; 40 mm) (§25.2.3)', value: '', ok: spacingOk },
        { label: 'rcSheets.s.biaxial', formula: gov ? `${gov.c.combo}: Pu = ${fmt(gov.c.pu, 1)} kN` : '—', value: `${fmt(ratio, 3)}`, ok: ratio <= 1 + 1e-6 },
      ],
    },
    {
      title: 'rcSheets.g.ties',
      steps: [
        { label: 'rcSheets.s.tieDia', formula: `${code.tie.formula} (${code.tie.clause})`, value: `Ø${a.tieDia}`, ok: tieDiaOk },
        { label: 'rcSheets.s.tieSpacing', formula: 's ≤ min(16·db; 48·de; b) (§25.7.2.1)', value: `${tieLabel(a)} ≤ ${fmt(tieMax * 100, 0)} cm`, ok: a.tieSpacing <= tieMax + 1e-6 },
        { label: 'rcSheets.s.tieFloor', formula: 's ≥ s,min; (4/3)·dagg (§25.7.2.1(a))', value: `${fmt(floor * 100, 1)} cm`, ok: a.tieSpacing >= floor - 1e-6 },
        { label: 'rcSheets.s.crossties', formula: '≤ min(15·dbe; 150 mm), every other bar (§25.7.2.3)', value: ctText },
        { label: 'rcSheets.s.colShear', formula: 'φVn = φ·(Vc(Nu) + Av·fyt·d/s)', value: `${fmt(Math.max(shearX, shearY), 3)}`, ok: shearX <= 1 + 1e-6 && shearY <= 1 + 1e-6 },
      ],
    },
    ...(seis ? [{ title: 'rcSheets.g.seismic', steps: seis.steps }] : []),
    {
      title: 'rcSheets.g.proposal',
      steps: [adopted ? { label: 'rcSheets.s.adoptedByUser', value: '' } : { label: 'rcSheets.s.iterations', formula: 'ρ → bars → (Pu, Mx, My) ≤ φ; V ≤ φVn', value: String(iterations) }],
    },
  ];

  return {
    family: 'column', key: d.key, name: d.name, level: d.level, b: d.b, h: d.h, length: d.length, cover: c.cover, demand: d,
    req: { rho: ast / (Ag * 1e4), ast, impossible, governing: gov?.c.combo ?? '', compressionDominated },
    proposed, adopted: a, isAdopted: !!adopted, iterations: adopted ? 0 : iterations,
    checks: { ratio, ok, area, spacingOk, tieOk, tieMax, crossties: { ...ct, ...(ict.x + ict.y ? { inner: { x: ict.x, y: ict.y } } : {}), ...(cct && (cct.x > ct.x || cct.y > ct.y) ? { confined: { x: cct.x, y: cct.y } } : {}) }, rhoOk, shearX, shearY },
    verifications, combos,
    status: ok ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
    ...(stack.fromBelow ? { lap: splice } : {}),
    ...(seis ? { confinement: { lo: seis.lo, so: seis.so } } : {}),
    tieFloor: floor,
  };
}

/**
 * The hoops of a special moment frame's column over lo, as practice reaches them (§18.7.5): at the
 * widest spacing so allows first, a thicker allowed hoop and then more crossties, laid symmetrically
 * (`confinedOptions`), before a closer spacing, never closer than the project's floor; only then a
 * bar more on each face for a crosstie to hold. Where nothing does, the most it reached, and the row
 * fails.
 */
function confineColumn(d: ColumnDemand, c: ColumnContext, start: ColumnAdopted, fmt: Fmt, fits: (a: ColumnAdopted) => boolean): { layout: ColumnAdopted; iterations: number; ok: boolean } {
  const seismic = { ...c, overstrength: c.seismic!.overstrength };
  const high = highAxialColumn({ b: d.b, h: d.h, fc: c.mat.fc, pu: Math.max(0, ...d.cases.map((k) => k.pu)) });
  const floor = tieFloorOf(c);
  const ties = tieDiametersOf(c).filter((t) => t >= start.tieDia);
  const longMin = (a: ColumnAdopted) => Math.min(...layoutDias(a));
  let iterations = 0, last = start;
  let bars = start;
  for (let more = 0; more <= 2; more++) {
    const widest = roundDown(Math.min(start.tieSpacing || 1, Math.min(d.b, d.h) / 4, 6 * longMin(bars) / 1000, 0.15) + 1e-9);
    const mpr = new Map<number, { x: number; y: number }>();
    const spacings: number[] = [];
    for (let s = widest; s >= floor - 1e-9; s = Math.round((s - 0.025) * 1000) / 1000) spacings.push(s);
    if (!spacings.some((x) => Math.abs(x - floor) < 1e-9)) spacings.push(floor);
    for (const s of spacings) {
      for (const tieDia of ties) {
        const base = { ...bars, tieDia };
        if ((more > 0 || tieDia !== start.tieDia) && !fits(base)) continue;
        const basic = { x: crossties(d.b, base.nx, base.dx, base.corner, c, tieDia), y: crossties(d.h, base.ny, base.dy, base.corner, c, tieDia) };
        for (const o of confinedOptions(d, base, c)) {
          if (o.x < basic.x || o.y < basic.y) continue;
          const { confined: _was, ...plain } = base;
          const held: ColumnAdopted = o.x > basic.x || o.y > basic.y ? { ...plain, confined: o } : plain;
          const ct = confinedTies(d, held, c);
          iterations++;
          const a = { ...held, tieSpacing: s };
          last = a;
          if (ct.hx > columnConfinementOf(d, c, a, ct).hxMax + 1e-6 || (high && ct.held < ct.perimeter)) continue;
          const run = columnSeismic(d, seismic, a, columnBars(d, a, c), ct, fmt, mpr.get(tieDia));
          mpr.set(tieDia, run.mpr);
          if (['rcSheets.v.seisColSo', 'rcSheets.v.seisColAsh', 'rcSheets.v.seisColVe', 'rcSheets.v.seisColHx'].every((l) => run.checks.find((v) => v.label === l)?.ok !== false)) return { layout: a, iterations, ok: true };
        }
      }
    }
    const next = growSymmetric(d, bars, (side) => side - 2 * coverToBar(c, bars.tieDia, bars.corner));
    if (!fits(next)) break;
    bars = next;
  }
  return { layout: last, iterations, ok: false };
}

/**
 * The moment with every second-order effect over the first-order moment, the larger axis (§6.2.6):
 * the design moment against the larger first-order end moment, each never under Pu·(15 mm + 0.03·h).
 */
function secondOrderShare(d: ColumnDemand, r: CaseResult): number {
  const pu = Math.max(0, r.c.pu);
  if (pu <= 0) return 1;
  const first = firstOrderM2(r.c);
  const of = (a: AxisResult, m2: number, depth: number, top: number, bot: number) => {
    const floor = pu * (0.015 + 0.03 * depth);
    const final = a.slender ? a.mc : Math.max(Math.abs(top), Math.abs(bot));
    return final / Math.max(m2, floor, 1e-9);
  };
  return Math.max(of(r.x, first.x, d.h, r.magnified.mxTop, r.magnified.mxBot), of(r.y, first.y, d.b, r.magnified.myTop, r.magnified.myBot));
}

/** How the storey reads for sway: not read, braced, swaying with its δs, or already second order. */
function swayStep(d: ColumnDemand, results: readonly CaseResult[], sways: boolean, k: number, klr: { x: number; y: number }, code: ColumnCode, f: Fmt): Step {
  const s = d.sway;
  if (!s) return { label: 'rcSheets.s.nonSway', value: '' };
  const q = `Q = ${f(s.Q, 3)}${s.combo ? ` (${s.combo})` : ''}`;
  if (!sways) return { label: 'rcSheets.s.storeyBraced', formula: 'Q = ΣPu·Δo/(Vus·lc) ≤ 0.05 (§6.6.4.3(a))', value: q, ok: true };
  if (s.secondOrder) return { label: 'rcSheets.s.storeySecondOrder', formula: 'Q > 0.05 (§6.6.4.3(a)); P-Delta (§6.6.4.6.2)', value: q };
  const worst = results.reduce<CaseResult | undefined>((w, r) => (!w || r.sway.deltaS > w.sway.deltaS ? r : w), undefined);
  const kText = `k = ${f(k, 2)}${code.swayKMin && code.swayKMin > 1 ? ` ≥ ${f(code.swayKMin, 2)} (FIUBA §15.3)` : ''}`;
  const delta = worst && Number.isFinite(worst.sway.deltaS) ? `δs = ${f(worst.sway.deltaS, 3)} (${worst.c.combo})` : 'δs = ∞';
  return {
    label: 'rcSheets.s.storeySway',
    formula: `${q} > 0.05; ${kText}; k·lu/r = ${f(klr.x, 1)} · ${f(klr.y, 1)} > 22 → M = Mns + δs·Ms; δs = 1/(1 − Q) ≤ 1.5, or 1/(1 − ΣPu/(0.75·ΣPc)) (§6.6.4.6)`,
    value: delta, ok: !!worst && Number.isFinite(worst.sway.deltaS),
  };
}

/** The FIUBA course's layout rules (§15.8): the thickest bars at the corners, and bars at most 30 cm apart along a face, but for a face of 40 cm at most with its two corner bars alone. */
function courseChecks(d: ColumnDemand, c: ColumnContext, a: ColumnAdopted, f: Fmt): CheckLine[] {
  const faceMax = Math.max(a.nx > 0 ? a.dx : 0, a.ny > 0 ? a.dy : 0);
  const pitch = (side: number, n: number) => (side - 2 * coverToBar(c, a.tieDia, a.corner)) / (n + 1);
  const wide = (side: number, n: number) => pitch(side, n) > COURSE_PITCH + 1e-6 && !(n === 0 && side <= 0.4 + 1e-9);
  const widest = Math.max(pitch(d.b, a.nx), pitch(d.h, a.ny));
  return [
    check('rcSheets.v.colCornerLargest', a.corner >= faceMax, { clause: 'FIUBA §15.8', demand: `Ø${a.corner}`, capacity: `≥ Ø${faceMax}` }),
    check('rcSheets.v.colMaxPitch', !wide(d.b, a.nx) && !wide(d.h, a.ny), { clause: 'FIUBA §15.8', demand: `${f(widest * 100, 1)} cm`, capacity: `≤ ${f(COURSE_PITCH * 100, 0)} cm` }),
  ];
}

function slenderSteps(g: CaseResult, f: Fmt): StepGroup {
  const ax = (name: string, r: AxisResult): Step[] => [
    { label: 'rcSheets.s.slenderness', formula: `${name}: k·lu/r = ${f(r.k, 2)}·lu/(0.3·h)`, value: `${f(r.klr, 1)} ≤ ${f(r.lim, 1)}?`, ok: !r.slender },
    { label: 'rcSheets.s.limit', formula: 'λlim = 34 + 12·M1/M2 ≤ 40', value: `M1 = ${f(-r.m1)} · M2 = ${f(r.m2)} kN·m` },
    ...(r.slender ? [{ label: 'rcSheets.s.magnifier', formula: 'δns = Cm/(1 − Pu/(0.75·Pc)); Mc = δns·max(M2; M2,min)', value: `${f(r.delta, 3)} → ${f(r.mc)} kN·m` }] : []),
  ];
  return { title: 'rcSheets.g.slenderness', steps: [{ label: 'rcSheets.s.governs', formula: '', value: g.c.combo }, ...ax('x', g.x), ...ax('y', g.y)] };
}

/** The smallest clear spacing between a layout's outer bars along any face, m. */
function outerClear(d: ColumnDemand, c: ColumnContext, a: ColumnAdopted): number {
  const gap = (side: number, n: number, dia: number) => (side - 2 * coverToBar(c, a.tieDia, a.corner) - (n + 1) * dia / 1000) / (n + 1);
  return Math.min(gap(d.b, a.nx, Math.max(a.corner, a.dx)), gap(d.h, a.ny, Math.max(a.corner, a.dy)));
}

/**
 * The bars a column is proposed: for each allowed diameter, the fewest bars that keep them
 * `COLUMN_PITCH` apart at most, grown symmetrically (`growSymmetric`) until they carry the demand; of
 * those that do with the practical clear spacing between them when any does, the lightest or one
 * with fewer bars and nearly as light (`pickPractical`). Rows inside the faces only when no outer
 * row alone does it. The ties of the smallest allowed diameter the code takes, as wide as §25.7.2.1
 * and the shear let them and never closer than the project's floor. Where no layout carries the
 * demand, the one with the most steel that fits (`exhausted`): the row fails and says so.
 */
function proposeColumn(d: ColumnDemand, c: ColumnContext, ast: number, dias: readonly number[], tuples: Tuple[], pattern: StackPlace['pattern'], tieOf: (longDia: number) => number, joint: { short: (a: ColumnAdopted) => boolean; rhoMax: number }): { layout: ColumnAdopted; iterations: number; exhausted?: true } {
  const demands = governing(tuples);
  const utilOver = (a: ColumnAdopted) => demands.length > 0 && utilisation(d, c, a, demands) > 1 + 1e-6;
  const over = (a: ColumnAdopted) => utilOver(a) || joint.short(a);
  const tooMuch = (a: ColumnAdopted) => columnArea(a) > joint.rhoMax * d.b * d.h * 1e4 + 1e-6;
  const floor = tieFloorOf(c);
  const spacingFor = (dia: number, tie: number) => Math.max(floor, roundDown(columnTieSpacing(EDITION, dia, tie, Math.min(d.b, d.h)).spacing));
  let strongest: { a: ColumnAdopted; dia: number; it: number } | null = null;
  let densest: { a: ColumnAdopted; dia: number; it: number } | null = null;
  const shearTies = (start: ColumnAdopted, dia: number, it: number): { layout: ColumnAdopted; iterations: number } => {
    let a = start;
    for (let guard = 0; guard < 40; guard++) {
      const ct = { x: crossties(d.b, a.nx, a.dx, a.corner, c, a.tieDia), y: crossties(d.h, a.ny, a.dy, a.corner, c, a.tieDia) };
      if (shearRatios(d, c, a, ct).every((x) => x.x <= 1 + 1e-6 && x.y <= 1 + 1e-6)) break;
      it++;
      if (a.tieSpacing > floor + 1e-9) { a = { ...a, tieSpacing: Math.max(floor, roundDown(a.tieSpacing - 0.025)) }; continue; }
      const thicker = nextTie(c, a.tieDia);
      if (!thicker) break;
      a = { ...a, tieDia: thicker, tieSpacing: Math.min(0.15, spacingFor(dia, thicker)) };
    }
    return { layout: a, iterations: it };
  };
  if (pattern) for (const inner of patternInner(pattern)) {
    for (const dia of [...dias].filter((x) => x <= pattern.maxDia).sort((p, q) => p - q)) {
      const tie = tieOf(dia);
      const a: ColumnAdopted = { corner: dia, nx: pattern.nx, dx: dia, ny: pattern.ny, dy: dia, tieDia: tie, tieSpacing: spacingFor(dia, tie), ...(inner ? { inner: { ...inner, dia } } : {}) };
      if (columnArea(a) < ast - 1e-6 || !clearOk(d, c, a) || tooMuch(a)) continue;
      if (over(a)) continue;
      const ct = { x: crossties(d.b, a.nx, a.dx, a.corner, c, a.tieDia), y: crossties(d.h, a.ny, a.dy, a.corner, c, a.tieDia) };
      if (!shearRatios(d, c, a, ct).every((x) => x.x <= 1 + 1e-6 && x.y <= 1 + 1e-6)) continue;
      return { layout: a, iterations: 0 };
    }
  }
  const span = (a: ColumnAdopted) => (side: number) => side - 2 * coverToBar(c, a.tieDia, a.corner);
  const grow = (a: ColumnAdopted, dia: number, inside: boolean): ColumnAdopted | null => growColumn(d, a, c.cover, dia, (x) => clearOk(d, c, x), inside);
  const maxPitch = c.seismic ? COLUMN_PITCH.seismic : COLUMN_PITCH.plain;
  for (const inside of [false, true]) {
    const found: Array<{ a: ColumnAdopted; dia: number; it: number }> = [];
    for (const dia of [...(dias.length ? dias : [16])].sort((p, q) => p - q)) {
      const tie = tieOf(dia);
      const bare: ColumnAdopted = { corner: dia, nx: 0, dx: dia, ny: 0, dy: dia, tieDia: tie, tieSpacing: 0 };
      let a: ColumnAdopted = { ...bare, ...startCounts(d, span(bare), maxPitch) };
      if (!clearOk(d, c, a)) continue;
      let it = 0;
      for (let guard = 0; guard < 40 && columnArea(a) < ast - 1e-6; guard++) {
        const next = grow(a, dia, inside);
        if (!next) break;
        a = next;
      }
      if (clearOk(d, c, a) && !tooMuch(a) && (!densest || columnArea(a) > columnArea(densest.a))) densest = { a: { ...a, tieSpacing: spacingFor(dia, tie) }, dia, it: 0 };
      if (!clearOk(d, c, a) || columnArea(a) < ast - 1e-6 || tooMuch(a)) continue;
      a = { ...a, tieSpacing: spacingFor(dia, tie) };
      while (over(a) && it < 24) {
        it++;
        const next = grow(a, dia, inside);
        if (!next || tooMuch(next)) break;
        a = next;
      }
      if (tooMuch(a)) continue;
      if (over(a)) {
        if (!utilOver(a) && (!strongest || columnArea(a) > columnArea(strongest.a))) strongest = { a, dia, it };
        continue;
      }
      found.push({ a, dia, it });
    }
    const roomy = found.filter((x) => outerClear(d, c, x.a) >= COLUMN_PRACTICAL_CLEAR - 1e-4);
    const pick = pickPractical(roomy.length ? roomy : found, (x) => columnArea(x.a), (x) => barCount(x.a), (x) => x.dia);
    if (pick) return shearTies(pick.a, pick.dia, pick.it);
  }
  if (strongest) return shearTies(strongest.a, strongest.dia, strongest.it);
  if (densest) return { ...shearTies(densest.a, densest.dia, densest.it), exhausted: true };
  const dia = dias[dias.length - 1] ?? 25;
  const tie = tieOf(dia);
  return { layout: { ...evenLayout(d, c, dia, tie, 0.15), tieSpacing: spacingFor(dia, tie) }, iterations: 0, exhausted: true };
}
