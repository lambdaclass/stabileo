import { deriveDevelopment, deriveHookedDevelopment, deriveLap, concreteBelowTopBars, topBarFactor } from '../codes/cirsoc201/anchorage';
import { minMandrelDiameter } from '../codes/cirsoc201/bar-geometry';
import { transverseSpacingLimits } from '../codes/cirsoc201/transverse-spacing';
import { evaluateCutoff, type CutoffLegality } from '../engine/detailing/generate-beam';
import { evaluateBeamSections } from '../engine/codes/argentina/cirsoc201-beam-kernel';
import { minFlexuralSteelCm2 } from '../engine/codes/argentina/cirsoc201-basis';
import { barArea, faceLayout, groupsArea, groupsLabel, roundDown } from './bars';
import { phiMnOf, sectionQuery, type BeamContext, type BeamDemand, type BeamEnd, type BeamRow } from './beam-row';
import type { Fmt } from './format';
import { developedLength, hookedStraight, shapeWeight, type BarShape } from './shape';
import { check, ratioOf, type BarGroup, type BeamAdopted, type CheckLine, type RowStatus, type StepGroup, type Stirrups } from './types';

const EDITION = '2025' as const;
const STOCK_LENGTH = 12;
/** A column's longitudinal bar the beam's bars stop inside of, m. */
const COLUMN_BAR = 0.016;
const step = (x: number) => Math.ceil(x / 0.05 - 1e-9) * 0.05;

/** One section of a span the line asks a capacity of: the bars in tension and in compression, and whether it sags (the flange then counts). */
export interface LineQuery { demand: Pick<BeamDemand, 'b' | 'h' | 'flange'>; tension: BarGroup[]; compression: BarGroup[]; sd: number; sagging: boolean }

/** What a stopped bar's point needs (CIRSOC 201 and ACI 318 §9.7.3.5; another code its own rule), as `evaluateCutoff` takes it. */
export type CutoffInput = Omit<Parameters<typeof evaluateCutoff>[0], 'edition'>;

/** The code's rules a continuous beam's bars are laid out by: lengths in m, areas in cm², forces in kN and kN·m. */
export interface LineCode {
  development(c: BeamContext, dia: number, top: boolean, h: number): number;
  hooked(c: BeamContext, dia: number): number;
  lap(c: BeamContext, dia: number, top: boolean, h: number): number;
  minBottom(c: BeamContext, b: number, d: number): number;
  /** Design moment capacity of each section. */
  moments(c: BeamContext, qs: readonly LineQuery[]): number[];
  /** Design shear capacity with the stirrups given, and the nominal one a cutoff rule reads. */
  shear(c: BeamContext, q: LineQuery, stirrups: Stirrups): { design: number; nominal: number };
  cutoff(input: CutoffInput): { legality: CutoffLegality; extraStirrups?: { maxSpacing: number; minAvOverS: number } | null };
  stirrupMax(c: BeamContext, b: number, d: number, stirrupDia: number): number;
  /** Inside diameter a longitudinal bar is bent on, m; 6 bar diameters when the code gives none here. */
  mandrel?(dia: number): number;
  text: {
    cutoff: Record<CutoffLegality, string>;
    clause: { envelope: string; bottomRun: string; fit: string; hooks: string; splices: string };
    formula: { capacity: string; cut: string; third: string };
  };
}

const cirsocDevelopment = (c: BeamContext, dia: number, top: boolean, h: number) => {
  const psiT = top ? topBarFactor(concreteBelowTopBars(h, c.cover, c.stirrupDia, dia)) : 1;
  return deriveDevelopment({ diameterMm: dia, fy: c.mat.fy, fc: c.mat.fc, favourableSpacing: false, psiT, edition: EDITION });
};
const kernelQuery = (c: BeamContext, q: LineQuery, shear?: Stirrups) => sectionQuery(c, q.demand, q.tension, q.compression, q.sd, 0, shear, q.sagging);

/** CIRSOC 201-2025, and ACI 318-19 whose provisions it adopts with the same numbering. */
export const CIRSOC_LINE: LineCode = {
  development: (c, dia, top, h) => cirsocDevelopment(c, dia, top, h).ldM,
  hooked: (c, dia) => deriveHookedDevelopment({ diameterMm: dia, fy: c.mat.fy, fc: c.mat.fc, edition: EDITION }).ldhM,
  lap: (c, dia, top, h) => deriveLap(cirsocDevelopment(c, dia, top, h), { edition: EDITION }).lapM,
  minBottom: (c, b, d) => minFlexuralSteelCm2(c.mat.fc, c.mat.fy, b, d),
  moments: (c, qs) => (evaluateBeamSections(qs.map((q) => kernelQuery(c, q))) ?? []).map(phiMnOf),
  shear: (c, q, st) => {
    const r = evaluateBeamSections([kernelQuery(c, q, st)])?.[0];
    return r && r.shearValid ? { design: r.phiVn / 1e3, nominal: r.phiVn / 0.75 / 1e3 } : { design: 0, nominal: 0 };
  },
  cutoff: (input) => evaluateCutoff({ ...input, edition: EDITION }),
  mandrel: (dia) => minMandrelDiameter(dia, 'longitudinal').value,
  stirrupMax: (c, b, d, sd) => transverseSpacingLimits(EDITION, { VsRequired: 0, bw: b, d, fc: c.mat.fc, cover: c.cover, stirrupDiaMm: sd }).alongMax,
  text: {
    cutoff: { notInTension: '§9.7.3.5: M = 0', lowShear: '§9.7.3.5(a): Vu ≤ ⅔·Vn', doubleArea: '§9.7.3.5(b): As,cont ≥ 2·As,req; Vu ≤ ¾·Vn', extraStirrups: '§9.7.3.5(c): s ≤ d/8; Av/s ≥ 0.41·bw/fyt', illegal: '—' },
    clause: { envelope: '§9.7.3, §22.2', bottomRun: '§9.7.3.8.2', fit: '§25.2.1', hooks: '§25.4.3', splices: '§25.5.2' },
    formula: { capacity: 'φMn(x) ≥ Mu(x) ∀x', cut: '§9.7.3.3, §9.7.3.2: x(φMn,cont = Mu) + max(d; 12·db) ≥ c + ld', third: '§9.7.3.8.4: As⁻/3 → x(M = 0) + max(d; 12·db; ln/16)' },
  },
};

/** A continuous beam's bars: a run top and bottom over its whole length, extra top bars at each support and extra bottom bars in each span. */
export interface LineAdopted {
  bottom: BarGroup;
  top: BarGroup;
  supportTop: BarGroup[];
  spanBottom: BarGroup[];
  /** Span bars bent up over both supports of each span, where the line is laid out with bent bars. */
  bent?: BarGroup[];
  stirrups?: Stirrups[];
}

export interface LineBar {
  mark: string;
  face: 'top' | 'bottom';
  kind: 'continuous' | 'support' | 'span' | 'bent';
  bars: BarGroup;
  /** Along the line, m. */
  from: number; to: number;
  hooks: [boolean, boolean];
  /** One bar's cut length with its hooks, m, and the group's weight, kg. */
  length: number; weight: number;
  /** The bar as it is bent, in the elevation's plane: y up from the beam's soffit. */
  shape: BarShape;
  /** Where along the line it lies at a face and carries tension there; a straight bar has one run, a bent one three. */
  runs: Array<{ face: 'top' | 'bottom'; from: number; to: number }>;
}

/** The faces a bar works at x along the line: none on its inclined legs. */
export const barActsAt = (b: Pick<LineBar, 'runs'>, face: 'top' | 'bottom', x: number, tol = 1e-9): boolean =>
  b.runs.some((r) => r.face === face && x >= r.from - tol && x <= r.to + tol);

const BEND_ANGLE = 45;

export interface LineLayout {
  key: string; group: number; name: string; level?: string;
  length: number;
  spans: Array<{ name: string; x0: number; x1: number; b: number; h: number }>;
  /** Each support's extent along the line, m (0 where unknown). */
  supportWidths: number[];
  /** Clear cover to the stirrups, m. */
  cover: number;
  proposed: LineAdopted; adopted: LineAdopted; isAdopted: boolean; iterations: number;
  bars: LineBar[];
  zones: Array<{ span: number; from: number; to: number; stirrups: Stirrups }>;
  splices: Array<{ face: 'top' | 'bottom'; x: number; length: number }>;
  /** Where extra bars stop in a span, and which §9.7.3.5 provision allows it. A cut none allows is not made: the bar runs on to the support. */
  cutoffs: Array<{ mark: string; face: 'top' | 'bottom'; x: number; legality: CutoffLegality }>;
  anchorage: Array<{ dia: number; ld: number; ldTop: number; ldh: number; lap: number }>;
  envelope: Array<{ x: number; pos: number; neg: number; phiPos: number; phiNeg: number }>;
  /** Shear along the line over all combinations, and the design capacity of the stirrups there, kN. */
  shear: Array<{ x: number; v: number; phiVn: number }>;
  /** Where the bars that reach each end of the line stop, m along it (negative before the first axis), and what holds that end. */
  ends: { from: number; to: number; start?: BeamEnd; end?: BeamEnd };
  spanAdopted: BeamAdopted[];
  verifications: CheckLine[];
  utilization: number;
  status: RowStatus;
  steps: StepGroup[];
}

interface Span { row: BeamRow; x0: number; L: number; b: number; h: number; d: number }

/** The straight extension past a 90° hook's bend, m (Table 25.3.1). */
const HOOK_EXTENSION = (dia: number) => 12 * dia / 1000;

/** The bars a section holds: one layer when they are one diameter and fit, else two. */
function sectionGroups(cont: BarGroup, extra: BarGroup | undefined, b: number, c: BeamContext, sd: number): BarGroup[] {
  if (!extra || extra.count <= 0) return [cont];
  const merged = { count: cont.count + extra.count, dia: cont.dia };
  if (extra.dia === cont.dia && faceLayout([merged], b, c.cover, sd).fits) return [merged];
  return [cont, extra];
}

function commonDia(groups: BarGroup[][], fallback: number): number {
  const counts = new Map<number, number>();
  for (const g of groups) for (const x of g) if (x.count > 0) counts.set(x.dia, (counts.get(x.dia) ?? 0) + x.count);
  return [...counts].sort((p, q) => q[1] - p[1] || q[0] - p[0])[0]?.[0] ?? fallback;
}

export function beamLine(rows: BeamRow[], c: BeamContext, adopted: LineAdopted | undefined, fmt: Fmt, code: LineCode = CIRSOC_LINE): LineLayout {
  const dev = (_c: BeamContext, dia: number, top: boolean, h: number) => code.development(c, dia, top, h);
  const lapOf = (_c: BeamContext, dia: number, top: boolean, h: number) => code.lap(c, dia, top, h);
  const sorted = [...rows].sort((p, q) => (p.demand.line?.index ?? 0) - (q.demand.line?.index ?? 0));
  let x = 0;
  const spans: Span[] = sorted.map((row) => { const s = { row, x0: x, L: row.length, b: row.b, h: row.h, d: row.h - c.cover - c.stirrupDia / 1000 - 0.01 }; x += row.length; return s; });
  const total = x;
  const supports = [0, ...spans.map((s) => s.x0 + s.L)];
  const endStart = sorted[0]?.demand.ends?.start, endEnd = sorted[sorted.length - 1]?.demand.ends?.end;
  const inset = c.cover + c.stirrupDia / 1000 + COLUMN_BAR;
  const reachInto = (e: BeamEnd | undefined) => (!e ? 0 : e.kind === 'free' ? -c.cover : Math.max(0, e.half - inset));
  const xFrom = -reachInto(endStart), xTo = total + reachInto(endEnd);
  const hMax = Math.max(...spans.map((s) => s.h));
  const mandrelOf = (dia: number) => code.mandrel?.(dia) ?? 6 * dia / 1000;
  const line = supports.map((_, j) => Math.max(spans[j - 1]?.row.demand.supportHalf?.end ?? 0, spans[j]?.row.demand.supportHalf?.start ?? 0));
  const reqAt = (r: BeamRow, sign: 'pos' | 'neg', sec: 'start' | 'span' | 'end') =>
    Math.max(0, ...r.req.bySection.filter((x) => x.sign === sign && x.section === sec).map((x) => x.req));
  const botDia = commonDia(sorted.map((r) => r.proposed.bottom), 16), topDia = commonDia(sorted.map((r) => r.proposed.top), 16);
  const hanger = c.diameters.includes(12) ? 12 : 10;

  const propose = (): LineAdopted => {
    const minBottom = Math.max(...spans.map((s) => code.minBottom(c, s.b, s.d)));
    const aCb = Math.max(minBottom, 0.25 * Math.max(...sorted.map((r) => r.req.bottom)));
    const bottom = { dia: botDia, count: Math.max(2, Math.ceil(aCb / barArea(botDia) - 1e-9)) };
    const spanHog = Math.max(0, ...sorted.map((r) => reqAt(r, 'neg', 'span')));
    const top = spanHog > 2 * barArea(hanger) ? { dia: topDia, count: Math.max(2, Math.ceil(spanHog / barArea(topDia) - 1e-9)) } : { dia: hanger, count: 2 };
    const supportTop = supports.map((_, j) => {
      const left = j > 0 ? reqAt(sorted[j - 1]!, 'neg', 'end') : 0, right = j < sorted.length ? reqAt(sorted[j]!, 'neg', 'start') : 0;
      const extra = Math.max(left, right) - groupsArea([top]);
      return { dia: topDia, count: extra > 1e-6 ? Math.ceil(extra / barArea(topDia) - 1e-9) : 0 };
    });
    const spanBottom = sorted.map((r) => {
      const extra = r.req.bottom - groupsArea([bottom]);
      return { dia: botDia, count: extra > 1e-6 ? Math.ceil(extra / barArea(botDia) - 1e-9) : 0 };
    });
    if (!c.bentBars) return { bottom, top, supportTop, spanBottom, stirrups: sorted.map((r) => r.proposed.stirrups) };
    const share = supportTop.map((g, j) => (g.count * barArea(g.dia)) / (j === 0 || j === supports.length - 1 ? 1 : 2));
    const bentDia = Math.max(botDia, topDia);
    const bent = spanBottom.map((g, k) => ({ dia: bentDia, count: Math.max(g.count >= 2 && g.dia === bentDia ? Math.floor(g.count / 2) : 0, Math.floor(Math.max(share[k] ?? 0, share[k + 1] ?? 0) / barArea(bentDia) + 1e-9)) }));
    bent.forEach((g, k) => { if (spanBottom[k]!.dia === bentDia) spanBottom[k] = { dia: bentDia, count: Math.max(0, spanBottom[k]!.count - g.count) }; });
    supports.forEach((_, j) => {
      const arriving = (bent[j - 1]?.count ?? 0) * barArea(bentDia) + (bent[j]?.count ?? 0) * barArea(bentDia);
      const left = j > 0 ? reqAt(sorted[j - 1]!, 'neg', 'end') : 0, right = j < sorted.length ? reqAt(sorted[j]!, 'neg', 'start') : 0;
      const extra = Math.max(left, right) - groupsArea([top]) - arriving;
      supportTop[j] = { dia: topDia, count: extra > 1e-6 ? Math.ceil(extra / barArea(topDia) - 1e-9) : 0 };
    });
    return { bottom, top, supportTop, spanBottom, bent, stirrups: sorted.map((r) => r.proposed.stirrups) };
  };

  const capQueries = (qs: LineQuery[]) => code.moments(c, qs);
  const query = (s: Span, tension: BarGroup[], compression: BarGroup[], sd: number, sagging: boolean): LineQuery => ({ demand: s.row.demand, tension, compression, sd, sagging });

  const layout = (a: LineAdopted) => {
    const sdOf = (k: number) => a.stirrups?.[k]?.dia ?? c.stirrupDia;
    const bars: LineBar[] = [];
    let mark = 0;
    const next = () => String.fromCharCode(65 + (mark++ % 26)) + (mark > 26 ? String(Math.floor((mark - 1) / 26)) : '');
    const add = (face: 'top' | 'bottom', kind: LineBar['kind'], g: BarGroup, from: number, to: number, hooks: [boolean, boolean], bent?: { shape: BarShape; runs: LineBar['runs'] }) => {
      if (g.count <= 0 || to - from < 1e-6) return;
      const inner = c.cover + sdOf(0) / 1000 + g.dia / 2000;
      const shape = bent?.shape ?? hookedStraight(from, to, face === 'top' ? hMax - inner : inner, g.dia, mandrelOf(g.dia), hooks, face === 'top' ? -1 : 1, HOOK_EXTENSION(g.dia));
      const length = developedLength(shape);
      bars.push({ mark: next(), face, kind, bars: g, from, to, hooks, length, weight: shapeWeight(shape, g.count), shape, runs: bent?.runs ?? [{ face, from, to }] });
    };
    add('bottom', 'continuous', a.bottom, xFrom, xTo, [true, true]);
    add('top', 'continuous', a.top, xFrom, xTo, [true, true]);
    const contCap = (sign: 'pos' | 'neg') => spans.map((s, k) => capQueries((s.row.demand.env ?? []).map(() => (sign === 'pos' ? query(s, [a.bottom], [a.top], sdOf(k), true) : query(s, [a.top], [a.bottom], sdOf(k), false)))));
    const capPos = contCap('pos'), capNeg = contCap('neg');
    const stOf = (k: number) => a.stirrups?.[k] ?? spans[k]!.row.proposed.stirrups;
    const vnOf = spans.map((s, k) => code.shear(c, query(s, [a.bottom], [a.top], sdOf(k), false), stOf(k)).nominal);
    const legality = (k: number, x: number, face: 'top' | 'bottom', dia: number, towardEnd: boolean): { legality: CutoffLegality; ok: boolean } => {
      const s = spans[k]!, env = s.row.demand.env ?? [];
      if (!env.length) return { legality: 'notInTension', ok: true };
      const i = env.reduce((b, e, j) => (Math.abs(e.x - x) < Math.abs(env[b]!.x - x) ? j : b), 0);
      const m = face === 'bottom' ? env[i]!.pos : env[i]!.neg, cap = (face === 'bottom' ? capPos : capNeg)[k]![i] ?? 0;
      const ext = Math.max(s.d, 12 * dia / 1000);
      const r = code.cutoff({
        theoretical: towardEnd ? x - ext : x + ext, d: s.d, diameterMm: dia, stations: env.map((e) => ({ x: e.x, mPos: e.pos, mNeg: e.neg, v: e.v })),
        vn: vnOf[k]!, b: s.b, fy: c.mat.fy, continuingDoubleArea: cap >= 2 * m - 1e-6, inTensionZone: m > 1e-6, towardEnd,
      });
      const st = stOf(k), x3 = r.extraStirrups;
      return { legality: r.legality, ok: r.legality !== 'illegal' && (!x3 || (st.spacing <= x3.maxSpacing + 1e-9 && st.legs * barArea(st.dia) * 1e-4 / st.spacing >= x3.minAvOverS - 1e-12)) };
    };
    const cuts: Array<{ face: 'top' | 'bottom'; x: number; legality: CutoffLegality; bar: number }> = [];
    supports.forEach((xs, j) => {
      const g = a.supportTop[j];
      if (!g || g.count <= 0) return;
      const ld = dev(c, g.dia, true, Math.max(...spans.map((s) => s.h)));
      const reach = (k: number, fromStart: boolean): number => {
        const s = spans[k]!, env = s.row.demand.env ?? [];
        const ext = Math.max(s.d, 12 * g.dia / 1000);
        const ordered = env.map((e, i) => ({ ...e, i, dist: fromStart ? e.x : s.L - e.x })).sort((p, q) => p.dist - q.dist);
        let need = 0, inflection = s.L;
        for (const e of ordered) if (e.neg <= 1e-6) { inflection = e.dist; break; }
        for (const e of ordered) if (e.dist <= inflection + 1e-9 && e.neg > (capNeg[k]![e.i] ?? 0) + 1e-6) need = e.dist;
        const third = groupsArea([a.top]) < (groupsArea([a.top]) + groupsArea([g])) / 3 ? inflection + Math.max(ext, s.L / 16) : 0;
        const face = (fromStart ? s.row.demand.faces?.start : s.row.demand.faces?.end) ?? 0;
        const dist = Math.min(s.L, step(Math.max(need + ext, face + ld, third)));
        if (dist >= s.L - 1e-6) return dist;
        const x = fromStart ? dist : s.L - dist, l = legality(k, x, 'top', g.dia, fromStart);
        if (!l.ok) return s.L;
        cuts.push({ face: 'top', x: s.x0 + x, legality: l.legality, bar: bars.length });
        return dist;
      };
      const left = j > 0 ? reach(j - 1, false) : -xFrom, right = j < spans.length ? reach(j, true) : xTo - total;
      add('top', 'support', g, xs - left, xs + right, [j === 0, j === spans.length]);
    });
    spans.forEach((s, k) => {
      const g = a.spanBottom[k];
      if (!g || g.count <= 0) return;
      const env = s.row.demand.env ?? [];
      const over = env.map((e, i) => ({ e, i })).filter(({ e, i }) => e.pos > (capPos[k]![i] ?? 0) + 1e-6);
      const ld = dev(c, g.dia, false, s.h);
      const ext = Math.max(s.d, 12 * g.dia / 1000);
      const xStar = s.row.demand.span.x;
      const xa = over.length ? Math.min(...over.map((o) => o.e.x)) : xStar, xb = over.length ? Math.max(...over.map((o) => o.e.x)) : xStar;
      let from = Math.max(0, Math.floor(Math.min(xa - ext, xStar - ld) / 0.05 + 1e-9) * 0.05), to = Math.min(s.L, step(Math.max(xb + ext, xStar + ld)));
      const lf = from > 1e-6 ? legality(k, from, 'bottom', g.dia, false) : null, lt = to < s.L - 1e-6 ? legality(k, to, 'bottom', g.dia, true) : null;
      if (lf && !lf.ok) from = 0;
      if (lt && !lt.ok) to = s.L;
      if (lf?.ok) cuts.push({ face: 'bottom', x: s.x0 + from, legality: lf.legality, bar: bars.length });
      if (lt?.ok) cuts.push({ face: 'bottom', x: s.x0 + to, legality: lt.legality, bar: bars.length });
      add('bottom', 'span', g, s.x0 + from, s.x0 + to, [false, false]);
    });
    spans.forEach((s, k) => {
      const g = a.bent?.[k];
      if (!g || g.count <= 0) return;
      const inner = c.cover + sdOf(k) / 1000 + g.dia / 2000;
      const yLow = inner, yHigh = s.h - inner;
      const run = (yHigh - yLow) / Math.tan((BEND_ANGLE * Math.PI) / 180);
      const env = s.row.demand.env ?? [];
      const ext = Math.max(s.d, 12 * g.dia / 1000);
      const bendAt = (fromStart: boolean) => {
        const half = env.map((e, i) => ({ e, i, dist: fromStart ? e.x : s.L - e.x })).filter((o) => o.dist <= s.L / 2 + 1e-9);
        const posNeed = Math.min(s.L / 2, ...half.filter((o) => o.e.pos > (capPos[k]![o.i] ?? 0) + 1e-6).map((o) => o.dist));
        const negNeed = Math.max(0, ...half.filter((o) => o.e.neg > (capNeg[k]![o.i] ?? 0) + 1e-6).map((o) => o.dist));
        const upper = Math.min(s.L / 2 - run - 0.05, posNeed - ext - run);
        return Math.max(0, Math.floor(Math.min(upper, Math.max(negNeed + ext, s.L / 7)) / 0.05 + 1e-9) * 0.05);
      };
      const xl = s.x0 + bendAt(true), xr = s.x0 + s.L - bendAt(false);
      if (xr - xl < 2 * run + 0.1 || xl - s.x0 < 0.05 || s.x0 + s.L - xr < 0.05) return;
      const ldTop = dev(c, g.dia, true, s.h);
      const reachOver = (j: number) => step(ldTop + (line[j] ?? 0));
      const from = k === 0 ? xFrom : s.x0 - reachOver(k), to = k === spans.length - 1 ? xTo : s.x0 + s.L + reachOver(k + 1);
      const hooks: [boolean, boolean] = [k === 0, k === spans.length - 1];
      const leg = (mandrelOf(g.dia) + g.dia / 1000) / 2 + HOOK_EXTENSION(g.dia);
      const pts: Array<[number, number]> = [
        ...(hooks[0] ? [[from, yHigh - leg] as [number, number]] : []),
        [from, yHigh], [xl, yHigh], [xl + run, yLow], [xr - run, yLow], [xr, yHigh], [to, yHigh],
        ...(hooks[1] ? [[to, yHigh - leg] as [number, number]] : []),
      ];
      add('bottom', 'bent', g, from, to, hooks, {
        shape: { pts, mandrel: mandrelOf(g.dia), dia: g.dia },
        runs: [{ face: 'top', from, to: xl }, { face: 'bottom', from: xl + run, to: xr - run }, { face: 'top', from: xr, to }],
      });
    });
    lastCuts = cuts.map((x) => ({ mark: bars[x.bar]?.mark ?? '', face: x.face, x: x.x, legality: x.legality }));
    return bars;
  };
  let lastCuts: LineLayout['cutoffs'] = [];

  const effective = (bars: LineBar[], face: 'top' | 'bottom', xl: number, ldOf: (g: BarGroup) => number) => {
    const groups: BarGroup[] = [];
    for (const b of bars.filter((y) => barActsAt(y, face, xl))) {
      const ld = ldOf(b.bars);
      const fromStart = b.hooks[0] ? Infinity : xl - b.from, fromEnd = b.hooks[1] ? Infinity : b.to - xl;
      const f = Math.min(1, Math.min(fromStart, fromEnd) / ld);
      if (f > 1e-3) groups.push({ count: b.bars.count * f, dia: b.bars.dia });
    }
    return groups;
  };

  const verify = (a: LineAdopted, bars: LineBar[]) => {
    const pts: Array<{ k: number; i: number; xl: number; pos: number; neg: number }> = [];
    spans.forEach((s, k) => (s.row.demand.env ?? []).forEach((e, i) => pts.push({ k, i, xl: s.x0 + e.x, pos: e.pos, neg: e.neg })));
    const qs: LineQuery[] = [];
    for (const p of pts) {
      const s = spans[p.k]!, sd = a.stirrups?.[p.k]?.dia ?? c.stirrupDia;
      const bot = effective(bars, 'bottom', p.xl, (g) => dev(c, g.dia, false, s.h)), top = effective(bars, 'top', p.xl, (g) => dev(c, g.dia, true, s.h));
      qs.push(query(s, bot.length ? bot : [{ count: 0, dia: 10 }], top, sd, true), query(s, top.length ? top : [{ count: 0, dia: 10 }], bot, sd, false));
    }
    const cap = capQueries(qs);
    return pts.map((p, n) => ({ ...p, phiPos: cap[2 * n] ?? 0, phiNeg: cap[2 * n + 1] ?? 0 }));
  };

  let proposed = adopted ?? propose(), iterations = 0;
  let bars = layout(proposed), env = verify(proposed, bars);
  if (!adopted) {
    while (iterations < 16) {
      const bad = env.filter((e) => e.pos > e.phiPos + 1e-6 || e.neg > e.phiNeg + 1e-6);
      if (!bad.length) break;
      iterations++;
      const next: LineAdopted = JSON.parse(JSON.stringify(proposed));
      const spansBad = new Set(bad.filter((e) => e.pos > e.phiPos + 1e-6).map((e) => e.k));
      for (const k of spansBad) next.spanBottom[k] = { dia: next.spanBottom[k]!.dia, count: next.spanBottom[k]!.count + 1 };
      const supportsBad = new Set(bad.filter((e) => e.neg > e.phiNeg + 1e-6).map((e) => (e.xl - spans[e.k]!.x0 < spans[e.k]!.L / 2 ? e.k : e.k + 1)));
      for (const j of supportsBad) next.supportTop[j] = { dia: next.supportTop[j]!.dia, count: next.supportTop[j]!.count + 1 };
      proposed = next; bars = layout(proposed); env = verify(proposed, bars);
    }
  }
  const a = adopted ?? proposed;
  if (adopted) { bars = layout(a); env = verify(a, bars); }

  const zones = spans.flatMap((s, k) => {
    const st = a.stirrups?.[k] ?? s.row.proposed.stirrups;
    const env1 = s.row.demand.env ?? [];
    const row1 = code.stirrupMax(c, s.b, s.d, st.dia);
    const sMid = roundDown(Math.min(row1, s.row.req.sMax > 0 ? Math.max(s.row.req.sMax, st.spacing) : row1));
    const extra = lastCuts.some((x) => x.legality === 'extraStirrups' && x.x >= s.x0 - 1e-6 && x.x <= s.x0 + s.L + 1e-6);
    if (extra || !s.row.req.torsionNeglected || sMid <= st.spacing + 1e-9 || !env1.length) return [{ span: k, from: s.x0, to: s.x0 + s.L, stirrups: st }];
    const phiVnMid = code.shear(c, query(s, [a.bottom], [a.top], st.dia, false), { ...st, spacing: sMid }).design;
    const need = env1.filter((e) => e.v > phiVnMid + 1e-6);
    const left = need.filter((e) => e.x < s.L / 2), right = need.filter((e) => e.x >= s.L / 2);
    const xa = left.length ? step(Math.max(...left.map((e) => e.x)) + 0.05) : 0, xb = right.length ? s.L - step(s.L - Math.min(...right.map((e) => e.x)) + 0.05) : s.L;
    if (xa >= xb - 0.1) return [{ span: k, from: s.x0, to: s.x0 + s.L, stirrups: st }];
    return [
      ...(xa > 0 ? [{ span: k, from: s.x0, to: s.x0 + xa, stirrups: st }] : []),
      { span: k, from: s.x0 + xa, to: s.x0 + xb, stirrups: { ...st, spacing: sMid } },
      ...(xb < s.L ? [{ span: k, from: s.x0 + xb, to: s.x0 + s.L, stirrups: st }] : []),
    ];
  });

  const zoneVn = zones.map((z) => code.shear(c, query(spans[z.span]!, [a.bottom], [a.top], z.stirrups.dia, false), z.stirrups).design);
  const shear = spans.flatMap((s, k) => (s.row.demand.env ?? []).map((e) => {
    const xl = s.x0 + e.x;
    const zi = zones.findIndex((z) => z.span === k && xl >= z.from - 1e-9 && xl <= z.to + 1e-9);
    return { x: xl, v: e.v, phiVn: zoneVn[zi >= 0 ? zi : zones.findIndex((z) => z.span === k)] ?? 0 };
  }));
  const endAnchors = ([[endStart, xFrom, true], [endEnd, xTo, false]] as const).flatMap(([e, xe, first]) => {
    if (!e || e.kind !== 'column' || e.half <= 0) return [];
    const room = 2 * e.half - inset;
    const reaching = [...new Set(bars.filter((b) => (first ? b.from <= xe + 1e-6 : b.to >= xe - 1e-6)).map((b) => b.bars.dia))];
    return reaching.map((dia) => ({ dia, ldh: code.hooked(c, dia), room }));
  });
  const dias = [...new Set(bars.map((b) => b.bars.dia))].sort((p, q) => p - q);
  const anchorage = dias.map((dia) => {
    const ld = dev(c, dia, false, hMax), ldTop = dev(c, dia, true, hMax);
    return { dia, ld, ldTop, ldh: code.hooked(c, dia), lap: lapOf(c, dia, true, hMax) };
  });
  const splices: LineLayout['splices'] = [];
  if (total > STOCK_LENGTH) {
    for (const face of ['bottom', 'top'] as const) {
      const g = face === 'bottom' ? a.bottom : a.top;
      const lap = lapOf(c, g.dia, face === 'top', hMax);
      const candidates = face === 'bottom' ? supports.slice(1, -1) : spans.map((s) => s.x0 + s.L / 2);
      let last = 0;
      for (const xc of candidates) if (xc - last > STOCK_LENGTH - lap - 1e-6) { const pick = candidates.filter((y) => y > last && y - last <= STOCK_LENGTH - lap).pop() ?? xc; splices.push({ face, x: pick, length: step(lap) }); last = pick; }
    }
  }

  const spanAdopted: BeamAdopted[] = spans.map((s, k) => {
    const sd = a.stirrups?.[k]?.dia ?? c.stirrupDia;
    const at = (xl: number) => {
      const full = (face: 'top' | 'bottom') => bars.filter((b) => b.kind !== 'continuous' && barActsAt(b, face, xl, 1e-6)).reduce<BarGroup | undefined>((acc, b) => (acc ? { dia: acc.dia, count: acc.count + b.bars.count } : b.bars), undefined);
      return { top: sectionGroups(a.top, full('top'), s.b, c, sd), bottom: sectionGroups(a.bottom, full('bottom'), s.b, c, sd) };
    };
    const own = s.row.proposed;
    return {
      bottom: [a.bottom], top: [a.top], stirrups: a.stirrups?.[k] ?? own.stirrups,
      ...(own.torsionLong ? { torsionLong: own.torsionLong } : {}),
      at: { start: at(s.x0 + (s.row.demand.start.x)), span: at(s.x0 + s.row.demand.span.x), end: at(s.x0 + s.row.demand.end.x) },
    };
  });

  const worst = env.reduce((w, e) => Math.max(w, ratioOf(e.pos, e.phiPos), ratioOf(e.neg, e.phiNeg)), 0);
  const hookOk = spans.length > 0;
  const fitOk = spanAdopted.every((sa, k) => (['start', 'span', 'end'] as const).every((sec) => faceLayout(sa.at![sec]!.top, spans[k]!.b, c.cover, sa.stirrups.dia).fits && faceLayout(sa.at![sec]!.bottom, spans[k]!.b, c.cover, sa.stirrups.dia).fits));
  const contRatio = groupsArea([a.bottom]) / Math.max(1e-9, ...sorted.map((r) => r.req.bottom));
  const verifications: CheckLine[] = [
    check('rcSheets.v.lineEnvelope', worst <= 1 + 1e-6, { clause: code.text.clause.envelope, ratio: worst }),
    check('rcSheets.v.lineBottomRun', contRatio >= 0.25 - 1e-6, { clause: code.text.clause.bottomRun, demand: '≥ 1/4', capacity: fmt(contRatio, 2) }),
    check('rcSheets.v.lineFit', fitOk, { clause: code.text.clause.fit }),
    check('rcSheets.v.lineHooks', hookOk, { clause: code.text.clause.hooks, capacity: anchorage.map((x) => `Ø${x.dia}: ldh ${fmt(x.ldh * 100, 0)} cm`).join(' · ') }),
    ...(endAnchors.length ? [((worstEnd) => check('rcSheets.v.lineEndAnchor', endAnchors.every((x) => x.ldh <= x.room + 1e-6), {
      clause: code.text.clause.hooks, demand: `ldh Ø${worstEnd.dia} = ${fmt(worstEnd.ldh * 100, 0)} cm`, capacity: `${fmt(worstEnd.room * 100, 0)} cm`, ratio: worstEnd.ldh / Math.max(1e-6, worstEnd.room),
    }))(endAnchors.reduce((w, x) => (x.ldh / x.room > w.ldh / w.room ? x : w)))] : []),
    ...(total > STOCK_LENGTH ? [check('rcSheets.v.lineSplices', true, { clause: code.text.clause.splices, capacity: splices.map((sp) => `${sp.face === 'top' ? '↑' : '↓'} x = ${fmt(sp.x)} m, ${fmt(sp.length * 100, 0)} cm`).join(' · ') })] : []),
  ];
  const ok = verifications.every((v) => v.ok);
  const steps: StepGroup[] = [
    {
      title: 'rcSheets.g.lineMethod',
      steps: [
        { label: 'rcSheets.s.lineRun', formula: 'As,cont ≥ max(As,min; As⁺max/4)', value: `${groupsLabel([a.bottom])} · ${groupsLabel([a.top])}` },
        { label: 'rcSheets.s.lineCut', formula: code.text.formula.cut, value: '' },
        { label: 'rcSheets.s.lineThird', formula: code.text.formula.third, value: '' },
        { label: 'rcSheets.s.lineDev', formula: 'As,ef(x) = As·min(1; dist/ld)', value: '' },
        ...lastCuts.map((x) => ({ label: 'rcSheets.s.lineCutoff', formula: `${x.mark} ${x.face === 'top' ? '↑' : '↓'} x = ${fmt(x.x)} m`, value: code.text.cutoff[x.legality] })),
        ...bars.filter((b) => b.kind === 'bent').map((b) => ({ label: 'rcSheets.s.lineBent', formula: `${b.mark}: ${b.bars.count} Ø${b.bars.dia} · ${BEND_ANGLE}° · x = ${fmt(b.runs[0]!.to)} → ${fmt(b.runs[2]!.from)} m`, value: '' })),
        { label: 'rcSheets.s.iterations', formula: code.text.formula.capacity, value: adopted ? '—' : String(iterations), ok: worst <= 1 + 1e-6 },
      ],
    },
    {
      title: 'rcSheets.g.anchorage',
      steps: anchorage.map((x) => ({ label: 'rcSheets.s.ldRow', formula: `Ø${x.dia}`, value: `ld = ${fmt(x.ld * 100, 0)} · ld,top = ${fmt(x.ldTop * 100, 0)} · ldh = ${fmt(x.ldh * 100, 0)} · ls,B = ${fmt(x.lap * 100, 0)} cm` })),
    },
  ];
  return {
    key: `line:${sorted[0]?.demand.line?.group ?? sorted[0]?.key}`, group: sorted[0]?.demand.line?.group ?? 0,
    name: sorted[0]?.demand.line?.lineName ?? sorted[0]?.name ?? '', level: sorted[0]?.level, length: total,
    spans: spans.map((s) => ({ name: s.row.name, x0: s.x0, x1: s.x0 + s.L, b: s.b, h: s.h })),
    cover: c.cover,
    supportWidths: supports.map((_, j) => 2 * Math.max(spans[j - 1]?.row.demand.supportHalf?.end ?? 0, spans[j]?.row.demand.supportHalf?.start ?? 0)),
    proposed, adopted: a, isAdopted: !!adopted, iterations: adopted ? 0 : iterations, bars, zones, splices, cutoffs: lastCuts, anchorage,
    envelope: env.map((e) => ({ x: e.xl, pos: e.pos, neg: e.neg, phiPos: e.phiPos, phiNeg: e.phiNeg })), shear,
    ends: { from: xFrom, to: xTo, ...(endStart ? { start: endStart } : {}), ...(endEnd ? { end: endEnd } : {}) },
    spanAdopted, verifications, utilization: worst, status: ok ? 'ok' : 'fail', steps,
  };
}
