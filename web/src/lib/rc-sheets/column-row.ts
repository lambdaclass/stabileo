import { checkSlender, type ConcreteDesignParams } from '../engine/codes/argentina/cirsoc201';
import { COLUMN_STEEL_RATIO, shearFy } from '../engine/codes/argentina/cirsoc201-basis';
import { withSection, type Bar } from '../engine/codes/argentina/cirsoc201-section';
import { evaluateBeamSections, type BeamSectionQuery } from '../engine/codes/argentina/cirsoc201-beam-kernel';
import { columnTieSpacing } from '../codes/cirsoc201/transverse-spacing';
import { minClearSpacingColumn } from '../codes/cirsoc201/spacing';
import { barArea, roundDown } from './bars';
import { compressionLapMm, deriveDevelopment, deriveLap } from '../codes/cirsoc201/anchorage';
import { unbracedClearLimit } from '../codes/cirsoc201/transverse-cage';
import { columnSeismic, type Seismic } from './seismic';
import type { Fmt } from './format';
import { check, ratioOf, type CheckLine, type ColumnAdopted, type ComboTable, type Materials, type RowStatus, type Step, type StepGroup } from './types';

const EDITION = '2025' as const;

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
}

export interface ColumnDemand {
  key: string; name: string; level?: string;
  /** m: width (along the section's x) and depth (along y). */
  b: number; h: number;
  /** Storey height and clear height, m. */
  length: number; lu: number;
  psiTop: number; psiBot: number;
  cases: ColumnCase[];
  nodes?: { bottom: number; top: number };
}

export interface ColumnContext {
  mat: Materials;
  cover: number;
  tieDia: number;
  diameters: readonly number[];
  seismic?: Seismic;
}

interface AxisResult { klr: number; lim: number; slender: boolean; m1: number; m2: number; delta: number; mc: number; k: number }
interface CaseResult { c: ColumnCase; x: AxisResult; y: AxisResult; tuples: Tuple[]; ratio: number }
interface Tuple { pu: number; mx: number; my: number }

export interface ColumnRow {
  family: 'column';
  key: string; name: string; level?: string;
  b: number; h: number; length: number;
  demand: ColumnDemand;
  req: { rho: number; ast: number; impossible: boolean; governing: string; compressionDominated: boolean };
  proposed: ColumnAdopted;
  adopted: ColumnAdopted;
  isAdopted: boolean;
  checks: { ratio: number; ok: boolean; area: number; spacingOk: boolean; tieOk: boolean; tieMax: number; crossties: { x: number; y: number }; rhoOk: boolean; shearX: number; shearY: number };
  verifications: CheckLine[];
  combos: ComboTable;
  iterations: number;
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
  const pitch = span / (n + 1), limit = unbracedClearLimit(tie);
  let lastSupported = 0, count = 0;
  for (let i = 1; i <= n; i++) {
    const back = (i - lastSupported) * pitch - dia / 1000;
    const ahead = (n + 1 - i) * pitch - dia / 1000;
    if (back > limit + 1e-9 && ahead > limit + 1e-9) { count++; lastSupported = i; }
  }
  return count;
}

const tieDiaFor = (longDia: number): number => (longDia <= 16 ? 6 : longDia <= 25 ? 8 : 10);



/** The demands a case puts on the section: each end as it is, or the magnified moments where a direction is slender. */
function tuplesOf(cs: ColumnCase, x: AxisResult, y: AxisResult): Tuple[] {
  if (x.slender || y.slender) return [{ pu: cs.pu, mx: x.mc, my: y.mc }];
  return [{ pu: cs.puMin ?? cs.pu, mx: cs.mxTop, my: cs.myTop }, { pu: cs.pu, mx: cs.mxBot, my: cs.myBot }];
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
  const base = { edition: EDITION, fc: c.mat.fc * 1e6, fy: c.mat.fy * 1e6, s: a.tieSpacing, fyt: shearFy(c.mat.fy) * 1e6, Ag: d.b * d.h, NuCompression: Math.max(0, pu) * 1e3 };
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
export interface StackPlace { pattern?: { nx: number; ny: number; maxDia: number }; fromBelow?: boolean; offset?: number }

/** §25.5.5.1 in compression, or a class B tension splice (§25.5.2) where the column is not compression-dominated. */
export function columnSplice(c: ColumnContext, dia: number, tension: boolean): { length: number; tension: boolean } {
  if (tension) return { length: deriveLap(deriveDevelopment({ diameterMm: dia, fy: c.mat.fy, fc: c.mat.fc, favourableSpacing: false, edition: EDITION }), { edition: EDITION }).lapM, tension };
  return { length: compressionLapMm(c.mat.fy, dia) / 1000, tension };
}

export function columnRow(d: ColumnDemand, c: ColumnContext, adopted: ColumnAdopted | undefined, fmt: Fmt, stack: StackPlace = {}): ColumnRow {
  const Ag = d.b * d.h;
  const results: CaseResult[] = d.cases.map((cs) => {
    const x = axis(d, c, cs, 'x'), y = axis(d, c, cs, 'y');
    return { c: cs, x, y, tuples: tuplesOf(cs, x, y), ratio: 0 };
  });
  const all = results.flatMap((r) => r.tuples);
  const demands = governing(all);
  const puMax = Math.max(0, ...d.cases.map((cs) => cs.pu));
  const compressionDominated = puMax > 0.1 * c.mat.fc * 1000 * Ag;
  const klrMax = Math.max(0, ...results.flatMap((r) => [r.x.klr, r.y.klr]));

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

  const first = proposeColumn(d, c, ast, dias, all, stack.pattern);
  let proposed = first.layout, iterations = first.iterations;
  if (c.seismic) {
    for (let guard = 0; guard < 12; guard++) {
      const ct0 = { x: crossties(d.b, proposed.nx, proposed.dx, proposed.corner, c, proposed.tieDia), y: crossties(d.h, proposed.ny, proposed.dy, proposed.corner, c, proposed.tieDia) };
      const s0 = columnSeismic(d, { ...c, overstrength: c.seismic!.overstrength }, proposed, columnBars(d, proposed, c), ct0, fmt);
      const bad = (l: string) => s0.checks.some((k) => k.label === l && !k.ok);
      if (!bad('rcSheets.v.seisColSo') && !bad('rcSheets.v.seisColAsh') && !bad('rcSheets.v.seisColVe')) break;
      iterations++;
      if (proposed.tieSpacing > s0.so + 1e-6) proposed = { ...proposed, tieSpacing: roundDown(s0.so) };
      else if (proposed.tieDia < 12) proposed = { ...proposed, tieDia: proposed.tieDia + 2 };
      else if (proposed.tieSpacing > 0.075 + 1e-9) proposed = { ...proposed, tieSpacing: roundDown(proposed.tieSpacing - 0.025) };
      else break;
    }
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
  const longest = Math.max(a.corner, a.dx, a.dy), thinnest = Math.min(a.corner, a.nx > 0 ? a.dx : 99, a.ny > 0 ? a.dy : 99);
  const tieMax = columnTieSpacing(EDITION, thinnest, a.tieDia, Math.min(d.b, d.h)).spacing;
  const tieDiaOk = a.tieDia >= tieDiaFor(longest);
  const tieOk = a.tieSpacing <= tieMax + 1e-6 && tieDiaOk;
  const ct = { x: crossties(d.b, a.nx, a.dx, a.corner, c, a.tieDia), y: crossties(d.h, a.ny, a.dy, a.corner, c, a.tieDia) };
  const sh = shearRatios(d, c, a, ct);
  const shearX = Math.max(0, ...sh.map((x) => x.x)), shearY = Math.max(0, ...sh.map((x) => x.y));
  const vxMax = Math.max(0, ...d.cases.map((cs) => cs.vx ?? 0)), vyMax = Math.max(0, ...d.cases.map((cs) => cs.vy ?? 0));
  const generous = area > 1.2 * ast + 1e-6 && ast > lo0 + 1e-6;
  const splice = columnSplice(c, longest, d.cases.some((cs) => (cs.puMin ?? cs.pu) < 0.1 * c.mat.fc * 1000 * Ag));
  const seis = c.seismic ? columnSeismic(d, { ...c, overstrength: c.seismic.overstrength }, a, columnBars(d, a, c), ct, fmt) : null;

  const verifications: CheckLine[] = [
    check('rcSheets.v.biaxial', ratio <= 1 + 1e-6, { clause: '§22.4, §22.2', demand: gov?.c.combo ?? '', capacity: '', ratio }),
    check('rcSheets.v.rhoMin', area >= Math.max(ast, lo0) - 1e-6, { clause: '§10.6.1.1', demand: `${fmt(Math.max(ast, lo0))} cm²`, capacity: `${fmt(area)} cm²`, ratio: ratioOf(Math.max(ast, lo0), area) }),
    check('rcSheets.v.rhoMax', area <= hi0 + 1e-6, { clause: '§10.6.1.1', demand: `${fmt(area / (Ag * 1e4) * 100)} %`, capacity: '≤ 8 %' }),
    check('rcSheets.v.colSpacing', spacingOk, { clause: '§25.2.3' }),
    check('rcSheets.v.slenderMax', klrMax <= 100 + 1e-9, { clause: '§6.2.6', demand: `k·lu/r = ${fmt(klrMax, 1)}`, capacity: '≤ 100' }),
    check('rcSheets.v.shearX', shearX <= 1 + 1e-6, { clause: '§22.5', demand: `${fmt(vxMax)} kN`, capacity: `${fmt(Math.min(...sh.map((x) => x.px)))} kN`, ratio: shearX }),
    check('rcSheets.v.shearY', shearY <= 1 + 1e-6, { clause: '§22.5', demand: `${fmt(vyMax)} kN`, capacity: `${fmt(Math.min(...sh.map((x) => x.py)))} kN`, ratio: shearY }),
    check('rcSheets.v.tieDia', tieDiaOk, { clause: '§25.7.2.2', demand: `Ø${a.tieDia}`, capacity: `≥ Ø${tieDiaFor(longest)}` }),
    check('rcSheets.v.tieSpacing', a.tieSpacing <= tieMax + 1e-6, { clause: '§25.7.2.1', demand: `${fmt(a.tieSpacing * 100, 1)} cm`, capacity: `≤ ${fmt(tieMax * 100, 1)} cm` }),
    check('rcSheets.v.crossties', true, { clause: '§25.7.2.3', capacity: `${ct.x} (b) · ${ct.y} (h)` }),
    ...(stack.fromBelow ? [check(splice.tension ? 'rcSheets.v.colSpliceT' : 'rcSheets.v.colSpliceC', true, { clause: splice.tension ? '§25.5.2' : '§25.5.5.1', capacity: `${fmt(splice.length * 100, 0)} cm (Ø${longest})` })] : []),
    ...((stack.offset ?? 0) > 0.075 + 1e-6 ? [check('rcSheets.v.colOffset', true, { clause: '§10.7.4.1', demand: `${fmt((stack.offset ?? 0) * 100, 1)} cm`, capacity: '> 7.5 cm' })] : []),
    ...(seis?.checks ?? []),
  ];
  const ok = verifications.every((v) => v.ok) && !impossible;

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
        { label: 'rcSheets.s.nonSway', value: '' },
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
        { label: 'rcSheets.s.tieDia', formula: 'db ≤ 16 → Ø6; ≤ 25 → Ø8; > 25 → Ø10', value: `Ø${a.tieDia}`, ok: tieDiaOk },
        { label: 'rcSheets.s.tieSpacing', formula: 's ≤ min(16·db; 48·de; b) (§25.7.2.1)', value: `${tieLabel(a)} ≤ ${fmt(tieMax * 100, 0)} cm`, ok: a.tieSpacing <= tieMax + 1e-6 },
        { label: 'rcSheets.s.crossties', formula: '≤ min(15·dbe; 150 mm) (§25.7.2.3)', value: `${ct.x} (b) · ${ct.y} (h)` },
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
    family: 'column', key: d.key, name: d.name, level: d.level, b: d.b, h: d.h, length: d.length, demand: d,
    req: { rho: ast / (Ag * 1e4), ast, impossible, governing: gov?.c.combo ?? '', compressionDominated },
    proposed, adopted: a, isAdopted: !!adopted, iterations: adopted ? 0 : iterations,
    checks: { ratio, ok, area, spacingOk, tieOk, tieMax, crossties: ct, rhoOk, shearX, shearY },
    verifications, combos,
    status: ok ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
  };
}

function slenderSteps(g: CaseResult, f: Fmt): StepGroup {
  const ax = (name: string, r: AxisResult): Step[] => [
    { label: 'rcSheets.s.slenderness', formula: `${name}: k·lu/r = ${f(r.k, 2)}·lu/(0.3·h)`, value: `${f(r.klr, 1)} ≤ ${f(r.lim, 1)}?`, ok: !r.slender },
    { label: 'rcSheets.s.limit', formula: 'λlim = 34 + 12·M1/M2 ≤ 40', value: `M1 = ${f(-r.m1)} · M2 = ${f(r.m2)} kN·m` },
    ...(r.slender ? [{ label: 'rcSheets.s.magnifier', formula: 'δns = Cm/(1 − Pu/(0.75·Pc)); Mc = δns·max(M2; M2,min)', value: `${f(r.delta, 3)} → ${f(r.mc)} kN·m` }] : []),
  ];
  return { title: 'rcSheets.g.slenderness', steps: [{ label: 'rcSheets.s.governs', formula: '', value: g.c.combo }, ...ax('x', g.x), ...ax('y', g.y)] };
}

function proposeColumn(d: ColumnDemand, c: ColumnContext, ast: number, dias: readonly number[], tuples: Tuple[], pattern?: StackPlace['pattern']): { layout: ColumnAdopted; iterations: number } {
  const ok: Array<{ a: ColumnAdopted; it: number }> = [];
  const demands = governing(tuples);
  if (pattern) {
    for (const dia of [...dias].filter((x) => x <= pattern.maxDia).sort((p, q) => p - q)) {
      const tie = tieDiaFor(dia);
      const a: ColumnAdopted = { corner: dia, nx: pattern.nx, dx: dia, ny: pattern.ny, dy: dia, tieDia: tie, tieSpacing: roundDown(columnTieSpacing(EDITION, dia, tie, Math.min(d.b, d.h)).spacing) };
      if (columnArea(a) < ast - 1e-6 || !clearOk(d, c, a)) continue;
      if (demands.length && utilisation(d, c, a, demands) > 1 + 1e-6) continue;
      const ct = { x: crossties(d.b, a.nx, a.dx, a.corner, c, a.tieDia), y: crossties(d.h, a.ny, a.dy, a.corner, c, a.tieDia) };
      if (!shearRatios(d, c, a, ct).every((x) => x.x <= 1 + 1e-6 && x.y <= 1 + 1e-6)) continue;
      return { layout: a, iterations: 0 };
    }
  }
  for (const dia of dias.length ? dias : [16]) {
    let tie = tieDiaFor(dia);
    let a = evenLayout(d, c, dia, tie, 0.3);
    let it = 0;
    for (let guard = 0; guard < 20 && columnArea(a) < ast - 1e-6; guard++) {
      a = d.h >= d.b ? (a.ny <= a.nx ? { ...a, ny: a.ny + 1 } : { ...a, nx: a.nx + 1 }) : (a.nx <= a.ny ? { ...a, nx: a.nx + 1 } : { ...a, ny: a.ny + 1 });
    }
    if (!clearOk(d, c, a)) continue;
    a = { ...a, tieSpacing: roundDown(columnTieSpacing(EDITION, dia, tie, Math.min(d.b, d.h)).spacing) };
    while (demands.length && utilisation(d, c, a, demands) > 1 + 1e-6 && it < 8) {
      it++;
      const grown = d.h >= d.b ? (a.ny <= a.nx ? { ...a, ny: a.ny + 1 } : { ...a, nx: a.nx + 1 }) : (a.nx <= a.ny ? { ...a, nx: a.nx + 1 } : { ...a, ny: a.ny + 1 });
      if (!clearOk(d, c, grown)) break;
      a = grown;
    }
    if (demands.length && utilisation(d, c, a, demands) > 1 + 1e-6) continue;
    for (let guard = 0; guard < 40; guard++) {
      const ct = { x: crossties(d.b, a.nx, a.dx, a.corner, c, a.tieDia), y: crossties(d.h, a.ny, a.dy, a.corner, c, a.tieDia) };
      const sh = shearRatios(d, c, a, ct);
      if (sh.every((x) => x.x <= 1 + 1e-6 && x.y <= 1 + 1e-6)) break;
      it++;
      if (a.tieSpacing > 0.075 + 1e-9) a = { ...a, tieSpacing: roundDown(a.tieSpacing - 0.025) };
      else if (tie < 12) { tie += 2; a = { ...a, tieDia: tie, tieSpacing: Math.min(0.15, roundDown(columnTieSpacing(EDITION, dia, tie, Math.min(d.b, d.h)).spacing)) }; }
      else break;
    }
    ok.push({ a, it });
  }
  if (ok.length) {
    const least = Math.min(...ok.map((x) => columnArea(x.a)));
    const pick = ok.filter((x) => columnArea(x.a) <= 1.1 * least + 1e-6).sort((p, q) => p.a.nx + p.a.ny - (q.a.nx + q.a.ny) || columnArea(p.a) - columnArea(q.a))[0]!;
    return { layout: pick.a, iterations: pick.it };
  }
  const dia = dias[dias.length - 1] ?? 25;
  const tie = tieDiaFor(dia);
  return { layout: { ...evenLayout(d, c, dia, tie, 0.15), tieSpacing: roundDown(columnTieSpacing(EDITION, dia, tie, Math.min(d.b, d.h)).spacing) }, iterations: 0 };
}
