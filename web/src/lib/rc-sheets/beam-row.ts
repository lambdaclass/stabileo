import { checkFlexure, checkShear, checkTorsion, type ConcreteDesignParams } from '../engine/codes/argentina/cirsoc201';
import { evaluateBeamSections, type BeamSectionAnswer, type BeamSectionQuery } from '../engine/codes/argentina/cirsoc201-beam-kernel';
import { beta1, ductilityStrain, phiFromStrain, shearFy, shearSqrtFc, tensionControlledStrain } from '../engine/codes/argentina/cirsoc201-basis';
import { crackControlFaceSpacing } from '../engine/design/crack-spacing';
import { checkTorsion2025 } from '../codes/cirsoc201/torsion';
import { transverseSpacingLimits } from '../codes/cirsoc201/transverse-spacing';
import { proposeSkin } from '../codes/cirsoc201/skin';
import { barArea, faceLayout, groupsArea, groupsLabel, proposeBeamFace, roundDown, stirrupsLabel } from './bars';
import type { Fmt } from './format';
import { beamSeismic, type Seismic } from './seismic';
import { check, ratioOf, type BarGroup, type BeamAdopted, type CheckLine, type ComboTable, type Materials, type MeshBars, type RowStatus, type Signed, type Step, type StepGroup, type Stirrups, type TorsionMode } from './types';

const EDITION = '2025' as const;
const PHI_V = 0.75;
const MAX_ITERATIONS = 12;

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
  /** Envelope along the span over all combinations: largest sagging, hogging (kN·m) and shear (kN). */
  env?: Array<{ x: number; pos: number; neg: number; v: number }>;
  /** Half the support's extent along the beam at each end, m. */
  supportHalf?: { start: number; end: number };
}

export interface BeamContext {
  mat: Materials;
  /** m, clear cover to the stirrup. */
  cover: number;
  /** mm, the stirrup the depth arithmetic assumes. */
  stirrupDia: number;
  diameters: readonly number[];
  torsion: TorsionMode;
  /** Special moment frame provisions (chapter 18), with the project's λo. */
  seismic?: Seismic;
}

export interface FlexureCheck { section: SectionName; sign: 'pos' | 'neg'; phiMn: number; mu: number; epsT: number; epsTMin: number; d: number; ok: boolean; ductile: boolean }

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
    skin: MeshBars | null;
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
}

const paramsOf = (d: BeamDemand, c: BeamContext, stirrupDia = c.stirrupDia): ConcreteDesignParams =>
  ({ fc: c.mat.fc, fy: c.mat.fy, cover: c.cover, b: d.b, h: d.h, stirrupDia });

const hoopPerimeter = (d: BeamDemand, c: BeamContext, sd: number) => 2 * ((d.b - 2 * c.cover - sd / 1000) + (d.h - 2 * c.cover - sd / 1000));

const sectionOf = (d: BeamDemand, s: SectionName) => (s === 'start' ? d.start : s === 'span' ? d.span : d.end);

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

function flexChecks(c: BeamContext, d: BeamDemand, a: BeamAdopted): FlexureCheck[] {
  const sd = a.stirrups.dia;
  const items: Array<{ section: SectionName; sign: 'pos' | 'neg'; mu: number; nc: number }> = [];
  for (const s of SECTION_NAMES) {
    const e = sectionOf(d, s);
    items.push({ section: s, sign: 'pos', mu: e.pos.value, nc: e.nPos }, { section: s, sign: 'neg', mu: e.neg.value, nc: e.nNeg });
  }
  if (d.negAny.value > Math.max(d.start.neg.value, d.span.neg.value, d.end.neg.value) + 1e-6) items.push({ section: 'span', sign: 'neg', mu: d.negAny.value, nc: d.nNegAny });
  const answers = evaluateBeamSections(items.map((i) => { const g = barsAt(a, i.section); return i.sign === 'pos' ? sectionQuery(c, d, g.bottom, g.top, sd, i.nc, undefined, true) : sectionQuery(c, d, g.top, g.bottom, sd, i.nc); })) ?? [];
  return items.map((i, k) => {
    const r = answers[k];
    const phiMn = phiMnOf(r);
    const epsT = r?.epsilonT ?? 0, epsTMin = r?.epsilonTMin ?? 0;
    const ductile = !(i.mu > 1e-6) || epsT >= epsTMin - 1e-9;
    const depth = d.h - faceLayout(i.sign === 'pos' ? barsAt(a, i.section).bottom : barsAt(a, i.section).top, d.b, c.cover, sd).centroidFromFace;
    return { ...i, phiMn, epsT, epsTMin, d: depth, ductile, ok: !(i.mu > 1e-6) || (phiMn >= i.mu - 1e-6 && ductile) };
  });
}

interface Requirement { bottom: number; top: number; al: number; alMin: number; transverseMin: number; neglect: boolean; torSection: boolean; atOverS: number; bySection: Array<{ section: SectionName; sign: 'pos' | 'neg'; req: number }> }

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
  const perLegRequired = Math.max(shear.AvOverSReq ?? 0, shear.AvOverSMin) / legs + (req.neglect ? 0 : req.atOverS);
  const transverseMin = req.neglect ? 0 : req.transverseMin;
  const transverseProvided = a.stirrups.spacing > 0 ? legs * ab / a.stirrups.spacing : 0;
  const al = a.torsionLong;
  const alProvided = al ? al.count * barArea(al.dia) : 0;
  const ph = hoopPerimeter(d, c, sd);
  const alSpacing = al && al.count > 0 ? ph / al.count : Infinity;
  const alDiaMin = Math.max(0.042 * a.stirrups.spacing * 1000, 10);
  const ok = {
    stirrups: perLegProvided >= perLegRequired - 1e-6,
    transverseMin: req.neglect || transverseProvided >= transverseMin - 1e-6,
    al: req.neglect || alProvided >= Math.max(req.al, req.alMin) - 1e-6,
    alSpacing: req.neglect || alSpacing <= 0.3 + 1e-6,
    alDia: req.neglect || (!!al && al.dia >= alDiaMin - 1e-6),
    torsionSection: req.torSection,
  };
  const worstCrack = (face: 'top' | 'bottom', used: boolean) => SECTION_NAMES.map((s) => crack(barsAt(a, s)[face], used)).reduce((w, x) => (x.s > w.s ? x : w));
  const crackBottom = worstCrack('bottom', true), crackTop = worstCrack('top', hogUsed);
  const areaOk = (sign: 'pos' | 'neg') => req.bySection.filter((x) => x.sign === sign).every((x) => groupsArea(barsAt(a, x.section)[sign === 'pos' ? 'bottom' : 'top']) >= x.req - 1e-6);
  const areaBottom = areaOk('pos'), areaTop = areaOk('neg');
  const all = flex.every((f) => f.ok) && fb.fits && ft.fits && areaBottom && areaTop && crackBottom.ok && crackTop.ok
    && shear.status !== 'fail' && Object.values(ok).every(Boolean);
  return { flex, fitBottom: fb.fits, fitTop: ft.fits, areaBottom, areaTop, crackBottom, crackTop, shear, perLegProvided, perLegRequired, transverseMin, transverseProvided, alProvided, alSpacing, alDiaMin, ok, all };
}

const LONG = (c: BeamContext) => c.diameters.filter((x) => x >= 10 && x <= 25);

function bumpFace(groups: BarGroup[], d: BeamDemand, c: BeamContext, sd: number): BarGroup[] {
  const cur = groups.find((g) => g.count > 0)?.dia ?? 16;
  return proposeBeamFace(groupsArea(groups) + barArea(cur) * 0.999, d.b, d.h, c.cover, sd, LONG(c));
}

function finerFace(groups: BarGroup[], d: BeamDemand, c: BeamContext, sd: number): BarGroup[] {
  const cur = groups.find((g) => g.count > 0)?.dia ?? 16;
  const pool = LONG(c).filter((x) => x < cur);
  return proposeBeamFace(groupsArea(groups), d.b, d.h, c.cover, sd, pool.length ? pool : LONG(c));
}

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
  if (e.shear.status === 'fail' || !e.ok.stirrups || !e.ok.transverseMin) {
    if (next.stirrups.spacing > 0.075 + 1e-9) next.stirrups.spacing = roundDown(next.stirrups.spacing - 0.025);
    else if (next.stirrups.dia < 12) next.stirrups = { ...next.stirrups, dia: next.stirrups.dia + 2, spacing: 0.15 };
    else next.stirrups.legs += 2;
  }
  if (!e.ok.al || !e.ok.alSpacing || !e.ok.alDia) {
    const al = next.torsionLong ?? { count: 4, dia: 10 };
    const count = Math.max(4, al.count, 2 * Math.ceil(ph / 0.3 / 2));
    let dia = Math.max(al.dia, e.alDiaMin);
    if (!e.ok.al && count === al.count && dia <= al.dia) dia = al.dia + 1;
    next.torsionLong = { count, dia: [10, 12, 16, 20, 25].find((x) => x >= dia - 1e-9) ?? 25 };
  }
  return next;
}

function improveSeismic(a: BeamAdopted, s: NonNullable<ReturnType<typeof beamSeismic>>, d: BeamDemand, c: BeamContext): BeamAdopted {
  const next: BeamAdopted = JSON.parse(JSON.stringify(a));
  const bad = (label: string) => s.checks.some((k) => k.label === label && !k.ok);
  if (bad('rcSheets.v.seisBeamHoops') || bad('rcSheets.v.seisBeamVe')) {
    const target = roundDown(Math.max(0.05, Math.min(next.stirrups.spacing - 0.025, s.sZone)));
    if (target >= 0.05 && target < next.stirrups.spacing - 1e-9) next.stirrups.spacing = target;
    else if (next.stirrups.dia < 12) next.stirrups = { ...next.stirrups, dia: next.stirrups.dia + 2 };
    else next.stirrups.legs += 2;
  }
  if (bad('rcSheets.v.seisBeamHalf') || bad('rcSheets.v.seisBeamQuarter')) next.bottom = bumpFace(next.bottom, d, c, next.stirrups.dia);
  if (bad('rcSheets.v.seisBeamQuarter') && groupsArea(next.top) < groupsArea(next.bottom)) next.top = bumpFace(next.top, d, c, next.stirrups.dia);
  return next;
}

export function beamRow(d: BeamDemand, c: BeamContext, adopted: BeamAdopted | undefined, fmt: Fmt): BeamRow {
  const p = paramsOf(d, c);
  const fc = c.mat.fc, fy = c.mat.fy;

  const flexReq = (mu: number, nc: number, sagging = false) => checkFlexure(p, mu, nc, { edition: EDITION, ...(sagging && d.flange ? { flange: d.flange } : {}) });
  const posReq = SECTION_NAMES.map((s) => ({ s, r: flexReq(sectionOf(d, s).pos.value, sectionOf(d, s).nPos, true), env: sectionOf(d, s).pos, n: sectionOf(d, s).nPos }));
  const negList = SECTION_NAMES.map((s) => ({ s, r: flexReq(sectionOf(d, s).neg.value, sectionOf(d, s).nNeg), env: sectionOf(d, s).neg, n: sectionOf(d, s).nNeg }));
  if (d.negAny.value > Math.max(...negList.map((x) => x.env.value)) + 1e-6) negList.push({ s: 'span', r: flexReq(d.negAny.value, d.nNegAny), env: d.negAny, n: d.nNegAny });
  const heavier = <T extends { r: { AsReq: number }; env: Signed }>(a: T, b: T) => (b.r.AsReq > a.r.AsReq + 1e-9 || (Math.abs(b.r.AsReq - a.r.AsReq) <= 1e-9 && b.env.value > a.env.value) ? b : a);
  const gPos = posReq.reduce(heavier);
  const hogging = negList.filter((x) => x.env.value > 1e-6);
  const gNeg = (hogging.length ? hogging : negList).reduce(heavier);
  const bottomReq = gPos.r.AsReq;
  const topReq = hogging.length ? gNeg.r.AsReq : 0;

  const shear = checkShear(p, d.vu.value, d.nAtV, { edition: EDITION, AsTensionCm2: bottomReq });
  const tor0 = checkTorsion(p, d.tu.value, d.vu.value, EDITION);
  const tuDesign = !tor0.neglect && c.torsion === 'compatibility' ? Math.min(d.tu.value, PHI_V * tor0.Tcr) : d.tu.value;
  const tor = tuDesign === d.tu.value ? tor0 : checkTorsion(p, tuDesign, d.vu.value, EDITION);
  const limits = transverseSpacingLimits(EDITION, { VsRequired: shear.Vs, bw: d.b, d: shear.d, fc, cover: c.cover, stirrupDiaMm: c.stirrupDia });
  const legs = Math.max(2, shear.stirrupLegs, limits.requiredLegs);
  const ph = hoopPerimeter(d, c, c.stirrupDia);
  const atS = tor.neglect ? 0 : tor.AtOverS;
  const torsion25 = (Tu: number) => checkTorsion2025({ b: d.b, h: d.h, d: shear.d, cover: c.cover, stirrupDiaMm: c.stirrupDia, fc, fy, fyt: fy, Vu: 0, Tu });
  const t25 = torsion25(tuDesign);
  const alMin = tor.neglect ? 0 : t25.AlMin * 1e4;
  const transverseMin = torsion25(0).transverseRequired * 1e4;
  const alReq = tor.neglect ? 0 : tor.AlReq;
  const perLeg = Math.max(shear.AvOverSReq ?? 0, shear.AvOverSMin) / legs + atS;
  const sMax = Math.min(limits.alongMax, tor.neglect ? Infinity : t25.sMax);
  const skin = proposeSkin(EDITION, d.h, fy, c.cover, c.stirrupDia);
  const bySection = [
    ...posReq.filter((x) => x.env.value > 1e-6 || x.s === 'span').map((x) => ({ section: x.s, sign: 'pos' as const, req: x.r.AsReq })),
    ...negList.filter((x) => x.env.value > 1e-6).map((x) => ({ section: x.s, sign: 'neg' as const, req: x.r.AsReq })),
  ];
  const req: Requirement = { bottom: bottomReq, top: topReq, al: alReq, alMin, transverseMin, neglect: tor.neglect, torSection: tor.status !== 'fail', atOverS: atS, bySection };

  const initial: BeamAdopted = {
    bottom: proposeBeamFace(bottomReq, d.b, d.h, c.cover, c.stirrupDia, c.diameters),
    top: topReq > 0 ? proposeBeamFace(topReq, d.b, d.h, c.cover, c.stirrupDia, c.diameters) : [{ count: 2, dia: c.diameters.includes(10) ? 10 : 12 }],
    stirrups: proposeStirrups(perLeg, legs, roundDown(sMax), [6, 8, 10, 12], c.stirrupDia),
    ...(tor.neglect ? {} : { torsionLong: { count: Math.max(4, 2 * Math.ceil(ph / 0.3 / 2)), dia: 10 } }),
  };
  const seisOf = (x: BeamAdopted) => (c.seismic ? beamSeismic(d, { ...c, overstrength: c.seismic.overstrength }, x, (sec) => barsAt(x, sec), fmt) : null);
  let proposed = initial, iterations = 0;
  let ev = evaluate(d, c, proposed, req);
  let seis = seisOf(proposed);
  const holds = () => ev.all && (!seis || seis.checks.every((k) => k.ok));
  while (!holds() && iterations < MAX_ITERATIONS) {
    iterations++;
    proposed = improve(proposed, ev, d, c, ph);
    if (seis) proposed = improveSeismic(proposed, seis, d, c);
    ev = evaluate(d, c, proposed, req);
    seis = seisOf(proposed);
  }
  const a = adopted ?? proposed;
  const e = adopted ? evaluate(d, c, a, req) : ev;
  const seisA = adopted ? seisOf(a) : seis;
  const generous = groupsArea(a.bottom) > 1.2 * bottomReq + 1e-6 || (topReq > 0 && groupsArea(a.top) > 1.2 * topReq + 1e-6);

  const f2 = (v: number) => fmt(v);
  const verifications: CheckLine[] = [
    ...e.flex.filter((x) => x.mu > 1e-6).map((x) => check(x.sign === 'pos' ? `rcSheets.v.flexPos.${x.section}` : `rcSheets.v.flexNeg.${x.section}`, x.ok, {
      clause: '§22.2, §21.2', demand: `${f2(x.mu)} kN·m`, capacity: `${f2(x.phiMn)} kN·m`, ratio: ratioOf(x.mu, x.phiMn),
    })),
    ...e.flex.filter((x) => x.mu > 1e-6 && !x.ductile).map((x) => check('rcSheets.v.ductility', false, { clause: '§9.3.3.1', demand: `εt = ${fmt(x.epsT * 1000)} ‰`, capacity: `≥ ${fmt(x.epsTMin * 1000)} ‰` })),
    check('rcSheets.v.minBottom', e.areaBottom, { clause: '§9.6.1.2', demand: `${f2(bottomReq)} cm²`, capacity: `${f2(groupsArea(a.bottom))} cm²`, ratio: ratioOf(bottomReq, groupsArea(a.bottom)) }),
    ...(topReq > 0 ? [check('rcSheets.v.minTop', e.areaTop, { clause: '§9.6.1.2', demand: `${f2(topReq)} cm²`, capacity: `${f2(groupsArea(a.top))} cm²`, ratio: ratioOf(topReq, groupsArea(a.top)) })] : []),
    check('rcSheets.v.fitBottom', e.fitBottom, { clause: '§25.2.1' }),
    check('rcSheets.v.fitTop', e.fitTop, { clause: '§25.2.1' }),
    check('rcSheets.v.crack', e.crackBottom.ok && e.crackTop.ok, { clause: '§24.3.2', demand: `s = ${fmt(Math.max(e.crackBottom.s, topReq > 0 ? e.crackTop.s : 0) * 100, 1)} cm`, capacity: `≤ ${fmt(e.crackBottom.max * 100, 1)} cm` }),
    check('rcSheets.v.shear', e.shear.status !== 'fail', { clause: '§22.5', demand: `${f2(d.vu.value)} kN`, capacity: `${f2(e.shear.phiVn)} kN`, ratio: ratioOf(d.vu.value, e.shear.phiVn) }),
    check('rcSheets.v.stirrupSpacing', a.stirrups.spacing <= sMax + 1e-6, { clause: tor.neglect ? '§9.7.6.2.2' : '§9.7.6.2.2, §9.7.6.3.3', demand: `${fmt(a.stirrups.spacing * 100, 1)} cm`, capacity: `≤ ${fmt(sMax * 100, 1)} cm` }),
    ...(tor.neglect ? [check('rcSheets.v.torsionNeglect', true, { clause: '§22.7.1', demand: `${f2(d.tu.value)} kN·m`, capacity: `< ${f2(PHI_V * tor0.Tcr / 4)} kN·m` })] : [
      check('rcSheets.v.stirrupsVT', e.ok.stirrups, { clause: '§22.5.8, §22.7.6', demand: `${f2(e.perLegRequired)} cm²/m`, capacity: `${f2(e.perLegProvided)} cm²/m`, ratio: ratioOf(e.perLegRequired, e.perLegProvided) }),
      check('rcSheets.v.transverseMin', e.ok.transverseMin, { clause: '§9.6.4.2', demand: `${f2(e.transverseMin)} cm²/m`, capacity: `${f2(e.transverseProvided)} cm²/m`, ratio: ratioOf(e.transverseMin, e.transverseProvided) }),
      check('rcSheets.v.al', e.ok.al, { clause: '§22.7.6.1, §9.6.4.3', demand: `${f2(Math.max(alReq, alMin))} cm²`, capacity: `${f2(e.alProvided)} cm²`, ratio: ratioOf(Math.max(alReq, alMin), e.alProvided) }),
      check('rcSheets.v.alSpacing', e.ok.alSpacing, { clause: '§9.7.5.1', demand: `${fmt(Number.isFinite(e.alSpacing) ? e.alSpacing * 100 : 0, 1)} cm`, capacity: '≤ 30 cm' }),
      check('rcSheets.v.alDia', e.ok.alDia, { clause: '§9.7.5.2', demand: a.torsionLong ? `Ø${a.torsionLong.dia}` : '—', capacity: `≥ Ø${fmt(e.alDiaMin, 1)}` }),
      check('rcSheets.v.torsionSection', e.ok.torsionSection, { clause: '§22.7.7.1' }),
    ]),
    ...(skin ? [check('rcSheets.v.skin', true, { clause: '§9.7.2.3', capacity: `Ø${skin.diameter} c/${fmt(skin.spacing * 100, 1)} cm` })] : []),
    ...(seisA?.checks ?? []),
  ];
  const allOk = verifications.every((v) => v.ok);

  const steps: StepGroup[] = [
    dataSteps(d, c, fmt),
    flexureSteps('rcSheets.g.flexBottom', d, c, gPos.r, gPos.env, gPos.n, `rcSheets.sec.${gPos.s}`, a.bottom, e.flex.filter((x) => x.sign === 'pos'), fmt),
    ...(topReq > 0 ? [flexureSteps('rcSheets.g.flexTop', d, c, gNeg.r, gNeg.env, gNeg.n, `rcSheets.sec.${gNeg.s}`, a.top, e.flex.filter((x) => x.sign === 'neg'), fmt)] : []),
    shearSteps(d, c, shear, e.shear, a.stirrups, sMax, fmt),
    torsionSteps(d, tor0, tor, tuDesign, e, alReq, alMin, a, fmt),
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
    req: { bottom: bottomReq, top: topReq, bottomAt: gPos.s, topAt: gNeg.s, stirrupPerLeg: perLeg, legs, sMax, al: Math.max(alReq, alMin), torsionNeglected: tor.neglect, tuDesign, skin: skin ? { dia: skin.diameter, spacing: skin.spacing } : null, bySection },
    proposed, adopted: a, isAdopted: !!adopted, iterations: adopted ? 0 : iterations, flexure: e.flex, verifications, combos: comboTable(d, c, a, fmt),
    status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
  };
}

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
  const tcr = checkTorsion(p, 0, 0, EDITION).Tcr;
  const rows = d.combos.map((k, i) => {
    const o = i * 6;
    const mRatio = (m: number, iPos: number, iNeg: number) => (m >= 0 ? ratioOf(m, cap(iPos)) : ratioOf(-m, cap(iNeg)));
    const flex = Math.max(mRatio(k.mStart, o + 3, o + 1), mRatio(k.mSpan, o, o + 5), mRatio(k.mEnd, o + 4, o + 2), ratioOf(k.mPos, cap(o)),
      ratioOf(k.mNeg, Math.min(cap(o + 1), cap(o + 2), cap(o + 5))));
    const sh = checkShear(p, k.v, k.nV, { edition: EDITION, AsTensionCm2: groupsArea(a.bottom), spacing: a.stirrups.spacing, legs: a.stirrups.legs });
    const t = c.torsion === 'compatibility' ? Math.min(k.t, PHI_V * tcr) : k.t;
    const tor = checkTorsion(p, t, k.v, EDITION);
    const stir = ratioOf((sh.AvOverSReq ?? 0) / legs + (tor.neglect ? 0 : tor.AtOverS), perLegProvided);
    const ratio = Math.max(flex, stir, ratioOf(k.v, sh.phiVn));
    return { combo: k.combo, values: [fmt(k.mStart, 1), fmt(k.mSpan, 1), fmt(k.mEnd, 1), fmt(k.v, 1), fmt(k.t, 1), fmt(k.nSpan, 1)], ratio, ok: ratio <= 1 + 1e-6 };
  });
  return { headers: ['M i', 'M x*', 'M j', 'V', 'T', 'N'], rows };
}

function proposeStirrups(perLeg: number, legs: number, sMax: number, dias: readonly number[], prefer: number): Stirrups {
  const list = [prefer, ...dias.filter((x) => x > prefer && x <= 12)];
  for (const floor of [0.1, 0.075]) {
    for (const dia of list) {
      const s = roundDown(Math.min(sMax, perLeg > 0 ? barArea(dia) / perLeg : sMax));
      if (s >= floor - 1e-9) return { dia, legs, spacing: s };
    }
  }
  const dia = list[list.length - 1]!;
  return { dia, legs, spacing: roundDown(Math.max(0.05, Math.min(sMax, barArea(dia) / Math.max(perLeg, 1e-9)))) };
}

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
      ...(d.flange ? [{ label: 'rcSheets.s.flange', formula: 'bf = bw + Σ min(8hf; sw/2; ln/8) (Tabla 6.3.2.1)', value: `bf = ${f(d.flange.bf * 100, 0)} cm; hf = ${f(d.flange.hf * 100, 0)} cm` }] : []),
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
    { label: 'rcSheets.s.asReq', formula: 'As,nec', value: `${f(r.AsReq)} cm²` },
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
