import { barArea } from '../bars';
import { columnArea, columnBars, type ColumnCase, type ColumnContext, type ColumnDemand } from '../column-row';
import { ratioOf, type ColumnAdopted } from '../types';
import { minEccentricity, vcrOf, vmaxOf, type Ts500Mat } from './basis';
import { utilisation, type RectSection } from './biaxial';

export interface AxisResult { k: number; lk: number; lambda: number; lim: number; slender: boolean; m1: number; m2: number; cm: number; nk: number; beta: number; emin: number }
export interface Tuple { pu: number; mx: number; my: number }
export interface CaseResult { c: ColumnCase; x: AxisResult; y: AxisResult; tuples: Tuple[]; ratio: number }

export const coverToBar = (c: ColumnContext, tie: number, dia: number) => c.cover + tie / 1000 + dia / 2000;

export const kNonSway = (a1: number, a2: number): number => Math.min(1, 0.7 + 0.05 * (a1 + a2), 0.85 + 0.05 * Math.min(a1, a2));

export function axis(d: ColumnDemand, t: Ts500Mat, cs: ColumnCase, about: 'x' | 'y'): AxisResult {
  const top = about === 'x' ? cs.mxTop : cs.myTop, bot = about === 'x' ? cs.mxBot : cs.myBot;
  const big = Math.abs(top) >= Math.abs(bot) ? top : bot, small = big === top ? bot : top;
  const m2 = Math.abs(big);
  const m1 = m2 > 1e-9 ? Math.sign(big * small) * Math.abs(small) : 0;
  const depth = about === 'x' ? d.h : d.b, width = about === 'x' ? d.b : d.h;
  const k = kNonSway(d.psiTop, d.psiBot);
  const lk = k * d.lu, i = 0.3 * depth;
  const lambda = lk / i;
  const r = m2 > 1e-9 ? m1 / m2 : 0;
  const lim = 34 - 12 * r;
  const slender = lambda > lim + 1e-9;
  const rm = cs.puD !== undefined && cs.pu > 1e-9 ? Math.min(1, Math.max(0, cs.puD / cs.pu)) : 1;
  const ei = 0.4 * t.ec * 1000 * (width * depth ** 3 / 12) / (1 + rm);
  const nk = Math.PI ** 2 * ei / Math.max(lk * lk, 1e-9);
  const cm = Math.max(0.4, 0.6 + 0.4 * r);
  const nd = Math.max(0, cs.pu);
  const beta = !slender ? 1 : 1.3 * nd >= nk ? Number.POSITIVE_INFINITY : Math.max(1, cm / (1 - 1.3 * nd / nk));
  return { k, lk, lambda, lim, slender, m1, m2, cm, nk, beta, emin: minEccentricity(depth) };
}

export function tuplesOf(cs: ColumnCase, x: AxisResult, y: AxisResult): Tuple[] {
  const raise = (n: number, mx: number, my: number): Tuple[] => {
    const nc = Math.max(0, n);
    return [{ pu: n, mx: Math.max(Math.abs(mx), nc * x.emin), my: Math.abs(my) }, { pu: n, mx: Math.abs(mx), my: Math.max(Math.abs(my), nc * y.emin) }];
  };
  if (x.slender || y.slender) {
    const nc = Math.max(0, cs.pu);
    return [
      { pu: cs.pu, mx: x.beta * Math.max(x.m2, nc * x.emin), my: y.beta * y.m2 },
      { pu: cs.pu, mx: x.beta * x.m2, my: y.beta * Math.max(y.m2, nc * y.emin) },
    ];
  }
  return [...raise(cs.puMin ?? cs.pu, cs.mxTop, cs.myTop), ...raise(cs.pu, cs.mxBot, cs.myBot)];
}

export function governing(tuples: Tuple[]): Tuple[] {
  if (tuples.length <= 8) return tuples;
  const by = (f: (t: Tuple) => number) => tuples.reduce((a, t) => (f(t) > f(a) ? t : a));
  return [...new Set([by((t) => t.pu), by((t) => -t.pu), by((t) => t.mx), by((t) => t.my), by((t) => t.mx + t.my),
    by((t) => (t.mx + t.my) / Math.max(Math.abs(t.pu), 1)), by((t) => t.mx - t.pu * 1e-3), by((t) => t.my - t.pu * 1e-3)])];
}

export const sectionOf = (d: ColumnDemand, a: ColumnAdopted, c: ColumnContext): RectSection => ({ b: d.b, h: d.h, bars: columnBars(d, a, c) });

export const utilOf = (sec: RectSection, t: Ts500Mat, demands: Tuple[]): number =>
  demands.reduce((w, q) => Math.max(w, utilisation(sec, t, q.pu, q.mx, q.my)), 0);

export function evenLayout(d: ColumnDemand, c: ColumnContext, dia: number, tie: number, pitch: number): ColumnAdopted {
  const span = (side: number) => side - 2 * coverToBar(c, tie, dia);
  const n = (side: number) => Math.max(0, Math.ceil(span(side) / pitch) - 1);
  return { corner: dia, nx: n(d.b), dx: dia, ny: n(d.h), dy: dia, tieDia: tie, tieSpacing: 0 };
}

export function clearOk(d: ColumnDemand, c: ColumnContext, a: ColumnAdopted): boolean {
  const gap = (side: number, n: number, dia: number) => (side - 2 * coverToBar(c, a.tieDia, a.corner) - (n + 1) * dia / 1000) / (n + 1);
  const min = (dia: number) => Math.max(1.5 * dia / 1000, 0.04);
  const dx = Math.max(a.corner, a.dx), dy = Math.max(a.corner, a.dy);
  return gap(d.b, a.nx, dx) >= min(dx) - 1e-4 && gap(d.h, a.ny, dy) >= min(dy) - 1e-4;
}

export const tieDiaFor = (longDia: number): number => [6, 8, 10, 12].find((x) => x >= longDia / 3 - 1e-9) ?? 12;

export const tieMaxOf = (thinnest: number): number => Math.min(12 * thinnest / 1000, 0.2);

export const HELD_SPACING = 0.3;

/** The face bars (1 … n between the corners) a crosstie holds so that held bars are at most 300 mm apart, centre to centre; null where two neighbours are already farther apart. */
export function heldFaceBars(side: number, n: number, cornerDia: number, c: ColumnContext, tie: number): number[] | null {
  const pitch = (side - 2 * coverToBar(c, tie, cornerDia)) / (n + 1);
  if (pitch > HELD_SPACING + 1e-9) return null;
  const step = Math.max(1, Math.floor(HELD_SPACING / pitch + 1e-9));
  const out: number[] = [];
  for (let last = 0; (n + 1 - last) * pitch > HELD_SPACING + 1e-9;) { last += step; out.push(last); }
  return out;
}

export function crosstiesOf(d: ColumnDemand, a: ColumnAdopted, c: ColumnContext): { x: number; y: number; ok: boolean } {
  const x = heldFaceBars(d.b, a.nx, a.corner, c, a.tieDia), y = heldFaceBars(d.h, a.ny, a.corner, c, a.tieDia);
  return { x: x?.length ?? 0, y: y?.length ?? 0, ok: !!x && !!y };
}

export function shearRatios(d: ColumnDemand, c: ColumnContext, t: Ts500Mat, a: ColumnAdopted, ct: { x: number; y: number }): Array<{ x: number; y: number; px: number; py: number }> {
  const ab = barArea(a.tieDia) * 1e-4;
  const dx = d.h - coverToBar(c, a.tieDia, a.corner), dy = d.b - coverToBar(c, a.tieDia, a.corner);
  const vr = (bw: number, dd: number, legs: number, nd: number) => {
    const vw = a.tieSpacing > 0 ? legs * ab / a.tieSpacing * t.fyd * 1000 * dd : 0;
    return Math.min(0.8 * vcrOf(t, bw, dd, nd, d.b * d.h) + vw, vmaxOf(t, bw, dd));
  };
  return d.cases.map((cs) => {
    const nd = cs.puMin ?? cs.pu;
    const px = vr(d.b, dx, 2 + ct.x, nd), py = vr(d.h, dy, 2 + ct.y, nd);
    return { x: ratioOf(cs.vx ?? 0, px), y: ratioOf(cs.vy ?? 0, py), px, py };
  });
}

export function anyTension(d: ColumnDemand, tuples: Tuple[]): boolean {
  const ac = d.b * d.h, wx = d.b * d.h * d.h / 6, wy = d.h * d.b * d.b / 6;
  return tuples.some((q) => q.pu / ac - q.mx / wx - q.my / wy < 0);
}

export const areaOf = columnArea;
