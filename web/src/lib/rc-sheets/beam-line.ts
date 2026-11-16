import { confinementOf, deriveDevelopment, deriveHookedDevelopment, deriveLap, concreteBelowTopBars, topBarFactor } from '../codes/cirsoc201/anchorage';
import { bentBarMandrel, minMandrelDiameter } from '../codes/cirsoc201/bar-geometry';
import { transverseSpacingLimits } from '../codes/cirsoc201/transverse-spacing';
import { evaluateCutoff, type CutoffLegality } from './cutoff';
import { evaluateBeamSections } from '../engine/codes/argentina/cirsoc201-beam-kernel';
import { minFlexuralSteelCm2 } from '../engine/codes/argentina/cirsoc201-basis';
import { barArea, faceLayout, groupsArea, groupsLabel, roundDown, stirrupsLabel } from './bars';
import { hangerArea } from '../engine/design/beam-hangers';
import { beamSeismic } from './seismic';
import { phiMnOf, sectionQuery, type BeamContext, type BeamDemand, type BeamEnd, type BeamRow } from './beam-row';
import type { Fmt } from './format';
import { developedLength, hookedStraight, shapeWeight, type BarShape } from './shape';
import { check, governingRatio, GENEROUS_BELOW, isGenerous, ratioOf, type BarGroup, type BeamAdopted, type CheckLine, type RowStatus, type StepGroup, type Stirrups } from './types';

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
  /** ld; with the bars of the layer (`count` across `width`, m), by the code's general expression where it has one. */
  development(c: BeamContext, dia: number, top: boolean, h: number, layer?: BarLayer): number;
  hooked(c: BeamContext, dia: number): number;
  /** A lap splice in tension: class B unless asked for class A (Table 25.5.2.1; another code its own rule). */
  lap(c: BeamContext, dia: number, top: boolean, h: number, spliceClass?: 'A' | 'B', layer?: BarLayer): number;
  minBottom(c: BeamContext, b: number, d: number): number;
  /** Design moment capacity of each section. */
  moments(c: BeamContext, qs: readonly LineQuery[]): number[];
  /** Design shear capacity with the stirrups given, and the nominal one a cutoff rule reads. */
  shear(c: BeamContext, q: LineQuery, stirrups: Stirrups): { design: number; nominal: number };
  cutoff(input: CutoffInput): { legality: CutoffLegality; extraStirrups?: { maxSpacing: number; minAvOverS: number } | null };
  stirrupMax(c: BeamContext, b: number, d: number, stirrupDia: number): number;
  /** Inside diameter a longitudinal bar is bent on, m; 6 bar diameters when the code gives none here. */
  mandrel?(dia: number): number;
  /** Straight leg past a 90° hook's bend, m; 12 bar diameters (Table 25.3.1) when the code gives none here. */
  hookExtension?(dia: number): number;
  /** Inside diameter a bent-up bar is bent on, m; the longitudinal mandrel when the code gives none here. */
  bentMandrel?(dia: number): number;
  text: {
    cutoff: Record<CutoffLegality, string>;
    clause: { envelope: string; bottomRun: string; fit: string; hooks: string; splices: string; seismicBent?: string; integrity?: string; inflection?: string };
    formula: { capacity: string; cut: string; third: string };
  };
}

/** The bars of one layer of a face: how many across what width, m. */
export interface BarLayer { count: number; width: number }

const cirsocDevelopment = (c: BeamContext, dia: number, top: boolean, h: number, layer?: BarLayer) => {
  const psiT = top ? topBarFactor(concreteBelowTopBars(h, c.cover, c.stirrupDia, dia)) : 1;
  const clear = c.cover + c.stirrupDia / 1000;
  const confinement = layer ? confinementOf(dia, clear * 1000, (layer.count > 1 ? (layer.width - 2 * clear - dia / 1000) / (layer.count - 1) : layer.width) * 1000) : undefined;
  return deriveDevelopment({ diameterMm: dia, fy: c.mat.fy, fc: c.mat.fc, favourableSpacing: false, psiT, edition: EDITION, ...(confinement ? { confinement } : {}) });
};
const kernelQuery = (c: BeamContext, q: LineQuery, shear?: Stirrups) => sectionQuery(c, q.demand, q.tension, q.compression, q.sd, 0, shear, q.sagging);

/** CIRSOC 201-2025, and ACI 318-19 whose provisions it adopts with the same numbering. */
export const CIRSOC_LINE: LineCode = {
  development: (c, dia, top, h, layer) => cirsocDevelopment(c, dia, top, h, layer).ldM,
  hooked: (c, dia) => deriveHookedDevelopment({ diameterMm: dia, fy: c.mat.fy, fc: c.mat.fc, edition: EDITION }).ldhM,
  lap: (c, dia, top, h, spliceClass, layer) => deriveLap(cirsocDevelopment(c, dia, top, h, layer), { edition: EDITION, spliceClass }).lapM,
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
    clause: { envelope: '§9.7.3, §22.2', bottomRun: '§9.7.3.8.1, §9.7.3.8.2', fit: '§25.2.1', hooks: '§25.4.3', splices: '§25.5.2', seismicBent: '§18.6.3', integrity: '§9.7.7.1, §9.7.7.5', inflection: '§9.7.3.8.3' },
    formula: { capacity: 'φMn(x) ≥ Mu(x) ∀x', cut: '§9.7.3.3, §9.7.3.2: x(φMn,cont = Mu) + max(d; 12·db) ≥ c + ld', third: '§9.7.3.8.4: As⁻/3 → x(M = 0) + max(d; 12·db; ln/16)' },
  },
};

/** CIRSOC 201-2025 with the FIUBA course's mandrels for bent-up bars (9·db, 12·db, 15·db, §11.4), which the code does not give. */
export const CIRSOC_2025_LINE: LineCode = { ...CIRSOC_LINE, bentMandrel: bentBarMandrel };

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

/** Why a line laid out with bent bars has none in a span (or anywhere, with no span). */
export type BentReason = 'seismic' | 'noSagging' | 'noHogging' | 'short' | 'adopted';

const BEND_ANGLE = 45;
/** The first hoop of a seismic end zone from the support face, and the closest the zone's hoops are spaced, m (§18.6.4.4). */
const SEISMIC_FIRST = 0.05;
/** The most bars the proposal puts in a continuous run before it takes a larger diameter. */
const RUN_BARS = 4;
/** Clear distance between the two halves of a staggered lap, m. */
const STAGGER_GAP = 0.1;

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
  /** Stirrups by zone; a zone set out from its end (`fromEnd`) or with its first stirrup at `first` holds a seismic end zone's spacing from the support face. */
  zones: Array<{ span: number; from: number; to: number; stirrups: Stirrups; first?: number; fromEnd?: boolean }>;
  /** Where each bar longer than a stock bar is lapped, the mark it belongs to, how many of its bars, the lap's length, m, and its class: half the bars a lap and a little apart from the other half where there are two or more. */
  splices: Array<{ mark: string; face: 'top' | 'bottom'; x: number; length: number; bars: number; spliceClass: 'A' | 'B' }>;
  /** Steel to hang an end that bears on another beam from it, in that beam: Vu there, cm² and closed stirrups of this line's. */
  hangers: Array<{ end: 'start' | 'end'; vu: number; area: number; count: number; stirrups: Stirrups }>;
  /** Where extra bars stop in a span, and which §9.7.3.5 provision allows it. A cut none allows is not made: the bar runs on to the support. */
  cutoffs: Array<{ mark: string; face: 'top' | 'bottom'; x: number; legality: CutoffLegality }>;
  anchorage: Array<{ dia: number; ld: number; ldTop: number; ldh: number; lap: number }>;
  envelope: Array<{ x: number; pos: number; neg: number; phiPos: number; phiNeg: number }>;
  /** Shear along the line over all combinations, and the design capacity of the stirrups there, kN. */
  shear: Array<{ x: number; v: number; vPos: number; vNeg: number; phiVn: number }>;
  /** Where the bars that reach each end of the line stop, m along it (negative before the first axis), and what holds that end. */
  ends: { from: number; to: number; start?: BeamEnd; end?: BeamEnd };
  spanAdopted: BeamAdopted[];
  verifications: CheckLine[];
  /** With bent bars asked for, why each span left without them has none. */
  bentNotes: Array<{ span?: number; reason: BentReason; clause?: string }>;
  utilization: number;
  status: RowStatus;
  steps: StepGroup[];
}

interface Span { row: BeamRow; x0: number; L: number; b: number; h: number; d: number }

interface HookMisfit { mark: string; dia: number; leg: number; room: number }

/**
 * Where a bar longer than a stock bar is lapped, m along the line: at the farthest of `candidates`
 * that keeps each piece with its share of the lap within a stock bar, else as far on as that allows;
 * with `stagger`, half the bars lap that far before the place and half that far after it.
 */
export function spliceAt(shape: BarShape, lap: number, candidates: readonly number[], stock = STOCK_LENGTH, stagger = 0): number[] {
  const p = shape.pts, cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  if (total <= stock + 1e-9 || lap >= stock / 2) return [];
  const uAt = (x: number) => {
    for (let i = 0; i + 1 < p.length; i++) {
      const [x0] = p[i]!, [x1] = p[i + 1]!;
      if (x1 - x0 > 1e-9 && x >= x0 - 1e-9 && x <= x1 + 1e-9) return cum[i]! + (cum[i + 1]! - cum[i]!) * (x - x0) / (x1 - x0);
    }
    return x <= p[0]![0] ? 0 : total;
  };
  const xAt = (u: number) => {
    for (let i = 0; i + 1 < p.length; i++) if (u <= cum[i + 1]! + 1e-9) return p[i]![0] + (p[i + 1]![0] - p[i]![0]) * Math.max(0, u - cum[i]!) / Math.max(1e-12, cum[i + 1]! - cum[i]!);
    return p[p.length - 1]![0];
  };
  const out: number[] = [];
  const reach = lap / 2 + stagger;
  for (let start = 0; total - start > stock + 1e-9 && out.length < 32;) {
    const fits = candidates.filter((x) => { const u = uAt(x); return u - reach > start + 1e-6 && u + reach - start <= stock + 1e-9; });
    const x = fits.length ? Math.max(...fits) : Math.floor(xAt(start + stock - reach) / 0.05 + 1e-9) * 0.05;
    out.push(x);
    start = uAt(x) - reach;
  }
  return out;
}

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
  const dev = (_c: BeamContext, dia: number, top: boolean, h: number, layer?: BarLayer) => code.development(c, dia, top, h, layer);
  const lapOf = (_c: BeamContext, dia: number, top: boolean, h: number, spliceClass?: 'A' | 'B', layer?: BarLayer) => code.lap(c, dia, top, h, spliceClass, layer);
  const sorted = [...rows].sort((p, q) => (p.demand.line?.index ?? 0) - (q.demand.line?.index ?? 0));
  let x = 0;
  const spans: Span[] = sorted.map((row) => { const s = { row, x0: x, L: row.length, b: row.b, h: row.h, d: row.h - c.cover - c.stirrupDia / 1000 - 0.01 }; x += row.length; return s; });
  const total = x;
  const supports = [0, ...spans.map((s) => s.x0 + s.L)];
  const endStart = sorted[0]?.demand.ends?.start, endEnd = sorted[sorted.length - 1]?.demand.ends?.end;
  const inset = c.cover + c.stirrupDia / 1000 + COLUMN_BAR;
  const reachInto = (e: BeamEnd | undefined) => (!e ? 0 : e.kind === 'free' ? -c.cover : Math.max(0, e.half - inset));
  const xFrom = -reachInto(endStart), xTo = total + reachInto(endEnd);
  const hMax = Math.max(...spans.map((s) => s.h)), bMin = Math.min(...spans.map((s) => s.b));
  const mandrelOf = (dia: number) => code.mandrel?.(dia) ?? 6 * dia / 1000;
  const extensionOf = (dia: number) => code.hookExtension?.(dia) ?? HOOK_EXTENSION(dia);
  const line = supports.map((_, j) => Math.max(spans[j - 1]?.row.demand.supportHalf?.end ?? 0, spans[j]?.row.demand.supportHalf?.start ?? 0));
  const reqAt = (r: BeamRow, sign: 'pos' | 'neg', sec: 'start' | 'span' | 'end') =>
    Math.max(0, ...r.req.bySection.filter((x) => x.sign === sign && x.section === sec).map((x) => x.req));
  const botDia = commonDia(sorted.map((r) => r.proposed.bottom), 16), topDia = commonDia(sorted.map((r) => r.proposed.top), 16);
  const hanger = [...c.diameters].sort((p, q) => p - q).find((d) => d >= Math.max(c.stirrupDia, Math.ceil(botDia / 2))) ?? Math.max(...c.diameters);
  const negMax = Math.max(0, ...supports.map((_, j) => Math.max(j > 0 ? reqAt(sorted[j - 1]!, 'neg', 'end') : 0, j < sorted.length ? reqAt(sorted[j]!, 'neg', 'start') : 0)));
  const simpleEnd = (e: BeamEnd | undefined) => !!e && (e.kind === 'support' || e.kind === 'beam');
  const endShear = (k: number, atStart: boolean) => { const env = spans[k]?.row.demand.env ?? []; return (atStart ? env[0] : env[env.length - 1])?.v ?? spans[k]?.row.demand.vu.value ?? 0; };
  const perimeter = sorted.some((r) => r.demand.perimeter !== false);
  /** The bottom run's area the supports ask, cm²: a quarter of each span's into the supports, a third at a simple one and the 0.75·Vu/fy the course anchors there. */
  const bottomRunNeed = () => {
    const last = spans.length - 1;
    const at = (e: BeamEnd | undefined, k: number, atStart: boolean) => (simpleEnd(e) ? Math.max(sorted[k]!.req.bottom / 3, (0.75 * endShear(k, atStart) * 10) / c.mat.fy) : 0);
    return Math.max(0.25 * Math.max(...sorted.map((r) => r.req.bottom)), spans.length ? at(endStart, 0, true) : 0, spans.length ? at(endEnd, last, false) : 0);
  };

  let bentNotes: LineLayout['bentNotes'] = [];
  const propose = (): LineAdopted => {
    const minBottom = Math.min(Math.max(...spans.map((s) => code.minBottom(c, s.b, s.d))), (4 / 3) * Math.max(...sorted.map((r) => r.req.bottom)));
    const aCb = Math.max(minBottom, bottomRunNeed());
    const runDia = [...c.diameters].filter((d) => d >= botDia).sort((p, q) => p - q).find((d) => Math.ceil(aCb / barArea(d) - 1e-9) <= RUN_BARS) ?? botDia;
    const bottom = { dia: runDia, count: Math.max(2, Math.ceil(aCb / barArea(runDia) - 1e-9)) };
    const spanHog = Math.max(0, ...sorted.map((r) => reqAt(r, 'neg', 'span')));
    const topNeed = Math.max(spanHog, negMax / 6), hangers = Math.max(2, Math.ceil(topNeed / barArea(hanger) - 1e-9));
    const top = hangers <= 3 ? { dia: hanger, count: hangers } : { dia: topDia, count: Math.max(2, Math.ceil(topNeed / barArea(topDia) - 1e-9)) };
    const supportTop = supports.map((_, j) => {
      const left = j > 0 ? reqAt(sorted[j - 1]!, 'neg', 'end') : 0, right = j < sorted.length ? reqAt(sorted[j]!, 'neg', 'start') : 0;
      const extra = Math.max(left, right) - groupsArea([top]);
      return { dia: topDia, count: extra > 1e-6 ? Math.ceil(extra / barArea(topDia) - 1e-9) : 0 };
    });
    const spanBottom = sorted.map((r) => {
      const extra = r.req.bottom - groupsArea([bottom]);
      return { dia: botDia, count: extra > 1e-6 ? Math.ceil(extra / barArea(botDia) - 1e-9) : 0 };
    });
    bentNotes = [];
    if (!c.bentBars) return { bottom, top, supportTop, spanBottom, stirrups: sorted.map((r) => r.proposed.stirrups) };
    if (c.seismic) {
      bentNotes = [{ reason: 'seismic', clause: code.text.clause.seismicBent ?? '' }];
      return { bottom, top, supportTop, spanBottom, stirrups: sorted.map((r) => r.proposed.stirrups) };
    }
    const bentDia = topDia, bentA = barArea(bentDia);
    const last = supports.length - 1;
    const hogShare = (j: number): number | null => {
      const area = (supportTop[j]?.count ?? 0) * barArea(supportTop[j]?.dia ?? bentDia);
      if (j === 0 || j === last) return area > 1e-6 ? area : null;
      return area / 2;
    };
    const bent = sorted.map((r, k) => {
      const sag = Math.max(0, ...(r.demand.env ?? []).map((e) => e.pos), r.demand.span.pos.value);
      const hogs = [hogShare(k), hogShare(k + 1)].filter((x): x is number => x !== null);
      const hog = hogs.length ? Math.min(...hogs) : 0;
      const s = spans[k]!, rise = s.h - 2 * (c.cover + c.stirrupDia / 1000) - bentDia / 1000;
      const reason: BentReason | null = sag <= 1e-6 ? 'noSagging' : hog <= 1e-6 ? 'noHogging' : s.L < 2 * rise + 0.2 - 1e-9 ? 'short' : null;
      if (reason) { bentNotes.push({ span: k, reason }); return { dia: bentDia, count: 0 }; }
      return { dia: bentDia, count: Math.max(1, Math.floor(hog / bentA + 1e-9)) };
    });
    sorted.forEach((r, k) => {
      const rest = r.req.bottom - groupsArea([bottom]) - bent[k]!.count * barArea(bentDia);
      spanBottom[k] = rest > 1e-6 ? { dia: bentDia, count: Math.ceil(rest / barArea(bentDia) - 1e-9) } : { dia: botDia, count: 0 };
    });
    supports.forEach((_, j) => {
      const arriving = ((bent[j - 1]?.count ?? 0) + (bent[j]?.count ?? 0)) * barArea(bentDia);
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
    const laps: LineLayout['splices'] = [];
    const misfits: HookMisfit[] = [];
    let mark = 0;
    const next = () => String.fromCharCode(65 + (mark++ % 26)) + (mark > 26 ? String(Math.floor((mark - 1) / 26)) : '');
    const turnOf = (face: 'top' | 'bottom', end: BeamEnd | undefined): 1 | -1 => (face === 'top' || end?.kind === 'column' ? -1 : 1);
    const add = (face: 'top' | 'bottom', kind: LineBar['kind'], g: BarGroup, from: number, to: number, hooks: [boolean, boolean], bent?: { shape: BarShape; runs: LineBar['runs'] }) => {
      if (g.count <= 0 || to - from < 1e-6) return;
      const inner = c.cover + sdOf(0) / 1000 + g.dia / 2000;
      const ends = [turnOf(face, endStart), turnOf(face, endEnd)] as [1 | -1, 1 | -1];
      let shape = bent?.shape ?? hookedStraight(from, to, face === 'top' ? hMax - inner : inner, g.dia, mandrelOf(g.dia), hooks, ends, extensionOf(g.dia));
      const id = next();
      ([0, 1] as const).forEach((i) => {
        const e = i === 0 ? endStart : endEnd, s = spans[i === 0 ? 0 : spans.length - 1];
        if (!hooks[i] || !s || e?.kind === 'column') return;
        const room = s.h - 2 * (c.cover + sdOf(i === 0 ? 0 : spans.length - 1) / 1000) - g.dia / 2000;
        const p = shape.pts, leg = Math.abs(i === 0 ? p[0]![1] - p[1]![1] : p[p.length - 1]![1] - p[p.length - 2]![1]);
        if (leg > room + 1e-6) misfits.push({ mark: id, dia: g.dia, leg, room });
      });
      const runs = bent?.runs ?? [{ face, from, to }];
      const lap = step(lapOf(c, g.dia, face === 'top' || kind === 'bent', hMax, undefined, { count: g.count, width: bMin }));
      const cands = kind !== 'continuous' ? [] : face === 'bottom' && !c.seismic ? supports.slice(1, -1) : spans.map((s) => s.x0 + s.L / 2);
      const off = g.count >= 2 ? lap / 2 + STAGGER_GAP / 2 : 0;
      const at = spliceAt(shape, lap, cands, STOCK_LENGTH, off);
      if (at.length) {
        shape = { ...shape, laps: { count: at.length, length: lap } };
        const faceAt = (x: number) => runs.find((r) => x >= r.from - 1e-9 && x <= r.to + 1e-9)?.face ?? face;
        for (const x of at) {
          if (!off) { laps.push({ mark: id, face: faceAt(x), x, length: lap, bars: g.count, spliceClass: 'B' }); continue; }
          laps.push({ mark: id, face: faceAt(x - off), x: x - off, length: lap, bars: Math.ceil(g.count / 2), spliceClass: 'B' });
          laps.push({ mark: id, face: faceAt(x + off), x: x + off, length: lap, bars: Math.floor(g.count / 2), spliceClass: 'B' });
        }
      }
      bars.push({ mark: id, face, kind, bars: g, from, to, hooks, length: developedLength(shape), weight: shapeWeight(shape, g.count), shape, runs });
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
      const ld = dev(c, g.dia, true, hMax, { count: g.count + a.top.count, width: bMin });
      const reach = (k: number, fromStart: boolean): number => {
        const s = spans[k]!, env = s.row.demand.env ?? [];
        const ext = Math.max(s.d, 12 * g.dia / 1000);
        const ordered = env.map((e, i) => ({ ...e, i, dist: fromStart ? e.x : s.L - e.x })).sort((p, q) => p.dist - q.dist);
        let need = 0, inflection = s.L;
        for (const e of ordered) if (e.neg <= 1e-6) { inflection = e.dist; break; }
        for (const e of ordered) if (e.dist <= inflection + 1e-9 && e.neg > (capNeg[k]![e.i] ?? 0) + 1e-6) need = e.dist;
        const ln = Math.max(0, s.L - (line[k] ?? 0) - (line[k + 1] ?? 0));
        const third = groupsArea([a.top]) < (groupsArea([a.top]) + groupsArea([g])) / 3 ? inflection + Math.max(ext, ln / 16) : 0;
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
      const ld = dev(c, g.dia, false, s.h, { count: g.count + a.bottom.count, width: s.b });
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
      const yLow = hMax - s.h + inner, yHigh = hMax - inner;
      const run = (yHigh - yLow) / Math.tan((BEND_ANGLE * Math.PI) / 180);
      const env = s.row.demand.env ?? [];
      const ext = Math.max(s.d, 12 * g.dia / 1000);
      const bendAt = (fromStart: boolean) => {
        const half = env.map((e, i) => ({ e, i, dist: fromStart ? e.x : s.L - e.x })).filter((o) => o.dist <= s.L / 2 + 1e-9);
        const posNeed = Math.min(s.L / 2, ...half.filter((o) => o.e.pos > (capPos[k]![o.i] ?? 0) + 1e-6).map((o) => o.dist));
        const negNeed = Math.max(0, ...half.filter((o) => o.e.neg > (capNeg[k]![o.i] ?? 0) + 1e-6).map((o) => o.dist));
        const room = s.L / 2 - run - 0.05, want = Math.max(negNeed + ext, s.L / 7);
        const upper = Math.min(room, posNeed - ext - run);
        return Math.max(0, Math.floor(Math.min(upper >= 0.05 ? upper : room, want) / 0.05 + 1e-9) * 0.05);
      };
      const xl = s.x0 + bendAt(true), xr = s.x0 + s.L - bendAt(false);
      if (xr - xl < 2 * run + 0.1 || xl - s.x0 < 0.05 || s.x0 + s.L - xr < 0.05) return;
      const ldTop = dev(c, g.dia, true, s.h, { count: g.count + a.top.count, width: s.b });
      const reachOver = (j: number) => step(ldTop + (line[j] ?? 0));
      const from = k === 0 ? xFrom : s.x0 - reachOver(k), to = k === spans.length - 1 ? xTo : s.x0 + s.L + reachOver(k + 1);
      const hooks: [boolean, boolean] = [k === 0, k === spans.length - 1];
      const bentMandrel = code.bentMandrel?.(g.dia) ?? mandrelOf(g.dia);
      const leg = (bentMandrel + g.dia / 1000) / 2 + extensionOf(g.dia);
      const pts: Array<[number, number]> = [
        ...(hooks[0] ? [[from, yHigh - leg] as [number, number]] : []),
        [from, yHigh], [xl, yHigh], [xl + run, yLow], [xr - run, yLow], [xr, yHigh], [to, yHigh],
        ...(hooks[1] ? [[to, yHigh - leg] as [number, number]] : []),
      ];
      add('bottom', 'bent', g, from, to, hooks, {
        shape: { pts, mandrel: bentMandrel, dia: g.dia },
        runs: [{ face: 'top', from, to: xl }, { face: 'bottom', from: xl + run, to: xr - run }, { face: 'top', from: xr, to }],
      });
    });
    lastCuts = cuts.map((x) => ({ mark: bars[x.bar]?.mark ?? '', face: x.face, x: x.x, legality: x.legality }));
    lastSplices = laps; lastMisfits = misfits;
    return bars;
  };
  let lastCuts: LineLayout['cutoffs'] = [];
  let lastSplices: LineLayout['splices'] = [];
  let lastMisfits: HookMisfit[] = [];

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
      const layerOf = (face: 'top' | 'bottom') => ({ count: bars.filter((b) => barActsAt(b, face, p.xl)).reduce((n, b) => n + b.bars.count, 0), width: s.b });
      const bot = effective(bars, 'bottom', p.xl, (g) => dev(c, g.dia, false, s.h, layerOf('bottom'))), top = effective(bars, 'top', p.xl, (g) => dev(c, g.dia, true, s.h, layerOf('top')));
      qs.push(query(s, bot.length ? bot : [{ count: 0, dia: 10 }], top, sd, true), query(s, top.length ? top : [{ count: 0, dia: 10 }], bot, sd, false));
    }
    const cap = capQueries(qs);
    return pts.map((p, n) => ({ ...p, phiPos: cap[2 * n] ?? 0, phiNeg: cap[2 * n + 1] ?? 0 }));
  };

  /** The positive bars' ld against Mn/Vu + ℓa at every point of inflection (§9.7.3.8.3(b)), the continuous bars running ℓa = max(d; 12·db) past it. */
  const inflectionsOf = (pts0: typeof env, g: BarGroup) => spans.flatMap((s, k) => {
    const pts = pts0.filter((e) => e.k === k), stations = s.row.demand.env ?? [];
    const out: Array<{ x: number; ld: number; reach: number }> = [];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!, q = pts[i]!;
      const [sag, pi] = p.pos > 1e-6 && q.pos <= 1e-6 && q.neg > 1e-6 ? [p, q] : q.pos > 1e-6 && p.pos <= 1e-6 && p.neg > 1e-6 ? [q, p] : [null, null];
      if (!sag || !pi) continue;
      const vu = stations[pi.i]?.v ?? 0;
      if (vu <= 1e-6) continue;
      out.push({ x: pi.xl, ld: dev(c, g.dia, false, s.h, { count: g.count, width: s.b }), reach: sag.phiPos / 0.9 / vu + Math.max(s.d, 12 * g.dia / 1000) });
    }
    return out;
  });
  let proposed = adopted ?? propose(), iterations = 0;
  let bars = layout(proposed), env = verify(proposed, bars);
  const iterate = () => {
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
  };
  if (!adopted) {
    iterate();
    const rooms = [endStart, endEnd].filter((e): e is BeamEnd => !!e && e.kind === 'column' && e.half > 0).map((e) => 2 * e.half - inset);
    if (rooms.length) {
      const room = Math.min(...rooms);
      const fits = (dia: number) => code.hooked(c, dia) <= room + 1e-6;
      const best = [...c.diameters].filter((d) => d >= 10 && fits(d)).sort((p, q) => q - p)[0];
      const shrink = (g: BarGroup | undefined): BarGroup | undefined => {
        if (!g || !best || g.count <= 0 || fits(g.dia)) return g;
        return { dia: best, count: Math.max(2, Math.ceil((g.count * barArea(g.dia)) / barArea(best) - 1e-9)) };
      };
      const next: LineAdopted = JSON.parse(JSON.stringify(proposed));
      next.bottom = shrink(next.bottom)!; next.top = shrink(next.top)!;
      const last = next.supportTop.length - 1;
      next.supportTop[0] = shrink(next.supportTop[0])!; next.supportTop[last] = shrink(next.supportTop[last])!;
      if (next.bent?.length) { next.bent[0] = shrink(next.bent[0])!; next.bent[next.bent.length - 1] = shrink(next.bent[next.bent.length - 1])!; }
      if (JSON.stringify(next) !== JSON.stringify(proposed)) { proposed = next; bars = layout(proposed); env = verify(proposed, bars); iterate(); }
    }
    const piOk = () => inflectionsOf(env, proposed.bottom).every((x) => x.ld <= x.reach + 1e-6);
    if (!piOk()) {
      const kept = { proposed, bars, env, iterations };
      let found = false;
      for (const dia of [...c.diameters].filter((d) => d >= 10 && d < kept.proposed.bottom.dia).sort((p, q) => q - p)) {
        const next: LineAdopted = JSON.parse(JSON.stringify(kept.proposed));
        next.bottom = { dia, count: Math.max(2, Math.ceil((kept.proposed.bottom.count * barArea(kept.proposed.bottom.dia)) / barArea(dia) - 1e-9)) };
        proposed = next; bars = layout(proposed); env = verify(proposed, bars); iterate();
        if (piOk()) { found = true; break; }
      }
      if (!found) ({ proposed, bars, env, iterations } = kept);
    }
  }
  const a = adopted ?? proposed;
  const adoptedBentNotes = (): LineLayout['bentNotes'] => {
    if (!c.bentBars) return [];
    if (c.seismic) return [{ reason: 'seismic', clause: code.text.clause.seismicBent ?? '' }];
    return a.bent?.some((g) => g.count > 0) ? [] : [{ reason: 'adopted' }];
  };
  if (adopted) { bars = layout(a); env = verify(a, bars); }
  const nearest = (x: number) => env.reduce((b, e) => (Math.abs(e.xl - x) < Math.abs(b.xl - x) ? e : b), env[0]!);
  const classA = (b: LineBar) => !perimeter && env.length > 0 && b.kind === 'continuous' && b.bars.count >= 2 && lastSplices.filter((sp) => sp.mark === b.mark).every((sp) => {
    const e = nearest(sp.x), m = b.face === 'bottom' ? e.pos : e.neg, cap = b.face === 'bottom' ? e.phiPos : e.phiNeg;
    return m <= 1e-6 || cap >= 2 * m - 1e-6;
  });
  bars = bars.map((b) => {
    if (!b.shape.laps || !classA(b)) return b;
    const lapA = step(lapOf(c, b.bars.dia, b.face === 'top', hMax, 'A', { count: b.bars.count, width: bMin }));
    const shape = { ...b.shape, laps: { count: b.shape.laps.count, length: lapA } };
    lastSplices = lastSplices.map((sp) => (sp.mark === b.mark ? { ...sp, length: lapA, spliceClass: 'A' as const } : sp));
    return { ...b, shape, length: developedLength(shape), weight: shapeWeight(shape, b.bars.count) };
  });
  const hangers: LineLayout['hangers'] = ([[endStart, 0, true, 'start'], [endEnd, spans.length - 1, false, 'end']] as const).flatMap(([e, k, atStart, end]) => {
    if (e?.kind !== 'beam' || !spans[k]) return [];
    const vu = endShear(k, atStart), area = hangerArea(vu, c.mat.fy), st = a.stirrups?.[k] ?? spans[k]!.row.proposed.stirrups;
    return area > 0 ? [{ end, vu, area, count: Math.max(1, Math.ceil(area / (Math.max(2, st.legs) * barArea(st.dia)) - 1e-9)), stirrups: st }] : [];
  });

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

  const seismicZones = (k: number): LineLayout['zones'] | null => {
    if (!c.seismic) return null;
    const s = spans[k]!, sa = spanAdopted[k]!, st = sa.stirrups;
    const faceL = Math.min(line[k] ?? 0, s.L / 2), faceR = Math.max(faceL, s.L - (line[k + 1] ?? 0));
    const seisOf = (x: Stirrups) => beamSeismic(s.row.demand, { ...c, overstrength: c.seismic!.overstrength }, { ...sa, stirrups: x }, (sec) => sa.at![sec]!, fmt);
    const holds = (r: ReturnType<typeof seisOf>) => r.checks.every((v) => (v.label !== 'rcSheets.v.seisBeamVe' && v.label !== 'rcSheets.v.seisBeamHoops') || v.ok);
    let end = st, seis = seisOf(end);
    for (let guard = 0; !adopted && !holds(seis) && end.spacing > SEISMIC_FIRST + 1e-9 && guard < 16; guard++) {
      end = { ...end, spacing: Math.max(SEISMIC_FIRST, roundDown(Math.min(end.spacing - 0.025, seis.sZone))) };
      seis = seisOf(end);
    }
    const zone = Math.min(2 * s.h, (faceR - faceL) / 2);
    const vMid = seis.ve - seis.vg + seis.vg * Math.max(0, 1 - (2 * zone) / seis.ln);
    const perLeg = s.row.req.stirrupPerLeg;
    let mid = { ...end, spacing: Math.max(end.spacing, roundDown(Math.min(s.row.req.sMax, s.d / 2, perLeg > 0 ? barArea(end.dia) / perLeg : Infinity))) };
    while (mid.spacing > end.spacing + 1e-9 && code.shear(c, query(s, [a.bottom], [a.top], mid.dia, false), mid).design < vMid - 1e-6) mid = { ...mid, spacing: Math.max(end.spacing, mid.spacing - 0.025) };
    sa.stirrups = end;
    if (!adopted && a.stirrups) a.stirrups[k] = end;
    if (faceR - faceL - 2 * zone < 0.05) return [{ span: k, from: s.x0 + faceL, to: s.x0 + faceR, stirrups: end, first: SEISMIC_FIRST }];
    return [
      { span: k, from: s.x0 + faceL, to: s.x0 + faceL + zone, stirrups: end, first: SEISMIC_FIRST },
      { span: k, from: s.x0 + faceL + zone, to: s.x0 + faceR - zone, stirrups: mid },
      { span: k, from: s.x0 + faceR - zone, to: s.x0 + faceR, stirrups: end, first: SEISMIC_FIRST, fromEnd: true },
    ];
  };

  const zones = spans.flatMap((s, k) => {
    const seismicZone = seismicZones(k);
    if (seismicZone) return seismicZone;
    const st = a.stirrups?.[k] ?? s.row.proposed.stirrups;
    const env1 = s.row.demand.env ?? [];
    const faceL = Math.min(line[k] ?? 0, s.L / 2), faceR = Math.max(faceL, s.L - (line[k + 1] ?? 0));
    const whole = [{ span: k, from: s.x0 + faceL, to: s.x0 + faceR, stirrups: st }];
    const row1 = code.stirrupMax(c, s.b, s.d, st.dia);
    const sMid = roundDown(Math.min(row1, s.row.req.sMax > 0 ? Math.max(s.row.req.sMax, st.spacing) : row1));
    const extra = lastCuts.some((x) => x.legality === 'extraStirrups' && x.x >= s.x0 - 1e-6 && x.x <= s.x0 + s.L + 1e-6);
    const tLimit = s.row.req.torsionNeglected ? Infinity : s.row.req.tuNeglect;
    if (extra || tLimit === undefined || sMid <= st.spacing + 1e-9 || !env1.length) return whole;
    const phiVnMid = code.shear(c, query(s, [a.bottom], [a.top], st.dia, false), { ...st, spacing: sMid }).design;
    const needs = (e: (typeof env1)[number]) => e.v > phiVnMid + 1e-6 || (e.t ?? Infinity) > tLimit + 1e-6;
    const need = env1.filter(needs);
    const left = need.filter((e) => e.x < s.L / 2), right = need.filter((e) => e.x >= s.L / 2);
    const xa = Math.max(faceL, left.length ? step(Math.max(...left.map((e) => e.x)) + 0.05) : 0);
    const xb = Math.min(faceR, right.length ? s.L - step(s.L - Math.min(...right.map((e) => e.x)) + 0.05) : s.L);
    if (xa >= xb - 0.1 || !env1.some((e) => e.x > xa && e.x < xb && !needs(e))) return whole;
    return [
      ...(xa > faceL + 1e-6 ? [{ span: k, from: s.x0 + faceL, to: s.x0 + xa, stirrups: st }] : []),
      { span: k, from: s.x0 + xa, to: s.x0 + xb, stirrups: { ...st, spacing: sMid } },
      ...(xb < faceR - 1e-6 ? [{ span: k, from: s.x0 + xb, to: s.x0 + faceR, stirrups: st }] : []),
    ];
  });

  const zoneVn = zones.map((z) => code.shear(c, query(spans[z.span]!, [a.bottom], [a.top], z.stirrups.dia, false), z.stirrups).design);
  const shear = spans.flatMap((s, k) => (s.row.demand.env ?? []).map((e) => {
    const xl = s.x0 + e.x;
    const zi = zones.reduce((best, z, i) => (z.span !== k ? best : best < 0 || Math.max(0, z.from - xl, xl - z.to) < Math.max(0, zones[best]!.from - xl, xl - zones[best]!.to) ? i : best), -1);
    return { x: xl, v: e.v, vPos: e.vPos ?? e.v, vNeg: e.vNeg ?? e.v, phiVn: zoneVn[zi] ?? 0 };
  }));
  const inflections = inflectionsOf(env, a.bottom);
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
  const splices = lastSplices;
  const worstPi = inflections.reduce<(typeof inflections)[number] | undefined>((w, x) => (!w || x.ld / x.reach > w.ld / w.reach ? x : w), undefined);
  const runNeed = bottomRunNeed();
  const integrityTop = Math.max(2 * barArea(a.top.dia), negMax / 6);

  const worst = env.reduce((w, e) => Math.max(w, ratioOf(e.pos, e.phiPos), ratioOf(e.neg, e.phiNeg)), 0);
  const hookOk = spans.length > 0;
  const fitOk = spanAdopted.every((sa, k) => (['start', 'span', 'end'] as const).every((sec) => faceLayout(sa.at![sec]!.top, spans[k]!.b, c.cover, sa.stirrups.dia).fits && faceLayout(sa.at![sec]!.bottom, spans[k]!.b, c.cover, sa.stirrups.dia).fits));
  const verifications: CheckLine[] = [
    check('rcSheets.v.lineEnvelope', worst <= 1 + 1e-6, { clause: code.text.clause.envelope, ratio: worst }),
    check('rcSheets.v.lineBottomRun', groupsArea([a.bottom]) >= runNeed - 1e-6 && a.bottom.count >= 2, { clause: code.text.clause.bottomRun, demand: `≥ ${fmt(runNeed)} cm²`, capacity: `${fmt(groupsArea([a.bottom]))} cm²`, ratio: runNeed / Math.max(1e-9, groupsArea([a.bottom])) }),
    ...(perimeter ? [check('rcSheets.v.lineIntegrity', groupsArea([a.top]) >= integrityTop - 1e-6 && a.top.count >= 2 && a.bottom.count >= 2, { clause: code.text.clause.integrity, demand: `↑ ≥ ${fmt(integrityTop)} cm²`, capacity: `${fmt(groupsArea([a.top]))} cm²` })] : []),
    ...(worstPi ? [check('rcSheets.v.lineInflectionLd', worstPi.ld <= worstPi.reach + 1e-6, { clause: code.text.clause.inflection, demand: `ld Ø${a.bottom.dia} = ${fmt(worstPi.ld * 100, 0)} cm`, capacity: `Mn/Vu + ℓa = ${fmt(worstPi.reach * 100, 0)} cm (x = ${fmt(worstPi.x)} m)`, ratio: worstPi.ld / Math.max(1e-9, worstPi.reach) })] : []),
    ...(hangers.length ? [check('rcSheets.v.lineHangers', true, { clause: '—', capacity: hangers.map((h) => `${h.end === 'start' ? '←' : '→'} Vu = ${fmt(h.vu)} kN: ${fmt(h.area)} cm² · ${h.count} × ${stirrupsLabel(h.stirrups).replace(/ c\/\d+$/, '')}`).join(' · ') })] : []),
    check('rcSheets.v.lineFit', fitOk, { clause: code.text.clause.fit }),
    check('rcSheets.v.lineHooks', hookOk, { clause: code.text.clause.hooks, capacity: anchorage.map((x) => `Ø${x.dia}: ldh ${fmt(x.ldh * 100, 0)} cm`).join(' · ') }),
    ...(endAnchors.length ? [((worstEnd) => check('rcSheets.v.lineEndAnchor', endAnchors.every((x) => x.ldh <= x.room + 1e-6), {
      clause: code.text.clause.hooks, demand: `ldh Ø${worstEnd.dia} = ${fmt(worstEnd.ldh * 100, 0)} cm`, capacity: `${fmt(worstEnd.room * 100, 0)} cm`, ratio: worstEnd.ldh / Math.max(1e-6, worstEnd.room),
    }))(endAnchors.reduce((w, x) => (x.ldh / x.room > w.ldh / w.room ? x : w)))] : []),
    ...(lastMisfits.length ? [((w) => check('rcSheets.v.lineHookFit', false, {
      clause: code.text.clause.hooks, demand: `${w.mark}: Ø${w.dia} ${fmt(w.leg * 100, 0)} cm`, capacity: `${fmt(w.room * 100, 0)} cm`, ratio: w.leg / Math.max(1e-6, w.room),
    }))(lastMisfits.reduce((w, x) => (x.leg / x.room > w.leg / w.room ? x : w)))] : []),
    ...(splices.length ? [check('rcSheets.v.lineSplices', true, { clause: code.text.clause.splices, capacity: splices.map((sp) => `${sp.mark} ${sp.bars}× ${sp.face === 'top' ? '↑' : '↓'} x = ${fmt(sp.x)} m, ${fmt(sp.length * 100, 0)} cm (${sp.spliceClass})`).join(' · ') })] : []),
    ...(c.seismic && bars.some((b) => b.kind === 'bent') ? [check('rcSheets.v.lineSeismicBent', false, { clause: code.text.clause.seismicBent, demand: bars.filter((b) => b.kind === 'bent').map((b) => b.mark).join(', ') })] : []),
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
    proposed, adopted: a, isAdopted: !!adopted, iterations: adopted ? 0 : iterations, bars, zones, splices, hangers, cutoffs: lastCuts, anchorage,
    envelope: env.map((e) => ({ x: e.xl, pos: e.pos, neg: e.neg, phiPos: e.phiPos, phiNeg: e.phiNeg })), shear,
    ends: { from: xFrom, to: xTo, ...(endStart ? { start: endStart } : {}), ...(endEnd ? { end: endEnd } : {}) },
    spanAdopted, verifications, bentNotes: adopted ? adoptedBentNotes() : bentNotes, utilization: worst, status: ok ? (isGenerous(verifications) ? 'warn' : 'ok') : 'fail', steps,
  };
}

/** A line's row: failing when it or a span fails, generous when every check of the line and its spans has room to spare. */
export function lineRowStatus(line: Pick<LineLayout, 'status' | 'verifications'>, spans: ReadonlyArray<Pick<BeamRow, 'status' | 'verifications'>>): 'ok' | 'warn' | 'fail' {
  if (line.status === 'fail' || spans.some((r) => r.status === 'fail')) return 'fail';
  return governingRatio([...line.verifications, ...spans.flatMap((r) => r.verifications)]) < GENEROUS_BELOW ? 'warn' : 'ok';
}
