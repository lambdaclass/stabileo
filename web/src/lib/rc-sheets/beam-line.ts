import { confinementOf, deriveDevelopment, deriveHookedDevelopment, deriveLap, concreteBelowTopBars, developmentSqrtFc, topBarFactor } from '../codes/cirsoc201/anchorage';
import { bentBarMandrel, minMandrelDiameter } from '../codes/cirsoc201/bar-geometry';
import { transverseSpacingLimits } from '../codes/cirsoc201/transverse-spacing';
import { evaluateCutoff, type CutoffLegality } from './cutoff';
import { evaluateBeamSections } from '../engine/codes/argentina/cirsoc201-beam-kernel';
import { minFlexuralSteelCm2, shearFy } from '../engine/codes/argentina/cirsoc201-basis';
import { barArea, faceBars, faceLayout, groupsArea, groupsLabel, moreStirrup, roundDown, stirrupsLabel } from './bars';
import { hangerArea } from '../engine/design/beam-hangers';
import { beamSeismic, faceRule } from './seismic';
import { beamContext, beamRow, phiMnOf, sectionQuery, type BeamContext, type BeamDemand, type BeamEnd, type BeamRow } from './beam-row';
import type { Fmt } from './format';
import { developedLength, hookedStraight, shapeWeight, type BarShape } from './shape';
import { BEAM_BAR_RANGE, check, governingRatio, GENEROUS_BELOW, isGenerous, listIn, nextTie, ratioOf, tieFloorOf, type BarGroup, type BeamAdopted, type CheckLine, type RowStatus, type StepGroup, type Stirrups } from './types';

const EDITION = '2025' as const;
const STOCK_LENGTH = 12;
/** A column's longitudinal bar the beam's bars stop inside of, m. */
const COLUMN_BAR = 0.016;
const step = (x: number) => Math.ceil(x / 0.05 - 1e-9) * 0.05;

/** One section of a span the line asks a capacity of: the bars in tension and in compression, and whether it sags (the flange then counts). */
export interface LineQuery { demand: Pick<BeamDemand, 'b' | 'h' | 'flange'>; tension: BarGroup[]; compression: BarGroup[]; sd: number; sagging: boolean; /** Axial force with the moment, kN, + compression. */ nc?: number }

/** What a stopped bar's point needs (CIRSOC 201 and ACI 318 §9.7.3.5; another code its own rule), as `evaluateCutoff` takes it. */
export type CutoffInput = Omit<Parameters<typeof evaluateCutoff>[0], 'edition'>;

/** The code's rules a continuous beam's bars are laid out by: lengths in m, areas in cm², forces in kN and kN·m. */
export interface LineCode {
  /** ld; with the bars of the layer (`count` across `width`, m), by the code's general expression where it has one. */
  development(c: BeamContext, dia: number, top: boolean, h: number, layer?: BarLayer): number;
  /** ldh; of a top bar in a member `h` deep where the code's bond reads the casting position. */
  hooked(c: BeamContext, dia: number, top?: boolean, h?: number): number;
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
  /** Where the bottom run may stop straight at a support with no column: ld ≤ factor·Mn/Vu + ℓa from the support's axis, entering the support `into` m past its face. Absent: it is hooked. */
  straightAtSupport?: { factor: number; into: number };
  /** Straight leg past a 180° hook's bend, m, for an end whose 90° hook does not fit the depth. Absent: no 180° hooks. */
  hook180Extension?(dia: number): number;
  /**
   * A hooked end's anchorage is measured along the bar from the support face, bend and tail
   * included, and at a column the tail may run down the joint as far as the depth allows. Absent:
   * `hooked` is read horizontally from the face to the hook's outside, the tail its standard one.
   */
  alongBar?: boolean;
  /**
   * Where a standard hook's ldh does not fit an end column, the bar developed by its straight ld
   * along the bar, bend and a longer tail included (the FIUBA course's criterion at end supports,
   * §12.2); the clause it is cited by. Absent: the hook has to fit.
   */
  alongFallback?: { clause: string };
  /** A span designed with the bars the line gives it, as the code's rows verify them. Absent: the spans are not read back. */
  spanRow?(d: BeamDemand, c: BeamContext, a: BeamAdopted, fmt: Fmt): BeamRow;
  /** ldh of a hooked bar ending in a column of a special moment frame, where the code gives one for its joints. */
  jointHooked?(c: BeamContext, dia: number): number;
  text: {
    cutoff: Record<CutoffLegality, string>;
    clause: { envelope: string; bottomRun: string; fit: string; hooks: string; splices: string; shear: string; seismicBent?: string; integrity?: string; inflection?: string; straightEnd?: string; hook180?: string; jointHooks?: string };
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
const kernelQuery = (c: BeamContext, q: LineQuery, shear?: Stirrups) => sectionQuery(c, q.demand, q.tension, q.compression, q.sd, q.nc ?? 0, shear, q.sagging);

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
  cutoff: (input) => evaluateCutoff({ ...input, fy: shearFy(input.fy), edition: EDITION }),
  spanRow: beamRow,
  mandrel: (dia) => minMandrelDiameter(dia, 'longitudinal').value,
  straightAtSupport: { factor: 1.3, into: 0.15 },
  hook180Extension: (dia) => Math.max(4 * dia / 1000, 0.065),
  jointHooked: (c, dia) => Math.max((c.mat.fy * dia) / (5.4 * developmentSqrtFc(c.mat.fc)), 8 * dia, 150) / 1000,
  stirrupMax: (c, b, d, sd) => transverseSpacingLimits(EDITION, { VsRequired: 0, bw: b, d, fc: c.mat.fc, cover: c.cover, stirrupDiaMm: sd }).alongMax,
  text: {
    cutoff: { notInTension: '§9.7.3.5: M = 0', lowShear: '§9.7.3.5(a): Vu ≤ ⅔·Vn', doubleArea: '§9.7.3.5(b): As,cont ≥ 2·As,req; Vu ≤ ¾·Vn', extraStirrups: '§9.7.3.5(c): s ≤ d/8; Av/s ≥ 0.41·bw/fyt', illegal: '—' },
    clause: { envelope: '§9.7.3, §22.2', bottomRun: '§9.7.3.8.1, §9.7.3.8.2', fit: '§25.2.1', hooks: '§25.4.3', splices: '§25.5.2', shear: '§22.5, §9.7.6.2.2', seismicBent: '§18.6.3', integrity: '§9.7.7.1, §9.7.7.5', inflection: '§9.7.3.8.3', straightEnd: '§9.7.3.8.1, §9.7.3.8.3(a)', hook180: '§25.3.1', jointHooks: '§18.8.5.1' },
    formula: { capacity: 'φMn(x) ≥ Mu(x) ∀x', cut: '§9.7.3.3, §9.7.3.2: x(φMn,cont = Mu) + max(d; 12·db) ≥ c + ld', third: '§9.7.3.8.4: As⁻/3 → x(M = 0) + max(d; 12·db; ln/16)' },
  },
};

/**
 * CIRSOC 201-2025 with the FIUBA course's mandrels for bent-up bars (9·db, 12·db, 15·db, §11.4),
 * which the code does not give, and its end anchorage where ldh does not fit the support: ld along
 * the bar, hook and a longer leg included (§12.2).
 */
export const CIRSOC_2025_LINE: LineCode = { ...CIRSOC_LINE, bentMandrel: bentBarMandrel, alongFallback: { clause: '§25.4.2; FIUBA §12.2' } };

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
  /** The hooks bent through 180°, back along the bar, where a 90° one does not fit the depth. */
  hook180?: [boolean, boolean];
  /** Each hooked end anchored along the bar: its tail past the bend and the length it develops the bar over, m. */
  anchor?: [EndAnchor | null, EndAnchor | null];
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

export interface EndAnchor { tail: number; need: number }

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
  shear: Array<{ x: number; v: number; vPos: number; vNeg: number; phiVn: number; /** Within the stretch the shear is verified over. */ checked?: boolean }>;
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

interface HookMisfit { mark: string; face: 'top' | 'bottom'; kind: LineBar['kind']; end: 0 | 1; dia: number; leg: number; room: number; depth: number }

/** An end of the bottom run left straight at a support with no column (§9.7.3.8.3(a)): ld against what the end develops, m. */
interface StraightEnd { mark: string; end: 0 | 1; ld: number; reach: number; la: number }

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

/** Each piece's developed length a bar is cut into where `spliceAt` laps it, m; with `stagger`, the longer of each pair of staggered pieces. */
export function splicePieces(shape: BarShape, lap: number, at: readonly number[], stagger = 0): number[] {
  const p = shape.pts, cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  const uAt = (x: number) => {
    for (let i = 0; i + 1 < p.length; i++) {
      const [x0] = p[i]!, [x1] = p[i + 1]!;
      if (x1 - x0 > 1e-9 && x >= x0 - 1e-9 && x <= x1 + 1e-9) return cum[i]! + (cum[i + 1]! - cum[i]!) * (x - x0) / (x1 - x0);
    }
    return x <= p[0]![0] ? 0 : total;
  };
  const reach = lap / 2 + stagger;
  const cuts = [...at].sort((a, b) => a - b).map(uAt);
  const starts = [0, ...cuts.map((u) => u - reach)], ends = [...cuts.map((u) => u + reach), total];
  return starts.map((u, i) => ends[i]! - u);
}

/** The straight extension past a 90° hook's bend, m (Table 25.3.1). */
const HOOK_EXTENSION = (dia: number) => 12 * dia / 1000;

/** The bars a section holds, each diameter its own group: the extras of the run's diameter in its layer where they fit, the rest beside them. */
function sectionGroups(cont: BarGroup, extras: readonly BarGroup[], b: number, c: BeamContext, sd: number): BarGroup[] {
  const used = extras.filter((g) => g.count > 0);
  if (!used.length) return [cont];
  const same = used.find((g) => g.dia === cont.dia), others = used.filter((g) => g.dia !== cont.dia);
  if (same) {
    const merged = [{ count: cont.count + same.count, dia: cont.dia }, ...others];
    if (faceLayout(merged, b, c.cover, sd).fits) return merged;
  }
  return [cont, ...used];
}

function commonDia(groups: BarGroup[][], fallback: number): number {
  const counts = new Map<number, number>();
  for (const g of groups) for (const x of g) if (x.count > 0) counts.set(x.dia, (counts.get(x.dia) ?? 0) + x.count);
  return [...counts].sort((p, q) => q[1] - p[1] || q[0] - p[0])[0]?.[0] ?? fallback;
}

export function beamLine(rows: BeamRow[], given: BeamContext, adopted: LineAdopted | undefined, fmt: Fmt, code: LineCode = CIRSOC_LINE): LineLayout {
  const c = beamContext(given);
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
  const faceNeg = Math.max(0, ...sorted.flatMap((r) => [reqAt(r, 'neg', 'start'), reqAt(r, 'neg', 'end')]));
  const longs = ((l) => (l.length ? l : [...c.diameters].sort((p, q) => p - q)))(listIn(c.diameters, BEAM_BAR_RANGE));
  const inTwo = (g: BarGroup[], width: number, sd = c.stirrupDia) => faceLayout(g, width, c.cover, sd).fits && new Set(faceBars(g, width, c.cover, sd).map((x) => x.row)).size <= 2;
  /**
   * The extra bars for an area beside a run, in the thinnest diameter from `least` that lays the
   * face in two layers: the run's own or one next to it in the list first, so a face holds one
   * diameter or two consecutive ones (FIUBA §8.1), any other only where none of those lays out.
   */
  const extraBars = (area: number, least: number, run: BarGroup, width: number): BarGroup => {
    if (area <= 1e-6) return { dia: least, count: 0 };
    const dias = longs.filter((d) => d >= least);
    const at = longs.indexOf(run.dia);
    const near = at < 0 ? [] : [longs[at - 1], longs[at], longs[at + 1]].filter((d): d is number => d !== undefined && d >= least);
    const of = (dia: number) => ({ dia, count: Math.ceil(area / barArea(dia) - 1e-9) });
    const lays = (dia: number) => inTwo(sectionGroups(run, [of(dia)], width, c, c.stirrupDia), width);
    return of(near.find(lays) ?? dias.find(lays) ?? dias[dias.length - 1] ?? least);
  };
  const propose = (floor: { top: number; bottom: number }): LineAdopted => {
    const minBottom = Math.min(Math.max(...spans.map((s) => code.minBottom(c, s.b, s.d))), (4 / 3) * Math.max(...sorted.map((r) => r.req.bottom)));
    const seis = c.seismic ? { top: 0.25 * faceNeg, bottom: 0.5 * faceNeg } : { top: 0, bottom: 0 };
    const comp = sorted.reduce((m, r) => ({ top: Math.max(m.top, r.req.compression?.top ?? 0), bottom: Math.max(m.bottom, r.req.compression?.bottom ?? 0) }), { top: 0, bottom: 0 });
    const aCb = Math.max(minBottom, bottomRunNeed(), seis.bottom, floor.bottom, comp.bottom);
    const narrowest = Math.min(...spans.map((s) => s.b));
    const runDia = longs.filter((d) => d >= botDia)
      .find((d) => Math.ceil(aCb / barArea(d) - 1e-9) <= RUN_BARS && inTwo([{ dia: d, count: Math.max(2, Math.ceil(aCb / barArea(d) - 1e-9)) }], narrowest)) ?? botDia;
    const bottom = { dia: runDia, count: Math.max(2, Math.ceil(aCb / barArea(runDia) - 1e-9)) };
    const spanHog = Math.max(0, ...sorted.map((r) => reqAt(r, 'neg', 'span')));
    const topNeed = Math.max(spanHog, negMax / 6, seis.top, floor.top, comp.top), hangers = Math.max(2, Math.ceil(topNeed / barArea(hanger) - 1e-9));
    const top = hangers <= 3 ? { dia: hanger, count: hangers } : { dia: topDia, count: Math.max(2, Math.ceil(topNeed / barArea(topDia) - 1e-9)) };
    const supportTop = supports.map((_, j) => {
      const left = j > 0 ? reqAt(sorted[j - 1]!, 'neg', 'end') : 0, right = j < sorted.length ? reqAt(sorted[j]!, 'neg', 'start') : 0;
      const width = Math.min(...[spans[j - 1]?.b, spans[j]?.b].filter((x): x is number => x !== undefined));
      return extraBars(Math.max(left, right) - groupsArea([top]), topDia, top, width);
    });
    const spanBottom = sorted.map((r, k) => extraBars(r.req.bottom - groupsArea([bottom]), botDia, bottom, spans[k]!.b));
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
  const query = (s: Span, tension: BarGroup[], compression: BarGroup[], sd: number, sagging: boolean, nc = 0): LineQuery => ({ demand: s.row.demand, tension, compression, sd, sagging, nc });
  const faceS = line[0] ?? 0, faceE = total - (line[line.length - 1] ?? 0);
  const endOfLine = (i: 0 | 1) => (i === 0 ? endStart : endEnd);
  /** What a hooked bar ending at a support needs: ldh, or the joint's under chapter 18 at a column; a bent bar's ends are top bars. */
  const anchorNeed = (dia: number, top: boolean, e: BeamEnd | undefined) =>
    (c.seismic && code.jointHooked && e?.kind === 'column' ? code.jointHooked(c, dia) : code.hooked(c, dia, top, hMax));
  const ldhOf = (b: Pick<LineBar, 'bars' | 'face' | 'kind'>, i: 0 | 1) => anchorNeed(b.bars.dia, b.face === 'top' || b.kind === 'bent', endOfLine(i));

  const bendRadius = (dia: number) => (mandrelOf(dia) + dia / 1000) / 2;
  const legOf = (dia: number) => bendRadius(dia) + extensionOf(dia);
  const rise180 = (dia: number) => mandrelOf(dia) + dia / 1000;
  const roomOf = (k: number, dia: number, sd: number) => spans[k]!.h - 2 * (c.cover + sd / 1000) - dia / 2000;
  /** A column end's room from its face to the outside of a hook inside it, m. */
  const columnRoom = (e: BeamEnd) => 2 * e.half - inset;
  /** What a hook anchors along the bar from `horizontal` m before its outside: its straight part, the bend's quarter arc and `tail`. */
  const alongReach = (dia: number, horizontal: number, tail: number) => {
    const r = bendRadius(dia);
    return Math.max(0, horizontal - dia / 2000 - r) + (Math.PI * r) / 2 + tail;
  };
  /** The length a hook anchored along the bar at `e` develops it over: the code's own, or the straight ld where it falls back to it; null where neither applies. */
  const alongNeed = (dia: number, top: boolean, e: BeamEnd | undefined, layer: BarLayer): number | null =>
    (code.alongBar ? anchorNeed(dia, top, e) : code.alongFallback && !(c.seismic && code.jointHooked) && e?.kind === 'column' ? dev(c, dia, top, hMax, layer) : null);
  /** The tail a hook at a column needs past its bend to develop `need` along the bar, from the standard one up to the beam's depth, m; null when not even that does. */
  const tailFor = (dia: number, need: number, e: BeamEnd, k: number, sd: number): number | null => {
    const std = extensionOf(dia), base = alongReach(dia, columnRoom(e), 0);
    const tail = Math.max(std, Math.ceil((need - base) / 0.01 - 1e-9) * 0.01);
    return tail <= Math.max(std, roomOf(k, dia, sd) - bendRadius(dia)) + 1e-9 ? tail : null;
  };
  /** How a bar of `dia` hooked at a column end anchors there: null with a standard hook that fits, its along-the-bar anchorage, or `false` where neither does. */
  const columnAnchor = (dia: number, top: boolean, e: BeamEnd, k: number, sd: number, count: number): EndAnchor | null | false => {
    if (!code.alongBar && anchorNeed(dia, top, e) <= columnRoom(e) + 1e-6) return null;
    const need = alongNeed(dia, top, e, { count, width: spans[k]!.b });
    const tail = need === null ? null : tailFor(dia, need, e, k, sd);
    return tail === null || need === null ? false : { tail, need };
  };
  /** Whether a bar of `dia` hooked at each column end of the line anchors there; with `standard`, by a standard hook of the code alone. */
  const anchorsAtColumns = (dia: number, top: boolean, standard = false) => ([0, 1] as const).every((i) => {
    const e = endOfLine(i), k = i === 0 ? 0 : spans.length - 1;
    if (!e || e.kind !== 'column' || e.half <= 0 || !spans[k]) return true;
    const a = columnAnchor(dia, top, e, k, c.stirrupDia, 2);
    return standard && !code.alongBar ? a === null : a !== false;
  });
  const anchorNeedOf = (b: Pick<LineBar, 'anchor' | 'bars' | 'face' | 'kind'>, i: 0 | 1) => b.anchor?.[i]?.need ?? ldhOf(b, i);
  const anchorReachOf = (b: Pick<LineBar, 'anchor' | 'bars'>, i: 0 | 1, horizontal: number) => {
    const a = b.anchor?.[i];
    return a ? alongReach(b.bars.dia, horizontal, a.tail) : horizontal;
  };
  let allow180 = false;
  const layout = (a: LineAdopted) => {
    const sdOf = (k: number) => a.stirrups?.[k]?.dia ?? c.stirrupDia;
    const bars: LineBar[] = [];
    const laps: LineLayout['splices'] = [];
    const misfits: HookMisfit[] = [];
    const straight: StraightEnd[] = [];
    const overStock: Array<{ mark: string; length: number }> = [];
    const straightEnd = (g: BarGroup, i: 0 | 1, e: BeamEnd): Omit<StraightEnd, 'mark' | 'end'> | null => {
      const rule = code.straightAtSupport;
      if (!rule) return null;
      const k = i === 0 ? 0 : spans.length - 1, s = spans[k]!;
      const la = Math.max(reachInto(e), rule.into - e.half);
      const ld = dev(c, g.dia, false, s.h, { count: g.count, width: s.b });
      const vu = endShear(k, i === 0);
      const mn = (capQueries([query(s, [a.bottom], [a.top], sdOf(k), true)])[0] ?? 0) / 0.9;
      const reach = vu > 1e-6 ? rule.factor * mn / vu + la : Infinity;
      return ld <= reach + 1e-6 ? { ld, reach, la } : null;
    };
    let mark = 0;
    const next = () => String.fromCharCode(65 + (mark++ % 26)) + (mark > 26 ? String(Math.floor((mark - 1) / 26)) : '');
    const turnOf = (face: 'top' | 'bottom', end: BeamEnd | undefined): 1 | -1 => (face === 'top' || end?.kind === 'column' ? -1 : 1);
    const add = (face: 'top' | 'bottom', kind: LineBar['kind'], g: BarGroup, from: number, to: number, hooksAsked: [boolean, boolean], bent?: { shape: BarShape; runs: LineBar['runs'] }) => {
      if (g.count <= 0 || to - from < 1e-6) return;
      const inner = c.cover + sdOf(0) / 1000 + g.dia / 2000;
      const ends = [turnOf(face, endStart), turnOf(face, endEnd)] as [1 | -1, 1 | -1];
      const id = next();
      const hooks: [boolean, boolean] = [...hooksAsked];
      const hook180: [boolean, boolean] = [false, false];
      const short: Array<Omit<HookMisfit, 'mark'>> = [];
      ([0, 1] as const).forEach((i) => {
        const e = i === 0 ? endStart : endEnd, k = i === 0 ? 0 : spans.length - 1;
        if (!hooks[i] || !spans[k] || e?.kind === 'column') return;
        const sd = sdOf(k), room = roomOf(k, g.dia, sd);
        if (bent) {
          const p = bent.shape.pts, leg = Math.abs(i === 0 ? p[0]![1] - p[1]![1] : p[p.length - 1]![1] - p[p.length - 2]![1]);
          if (leg > room + 1e-6) short.push({ face, kind, end: i, dia: g.dia, leg, room, depth: spans[k]!.h - room + leg });
          return;
        }
        if (legOf(g.dia) <= room + 1e-6) return;
        const st = face === 'bottom' && kind === 'continuous' && e?.kind === 'support' ? straightEnd(g, i, e) : null;
        if (st) {
          hooks[i] = false;
          if (i === 0) from = Math.min(from, -st.la); else to = Math.max(to, total + st.la);
          straight.push({ mark: id, end: i, ...st });
          return;
        }
        if (allow180 && code.hook180Extension && rise180(g.dia) <= room + 1e-6) { hook180[i] = true; return; }
        const leg = allow180 && code.hook180Extension ? rise180(g.dia) : legOf(g.dia);
        short.push({ face, kind, end: i, dia: g.dia, leg, room, depth: spans[k]!.h - room + leg });
      });
      for (const m of short) misfits.push({ mark: id, ...m });
      const tail: [number, number] = [extensionOf(g.dia), extensionOf(g.dia)];
      const anchor: [EndAnchor | null, EndAnchor | null] = [null, null];
      if (!bent) ([0, 1] as const).forEach((i) => {
        const e = endOfLine(i), k = i === 0 ? 0 : spans.length - 1;
        if (!hooks[i] || !e || !spans[k] || hook180[i]) return;
        const top = face === 'top' || kind === 'bent';
        if (e.kind !== 'column' || e.half <= 0) {
          if (code.alongBar) anchor[i] = { tail: tail[i], need: anchorNeed(g.dia, top, e) };
          return;
        }
        const own = columnAnchor(g.dia, top, e, k, sdOf(k), g.count);
        if (own) { anchor[i] = own; tail[i] = own.tail; return; }
        if (own === false && code.alongBar) {
          tail[i] = Math.max(tail[i], roomOf(k, g.dia, sdOf(k)) - bendRadius(g.dia));
          anchor[i] = { tail: tail[i], need: anchorNeed(g.dia, top, e) };
        }
      });
      const y = face === 'top' ? hMax - inner : inner;
      let shape = bent?.shape ?? hookedStraight(from, to, y, g.dia, mandrelOf(g.dia), hooks, ends, tail);
      if (!bent && (hook180[0] || hook180[1])) {
        const r = rise180(g.dia), back = r / 2 + code.hook180Extension!(g.dia), pts = shape.pts;
        if (hook180[0]) pts.splice(0, 1, [from + back, y + ends[0] * r], [from, y + ends[0] * r]);
        if (hook180[1]) pts.splice(pts.length - 1, 1, [to, y + ends[1] * r], [to - back, y + ends[1] * r]);
      }
      const runs = bent?.runs ?? [{ face, from, to }];
      const lap = step(lapOf(c, g.dia, face === 'top' || kind === 'bent', hMax, undefined, { count: g.count, width: bMin }));
      const cands = kind !== 'continuous' ? [] : face === 'bottom' && !c.seismic ? supports.slice(1, -1) : spans.map((s) => s.x0 + s.L / 2);
      const off = g.count >= 2 ? lap / 2 + STAGGER_GAP / 2 : 0;
      const at = spliceAt(shape, lap, cands, STOCK_LENGTH, off);
      const pieces = at.length ? splicePieces(shape, lap, at, off) : [developedLength(shape)];
      if (Math.max(...pieces) > STOCK_LENGTH + 1e-6) overStock.push({ mark: id, length: Math.max(...pieces) });
      if (at.length) {
        shape = { ...shape, laps: { count: at.length, length: lap } };
        const faceAt = (x: number) => runs.find((r) => x >= r.from - 1e-9 && x <= r.to + 1e-9)?.face ?? face;
        for (const x of at) {
          if (!off) { laps.push({ mark: id, face: faceAt(x), x, length: lap, bars: g.count, spliceClass: 'B' }); continue; }
          laps.push({ mark: id, face: faceAt(x - off), x: x - off, length: lap, bars: Math.ceil(g.count / 2), spliceClass: 'B' });
          laps.push({ mark: id, face: faceAt(x + off), x: x + off, length: lap, bars: Math.floor(g.count / 2), spliceClass: 'B' });
        }
      }
      bars.push({ mark: id, face, kind, bars: g, from, to, hooks, ...(hook180[0] || hook180[1] ? { hook180 } : {}), ...(anchor[0] || anchor[1] ? { anchor } : {}), length: developedLength(shape), weight: shapeWeight(shape, g.count), shape, runs });
    };
    add('bottom', 'continuous', a.bottom, xFrom, xTo, [true, true]);
    add('top', 'continuous', a.top, xFrom, xTo, [true, true]);
    const contCap = (sign: 'pos' | 'neg') => spans.map((s, k) => capQueries((s.row.demand.env ?? []).map((e) => (sign === 'pos' ? query(s, [a.bottom], [a.top], sdOf(k), true, e.nPos ?? 0) : query(s, [a.top], [a.bottom], sdOf(k), false, e.nNeg ?? 0)))));
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
    lastSplices = laps; lastMisfits = misfits; lastStraight = straight; lastOverStock = overStock;
    return bars;
  };
  let lastCuts: LineLayout['cutoffs'] = [];
  let lastSplices: LineLayout['splices'] = [];
  let lastMisfits: HookMisfit[] = [];
  let lastStraight: StraightEnd[] = [];
  let lastOverStock: Array<{ mark: string; length: number }> = [];

  /** The bars working at `xl`, each counted by how much of its strength it has developed there: a straight end over ld, a hooked one over ldh from its hook, read at the support face from inside the support. */
  const effective = (bars: LineBar[], face: 'top' | 'bottom', xl: number, ldOf: (g: BarGroup) => number) => {
    const groups: BarGroup[] = [];
    for (const b of bars.filter((y) => barActsAt(y, face, xl))) {
      const ld = ldOf(b.bars);
      const fromStart = b.hooks[0] ? anchorReachOf(b, 0, Math.max(xl, faceS) - b.from) / anchorNeedOf(b, 0) : (xl - b.from) / ld;
      const fromEnd = b.hooks[1] ? anchorReachOf(b, 1, b.to - Math.min(xl, faceE)) / anchorNeedOf(b, 1) : (b.to - xl) / ld;
      const f = Math.min(1, fromStart, fromEnd);
      if (f > 1e-3) groups.push({ count: b.bars.count * f, dia: b.bars.dia });
    }
    return groups;
  };

  const verify = (a: LineAdopted, bars: LineBar[]) => {
    const pts: Array<{ k: number; i: number; xl: number; pos: number; neg: number; nPos: number; nNeg: number }> = [];
    spans.forEach((s, k) => (s.row.demand.env ?? []).forEach((e, i) => pts.push({ k, i, xl: s.x0 + e.x, pos: e.pos, neg: e.neg, nPos: e.nPos ?? 0, nNeg: e.nNeg ?? 0 })));
    const qs: LineQuery[] = [];
    for (const p of pts) {
      const s = spans[p.k]!, sd = a.stirrups?.[p.k]?.dia ?? c.stirrupDia;
      const layerOf = (face: 'top' | 'bottom') => ({ count: bars.filter((b) => barActsAt(b, face, p.xl)).reduce((n, b) => n + b.bars.count, 0), width: s.b });
      const bot = effective(bars, 'bottom', p.xl, (g) => dev(c, g.dia, false, s.h, layerOf('bottom'))), top = effective(bars, 'top', p.xl, (g) => dev(c, g.dia, true, s.h, layerOf('top')));
      qs.push(query(s, bot.length ? bot : [{ count: 0, dia: 10 }], top, sd, true, p.nPos), query(s, top.length ? top : [{ count: 0, dia: 10 }], bot, sd, false, p.nNeg));
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
  /** Each span's bars as its row reads them: the runs, and at its start, middle and end what else acts there. */
  const spanAdoptedOf = (a: LineAdopted, bars: LineBar[]): BeamAdopted[] => spans.map((s, k) => {
    const sd = a.stirrups?.[k]?.dia ?? c.stirrupDia;
    const at = (xl: number) => {
      const full = (face: 'top' | 'bottom'): BarGroup[] => {
        const by = new Map<number, number>();
        for (const b of bars) if (b.kind !== 'continuous' && barActsAt(b, face, xl, 1e-6)) by.set(b.bars.dia, (by.get(b.bars.dia) ?? 0) + b.bars.count);
        return [...by].sort((p, q) => q[0] - p[0]).map(([dia, count]) => ({ dia, count }));
      };
      return { top: sectionGroups(a.top, full('top'), s.b, c, sd), bottom: sectionGroups(a.bottom, full('bottom'), s.b, c, sd) };
    };
    const own = s.row.proposed;
    return {
      bottom: [a.bottom], top: [a.top], stirrups: a.stirrups?.[k] ?? own.stirrups,
      ...(own.torsionLong ? { torsionLong: own.torsionLong } : {}),
      at: { start: at(s.x0 + (s.row.demand.start.x)), span: at(s.x0 + s.row.demand.span.x), end: at(s.x0 + s.row.demand.end.x) },
    };
  });
  /**
   * The runs a span short of ductility with the line's bars asks, cm²: a sagging section not
   * ductile asks the top run its own proposal holds there in compression, a hogging one the bottom
   * run; 0 where the line's runs already hold that much or the span is ductile.
   */
  const spanRows = new Map<string, BeamRow>();
  const spanRowOf = (k: number, sa: BeamAdopted): BeamRow => {
    const key = `${k}|${JSON.stringify(sa)}`;
    let row = spanRows.get(key);
    if (!row) { row = code.spanRow!(spans[k]!.row.demand, given, sa, fmt); spanRows.set(key, row); }
    return row;
  };
  const compressionShort = (sa: BeamAdopted[]): { top: number; bottom: number } => spans.reduce((m, s, k) => {
    const row = spanRowOf(k, sa[k]!);
    const bad = row.flexure.filter((f) => f.mu > 1e-6 && !f.ductile);
    const own = (sec: 'start' | 'span' | 'end') => s.row.proposed.at?.[sec] ?? s.row.proposed;
    const top = Math.max(0, ...bad.filter((f) => f.sign === 'pos').map((f) => groupsArea(own(f.section).top)));
    const bottom = Math.max(0, ...bad.filter((f) => f.sign === 'neg').map((f) => groupsArea(own(f.section).bottom)));
    return {
      top: top > groupsArea([proposed.top]) + 1e-6 ? Math.max(m.top, top) : m.top,
      bottom: bottom > groupsArea([proposed.bottom]) + 1e-6 ? Math.max(m.bottom, bottom) : m.bottom,
    };
  }, { top: 0, bottom: 0 });
  /**
   * A line laid out from its spans' own proposals, for one that iterating its runs leaves short: the
   * bottom run the spans' most common outer bars and each span's rest as its extras; a top run
   * that holds the compression a doubly reinforced span's proposal keeps on top; the supports' and
   * stirrups as they are.
   */
  const fromSpans = (p: LineAdopted): LineAdopted => {
    const outer = sorted.map((r) => r.proposed.bottom.find((g) => g.count > 0) ?? p.bottom);
    const common = [...outer].sort((x, y) => outer.filter((o) => o.dia === y.dia && o.count === y.count).length - outer.filter((o) => o.dia === x.dia && o.count === x.count).length || groupsArea([x]) - groupsArea([y]))[0] ?? p.bottom;
    const run = { dia: common.dia, count: Math.max(common.count, Math.ceil(bottomRunNeed() / barArea(common.dia) - 1e-9)) };
    const spanBottom = sorted.map((r) => {
      const rest = groupsArea(r.proposed.bottom) - groupsArea([run]);
      const dia = r.proposed.bottom[1]?.dia ?? run.dia;
      return rest > 1e-6 ? { dia, count: Math.ceil(rest / barArea(dia) - 1e-9) } : { dia, count: 0 };
    });
    const compressed = sorted.filter((r) => (r.req.compression?.top ?? 0) > 0);
    const need = Math.max(0, ...compressed.map((r) => groupsArea(r.proposed.at?.span?.top ?? r.proposed.top)));
    const dia = Math.max(0, ...compressed.flatMap((r) => r.proposed.top.map((g) => g.dia)));
    const top = compressed.length ? { dia, count: Math.max(2, Math.ceil(need / barArea(dia) - 1e-9)) } : p.top;
    return { ...p, bottom: run, spanBottom, top, ...(p.bent ? { bent: p.bent.map((g) => ({ ...g, count: 0 })) } : {}) };
  };
  let floor = { top: 0, bottom: 0 };
  let proposed = adopted ?? propose(floor), iterations = 0;
  let bars = layout(proposed), env = verify(proposed, bars);
  const worstOf = (e: typeof env) => e.reduce((w, x) => Math.max(w, ratioOf(x.pos, x.phiPos), ratioOf(x.neg, x.phiNeg)), 0);
  const thicker = (g: BarGroup): BarGroup => {
    const dia = longs.find((d) => d > g.dia);
    return dia && g.count > 0 ? { dia, count: Math.ceil((g.count * barArea(g.dia)) / barArea(dia) - 1e-9) } : { dia: g.dia, count: g.count + 1 };
  };
  const oneMore = (g: BarGroup): BarGroup => ({ dia: g.dia, count: g.count + 1 });
  const inTwoLayers = (a: LineAdopted, laid: LineBar[]) => spanAdoptedOf(a, laid).every((sa, k) => (['start', 'span', 'end'] as const).every((sec) => (['top', 'bottom'] as const).every((f) => inTwo(sa.at![sec]![f], spans[k]!.b, sa.stirrups.dia))));
  /**
   * Where the envelope is short: one bar more at the span or support, the same area there in a
   * thicker bar, then the same two on the run along the line, the first that raises the worst
   * station and still lays each face in two layers. A grade beam on soil, bent the other way, is short at its
   * supports in the bottom, which only the run reaches.
   */
  const iterate = () => {
    while (iterations < 16) {
      const bad = env.filter((e) => e.pos > e.phiPos + 1e-6 || e.neg > e.phiNeg + 1e-6);
      if (!bad.length) break;
      iterations++;
      const spansBad = new Set(bad.filter((e) => e.pos > e.phiPos + 1e-6).map((e) => e.k));
      const supportsBad = new Set(bad.filter((e) => e.neg > e.phiNeg + 1e-6).map((e) => (e.xl - spans[e.k]!.x0 < spans[e.k]!.L / 2 ? e.k : e.k + 1)));
      const local = (step: (g: BarGroup) => BarGroup): LineAdopted => {
        const next: LineAdopted = JSON.parse(JSON.stringify(proposed));
        for (const k of spansBad) next.spanBottom[k] = step(next.spanBottom[k]!);
        for (const j of supportsBad) next.supportTop[j] = step(next.supportTop[j]!);
        return next;
      };
      const run = (step: (g: BarGroup) => BarGroup): LineAdopted => {
        const next: LineAdopted = JSON.parse(JSON.stringify(proposed));
        if (spansBad.size) next.bottom = step(next.bottom);
        if (supportsBad.size) next.top = step(next.top);
        return next;
      };
      const before = worstOf(env), fitted = inTwoLayers(proposed, bars);
      let taken = false;
      for (const next of [local(oneMore), local(thicker), run(oneMore), run(thicker)]) {
        const nextBars = layout(next), nextEnv = verify(next, nextBars);
        if (worstOf(nextEnv) >= before - 1e-9 || (fitted && !inTwoLayers(next, nextBars))) continue;
        proposed = next; bars = nextBars; env = nextEnv; taken = true;
        break;
      }
      if (!taken) { bars = layout(proposed); break; }
    }
  };
  const fitsFaces = (a: LineAdopted, laid: LineBar[]) => spanAdoptedOf(a, laid).every((sa, k) => (['start', 'span', 'end'] as const).every((sec) => faceLayout(sa.at![sec]!.top, spans[k]!.b, c.cover, sa.stirrups.dia).fits && faceLayout(sa.at![sec]!.bottom, spans[k]!.b, c.cover, sa.stirrups.dia).fits));
  /** Hooks too deep for the beam: the same area in a smaller diameter whose 90° hook fits, where the face still holds it. */
  const depthTrade = () => {
    if (!lastMisfits.length) return;
    const kept = { proposed, bars, env, iterations, misfits: lastMisfits.length };
    const next: LineAdopted = JSON.parse(JSON.stringify(proposed));
    const swap = (g: BarGroup | undefined, m: HookMisfit, least: number): BarGroup | undefined => {
      if (!g || g.count <= 0 || g.dia !== m.dia) return g;
      const k = m.end === 0 ? 0 : spans.length - 1, sd = next.stirrups?.[k]?.dia ?? c.stirrupDia;
      const dia = [...c.diameters].filter((d) => d >= 10 && d < m.dia && legOf(d) <= roomOf(k, d, sd) + 1e-6).sort((p, q) => q - p)[0];
      return dia ? { dia, count: Math.max(least, Math.ceil((g.count * barArea(g.dia)) / barArea(dia) - 1e-9)) } : g;
    };
    for (const m of lastMisfits) {
      if (m.kind === 'continuous') { if (m.face === 'bottom') next.bottom = swap(next.bottom, m, 2)!; else next.top = swap(next.top, m, 2)!; }
      else if (m.kind === 'support') { const j = m.end === 0 ? 0 : next.supportTop.length - 1; next.supportTop[j] = swap(next.supportTop[j], m, 1)!; }
      else if (m.kind === 'bent' && next.bent?.length) { const j = m.end === 0 ? 0 : next.bent.length - 1; next.bent[j] = swap(next.bent[j], m, 1)!; }
    }
    if (JSON.stringify(next) === JSON.stringify(proposed)) return;
    proposed = next; bars = layout(proposed); env = verify(proposed, bars); iterate();
    if (lastMisfits.length >= kept.misfits || !fitsFaces(proposed, bars)) { ({ proposed, bars, env, iterations } = kept); layout(proposed); }
  };
  const designFrom = () => {
    allow180 = false;
    iterate();
    if ([endStart, endEnd].some((e) => !!e && e.kind === 'column' && e.half > 0)) {
      const standard = [...c.diameters].some((d) => d >= 10 && anchorsAtColumns(d, true, true));
      const fits = (dia: number) => anchorsAtColumns(dia, true, standard);
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
    depthTrade();
    if (lastMisfits.length && code.hook180Extension) { allow180 = true; bars = layout(proposed); env = verify(proposed, bars); }
  };
  if (!adopted) {
    designFrom();
    for (let guard = 0; c.seismic && guard < 8; guard++) {
      const more = spanAdoptedOf(proposed, bars).reduce((m, sa) => {
        const r = faceRule(sa.at!.start!, sa.at!.span!, sa.at!.end!).more;
        return { top: Math.max(m.top, r.top), bottom: Math.max(m.bottom, r.bottom) };
      }, { top: 0, bottom: 0 });
      if (more.top <= 1e-6 && more.bottom <= 1e-6) break;
      floor = {
        top: more.top > 1e-6 ? Math.max(floor.top, groupsArea([proposed.top]) + more.top) : floor.top,
        bottom: more.bottom > 1e-6 ? Math.max(floor.bottom, groupsArea([proposed.bottom]) + more.bottom) : floor.bottom,
      };
      iterations++;
      proposed = propose(floor); bars = layout(proposed); env = verify(proposed, bars);
      designFrom();
    }
    for (let guard = 0; code.spanRow && guard < 4; guard++) {
      const more = compressionShort(spanAdoptedOf(proposed, bars));
      if (more.top <= 1e-6 && more.bottom <= 1e-6) break;
      floor = { top: Math.max(floor.top, more.top), bottom: Math.max(floor.bottom, more.bottom) };
      iterations++;
      proposed = propose(floor); bars = layout(proposed); env = verify(proposed, bars);
      designFrom();
    }
    for (let guard = 0; code.spanRow && guard < 6; guard++) {
      const sa = spanAdoptedOf(proposed, bars);
      const next: LineAdopted = JSON.parse(JSON.stringify(proposed));
      const raised = new Set<string>();
      spans.forEach((_, k) => {
        for (const f of spanRowOf(k, sa[k]!).flexure) {
          if (!(f.mu > 1e-6) || f.ok || !f.ductile) continue;
          const at = f.sign === 'pos' ? `b${k}` : f.section === 'start' ? `t${k}` : f.section === 'end' ? `t${k + 1}` : 'run';
          if (raised.has(at)) continue;
          raised.add(at);
          if (at === 'run') next.top = oneMore(next.top);
          else if (f.sign === 'pos') next.spanBottom[k] = oneMore(next.spanBottom[k]!);
          else { const j = Number(at.slice(1)); next.supportTop[j] = oneMore(next.supportTop[j]!); }
        }
      });
      if (!raised.size) break;
      proposed = next; bars = layout(proposed); env = verify(proposed, bars); iterations++;
    }
    if (code.spanRow) {
      const score = (p: LineAdopted) => {
        const laid = layout(p), e = verify(p, laid), sa = spanAdoptedOf(p, laid);
        return { laid, e, bad: spans.filter((_, k) => spanRowOf(k, sa[k]!).status === 'fail').length, worst: worstOf(e) };
      };
      const now = score(proposed);
      if (now.bad > 0 || now.worst > 1 + 1e-6) {
        const alt = fromSpans(proposed), then = score(alt);
        const envelopeHeld = then.worst <= Math.max(1 + 1e-6, now.worst);
        if (envelopeHeld && (then.bad < now.bad || (then.bad === now.bad && then.worst < now.worst - 1e-6))) { proposed = alt; bars = then.laid; env = then.e; iterations++; }
        else { bars = layout(proposed); env = verify(proposed, bars); }
      }
    }
    for (let guard = 0; c.seismic && guard < 8; guard++) {
      const more = spanAdoptedOf(proposed, bars).reduce((m, sa) => {
        const r = faceRule(sa.at!.start!, sa.at!.span!, sa.at!.end!).more;
        return { top: Math.max(m.top, r.top), bottom: Math.max(m.bottom, r.bottom) };
      }, { top: 0, bottom: 0 });
      if (more.top <= 1e-6 && more.bottom <= 1e-6) break;
      const runs = (g: BarGroup, area: number): BarGroup => (area > 1e-6 ? { ...g, count: g.count + Math.ceil(area / barArea(g.dia) - 1e-9) } : g);
      proposed = { ...proposed, top: runs(proposed.top, more.top), bottom: runs(proposed.bottom, more.bottom) };
      bars = layout(proposed); env = verify(proposed, bars); iterations++;
    }
  }
  const a = adopted ?? proposed;
  const adoptedBentNotes = (): LineLayout['bentNotes'] => {
    if (!c.bentBars) return [];
    if (c.seismic) return [{ reason: 'seismic', clause: code.text.clause.seismicBent ?? '' }];
    return a.bent?.some((g) => g.count > 0) ? [] : [{ reason: 'adopted' }];
  };
  if (adopted) { allow180 = true; bars = layout(a); env = verify(a, bars); }
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

  const spanAdopted: BeamAdopted[] = spanAdoptedOf(a, bars);

  const seismicZones = (k: number): LineLayout['zones'] | null => {
    if (!c.seismic) return null;
    const s = spans[k]!, sa = spanAdopted[k]!, st = sa.stirrups;
    const faceL = Math.min(line[k] ?? 0, s.L / 2), faceR = Math.max(faceL, s.L - (line[k + 1] ?? 0));
    const seisOf = (x: Stirrups) => beamSeismic(s.row.demand, { ...c, overstrength: c.seismic!.overstrength }, { ...sa, stirrups: x }, (sec) => sa.at![sec]!, fmt);
    const holds = (r: ReturnType<typeof seisOf>) => r.checks.every((v) => (v.label !== 'rcSheets.v.seisBeamVe' && v.label !== 'rcSheets.v.seisBeamHoops') || v.ok);
    const floor = tieFloorOf(c);
    let end = st, seis = seisOf(end);
    for (let guard = 0; !adopted && !holds(seis) && guard < 24; guard++) {
      const closer = Math.max(floor, roundDown(Math.min(end.spacing - 0.025, seis.sZone)));
      const thicker = nextTie(c, end.dia);
      if (closer < end.spacing - 1e-9) end = { ...end, spacing: closer };
      else if (thicker) end = { ...end, dia: thicker };
      else if (!seis.veCapped && end.legs + 2 <= Math.max(2, sa.bottom[0]?.count ?? 0)) end = { ...end, legs: end.legs + 2 };
      else break;
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

  const zonesOf = (): LineLayout['zones'] => spans.flatMap((s, k) => {
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

  /** Where each span's row reads its shear: d from a support face, from the face where it frames into a beam (§9.4.3.2). */
  const shearWindow = (s: Span): [number, number] => {
    const d = s.row.demand, f = d.faces;
    if (!f) return [0, s.L];
    return [d.ends?.start.kind === 'beam' ? f.start : Math.min(f.start + f.shearAt, s.L / 2), d.ends?.end.kind === 'beam' ? s.L - f.end : Math.max(s.L - f.end - f.shearAt, s.L / 2)];
  };
  const shearAlong = (zones: LineLayout['zones']) => spans.flatMap((s, k) => (s.row.demand.env ?? []).map((e) => {
    const xl = s.x0 + e.x;
    const zi = zones.reduce((best, z, i) => (z.span !== k ? best : best < 0 || Math.max(0, z.from - xl, xl - z.to) < Math.max(0, zones[best]!.from - xl, xl - zones[best]!.to) ? i : best), -1);
    const z = zones[zi];
    const at = (face: 'top' | 'bottom'): BarGroup[] => {
      const by = new Map<number, number>();
      for (const b of bars) if (barActsAt(b, face, xl, 1e-6)) by.set(b.bars.dia, (by.get(b.bars.dia) ?? 0) + b.bars.count);
      return [...by].sort((p, q) => q[0] - p[0]).map(([dia, count]) => ({ dia, count }));
    };
    const tension = e.neg > e.pos ? 'top' : 'bottom';
    const phiVn = z ? code.shear(c, query(s, at(tension), at(tension === 'top' ? 'bottom' : 'top'), z.stirrups.dia, false, e.nV ?? 0), z.stirrups).design : 0;
    const [w0, w1] = shearWindow(s);
    return { x: xl, v: e.v, vPos: e.vPos ?? e.v, vNeg: e.vNeg ?? e.v, phiVn, checked: e.x >= w0 - 1e-6 && e.x <= w1 + 1e-6, span: k };
  }));
  let zones = zonesOf(), along = shearAlong(zones);
  for (let guard = 0; !adopted && guard < 16; guard++) {
    const short = new Set(along.filter((x) => x.checked && x.v > x.phiVn + 1e-6).map((x) => x.span));
    let moved = false;
    for (const k of short) {
      const more = a.stirrups?.[k] ? moreStirrup(a.stirrups[k]!, c, 0.15) : null;
      if (!more) continue;
      a.stirrups![k] = more; spanAdopted[k]!.stirrups = more; moved = true;
    }
    if (!moved) break;
    zones = zonesOf(); along = shearAlong(zones);
  }
  if (!adopted && code.spanRow && a.stirrups) {
    const failing = (k: number, st: Stirrups) => spanRowOf(k, { ...spanAdopted[k]!, stirrups: st }).verifications.filter((v) => !v.ok).length;
    let moved = false;
    spans.forEach((_, k) => {
      let best = a.stirrups![k]!, least = failing(k, best), st = best;
      for (let guard = 0; least > 0 && guard < 12; guard++) {
        const more = moreStirrup(st, c, 0.15);
        if (!more) break;
        st = more;
        const n = failing(k, st);
        if (n < least) { best = st; least = n; }
      }
      if (best !== a.stirrups![k]) { a.stirrups![k] = best; spanAdopted[k]!.stirrups = best; moved = true; }
    });
    if (moved) { zones = zonesOf(); along = shearAlong(zones); }
  }
  if (!adopted && c.course && a.stirrups) {
    const used = [...new Set(a.stirrups.map((st) => st.dia))].sort((p, q) => p - q);
    if (used.length > 2) {
      const least = used[used.length - 2]!;
      a.stirrups = a.stirrups.map((st) => (st.dia < least ? { ...st, dia: least } : st));
      spanAdopted.forEach((sa, k) => { sa.stirrups = a.stirrups![k]!; });
      zones = zonesOf(); along = shearAlong(zones);
    }
  }
  const shear = along.map(({ span: _span, ...x }) => x);
  const worstShear = shear.filter((x) => x.checked).reduce<(typeof shear)[number] | undefined>((w, x) => (!w || ratioOf(x.v, x.phiVn) > ratioOf(w.v, w.phiVn) ? x : w), undefined);
  const inflections = inflectionsOf(env, a.bottom);
  const endAnchors = ([[endStart, xFrom, 0], [endEnd, xTo, 1]] as const).flatMap(([e, xe, i]) => {
    if (!e || e.kind !== 'column' || e.half <= 0) return [];
    const room = columnRoom(e);
    const reaching = bars.filter((b) => (i === 0 ? b.from <= xe + 1e-6 : b.to >= xe - 1e-6));
    return reaching.map((b) => ({ dia: b.bars.dia, ldh: anchorNeedOf(b, i), room: anchorReachOf(b, i, room), along: b.anchor?.[i] ?? null }));
  });
  /** Each hook at an end the line rests on: the room from the support face to the hook against ldh, and whether the bars there carry the face's moment with what they develop in it. */
  const hookEnds = bars.flatMap((b) => ([0, 1] as const).filter((i) => b.hooks[i]).flatMap((i) => {
    const e = i === 0 ? endStart : endEnd;
    if (!e || e.kind === 'free') return [];
    const room = anchorReachOf(b, i, i === 0 ? faceS - b.from : b.to - faceE);
    const sign = b.face === 'top' || b.kind === 'bent' ? 'neg' : 'pos';
    const held = env.filter((p) => (i === 0 ? p.xl <= faceS + 1e-6 : p.xl >= faceE - 1e-6)).every((p) => (sign === 'pos' ? p.pos <= p.phiPos + 1e-6 : p.neg <= p.phiNeg + 1e-6));
    return [{ mark: b.mark, end: i, dia: b.bars.dia, ldh: anchorNeedOf(b, i), room, held }];
  }));
  const shortHook = hookEnds.filter((x) => x.ldh > x.room + 1e-6).reduce<(typeof hookEnds)[number] | undefined>((w, x) => (!w || x.ldh / Math.max(x.room, 1e-6) > w.ldh / Math.max(w.room, 1e-6) ? x : w), undefined);
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
  const hookOk = hookEnds.every((x) => x.ldh <= x.room + 1e-6 || x.held);
  const fitOk = spanAdopted.every((sa, k) => (['start', 'span', 'end'] as const).every((sec) => faceLayout(sa.at![sec]!.top, spans[k]!.b, c.cover, sa.stirrups.dia).fits && faceLayout(sa.at![sec]!.bottom, spans[k]!.b, c.cover, sa.stirrups.dia).fits));
  const verifications: CheckLine[] = [
    check('rcSheets.v.lineEnvelope', worst <= 1 + 1e-6, { clause: code.text.clause.envelope, ratio: worst }),
    check('rcSheets.v.lineBottomRun', groupsArea([a.bottom]) >= runNeed - 1e-6 && a.bottom.count >= 2, { clause: code.text.clause.bottomRun, demand: `≥ ${fmt(runNeed)} cm²`, capacity: `${fmt(groupsArea([a.bottom]))} cm²`, ratio: runNeed / Math.max(1e-9, groupsArea([a.bottom])) }),
    ...(perimeter ? [check('rcSheets.v.lineIntegrity', groupsArea([a.top]) >= integrityTop - 1e-6 && a.top.count >= 2 && a.bottom.count >= 2, { clause: code.text.clause.integrity, demand: `↑ ≥ ${fmt(integrityTop)} cm²`, capacity: `${fmt(groupsArea([a.top]))} cm²` })] : []),
    ...(worstPi ? [check('rcSheets.v.lineInflectionLd', worstPi.ld <= worstPi.reach + 1e-6, { clause: code.text.clause.inflection, demand: `ld Ø${a.bottom.dia} = ${fmt(worstPi.ld * 100, 0)} cm`, capacity: `Mn/Vu + ℓa = ${fmt(worstPi.reach * 100, 0)} cm (x = ${fmt(worstPi.x)} m)`, ratio: worstPi.ld / Math.max(1e-9, worstPi.reach) })] : []),
    ...(hangers.length ? [check('rcSheets.v.lineHangers', true, { clause: '—', capacity: hangers.map((h) => `${h.end === 'start' ? '←' : '→'} Vu = ${fmt(h.vu)} kN: ${fmt(h.area)} cm² · ${h.count} × ${stirrupsLabel(h.stirrups).replace(/ c\/\d+$/, '')}`).join(' · ') })] : []),
    check('rcSheets.v.lineFit', fitOk, { clause: code.text.clause.fit }),
    check('rcSheets.v.lineHooks', hookOk, { clause: code.text.clause.hooks, ...(shortHook ? { demand: `${shortHook.mark} ${shortHook.end === 0 ? '←' : '→'}: ldh Ø${shortHook.dia} = ${fmt(shortHook.ldh * 100, 0)} cm > ${fmt(Math.max(0, shortHook.room) * 100, 0)} cm` } : {}), capacity: anchorage.map((x) => `Ø${x.dia}: ldh ${fmt(x.ldh * 100, 0)} cm`).join(' · ') }),
    ...(worstShear ? [check('rcSheets.v.lineShear', ratioOf(worstShear.v, worstShear.phiVn) <= 1 + 1e-6, { clause: code.text.clause.shear, demand: `${fmt(worstShear.v)} kN (x = ${fmt(worstShear.x)} m)`, capacity: `${fmt(worstShear.phiVn)} kN`, ratio: ratioOf(worstShear.v, worstShear.phiVn) })] : []),
    ...(endAnchors.length ? [((worstEnd) => check('rcSheets.v.lineEndAnchor', endAnchors.every((x) => x.ldh <= x.room + 1e-6), {
      clause: c.seismic && code.jointHooked ? code.text.clause.jointHooks ?? code.text.clause.hooks : !code.alongBar && endAnchors.some((x) => x.along) && code.alongFallback ? code.alongFallback.clause : code.text.clause.hooks,
      demand: `${worstEnd.along && !code.alongBar ? 'ld' : 'ldh'} Ø${worstEnd.dia} = ${fmt(worstEnd.ldh * 100, 0)} cm`,
      capacity: worstEnd.along ? `${fmt(worstEnd.room * 100, 0)} cm (↓ ${fmt(worstEnd.along.tail * 100, 0)} cm)` : `${fmt(worstEnd.room * 100, 0)} cm`, ratio: worstEnd.ldh / Math.max(1e-6, worstEnd.room),
    }))(endAnchors.reduce((w, x) => (x.ldh / x.room > w.ldh / w.room ? x : w)))] : []),
    ...(lastMisfits.length ? [((w) => check('rcSheets.v.lineHookFit', false, {
      clause: code.text.clause.hooks, demand: `${w.mark}: Ø${w.dia} ${fmt(w.leg * 100, 0)} cm`, capacity: `${fmt(w.room * 100, 0)} cm · h ≥ ${fmt(Math.ceil(w.depth * 100 - 1e-9), 0)} cm`, ratio: w.leg / Math.max(1e-6, w.room),
    }))(lastMisfits.reduce((w, x) => (x.leg / x.room > w.leg / w.room ? x : w)))] : []),
    ...(splices.length || lastOverStock.length ? [check('rcSheets.v.lineSplices', !lastOverStock.length, { clause: code.text.clause.splices, ...(lastOverStock.length ? { demand: lastOverStock.map((x) => `${x.mark}: ${fmt(x.length)} m > ${fmt(STOCK_LENGTH, 0)} m`).join(' · ') } : {}), capacity: splices.map((sp) => `${sp.mark} ${sp.bars}× ${sp.face === 'top' ? '↑' : '↓'} x = ${fmt(sp.x)} m, ${fmt(sp.length * 100, 0)} cm (${sp.spliceClass})`).join(' · ') || '—' })] : []),
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
      steps: [
        ...anchorage.map((x) => ({ label: 'rcSheets.s.ldRow', formula: `Ø${x.dia}`, value: `ld = ${fmt(x.ld * 100, 0)} · ld,top = ${fmt(x.ldTop * 100, 0)} · ldh = ${fmt(x.ldh * 100, 0)} · ls,B = ${fmt(x.lap * 100, 0)} cm` })),
        ...lastStraight.map((x) => ({ label: 'rcSheets.s.lineStraightEnd', formula: `${x.mark} ${x.end === 0 ? '←' : '→'}: ld = ${fmt(x.ld * 100, 0)} cm ≤ ${fmt(code.straightAtSupport!.factor)}·Mn/Vu + ℓa = ${fmt(Math.min(x.reach, 99.99) * 100, 0)} cm; ℓa = ${fmt(x.la * 100, 0)} cm`, value: code.text.clause.straightEnd ?? '', ok: true })),
        ...bars.flatMap((b) => ([0, 1] as const).filter((i) => b.hook180?.[i]).map((i) => ({ label: 'rcSheets.s.lineHook180', formula: `${b.mark} ${i === 0 ? '←' : '→'}: ${b.bars.count} Ø${b.bars.dia} · 180° · ${fmt(code.hook180Extension!(b.bars.dia) * 100, 0)} cm`, value: code.text.clause.hook180 ?? '' }))),
      ],
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
    ends: { from: Math.min(xFrom, ...bars.map((b) => b.from)), to: Math.max(xTo, ...bars.map((b) => b.to)), ...(endStart ? { start: endStart } : {}), ...(endEnd ? { end: endEnd } : {}) },
    spanAdopted, verifications, bentNotes: adopted ? adoptedBentNotes() : bentNotes, utilization: worst, status: ok ? (isGenerous(verifications) ? 'warn' : 'ok') : 'fail', steps,
  };
}

/** A line's row: failing when it or a span fails, generous when every check of the line and its spans has room to spare. */
export function lineRowStatus(line: Pick<LineLayout, 'status' | 'verifications'>, spans: ReadonlyArray<Pick<BeamRow, 'status' | 'verifications'>>): 'ok' | 'warn' | 'fail' {
  if (line.status === 'fail' || spans.some((r) => r.status === 'fail')) return 'fail';
  return governingRatio([...line.verifications, ...spans.flatMap((r) => r.verifications)]) < GENEROUS_BELOW ? 'warn' : 'ok';
}
