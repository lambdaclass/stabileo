import { checkSlender, type ConcreteDesignParams } from '../engine/codes/argentina/cirsoc201';
import { COLUMN_STEEL_RATIO } from '../engine/codes/argentina/cirsoc201-basis';
import { withSection, type Bar } from '../engine/codes/argentina/cirsoc201-section';
import { columnTieSpacing } from '../codes/cirsoc201/transverse-spacing';
import { minClearSpacingColumn } from '../codes/cirsoc201/spacing';
import { barArea, roundDown } from './bars';
import type { Fmt } from './format';
import type { ColumnAdopted, Materials, RowStatus, Step, StepGroup } from './types';

const EDITION = '2025' as const;
const MAX_UNSUPPORTED_CLEAR = 0.15;

/** Moments about the section's x axis bend it over its depth h; about y, over its width b. */
export interface ColumnCase {
  combo: string;
  /** kN, positive in compression. */
  pu: number;
  /** The part of `pu` the dead load gives, factored as in the combination, kN. */
  puD?: number;
  mxTop: number; mxBot: number; myTop: number; myBot: number;
}

export interface ColumnDemand {
  key: string; name: string; level?: string;
  /** m: width (along the section's x) and depth (along y). */
  b: number; h: number;
  /** Storey height and clear height, m. */
  length: number; lu: number;
  psiTop: number; psiBot: number;
  cases: ColumnCase[];
}

export interface ColumnContext {
  mat: Materials;
  cover: number;
  tieDia: number;
  diameters: readonly number[];
}

interface AxisResult { klr: number; lim: number; slender: boolean; m1: number; m2: number; delta: number; mc: number; k: number }
interface CaseResult { c: ColumnCase; x: AxisResult; y: AxisResult; ratio: number }

export interface ColumnRow {
  family: 'column';
  key: string; name: string; level?: string;
  b: number; h: number; length: number;
  demand: ColumnDemand;
  req: { rho: number; ast: number; impossible: boolean; governing: string; compressionDominated: boolean };
  proposed: ColumnAdopted;
  adopted: ColumnAdopted;
  isAdopted: boolean;
  checks: { ratio: number; ok: boolean; area: number; spacingOk: boolean; tieOk: boolean; tieMax: number; crossties: { x: number; y: number }; rhoOk: boolean };
  status: RowStatus;
  generous: boolean;
  steps: StepGroup[];
}

const coverToBar = (c: ColumnContext, tie: number, dia: number) => c.cover + tie / 1000 + dia / 2000;

export function columnBars(d: { b: number; h: number }, a: ColumnAdopted, c: ColumnContext): Bar[] {
  const out: Bar[] = [];
  const xc = d.b / 2 - coverToBar(c, a.tieDia, a.corner), yc = d.h / 2 - coverToBar(c, a.tieDia, a.corner);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) out.push({ x: sx * xc, y: sy * yc, area: barArea(a.corner) * 1e-4 });
  const xf = d.b / 2 - coverToBar(c, a.tieDia, a.dy);
  for (let i = 1; i <= a.nx; i++) {
    const x = -xc + (2 * xc * i) / (a.nx + 1);
    for (const sy of [-1, 1]) out.push({ x, y: sy * (d.h / 2 - coverToBar(c, a.tieDia, a.dx)), area: barArea(a.dx) * 1e-4 });
  }
  for (let i = 1; i <= a.ny; i++) {
    const y = -yc + (2 * yc * i) / (a.ny + 1);
    for (const sx of [-1, 1]) out.push({ x: sx * xf, y, area: barArea(a.dy) * 1e-4 });
  }
  return out;
}

export const columnArea = (a: ColumnAdopted): number => 4 * barArea(a.corner) + 2 * a.nx * barArea(a.dx) + 2 * a.ny * barArea(a.dy);

export const columnLabel = (a: ColumnAdopted): string => {
  const parts = [`4 Ø${a.corner}`];
  if (a.nx > 0) parts.push(`2×${a.nx} Ø${a.dx} (b)`);
  if (a.ny > 0) parts.push(`2×${a.ny} Ø${a.dy} (h)`);
  return parts.join(' + ');
};

export const tieLabel = (a: ColumnAdopted): string => `Ø${a.tieDia} c/${Math.round(a.tieSpacing * 100)}`;

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
  return { klr: s.klu_r, lim: s.lambda_lim, slender: s.isSlender, m1, m2, delta: s.delta_ns, mc: s.isSlender ? s.Mc : m2, k: s.k };
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

function clearOk(d: ColumnDemand, c: ColumnContext, a: ColumnAdopted): boolean {
  const gap = (side: number, n: number, dia: number) => (side - 2 * coverToBar(c, a.tieDia, a.corner) - (n + 1) * dia / 1000) / (n + 1);
  const minX = minClearSpacingColumn(EDITION, { barDiameterMm: Math.max(a.corner, a.dx), maxAggregateSizeMm: 0 }).minClear;
  const minY = minClearSpacingColumn(EDITION, { barDiameterMm: Math.max(a.corner, a.dy), maxAggregateSizeMm: 0 }).minClear;
  return gap(d.b, a.nx, Math.max(a.corner, a.dx)) >= minX - 1e-4 && gap(d.h, a.ny, Math.max(a.corner, a.dy)) >= minY - 1e-4;
}

function crossties(side: number, n: number, dia: number, cornerDia: number, c: ColumnContext, tie: number): number {
  if (n <= 0) return 0;
  const span = side - 2 * coverToBar(c, tie, cornerDia);
  const pitch = span / (n + 1);
  let lastSupported = 0, count = 0;
  for (let i = 1; i <= n; i++) {
    const back = (i - lastSupported) * pitch - dia / 1000;
    const ahead = (n + 1 - i) * pitch - dia / 1000;
    if (back > MAX_UNSUPPORTED_CLEAR + 1e-9 && ahead > MAX_UNSUPPORTED_CLEAR + 1e-9) { count++; lastSupported = i; }
  }
  return count;
}

const tieDiaFor = (longDia: number): number => (longDia <= 16 ? 6 : longDia <= 25 ? 8 : 10);

export function columnRow(d: ColumnDemand, c: ColumnContext, adopted: ColumnAdopted | undefined, fmt: Fmt): ColumnRow {
  const Ag = d.b * d.h;
  const results: CaseResult[] = d.cases.map((cs) => ({ c: cs, x: axis(d, c, cs, 'x'), y: axis(d, c, cs, 'y'), ratio: 0 }));
  const demands = results.map((r) => ({ pu: r.c.pu, mx: r.x.mc, my: r.y.mc }));
  const puMax = Math.max(0, ...d.cases.map((cs) => cs.pu));
  const compressionDominated = puMax > 0.1 * c.mat.fc * 1000 * Ag;

  const dias = c.diameters.filter((x) => x >= 12 && x <= 32);
  const refDia = dias.includes(16) ? 16 : dias[0] ?? 16;
  const ref = evenLayout(d, c, refDia, tieDiaFor(refDia), 0.2);
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

  const proposed = proposeColumn(d, c, ast, dias, demands);
  const a = adopted ?? proposed;
  const ratio = demands.length ? utilisation(d, c, a, demands) : 0;
  results.forEach((r) => { r.ratio = utilisation(d, c, a, [{ pu: r.c.pu, mx: r.x.mc, my: r.y.mc }]); });
  const gov = results.reduce<CaseResult | undefined>((w, r) => (!w || r.ratio > w.ratio ? r : w), undefined);
  const area = columnArea(a);
  const rhoOk = area >= lo0 - 1e-6 && area <= hi0 + 1e-6;
  const spacingOk = clearOk(d, c, a);
  const longest = Math.max(a.corner, a.dx, a.dy), thinnest = Math.min(a.corner, a.nx > 0 ? a.dx : 99, a.ny > 0 ? a.dy : 99);
  const tieMax = columnTieSpacing(EDITION, thinnest, a.tieDia, Math.min(d.b, d.h)).spacing;
  const tieOk = a.tieSpacing <= tieMax + 1e-6 && a.tieDia >= tieDiaFor(longest);
  const ct = { x: crossties(d.b, a.nx, a.dx, a.corner, c, a.tieDia), y: crossties(d.h, a.ny, a.dy, a.corner, c, a.tieDia) };
  const ok = ratio <= 1 + 1e-6 && rhoOk && spacingOk && tieOk;
  const generous = area > 1.2 * ast + 1e-6 && ast > lo0 + 1e-6;

  const steps: StepGroup[] = [
    {
      title: 'rcSheets.g.data',
      steps: [
        { label: 'rcSheets.s.section', formula: 'b × h', value: `${fmt(d.b * 100, 0)} × ${fmt(d.h * 100, 0)} cm` },
        { label: 'rcSheets.s.materials', formula: "f'c · fy", value: `${fmt(c.mat.fc, 0)} · ${fmt(c.mat.fy, 0)} MPa` },
        { label: 'rcSheets.s.height', formula: 'L · lu', value: `${fmt(d.length)} · ${fmt(d.lu)} m` },
        { label: 'rcSheets.s.psi', formula: 'ΨA · ΨB', value: `${fmt(d.psiTop)} · ${fmt(d.psiBot)}` },
        { label: 'rcSheets.s.compressionDominated', formula: "Pu > 0.10·f'c·Ag", value: `${fmt(puMax, 1)} kN`, ok: compressionDominated },
      ],
    },
    ...(gov ? [slenderSteps(gov, fmt)] : []),
    {
      title: 'rcSheets.g.interaction',
      steps: [
        { label: 'rcSheets.s.rhoReq', formula: 'ρ = Ast/Ag (Pu, Mcx, Mcy)', value: `${fmt(ast / (Ag * 1e4) * 100, 2)} % → ${fmt(ast)} cm²`, ok: !impossible },
        { label: 'rcSheets.s.rhoLimits', formula: '0.01 ≤ ρ ≤ 0.08', value: `${fmt(area / (Ag * 1e4) * 100, 2)} %`, ok: rhoOk },
        { label: 'rcSheets.s.adopted', formula: columnLabel(a), value: `${fmt(area)} cm²`, ok: area >= ast - 1e-6 },
        { label: 'rcSheets.s.colSpacing', formula: 'max(1.5·db; 40 mm) (§25.2.3)', value: '', ok: spacingOk },
        { label: 'rcSheets.s.biaxial', formula: gov ? `Pu = ${fmt(gov.c.pu, 1)} kN; Mcx = ${fmt(gov.x.mc)}; Mcy = ${fmt(gov.y.mc)} kN·m (${gov.c.combo})` : '—', value: `${fmt(ratio, 3)}`, ok: ratio <= 1 + 1e-6 },
      ],
    },
    {
      title: 'rcSheets.g.ties',
      steps: [
        { label: 'rcSheets.s.tieDia', formula: 'db ≤ 16 → Ø6; ≤ 25 → Ø8; > 25 → Ø10', value: `Ø${a.tieDia}`, ok: a.tieDia >= tieDiaFor(longest) },
        { label: 'rcSheets.s.tieSpacing', formula: 's ≤ min(16·db; 48·de; b) (§25.7.2.1)', value: `${tieLabel(a)} ≤ ${fmt(tieMax * 100, 0)} cm`, ok: tieOk },
        { label: 'rcSheets.s.crossties', formula: '≤ 150 mm (§25.7.2.3)', value: `${ct.x} (b) · ${ct.y} (h)` },
      ],
    },
  ];

  return {
    family: 'column', key: d.key, name: d.name, level: d.level, b: d.b, h: d.h, length: d.length, demand: d,
    req: { rho: ast / (Ag * 1e4), ast, impossible, governing: gov?.c.combo ?? '', compressionDominated },
    proposed, adopted: a, isAdopted: !!adopted,
    checks: { ratio, ok, area, spacingOk, tieOk, tieMax, crossties: ct, rhoOk },
    status: ok ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
  };
}

function slenderSteps(g: CaseResult, f: Fmt): StepGroup {
  const ax = (name: string, r: AxisResult): Step[] => [
    { label: 'rcSheets.s.slenderness', formula: `${name}: k·lu/r = ${f(r.k, 2)}·lu/(0.3·h)`, value: `${f(r.klr, 1)} ≤ ${f(r.lim, 1)}?`, ok: !r.slender },
    { label: 'rcSheets.s.limit', formula: 'λlim = 34 + 12·M1/M2 ≤ 40', value: `M1 = ${f(-r.m1)} · M2 = ${f(r.m2)} kN·m` },
    ...(r.slender ? [{ label: 'rcSheets.s.magnifier', formula: 'δns = Cm/(1 − Pu/(0.75·Pc)); Mc = δns·max(M2; M2,min)', value: `${f(r.delta, 3)} → ${f(r.mc)} kN·m` }] : []),
  ];
  return { title: 'rcSheets.g.slenderness', steps: [...ax('x', g.x), ...ax('y', g.y)] };
}

function proposeColumn(d: ColumnDemand, c: ColumnContext, ast: number, dias: readonly number[], demands: Array<{ pu: number; mx: number; my: number }>): ColumnAdopted {
  const ok: ColumnAdopted[] = [];
  for (const dia of dias.length ? dias : [16]) {
    const tie = tieDiaFor(dia);
    let a = evenLayout(d, c, dia, tie, 0.3);
    for (let guard = 0; guard < 20 && columnArea(a) < ast - 1e-6; guard++) {
      a = d.h >= d.b ? (a.ny <= a.nx ? { ...a, ny: a.ny + 1 } : { ...a, nx: a.nx + 1 }) : (a.nx <= a.ny ? { ...a, nx: a.nx + 1 } : { ...a, ny: a.ny + 1 });
    }
    if (!clearOk(d, c, a)) continue;
    const spacing = roundDown(columnTieSpacing(EDITION, dia, tie, Math.min(d.b, d.h)).spacing);
    a = { ...a, tieSpacing: spacing };
    if (demands.length && utilisation(d, c, a, demands) > 1 + 1e-6) continue;
    ok.push(a);
  }
  if (ok.length) {
    const least = Math.min(...ok.map(columnArea));
    return ok.filter((a) => columnArea(a) <= 1.1 * least + 1e-6).sort((p, q) => p.nx + p.ny - (q.nx + q.ny) || columnArea(p) - columnArea(q))[0]!;
  }
  const dia = dias[dias.length - 1] ?? 25;
  const tie = tieDiaFor(dia);
  return { ...evenLayout(d, c, dia, tie, 0.15), tieSpacing: roundDown(columnTieSpacing(EDITION, dia, tie, Math.min(d.b, d.h)).spacing) };
}
