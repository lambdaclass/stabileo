import { checkFlexure, checkShear, checkTorsion, type ConcreteDesignParams } from '../engine/codes/argentina/cirsoc201';
import { evaluateBeamSections, type BeamSectionAnswer, type BeamSectionQuery } from '../engine/codes/argentina/cirsoc201-beam-kernel';
import { beta1, ductilityStrain, phiFromStrain, shearFy, shearSqrtFc, tensionControlledStrain } from '../engine/codes/argentina/cirsoc201-basis';
import { crackControlFaceSpacing } from '../engine/design/crack-spacing';
import { checkTorsion2025 } from '../codes/cirsoc201/torsion';
import { ConcurrentDemand } from '../engine/concurrent-demand';
import { transverseSpacingLimits } from '../codes/cirsoc201/transverse-spacing';
import { proposeSkin } from '../codes/cirsoc201/skin';
import { mainBarCoverMm } from '../codes/cirsoc201/cover';
import { barArea, faceBars, faceLayout, groupsArea, groupsLabel, moreStirrup, proposeBeamFace, proposeStirrups, roundDown, stirrupsLabel } from './bars';
import type { Fmt } from './format';
import { beamSeismic, faceRule, seismicBeamDiameters, type Seismic } from './seismic';
import { CRITERION, critOf, withCriterion, type Criteria } from './criteria';
import { BEAM_BAR_RANGE, check, inRange, listIn, nextTie, ratioOf, tieFloorOf, type TransverseList, type BarGroup, type BeamAdopted, type CheckLine, type ComboTable, type Materials, type MeshBars, type RowStatus, type Signed, type Step, type StepGroup, type Stirrups, type TorsionMode, isGenerous } from './types';

const EDITION = '2025' as const;
const PHI_V = 0.75;
const MAX_ITERATIONS = 12;
/** The factor the compression steel a doubly reinforced section asks is raised by before bars are chosen (FIUBA §8.9). */
export const compressionMargin = (c: { criteria?: Criteria }): number => 1 + critOf(c).beamCompressionMargin;
/** How many pairs of faces `searchFaces` tries, the lightest first. */
const SEARCH_PAIRS = 600;

const shearTorsion = (vu: number, tu: number) => ConcurrentDemand.fromStations({ elementId: 0, length: 1, stationTs: [0], comboResults: [{
  comboId: 0, comboName: '', stations: [{ t: 0, x: 0, n: 0, my: 0, mz: 0, vy: vu, vz: 0, torsion: tu }],
}] })[0]!.section('Mz');

export type SectionName = 'start' | 'span' | 'end';
export const SECTION_NAMES: readonly SectionName[] = ['start', 'span', 'end'];

/** The envelope at one section: the largest sagging and hogging moment, kN·m, each with its combination and its axial force (kN, + compression). */
export interface SectionEnv { x: number; pos: Signed; neg: Signed; nPos: number; nNeg: number }

/** One combination on a span: signed moments at the three sections, its own peaks anywhere, and V and T peaks. */
export interface BeamComboForces {
  combo: string;
  seismic?: boolean;
  mStart: number; mSpan: number; mEnd: number;
  mPos: number; mNeg: number;
  /** Where along the span those peaks act, m. */
  xPos?: number; xNeg?: number;
  nStart: number; nSpan: number; nEnd: number;
  v: number; nV: number; t: number;
}

export interface BeamDemand {
  key: string;
  name: string;
  level?: string;
  /** m. */
  length: number; b: number; h: number;
  start: SectionEnv; span: SectionEnv; end: SectionEnv;
  /** The largest hogging moment anywhere along the span. */
  negAny: Signed; nNegAny: number;
  vu: Signed; nAtV: number;
  tu: Signed;
  combos: BeamComboForces[];
  /** Taken at the support faces: their distance from the axes and where shear is read, m. */
  faces?: { start: number; end: number; shearAt: number };
  /** The slab as a compression flange for sagging (Table 6.3.2.1), m. */
  flange?: { bf: number; hf: number };
  /** The physical beam this span belongs to and its place in it. */
  line?: { group: number; index: number; spans: number; startNode: number; endNode: number; lineName: string };
  /** Envelope along the span over all combinations: largest sagging, hogging (kN·m) and shear (kN), each with its axial force (kN, + compression). */
  env?: Array<{ x: number; pos: number; neg: number; v: number; vPos?: number; vNeg?: number; t?: number; nPos?: number; nNeg?: number; nV?: number }>;
  /** Half the support's extent along the beam at each end, m. */
  supportHalf?: { start: number; end: number };
  /** What holds each end of the span: a column or wall, a support alone, a beam it frames into, or nothing (a cantilever's tip). */
  ends?: { start: BeamEnd; end: BeamEnd };
  posts?: { start?: SupportPost; end?: SupportPost };
  /** Slab on one side of it at most: an edge beam, held to the integrity rules of perimeter beams (§9.7.7.1); absent, taken as one. */
  perimeter?: boolean;
  /** The combinations whose results lack a force of this span: its demand is incomplete. */
  missing?: string[];
}

export interface SupportPost { name: string; b: number; h: number }

export interface BeamEnd { kind: 'column' | 'support' | 'beam' | 'free'; /** Half the holding member's extent along the beam, m: at a support with none of its own, the beam crossing it there. */ half: number; /** A column that stops at the joint: a frame corner, where the bars turn round it. */ corner?: boolean }

export interface BeamContext extends TransverseList {
  mat: Materials;
  /** m, clear cover to the stirrup. */
  cover: number;
  /** mm, the stirrup the depth arithmetic assumes. */
  stirrupDia: number;
  diameters: readonly number[];
  torsion: TorsionMode;
  /** Special moment frame provisions (chapter 18), with the project's λo. */
  seismic?: Seismic;
  /** Span bars bent up over the supports, where a continuous beam's run is laid out. */
  bentBars?: boolean;
  /** Check the main bars' cover of CIRSOC 201 Table 20.5.1.3.1, under execution control or not. */
  coverTable?: { control: boolean };
  /** The Stabileo criteria where the code leaves room (FIUBA §8.1, §9.5, §9.6): the largest stirrup spacing where shear needs them, four legs in a wide web, hangers a share of the bottom bars' diameter, the most stirrup diameters along a beam. */
  course?: true;
  /** The Stabileo criteria in force; absent, their defaults. */
  criteria?: Criteria;
}

/** `nc`: the axial force with the moment, kN, + compression; a section with none of either asks nothing. */
export interface FlexureCheck { section: SectionName; sign: 'pos' | 'neg'; phiMn: number; mu: number; nc?: number; epsT: number; epsTMin: number; d: number; ok: boolean; ductile: boolean }

/** A section with axial force and no moment: its check, failing where the bars and concrete cannot take the force at all. */
export const axialOnlyChecks = (flex: readonly FlexureCheck[], clause: string, fmt: Fmt): CheckLine[] =>
  flex.filter((x) => !(x.mu > 1e-6) && Math.abs(x.nc ?? 0) > 1e-6).reduce<FlexureCheck[]>((w, x) => (w.some((y) => y.section === x.section) ? w : [...w, x]), [])
    .map((x) => check('rcSheets.v.axialOnly', x.ok, { clause, demand: `N = ${fmt(x.nc ?? 0)} kN (${x.section})` }));

export interface BeamRow {
  family: 'beam';
  key: string; name: string; level?: string;
  b: number; h: number; length: number;
  demand: BeamDemand;
  req: {
    bottom: number; top: number; bottomAt: SectionName; topAt: SectionName;
    /** cm²/m per stirrup leg, shear and torsion together. */
    stirrupPerLeg: number; legs: number; sMax: number;
    al: number; torsionNeglected: boolean; tuDesign: number;
    /** The torsion below which it may be neglected, kN·m, where the code gives one to read station by station. */
    tuNeglect?: number;
    skin: MeshBars | null;
    /** The compression steel the doubly reinforced sections ask of each face, cm², already raised by the margin bars are chosen with; absent where none is. */
    compression?: { top: number; bottom: number };
    /** What each section asks of its tension face, cm². */
    bySection: Array<{ section: SectionName; sign: 'pos' | 'neg'; req: number }>;
  };
  proposed: BeamAdopted;
  adopted: BeamAdopted;
  isAdopted: boolean;
  /** Rounds the proposal took to verify, 0 for bars a person adopted. */
  iterations: number;
  flexure: FlexureCheck[];
  verifications: CheckLine[];
  combos: ComboTable;
  status: RowStatus;
  /** Adopted steel more than 1,2 times what is needed somewhere: the sheets' «VER». */
  generous: boolean;
  steps: StepGroup[];
  /** The proposal took more steel than its strength asks, for its deflection. */
  byDeflection?: true;
}

const paramsOf = (d: BeamDemand, c: BeamContext, stirrupDia = c.stirrupDia): ConcreteDesignParams =>
  ({ fc: c.mat.fc, fy: c.mat.fy, cover: c.cover, b: d.b, h: d.h, stirrupDia });

const hoopPerimeter = (d: BeamDemand, c: BeamContext, sd: number) => 2 * ((d.b - 2 * c.cover - sd / 1000) + (d.h - 2 * c.cover - sd / 1000));

const sectionOf = (d: Pick<BeamDemand, 'start' | 'span' | 'end'>, s: SectionName) => (s === 'start' ? d.start : s === 'span' ? d.span : d.end);

/** The kernel query for one section: `tension` bars against the moment, `compression` on the other face; the flange counts only when sagging. */
export function sectionQuery(c: BeamContext, d: { b: number; h: number; flange?: { bf: number; hf: number } }, tension: BarGroup[], compression: BarGroup[], stirrupDia: number, nc = 0, shear?: Stirrups, sagging = false): BeamSectionQuery {
  const t = faceLayout(tension, d.b, c.cover, stirrupDia);
  const k = faceLayout(compression, d.b, c.cover, stirrupDia);
  return {
    edition: EDITION, fc: c.mat.fc * 1e6, fy: c.mat.fy * 1e6, b: d.b, h: d.h, d: d.h - t.centroidFromFace,
    As: groupsArea(tension) * 1e-4, AsComp: groupsArea(compression) * 1e-4, dPrime: k.centroidFromFace,
    Ag: d.b * d.h, NuCompression: nc * 1e3,
    ...(shear ? { Av: shear.legs * barArea(shear.dia) * 1e-4, s: shear.spacing, fyt: shearFy(c.mat.fy) * 1e6 } : {}),
    ...(sagging && d.flange ? { bf: d.flange.bf, hf: d.flange.hf } : {}),
  };
}

/** φMn of a kernel answer, kN·m; 0 where the section gave none. */
export const phiMnOf = (r: BeamSectionAnswer | undefined): number =>
  (r && r.flexureValid && Number.isFinite(r.phiMn) ? r.phiMn / 1e3 : 0);

const barsAt = (a: BeamAdopted, s: SectionName) => a.at?.[s] ?? { top: a.top, bottom: a.bottom };

/** The section nearest to where a combination's peak moment acts, whose bars carry it; null where the demand does not say where. */
export function peakSection(d: Pick<BeamDemand, 'start' | 'span' | 'end'>, x: number | undefined): SectionName | null {
  if (x === undefined) return null;
  return SECTION_NAMES.reduce((w, s) => (Math.abs(sectionOf(d, s).x - x) < Math.abs(sectionOf(d, w).x - x) ? s : w));
}

function flexChecks(c: BeamContext, d: BeamDemand, a: BeamAdopted): FlexureCheck[] {
  const sd = a.stirrups.dia;
  const items: Array<{ section: SectionName; sign: 'pos' | 'neg'; mu: number; nc: number }> = [];
  for (const s of SECTION_NAMES) {
    const e = sectionOf(d, s);
    items.push({ section: s, sign: 'pos', mu: e.pos.value, nc: e.nPos }, { section: s, sign: 'neg', mu: e.neg.value, nc: e.nNeg });
  }
  if (d.negAny.value > Math.max(d.start.neg.value, d.span.neg.value, d.end.neg.value) + 1e-6) items.push({ section: peakSection(d, d.negAny.source?.x) ?? 'span', sign: 'neg', mu: d.negAny.value, nc: d.nNegAny });
  const answers = evaluateBeamSections(items.map((i) => { const g = barsAt(a, i.section); return i.sign === 'pos' ? sectionQuery(c, d, g.bottom, g.top, sd, i.nc, undefined, true) : sectionQuery(c, d, g.top, g.bottom, sd, i.nc); })) ?? [];
  return items.map((i, k) => {
    const r = answers[k];
    const phiMn = phiMnOf(r);
    const epsT = r?.epsilonT ?? 0, epsTMin = r?.epsilonTMin ?? 0;
    const ductile = !(i.mu > 1e-6) || epsT >= epsTMin - 1e-9;
    const depth = d.h - faceLayout(i.sign === 'pos' ? barsAt(a, i.section).bottom : barsAt(a, i.section).top, d.b, c.cover, sd).centroidFromFace;
    const active = i.mu > 1e-6 || Math.abs(i.nc) > 1e-6;
    return { ...i, phiMn, epsT, epsTMin, d: depth, ductile, ok: !active || (!!r?.flexureValid && phiMn >= i.mu - 1e-6 && ductile) };
  });
}

/** What torsion asks with a stirrup of `sd` mm: the hoop's size sets Aoh, ph and the depth. */
interface TorsionReq { tor0: ReturnType<typeof checkTorsion>; tor: ReturnType<typeof checkTorsion>; tuDesign: number; atOverS: number; al: number; alMin: number; transverseMin: number; torSection: boolean; sMax: number }

interface Requirement { bottom: number; top: number; neglect: boolean; torsion: (sd: number) => TorsionReq; bySection: Array<{ section: SectionName; sign: 'pos' | 'neg'; req: number }> }

interface Evaluation {
  flex: FlexureCheck[];
  fitBottom: boolean; fitTop: boolean;
  areaBottom: boolean; areaTop: boolean;
  crackBottom: { s: number; max: number; ok: boolean }; crackTop: { s: number; max: number; ok: boolean };
  shear: ReturnType<typeof checkShear>;
  perLegProvided: number; perLegRequired: number; transverseMin: number; transverseProvided: number;
  alProvided: number; alSpacing: number; alDiaMin: number;
  ok: { stirrups: boolean; transverseMin: boolean; al: boolean; alSpacing: boolean; alDia: boolean; torsionSection: boolean };
  all: boolean;
}

function evaluate(d: BeamDemand, c: BeamContext, a: BeamAdopted, req: Requirement): Evaluation {
  const sd = a.stirrups.dia;
  const flex = flexChecks(c, d, a);
  const fits = (face: 'top' | 'bottom') => SECTION_NAMES.every((s) => faceLayout(barsAt(a, s)[face], d.b, c.cover, sd).fits);
  const fb = { fits: fits('bottom') }, ft = { fits: fits('top') };
  const crack = (groups: BarGroup[], used: boolean) => {
    const first = groups.find((x) => x.count > 0) ?? { count: 0, dia: 10 };
    const f = crackControlFaceSpacing(EDITION, [{ count: Math.max(1, first.count), diameter: first.dia, row: 0 }], d.b, c.cover, sd, c.mat.fy)!;
    return { s: f.spacing, max: f.limit.maxSpacing, ok: !used || f.ok };
  };
  const hogUsed = req.top > 0;
  const shear = checkShear(paramsOf(d, c, sd), d.vu.value, d.nAtV, { edition: EDITION, AsTensionCm2: groupsArea(a.bottom), spacing: a.stirrups.spacing, legs: a.stirrups.legs });
  const ab = barArea(sd);
  const perLegProvided = a.stirrups.spacing > 0 ? ab / a.stirrups.spacing : 0;
  const legs = Math.max(1, a.stirrups.legs);
  const t = req.torsion(sd);
  const perLegRequired = Math.max(shear.AvOverSReq ?? 0, shear.AvOverSMin) / legs + (req.neglect ? 0 : t.atOverS);
  const transverseMin = req.neglect ? 0 : t.transverseMin;
  const transverseProvided = a.stirrups.spacing > 0 ? legs * ab / a.stirrups.spacing : 0;
  const al = a.torsionLong;
  const alProvided = al ? al.count * barArea(al.dia) : 0;
  const ph = hoopPerimeter(d, c, sd);
  const alSpacing = al && al.count > 0 ? ph / al.count : Infinity;
  const alDiaMin = Math.max(0.042 * a.stirrups.spacing * 1000, 10);
  const ok = {
    stirrups: perLegProvided >= perLegRequired - 1e-6,
    transverseMin: req.neglect || transverseProvided >= transverseMin - 1e-6,
    al: req.neglect || alProvided >= Math.max(t.al, t.alMin) - 1e-6,
    alSpacing: req.neglect || alSpacing <= 0.3 + 1e-6,
    alDia: req.neglect || (!!al && al.dia >= alDiaMin - 1e-6),
    torsionSection: req.neglect || t.torSection,
  };
  const worstCrack = (face: 'top' | 'bottom', used: boolean) => SECTION_NAMES.map((s) => crack(barsAt(a, s)[face], used)).reduce((w, x) => (x.s > w.s ? x : w));
  const sagUsed = Math.max(d.start.pos.value, d.span.pos.value, d.end.pos.value, ...(d.env ?? []).map((e) => e.pos)) > 1e-6;
  const crackBottom = worstCrack('bottom', sagUsed), crackTop = worstCrack('top', hogUsed);
  const areaOk = (sign: 'pos' | 'neg') => req.bySection.filter((x) => x.sign === sign).every((x) => groupsArea(barsAt(a, x.section)[sign === 'pos' ? 'bottom' : 'top']) >= x.req - 1e-6);
  const areaBottom = areaOk('pos'), areaTop = areaOk('neg');
  const all = flex.every((f) => f.ok) && fb.fits && ft.fits && areaBottom && areaTop && crackBottom.ok && crackTop.ok
    && shear.status !== 'fail' && Object.values(ok).every(Boolean);
  return { flex, fitBottom: fb.fits, fitTop: ft.fits, areaBottom, areaTop, crackBottom, crackTop, shear, perLegProvided, perLegRequired, transverseMin, transverseProvided, alProvided, alSpacing, alDiaMin, ok, all };
}

/** The section that asks the most of a face's steel against the bars it holds there, with both, cm²: a line's span holds its support bars only at its ends. */
function areaAt(a: BeamAdopted, req: Pick<Requirement, 'bySection'>, sign: 'pos' | 'neg', fallback: number): { req: number; area: number } {
  const face = sign === 'pos' ? 'bottom' : 'top';
  const at = req.bySection.filter((x) => x.sign === sign).map((x) => ({ req: x.req, area: groupsArea(barsAt(a, x.section)[face]) }));
  return at.reduce((w, x) => (ratioOf(x.req, x.area) > ratioOf(w.req, w.area) ? x : w), at[0] ?? { req: fallback, area: groupsArea(a[face]) });
}

const LONG = (c: BeamContext) => c.diameters.filter((x) => inRange(x, BEAM_BAR_RANGE));

function bumpFace(groups: BarGroup[], d: BeamDemand, c: BeamContext, sd: number): BarGroup[] {
  const cur = groups.find((g) => g.count > 0)?.dia ?? 16;
  return proposeBeamFace(groupsArea(groups) + barArea(cur) * 0.999, d.b, d.h, c.cover, sd, LONG(c));
}

function finerFace(groups: BarGroup[], d: BeamDemand, c: BeamContext, sd: number): BarGroup[] {
  const cur = groups.find((g) => g.count > 0)?.dia ?? 16;
  const pool = LONG(c).filter((x) => x < cur);
  return proposeBeamFace(groupsArea(groups), d.b, d.h, c.cover, sd, pool.length ? pool : LONG(c));
}

/** Vs beyond 0.66·√f'c·bw·d (§22.5.1.2): no stirrup helps, only a larger section. */
const shearCapped = (vs: number, b: number, d: number, fc: number) => vs > 0.66 * shearSqrtFc(fc) * b * d * 1000 + 1e-6;

/** Two legs more still each hold a bar of the outer bottom layer. */
const moreLegsHold = (a: BeamAdopted) => a.stirrups.legs + 2 <= Math.max(2, a.bottom[0]?.count ?? 0);

function improve(a: BeamAdopted, e: Evaluation, d: BeamDemand, c: BeamContext, ph: number): BeamAdopted {
  const sd = a.stirrups.dia;
  const next: BeamAdopted = JSON.parse(JSON.stringify(a));
  const pos = e.flex.filter((f) => f.sign === 'pos' && !f.ok), neg = e.flex.filter((f) => f.sign === 'neg' && !f.ok);
  if (pos.some((f) => !f.ductile)) next.top = bumpFace(next.top, d, c, sd);
  else if (pos.length || !e.areaBottom) next.bottom = bumpFace(next.bottom, d, c, sd);
  if (neg.some((f) => !f.ductile)) next.bottom = bumpFace(next.bottom, d, c, sd);
  else if (neg.length || !e.areaTop) next.top = bumpFace(next.top, d, c, sd);
  if (!e.crackBottom.ok) next.bottom = finerFace(next.bottom, d, c, sd);
  else if (!e.fitBottom) next.bottom = proposeBeamFace(groupsArea(next.bottom), d.b, d.h, c.cover, sd, LONG(c));
  if (!e.crackTop.ok) next.top = finerFace(next.top, d, c, sd);
  else if (!e.fitTop) next.top = proposeBeamFace(groupsArea(next.top), d.b, d.h, c.cover, sd, LONG(c));
  if ((e.shear.status === 'fail' && !shearCapped(e.shear.Vs, d.b, e.shear.d, c.mat.fc)) || !e.ok.stirrups || !e.ok.transverseMin) {
    const more = moreStirrup(next.stirrups, c, 0.15);
    if (more) next.stirrups = more;
    else if (moreLegsHold(next)) next.stirrups.legs += 2;
  }
  if (!e.ok.al || !e.ok.alSpacing || !e.ok.alDia) {
    const al = next.torsionLong ?? { count: 4, dia: 10 };
    const count = Math.max(4, al.count, 2 * Math.ceil(ph / 0.3 / 2));
    let dia = Math.max(al.dia, e.alDiaMin);
    if (!e.ok.al && count === al.count && dia <= al.dia) dia = al.dia + 1;
    next.torsionLong = { count, dia: torsionBar(c, dia) };
  }
  return next;
}

function improveSeismic(a: BeamAdopted, s: NonNullable<ReturnType<typeof beamSeismic>>, d: BeamDemand, c: BeamContext): BeamAdopted {
  const next: BeamAdopted = JSON.parse(JSON.stringify(a));
  const bad = (label: string) => s.checks.some((k) => k.label === label && !k.ok);
  if (bad('rcSheets.v.seisBeamHoops') || bad('rcSheets.v.seisBeamVe')) {
    const target = Math.max(tieFloorOf(c), roundDown(Math.min(next.stirrups.spacing - 0.025, s.sZone)));
    const thicker = nextTie(c, next.stirrups.dia);
    if (target < next.stirrups.spacing - 1e-9) next.stirrups.spacing = target;
    else if (thicker) next.stirrups = { ...next.stirrups, dia: thicker };
    else if (!s.veCapped && moreLegsHold(next)) next.stirrups.legs += 2;
  }
  if (bad('rcSheets.v.seisBeamHalf') || bad('rcSheets.v.seisBeamQuarter')) {
    const more = faceRule(barsAt(a, 'start'), barsAt(a, 'span'), barsAt(a, 'end')).more;
    if (more.bottom > 1e-6) next.bottom = bumpFace(next.bottom, d, c, next.stirrups.dia);
    if (more.top > 1e-6) next.top = bumpFace(next.top, d, c, next.stirrups.dia);
  }
  return next;
}

/**
 * Bottom and top bars that carry every section's moment ductile, where raising one face at a time
 * does not get there (a doubly reinforced section whose bars took a second layer): each face one
 * diameter or two consecutive ones (FIUBA §8.1), laid out in at most two layers, from what the
 * sections ask up to three times as much; the lightest pairs first, up to `SEARCH_PAIRS` of them.
 * Null when none does.
 */
export function searchFaces(a: BeamAdopted, bottom: number, top: number, d: Pick<BeamDemand, 'b' | 'h'>, c: BeamContext, ok: (x: BeamAdopted) => boolean): BeamAdopted | null {
  const sd = a.stirrups.dia;
  const dias = LONG(c).sort((p, q) => p - q);
  const inTwo = (g: BarGroup[]) => faceLayout(g, d.b, c.cover, sd).fits && new Set(faceBars(g, d.b, c.cover, sd).map((x) => x.row)).size <= 2;
  const hanger = groupsArea([{ count: 2, dia: hangerBar(c) }]);
  const faces = (need: number): BarGroup[][] => {
    const lo = Math.max(need, hanger), hi = 3 * lo;
    const out: BarGroup[][] = [];
    for (const [i, big] of dias.entries()) {
      for (let n = 2; n <= 12; n++) {
        const g = [{ count: n, dia: big }];
        if (groupsArea(g) >= lo - 1e-9 && groupsArea(g) <= hi) out.push(g);
        const small = dias[i - 1];
        if (small !== undefined) for (let m = 1; m <= 6; m++) {
          const mix = [{ count: n, dia: big }, { count: m, dia: small }];
          if (groupsArea(mix) >= lo - 1e-9 && groupsArea(mix) <= hi) out.push(mix);
        }
      }
    }
    return out.filter(inTwo);
  };
  const bs = faces(bottom), ts = faces(top);
  const pairs = bs.flatMap((b) => ts.map((t) => ({ b, t, area: groupsArea(b) + groupsArea(t) }))).sort((x, y) => x.area - y.area);
  for (const x of pairs.slice(0, SEARCH_PAIRS)) {
    const next: BeamAdopted = { ...a, bottom: x.b, top: x.t };
    if (ok(next)) return next;
  }
  return null;
}

/** The context a beam is designed in: under chapter 18 only bars whose 6·db leaves room for hoops at the project's floor (`seismicBeamDiameters`). */
export const beamContext = (c: BeamContext): BeamContext => (c.seismic ? { ...c, diameters: seismicBeamDiameters(c.diameters, tieFloorOf(c)) } : c);

export function beamRow(d: BeamDemand, given: BeamContext, adopted: BeamAdopted | undefined, fmt: Fmt): BeamRow {
  const c = beamContext(given);
  const p = paramsOf(d, c);
  const fc = c.mat.fc, fy = c.mat.fy;

  const flexReq = (mu: number, nc: number, sagging = false) => checkFlexure(p, mu, nc, { edition: EDITION, minimumExemption: true, ...(sagging && d.flange ? { flange: d.flange } : {}) });
  const posReq = SECTION_NAMES.map((s) => ({ s, r: flexReq(sectionOf(d, s).pos.value, sectionOf(d, s).nPos, true), env: sectionOf(d, s).pos, n: sectionOf(d, s).nPos }));
  const negList = SECTION_NAMES.map((s) => ({ s, r: flexReq(sectionOf(d, s).neg.value, sectionOf(d, s).nNeg), env: sectionOf(d, s).neg, n: sectionOf(d, s).nNeg }));
  if (d.negAny.value > Math.max(...negList.map((x) => x.env.value)) + 1e-6) negList.push({ s: peakSection(d, d.negAny.source?.x) ?? 'span', r: flexReq(d.negAny.value, d.nNegAny), env: d.negAny, n: d.nNegAny });
  const heavier = <T extends { r: { AsReq: number }; env: Signed }>(a: T, b: T) => (b.r.AsReq > a.r.AsReq + 1e-9 || (Math.abs(b.r.AsReq - a.r.AsReq) <= 1e-9 && b.env.value > a.env.value) ? b : a);
  const gPos = posReq.reduce(heavier);
  const hogging = negList.filter((x) => x.env.value > 1e-6);
  const gNeg = (hogging.length ? hogging : negList).reduce(heavier);
  const bottomReq = gPos.r.AsReq;
  const topReq = hogging.length ? gNeg.r.AsReq : 0;

  const shear = checkShear(p, d.vu.value, d.nAtV, { edition: EDITION, AsTensionCm2: bottomReq });
  const cr = critOf(c);
  const courseCap = c.course && shear.Vs > 1e-6 ? cr.beamStirrupSpacing : Infinity;
  const torsionCache = new Map<number, TorsionReq>();
  const torsionAt = (sd: number): TorsionReq => {
    const hit = torsionCache.get(sd);
    if (hit) return hit;
    const pp = paramsOf(d, c, sd);
    const t0 = checkTorsion(pp, shearTorsion(d.vu.value, d.tu.value), EDITION);
    const tuD = !t0.neglect && c.torsion === 'compatibility' ? Math.min(d.tu.value, PHI_V * t0.Tcr) : d.tu.value;
    const t = tuD === d.tu.value ? t0 : checkTorsion(pp, shearTorsion(d.vu.value, tuD), EDITION);
    const dd = checkShear(pp, d.vu.value, d.nAtV, { edition: EDITION, AsTensionCm2: bottomReq }).d;
    const t25 = (Tu: number) => checkTorsion2025({ b: d.b, h: d.h, d: dd, dSecondary: d.b - c.cover - sd / 1000 - 0.008, cover: c.cover, stirrupDiaMm: sd, fc, fy, fyt: fy, demand: shearTorsion(0, Tu) });
    const tt = t25(tuD);
    const lim = transverseSpacingLimits(EDITION, { VsRequired: shear.Vs, bw: d.b, d: dd, fc, cover: c.cover, stirrupDiaMm: sd });
    const r: TorsionReq = {
      tor0: t0, tor: t, tuDesign: tuD, atOverS: t.neglect ? 0 : t.AtOverS, al: t.neglect ? 0 : t.AlReq, alMin: t.neglect ? 0 : tt.AlMin * 1e4,
      transverseMin: t25(0).transverseRequired * 1e4, torSection: t.status !== 'fail', sMax: Math.min(lim.alongMax, t.neglect ? Infinity : tt.sMax, courseCap),
    };
    torsionCache.set(sd, r);
    return r;
  };
  const { tor0, tor, tuDesign } = torsionAt(c.stirrupDia);
  const limits = transverseSpacingLimits(EDITION, { VsRequired: shear.Vs, bw: d.b, d: shear.d, fc, cover: c.cover, stirrupDiaMm: c.stirrupDia });
  const legs = Math.max(2, shear.stirrupLegs, limits.requiredLegs, c.course && d.b > cr.beamFourLegsWidth + 1e-9 ? 4 : 2);
  const ph = hoopPerimeter(d, c, c.stirrupDia);
  const perLeg = Math.max(shear.AvOverSReq ?? 0, shear.AvOverSMin) / legs + torsionAt(c.stirrupDia).atOverS;
  const sMax = torsionAt(c.stirrupDia).sMax;
  const skin = proposeSkin(EDITION, d.h, fy, c.cover, c.stirrupDia);
  const bySection = [
    ...posReq.filter((x) => x.env.value > 1e-6 || x.s === 'span').map((x) => ({ section: x.s, sign: 'pos' as const, req: x.r.AsReq })),
    ...negList.filter((x) => x.env.value > 1e-6).map((x) => ({ section: x.s, sign: 'neg' as const, req: x.r.AsReq })),
  ];
  const req: Requirement = { bottom: bottomReq, top: topReq, neglect: tor.neglect, torsion: torsionAt, bySection };

  const compression = (list: Array<{ r: { isDoublyReinforced: boolean; AsCompReq?: number }; env: Signed }>) =>
    compressionMargin(c) * Math.max(0, ...list.filter((x) => x.env.value > 1e-6 && x.r.isDoublyReinforced).map((x) => x.r.AsCompReq ?? 0));
  const compTop = compression(posReq), compBottom = compression(negList);
  const bottom0 = proposeBeamFace(Math.max(bottomReq, compBottom), d.b, d.h, c.cover, c.stirrupDia, c.diameters);
  const hanger = c.course ? torsionBar(c, Math.max(10, c.stirrupDia, Math.ceil(Math.max(...bottom0.map((g) => g.dia)) * cr.beamHangerShare))) : hangerBar(c);
  const initial: BeamAdopted = {
    bottom: bottom0,
    top: topReq > 0 || compTop > 0 ? proposeBeamFace(Math.max(topReq, compTop), d.b, d.h, c.cover, c.stirrupDia, c.diameters) : [{ count: 2, dia: hanger }],
    stirrups: proposeStirrups(perLeg, legs, roundDown(sMax), c),
    ...(tor.neglect ? {} : { torsionLong: { count: Math.max(4, 2 * Math.ceil(ph / 0.3 / 2)), dia: torsionBar(c, 10) } }),
  };
  const seisOf = (x: BeamAdopted) => (c.seismic ? beamSeismic(d, { ...c, overstrength: c.seismic.overstrength }, x, (sec) => barsAt(x, sec), fmt) : null);
  let proposed = initial, iterations = 0;
  let ev = evaluate(d, c, proposed, req);
  let seis = seisOf(proposed);
  const holds = () => ev.all && (!seis || seis.checks.every((k) => k.ok));
  const loop = () => {
    for (let k = 0; !holds() && k < MAX_ITERATIONS; k++) {
      iterations++;
      proposed = improve(proposed, ev, d, c, ph);
      if (seis) proposed = improveSeismic(proposed, seis, d, c);
      ev = evaluate(d, c, proposed, req);
      seis = seisOf(proposed);
    }
  };
  loop();
  if (!adopted && !ev.flex.every((f) => f.ok)) {
    const faces = searchFaces(proposed, Math.max(bottomReq, compBottom), Math.max(topReq, compTop), d, c, (x) => flexChecks(c, d, x).every((f) => f.ok));
    proposed = faces ?? { ...proposed, bottom: initial.bottom, top: initial.top };
    ev = evaluate(d, c, proposed, req); seis = seisOf(proposed);
    if (faces) loop();
  }
  const a = adopted ?? proposed;
  const e = adopted ? evaluate(d, c, a, req) : ev;
  const seisA = adopted ? seisOf(a) : seis;
  const ta = torsionAt(a.stirrups.dia);
  const { al: alReq, alMin } = ta, sMaxA = ta.sMax;

  const f2 = (v: number) => fmt(v);
  const verifications: CheckLine[] = [
    ...e.flex.filter((x) => x.mu > 1e-6).map((x) => check(x.sign === 'pos' ? `rcSheets.v.flexPos.${x.section}` : `rcSheets.v.flexNeg.${x.section}`, x.ok, {
      clause: '§22.2, §21.2', demand: `${f2(x.mu)} kN·m`, capacity: `${f2(x.phiMn)} kN·m`, ratio: ratioOf(x.mu, x.phiMn),
    })),
    ...e.flex.filter((x) => x.mu > 1e-6 && !x.ductile).map((x) => check('rcSheets.v.ductility', false, { clause: '§9.3.3.1', demand: `εt = ${fmt(x.epsT * 1000)} ‰`, capacity: `≥ ${fmt(x.epsTMin * 1000)} ‰` })),
    ...axialOnlyChecks(e.flex, '§22.4, §22.2', fmt),
    ((g) => check('rcSheets.v.minBottom', e.areaBottom, { clause: '§9.6.1.2, §9.6.1.3', demand: `${f2(g.req)} cm²`, capacity: `${f2(g.area)} cm²`, ratio: ratioOf(g.req, g.area) }))(areaAt(a, req, 'pos', bottomReq)),
    ...(topReq > 0 ? [((g) => check('rcSheets.v.minTop', e.areaTop, { clause: '§9.6.1.2, §9.6.1.3', demand: `${f2(g.req)} cm²`, capacity: `${f2(g.area)} cm²`, ratio: ratioOf(g.req, g.area) }))(areaAt(a, req, 'neg', topReq))] : []),
    check('rcSheets.v.fitBottom', e.fitBottom, { clause: '§25.2.1' }),
    check('rcSheets.v.fitTop', e.fitTop, { clause: '§25.2.1' }),
    check('rcSheets.v.crack', e.crackBottom.ok && e.crackTop.ok, { clause: '§24.3.2', demand: `s = ${fmt(Math.max(e.crackBottom.s, topReq > 0 ? e.crackTop.s : 0) * 100, 1)} cm`, capacity: `≤ ${fmt(e.crackBottom.max * 100, 1)} cm` }),
    check('rcSheets.v.shear', e.shear.status !== 'fail', { clause: '§22.5', demand: `${f2(d.vu.value)} kN`, capacity: `${f2(e.shear.phiVn)} kN`, ratio: ratioOf(d.vu.value, e.shear.phiVn) }),
    check('rcSheets.v.stirrupSpacing', a.stirrups.spacing <= sMaxA + 1e-6, { clause: `${tor.neglect ? '§9.7.6.2.2' : '§9.7.6.2.2, §9.7.6.3.3'}${sMaxA >= courseCap - 1e-9 ? `; ${CRITERION}` : ''}`, demand: `${fmt(a.stirrups.spacing * 100, 1)} cm`, capacity: `≤ ${fmt(sMaxA * 100, 1)} cm` }),
    ...(tor.neglect ? [check('rcSheets.v.torsionNeglect', true, { clause: '§22.7.1', demand: `${f2(d.tu.value)} kN·m`, capacity: `< ${f2(PHI_V * tor0.Tcr / 4)} kN·m` })] : [
      check('rcSheets.v.stirrupsVT', e.ok.stirrups, { clause: '§22.5.8, §22.7.6', demand: `${f2(e.perLegRequired)} cm²/m`, capacity: `${f2(e.perLegProvided)} cm²/m`, ratio: ratioOf(e.perLegRequired, e.perLegProvided) }),
      check('rcSheets.v.transverseMin', e.ok.transverseMin, { clause: '§9.6.4.2', demand: `${f2(e.transverseMin)} cm²/m`, capacity: `${f2(e.transverseProvided)} cm²/m`, ratio: ratioOf(e.transverseMin, e.transverseProvided) }),
      check('rcSheets.v.al', e.ok.al, { clause: '§22.7.6.1, §9.6.4.3', demand: `${f2(Math.max(alReq, alMin))} cm²`, capacity: `${f2(e.alProvided)} cm²`, ratio: ratioOf(Math.max(alReq, alMin), e.alProvided) }),
      check('rcSheets.v.alSpacing', e.ok.alSpacing, { clause: '§9.7.5.1', demand: `${fmt(Number.isFinite(e.alSpacing) ? e.alSpacing * 100 : 0, 1)} cm`, capacity: '≤ 30 cm' }),
      check('rcSheets.v.alDia', e.ok.alDia, { clause: '§9.7.5.2', demand: a.torsionLong ? `Ø${a.torsionLong.dia}` : '—', capacity: `≥ Ø${fmt(e.alDiaMin, 1)}` }),
      check('rcSheets.v.torsionSection', e.ok.torsionSection, { clause: '§22.7.7.1' }),
    ]),
    ...(c.course && d.b > cr.beamFourLegsWidth + 1e-9 ? [check('rcSheets.v.wideLegs', a.stirrups.legs >= 4, { clause: withCriterion(), demand: `bw = ${fmt(d.b * 100, 0)} cm > ${fmt(cr.beamFourLegsWidth * 100, 0)} cm: ${a.stirrups.legs}`, capacity: '≥ 4' })] : []),
    ...(c.coverTable ? [mainCoverCheck(c.cover, a.stirrups.dia, largestBar(a), c.coverTable.control, fmt)] : []),
    ...(skin ? [check('rcSheets.v.skin', true, { clause: '§9.7.2.3', capacity: `Ø${skin.diameter} c/${fmt(skin.spacing * 100, 1)} cm` })] : []),
    ...(seisA?.checks ?? []),
  ];
  const allOk = verifications.every((v) => v.ok);
  const generous = isGenerous(verifications);

  const steps: StepGroup[] = [
    dataSteps(d, c, fmt),
    flexureSteps('rcSheets.g.flexBottom', d, c, gPos.r, gPos.env, gPos.n, `rcSheets.sec.${gPos.s}`, barsAt(a, gPos.s).bottom, e.flex.filter((x) => x.sign === 'pos'), fmt),
    ...(topReq > 0 ? [flexureSteps('rcSheets.g.flexTop', d, c, gNeg.r, gNeg.env, gNeg.n, `rcSheets.sec.${gNeg.s}`, barsAt(a, gNeg.s).top, e.flex.filter((x) => x.sign === 'neg'), fmt)] : []),
    shearSteps(d, c, shear, e.shear, a.stirrups, sMaxA, fmt),
    torsionSteps(d, ta.tor0, ta.tor, ta.tuDesign, e, alReq, alMin, a, fmt),
    ...(seisA ? [{ title: 'rcSheets.g.seismic', steps: seisA.steps }] : []),
    {
      title: 'rcSheets.g.proposal',
      steps: [
        adopted ? { label: 'rcSheets.s.adoptedByUser', value: '' } : { label: 'rcSheets.s.iterations', formula: 'As(d) → φMn ≥ Mu; εt ≥ εt,min; s ≤ s,max', value: String(iterations), ok: ev.all },
      ],
    },
  ];

  return {
    family: 'beam', key: d.key, name: d.name, level: d.level, b: d.b, h: d.h, length: d.length, demand: d,
    req: { bottom: bottomReq, top: topReq, bottomAt: gPos.s, topAt: gNeg.s, stirrupPerLeg: perLeg, legs, sMax, al: Math.max(alReq, alMin), torsionNeglected: tor.neglect, tuDesign, tuNeglect: PHI_V * tor0.Tcr / 4, skin: skin ? { dia: skin.diameter, spacing: skin.spacing } : null, bySection, ...(compTop > 0 || compBottom > 0 ? { compression: { top: compTop, bottom: compBottom } } : {}) },
    proposed, adopted: a, isAdopted: !!adopted, iterations: adopted ? 0 : iterations, flexure: e.flex, verifications, combos: comboTable(d, c, a, fmt),
    status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
  };
}

/** Table 20.5.1.3.1: the cover to the stirrup plus the stirrup, at least max(35; db + 5) mm under execution control. */
export function mainCoverCheck(cover: number, stirrupMm: number, db: number, control: boolean, fmt: Fmt): CheckLine {
  const have = cover * 1000 + stirrupMm, need = mainBarCoverMm(db, control);
  return check('rcSheets.v.mainCover', have >= need - 1e-6, { clause: 'Tabla 20.5.1.3.1', demand: `${fmt(have, 0)} mm`, capacity: `≥ ${control ? 'max(35; db + 5)' : 'max(40; db + 10)'} = ${fmt(need, 0)} mm` });
}

const largestBar = (a: BeamAdopted): number =>
  Math.max(0, ...[...a.top, ...a.bottom, ...Object.values(a.at ?? {}).flatMap((x) => [...x.top, ...x.bottom])].filter((g) => g.count > 0).map((g) => g.dia));

function comboTable(d: BeamDemand, c: BeamContext, a: BeamAdopted, fmt: Fmt): ComboTable {
  const sd = a.stirrups.dia;
  const p = paramsOf(d, c, sd);
  const S = barsAt(a, 'start'), M = barsAt(a, 'span'), E = barsAt(a, 'end');
  const qs: BeamSectionQuery[] = [];
  for (const k of d.combos) {
    qs.push(sectionQuery(c, d, M.bottom, M.top, sd, k.nSpan, undefined, true), sectionQuery(c, d, S.top, S.bottom, sd, k.nStart), sectionQuery(c, d, E.top, E.bottom, sd, k.nEnd),
      sectionQuery(c, d, S.bottom, S.top, sd, k.nStart, undefined, true), sectionQuery(c, d, E.bottom, E.top, sd, k.nEnd, undefined, true), sectionQuery(c, d, M.top, M.bottom, sd, k.nSpan));
  }
  const ans = evaluateBeamSections(qs) ?? [];
  const cap = (i: number) => phiMnOf(ans[i]);
  const legs = Math.max(1, a.stirrups.legs);
  const perLegProvided = a.stirrups.spacing > 0 ? barArea(sd) / a.stirrups.spacing : 0;
  const tcr = checkTorsion(p, shearTorsion(0, 0), EDITION).Tcr;
  const rows = d.combos.map((k, i) => {
    const o = i * 6;
    const mRatio = (m: number, iPos: number, iNeg: number) => (m >= 0 ? ratioOf(m, cap(iPos)) : ratioOf(-m, cap(iNeg)));
    const posAt = { start: o + 3, span: o, end: o + 4 }, negAt = { start: o + 1, span: o + 5, end: o + 2 };
    const sp = peakSection(d, k.xPos) ?? 'span', sn = peakSection(d, k.xNeg);
    const flex = Math.max(mRatio(k.mStart, o + 3, o + 1), mRatio(k.mSpan, o, o + 5), mRatio(k.mEnd, o + 4, o + 2), ratioOf(k.mPos, cap(posAt[sp])),
      ratioOf(k.mNeg, sn ? cap(negAt[sn]) : Math.min(cap(o + 1), cap(o + 2), cap(o + 5))));
    const sh = checkShear(p, k.v, k.nV, { edition: EDITION, AsTensionCm2: groupsArea(a.bottom), spacing: a.stirrups.spacing, legs: a.stirrups.legs });
    const t = c.torsion === 'compatibility' ? Math.min(k.t, PHI_V * tcr) : k.t;
    const tor = checkTorsion(p, shearTorsion(k.v, t), EDITION);
    const stir = ratioOf((sh.AvOverSReq ?? 0) / legs + (tor.neglect ? 0 : tor.AtOverS), perLegProvided);
    const ratio = Math.max(flex, stir, ratioOf(k.v, sh.phiVn));
    return { combo: k.combo, values: [fmt(k.mStart, 1), fmt(k.mSpan, 1), fmt(k.mEnd, 1), fmt(k.v, 1), fmt(k.t, 1), fmt(k.nSpan, 1)], ratio, ok: ratio <= 1 + 1e-6 };
  });
  return { headers: ['M i', 'M x*', 'M j', 'V', 'T', 'N'], rows };
}

/** The thinnest of the beams' bars in the project's list that `ok` takes, else the thickest of them, mm. */
export function beamBarWhere(c: Pick<BeamContext, 'diameters'>, ok: (dia: number) => boolean): number {
  const own = listIn(c.diameters, BEAM_BAR_RANGE);
  const pool = own.length ? own : [...c.diameters].sort((p, q) => p - q);
  return pool.find(ok) ?? pool[pool.length - 1] ?? 25;
}

export const torsionBar = (c: Pick<BeamContext, 'diameters'>, least: number): number => beamBarWhere(c, (x) => x >= least - 1e-9);

/** The two top bars a beam with no hogging moment carries its stirrups on: the thinnest of the list from Ø10. */
export const hangerBar = (c: Pick<BeamContext, 'diameters'>): number => torsionBar(c, 10);

function dataSteps(d: BeamDemand, c: BeamContext, f: Fmt): StepGroup {
  const src = (s: Signed) => (s.source ? ` (${s.source.combo})` : '');
  const sec = (name: SectionName, e: SectionEnv): Step => ({
    label: `rcSheets.sec.${name}`, formula: `x = ${f(e.x)} m`,
    value: `M⁺ = ${f(e.pos.value)}${src(e.pos)} · M⁻ = ${f(e.neg.value)}${src(e.neg)} kN·m`,
  });
  return {
    title: 'rcSheets.g.data',
    steps: [
      { label: 'rcSheets.s.section', formula: 'b × h · L', value: `${f(d.b * 100, 0)} × ${f(d.h * 100, 0)} cm · ${f(d.length)} m` },
      { label: 'rcSheets.s.materials', formula: "f'c · fy", value: `${f(c.mat.fc, 0)} · ${f(c.mat.fy, 0)} MPa` },
      { label: 'rcSheets.s.cover', formula: 'r', value: `${f(c.cover * 100, 1)} cm` },
      d.faces ? { label: 'rcSheets.s.atFaces', formula: 'Mu(x = c) · Vu, Tu(x = c + d)', value: `${f(d.faces.start * 100, 0)} · ${f(d.faces.end * 100, 0)} cm; d = ${f(d.faces.shearAt * 100, 0)} cm` } : { label: 'rcSheets.s.assumptionAxis', value: '' },
      ...(d.flange ? [{ label: 'rcSheets.s.flange', formula: 'bf = bw + Σ min(8hf; sw/2; ln/8) (6.3.2.1)', value: `bf = ${f(d.flange.bf * 100, 0)} cm; hf = ${f(d.flange.hf * 100, 0)} cm` }] : []),
      sec('start', d.start), sec('span', d.span), sec('end', d.end),
      ...(d.negAny.value > Math.max(d.start.neg.value, d.span.neg.value, d.end.neg.value) + 1e-6
        ? [{ label: 'rcSheets.s.negAny', formula: `x = ${f(d.negAny.source?.x ?? 0)} m`, value: `M⁻ = ${f(d.negAny.value)} kN·m${src(d.negAny)}` }] : []),
      { label: 'rcSheets.s.vu', formula: 'Vu', value: `${f(d.vu.value)} kN${src(d.vu)}` },
      { label: 'rcSheets.s.tu', formula: 'Tu', value: `${f(d.tu.value)} kN·m${src(d.tu)}` },
    ],
  };
}

function flexureSteps(
  title: string, d: BeamDemand, c: BeamContext, r: ReturnType<typeof checkFlexure>, mu: Signed, nc: number, where: string,
  bars: BarGroup[], checks: FlexureCheck[], f: Fmt,
): StepGroup {
  const fy = c.mat.fy, fc = c.mat.fc;
  const b1 = beta1(fc);
  const etc = tensionControlledStrain(fy, EDITION);
  const epsMin = ductilityStrain(fy, EDITION);
  const mus = mu.value + nc * (r.d - d.h / 2);
  const a = r.aReq, cc = 0.85 * fc * 1000 * a * d.b;
  const phi = r.epsilonT > 0 ? phiFromStrain(r.epsilonT, fy, 'ties', EDITION) : 0.9;
  const steps: Step[] = [
    { label: where, formula: `Mu = ${f(mu.value)} kN·m; Nu = ${f(nc)} kN`, value: mu.source?.combo ?? '' },
    { label: 'rcSheets.s.d', formula: 'd = h − r − Øe − Øl/2', value: `${f(r.d * 100, 1)} cm` },
    { label: 'rcSheets.s.mus', formula: 'Mus = Mu + Nu·(d − h/2)', value: `${f(mus)} kN·m` },
    { label: 'rcSheets.s.hypA', formula: `εc = 3 ‰, εt ≥ εty + 3 ‰ = ${f(etc * 1000, 2)} ‰ → φ = 0.90`, value: '' },
    { label: 'rcSheets.s.alphaBeta', formula: 'α1 · β1', value: `${f(0.85)} · ${f(b1, 3)}` },
  ];
  if (mu.value <= 1e-6) {
    steps.push({ label: 'rcSheets.s.noMoment', value: '' });
  } else {
    steps.push(
      { label: 'rcSheets.s.c', formula: "Cc = α1·f'c·β1·c·b → c", value: `${f(r.c * 100, 2)} cm` },
      { label: 'rcSheets.s.cc', formula: "Cc = α1·f'c·a·b; jdc = d − a/2", value: `${f(cc, 1)} kN; ${f((r.d - a / 2) * 100, 1)} cm` },
      { label: 'rcSheets.s.epsT', formula: 'εt = εc·(d − c)/c', value: `${f(r.epsilonT * 1000, 2)} ‰ → φ = ${f(phi, 3)}`, ok: r.epsilonT >= epsMin - 1e-9 },
    );
    if (r.isDoublyReinforced && r.AsComp) steps.push({ label: 'rcSheets.s.compression', formula: "A's (Cs = ΔM/jds)", value: `${f(r.AsComp)} cm²` });
    steps.push({ label: 'rcSheets.s.asStrength', formula: 'T = Mus/(φ·jdc) − Nu/φ; As = T/fy', value: `${f(r.AsFlexural)} cm²` });
  }
  steps.push(
    { label: 'rcSheets.s.asMin', formula: "As,min = max(√f'c/(4·fy); 1.4/fy)·bw·d", value: `${f(r.AsMin)} cm²` },
    { label: 'rcSheets.s.asReq', formula: 'As,nec = max(As; min(As,min; 4/3·As)) (§9.6.1.3)', value: `${f(r.AsReq)} cm²` },
    { label: 'rcSheets.s.adopted', formula: groupsLabel(bars), value: `${f(groupsArea(bars))} cm²`, ok: groupsArea(bars) >= r.AsReq - 1e-6 },
  );
  for (const k of checks.filter((x) => x.mu > 1e-6)) {
    steps.push({ label: `rcSheets.sec.${k.section}`, formula: `d = ${f(k.d * 100, 1)} cm; εt = ${f(k.epsT * 1000, 2)} ‰ ≥ ${f(k.epsTMin * 1000, 2)} ‰`, value: `φMn = ${f(k.phiMn)} ≥ ${f(k.mu)} kN·m`, ok: k.ok });
  }
  return { title, steps };
}

function shearSteps(d: BeamDemand, c: BeamContext, s: ReturnType<typeof checkShear>, sa: ReturnType<typeof checkShear>, st: Stirrups, sMax: number, f: Fmt): StepGroup {
  const sq = shearSqrtFc(c.mat.fc);
  const vc = s.phiVc / PHI_V;
  const l1 = 0.33 * sq * d.b * s.d * 1000, l2 = 0.66 * sq * d.b * s.d * 1000;
  const zone = s.Vs <= 1e-9 ? 'rcSheets.s.zone1' : s.Vs <= l1 ? 'rcSheets.s.zone2' : s.Vs <= l2 ? 'rcSheets.s.zone3' : 'rcSheets.s.zoneOver';
  return {
    title: 'rcSheets.g.shear',
    steps: [
      { label: 'rcSheets.s.vu', formula: 'Vu', value: `${f(d.vu.value)} kN${d.vu.source ? ` (${d.vu.source.combo})` : ''}` },
      { label: 'rcSheets.s.vc', formula: 'Vc (Tabla 22.5.5.1)', value: `${f(vc)} kN` },
      { label: 'rcSheets.s.vs', formula: 'Vs = Vu/φ − Vc', value: `${f(s.Vs)} kN` },
      { label: zone, formula: `0.33·√f'c·bw·d = ${f(l1, 1)} kN; 0.66·√f'c·bw·d = ${f(l2, 1)} kN`, value: `s,max = ${f(sMax * 100, 1)} cm`, ok: s.Vs <= l2 + 1e-6 },
      { label: 'rcSheets.s.avMin', formula: 'Av,min/s (§9.6.3.4)', value: `${f(s.AvOverSMin)} cm²/m` },
      { label: 'rcSheets.s.avReq', formula: 'Av/s = Vs/(fyt·d)', value: `${f(s.AvOverSReq ?? 0)} cm²/m` },
      { label: 'rcSheets.s.stirrups', formula: stirrupsLabel(st), value: '' },
      { label: 'rcSheets.s.verifyShear', formula: 'φVn = φ·(Vc + Av·fyt·d/s)', value: `${f(sa.phiVn)} ≥ Vu = ${f(d.vu.value)} kN`, ok: sa.status !== 'fail' },
    ],
  };
}

function torsionSteps(
  d: BeamDemand, t0: ReturnType<typeof checkTorsion>, t: ReturnType<typeof checkTorsion>, tuDesign: number,
  e: Evaluation, alReq: number, alMin: number, a: BeamAdopted, f: Fmt,
): StepGroup {
  const th = PHI_V * t0.Tcr / 4;
  const steps: Step[] = [
    { label: 'rcSheets.s.tth', formula: "φ·Tth = φ·0.083·√f'c·Acp²/pcp", value: `${f(th)} kN·m` },
  ];
  if (t0.neglect) {
    steps.push({ label: 'rcSheets.s.torsionNeglected', formula: `Tu = ${f(d.tu.value)} < φ·Tth`, value: '', ok: true });
  } else {
    if (tuDesign < d.tu.value) steps.push({ label: 'rcSheets.s.compatibility', formula: "Tu ≤ φ·0.33·√f'c·Acp²/pcp (§22.7.3.2)", value: `${f(tuDesign)} kN·m` });
    steps.push(
      { label: 'rcSheets.s.atReq', formula: 'At/s = Tu/(φ·2·A0·fyt·cotθ), A0 = 0.85·Aoh', value: `${f(t.AtOverS)} cm²/m` },
      { label: 'rcSheets.s.legReq', formula: 'Av/(n·s) + At/s', value: `${f(e.perLegRequired)} cm²/m` },
      { label: 'rcSheets.s.legProv', formula: `${stirrupsLabel(a.stirrups)}: Ab/s`, value: `${f(e.perLegProvided)} cm²/m`, ok: e.ok.stirrups },
      { label: 'rcSheets.s.transverseMin', formula: "(Av + 2At)/s ≥ max(0.062·√f'c; 0.35)·bw/fyt", value: `${f(e.transverseMin)} ≤ ${f(e.transverseProvided)} cm²/m`, ok: e.ok.transverseMin },
      { label: 'rcSheets.s.alReq', formula: 'Al = (At/s)·ph·(fyt/fy)', value: `${f(alReq)} cm²` },
      { label: 'rcSheets.s.alMin', formula: "Al,min = 0.42·√f'c·Acp/fy − (At/s)·ph·fyt/fy", value: `${f(alMin)} cm²` },
      { label: 'rcSheets.s.alProv', formula: a.torsionLong ? groupsLabel([a.torsionLong]) : '—', value: `${f(e.alProvided)} cm²`, ok: e.ok.al && e.ok.alSpacing && e.ok.alDia },
      { label: 'rcSheets.s.torsionSection', formula: "√((Vu/bw·d)² + (Tu·ph/1.7·Aoh²)²) ≤ φ·(Vc/bw·d + 0.66·√f'c)", value: '', ok: e.ok.torsionSection },
    );
  }
  return { title: 'rcSheets.g.torsion', steps };
}
