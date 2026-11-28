import { ec2Shear } from '../../engine/design/eurocode/ec2-beam';
import { barArea, faceLayout, groupsArea, moreStirrup, proposeBeamFace, proposeStirrups, roundDown } from '../bars';
import { beamBarWhere, hangerBar, peakSection, searchFaces } from '../beam-row';
import { SECTION_NAMES, type BeamContext, type BeamDemand, type BeamRow, type FlexureCheck, type SectionName } from '../beam-row';
import type { Fmt } from '../format';
import { type BarGroup, type BeamAdopted, type Signed, check, isGenerous } from '../types';
import { GAMMA_G, flexuralSteel, matOf, minSteel, shearCapacity, type Ec2Set, type FlexReq, type Mat } from './basis';
import { barsAt, beamCapacity, geomOf, hoopPerimeter, tensionWidth } from './beam-section';
import { crackFace, interactionStrut, skinBars, torsionGeom, torsionMax, torsionSteel, type CrackRead, type Skin, type TorsionGeom } from './beam-checks';
import { beamCombos, beamSteps, beamVerifications } from './beam-report';

const MAX_ITERATIONS = 12;
const GUESS_DIA = 16;
const KPA = 1000;

export interface Item { section: SectionName; sign: 'pos' | 'neg'; mu: number; n: number; src: Signed }

export interface BeamReq {
  items: Array<Item & { r: FlexReq; asMin: number; req: number }>;
  bottom: number; top: number; asMax: number;
  /** The compression steel the doubly reinforced sections ask of each face, cm². */
  compTop: number; compBottom: number;
  bySection: Array<{ section: SectionName; sign: 'pos' | 'neg'; req: number }>;
  shear: ReturnType<typeof ec2Shear>; vEd: number; sigmaCp: number; dShear: number;
  tg: TorsionGeom; screen: number; neglect: boolean; compat: boolean; torSection: boolean;
  cot: number; aswS: number; tPerLeg: number; alReq: number; interaction: number;
  legs: number; stMax: number; sMax: number; perLeg: number;
  skin: Skin | null;
}

export interface BeamEval {
  flex: FlexureCheck[]; xd: number[];
  fitBottom: boolean; fitTop: boolean; areaBottom: boolean; areaTop: boolean; maxOk: boolean;
  crackBottom: CrackRead; crackTop: CrackRead;
  vrd: number; vrdMax: number; shearOk: boolean;
  perLegProvided: number; rhoW: number; ok: { stirrups: boolean; linkMin: boolean; spacing: boolean; legs: boolean; al: boolean; alSpacing: boolean; torsionSection: boolean };
  alProvided: number; alSpacing: number;
  all: boolean;
}

const sectionOf = (d: BeamDemand, s: SectionName) => (s === 'start' ? d.start : s === 'span' ? d.span : d.end);

export function itemsOf(d: BeamDemand): Item[] {
  const items: Item[] = [];
  for (const s of SECTION_NAMES) {
    const e = sectionOf(d, s);
    items.push({ section: s, sign: 'pos', mu: e.pos.value, n: e.nPos, src: e.pos }, { section: s, sign: 'neg', mu: e.neg.value, n: e.nNeg, src: e.neg });
  }
  if (d.negAny.value > Math.max(d.start.neg.value, d.span.neg.value, d.end.neg.value) + 1e-6) items.push({ section: peakSection(d, d.negAny.source?.x) ?? 'span', sign: 'neg', mu: d.negAny.value, n: d.nNegAny, src: d.negAny });
  return items;
}

function requirement(set: Ec2Set, d: BeamDemand, c: BeamContext, m: Mat): BeamReq {
  const p = set.p, g = geomOf(d);
  const dd = d.h - c.cover - c.stirrupDia / 1000 - GUESS_DIA / 2000, d2 = c.cover + c.stirrupDia / 1000 + GUESS_DIA / 2000;
  const items = itemsOf(d).map((it) => {
    const shape = it.sign === 'pos' && d.flange ? { b: d.b, h: d.h, bf: d.flange.bf, hf: d.flange.hf } : { b: d.b, h: d.h };
    const r = flexuralSteel(Math.max(0, it.mu), it.n, shape, dd, d2, m, p);
    const asMin = minSteel(m, p, tensionWidth(g, it.sign === 'neg'), dd) * 1e4;
    return { ...it, r, asMin, req: Math.max(r.as * 1e4, asMin) };
  });
  const pos = items.filter((x) => x.sign === 'pos'), neg = items.filter((x) => x.sign === 'neg');
  const hogging = neg.filter((x) => x.mu > 1e-6);
  const comp = (xs: typeof items) => Math.max(0, ...xs.map((x) => x.r.as2 * 1e4));
  const bottom = Math.max(...pos.map((x) => x.req), comp(hogging));
  const top = Math.max(hogging.length ? Math.max(...hogging.map((x) => x.req)) : 0, comp(pos));
  const bySection = [
    ...pos.filter((x) => x.mu > 1e-6 || x.section === 'span').map((x) => ({ section: x.section, sign: 'pos' as const, req: x.req })),
    ...hogging.map((x) => ({ section: x.section, sign: 'neg' as const, req: x.req })),
    ...items.filter((x) => x.r.as2 > 0).map((x) => ({ section: x.section, sign: (x.sign === 'pos' ? 'neg' : 'pos') as 'pos' | 'neg', req: x.r.as2 * 1e4 })),
  ];

  const vEd = d.vu.value, sigmaCp = d.nAtV / (d.b * d.h * KPA);
  const asl = Math.min(bottom, top > 0 ? top : bottom) * 1e-4;
  const shear = ec2Shear({ bw: d.b, d: dd, fck: m.fck, fyk: m.fyk, asl, VEd: vEd, sigmaCp }, p);
  const tg = torsionGeom(d.b, d.h, c.cover + c.stirrupDia / 1000 + GUESS_DIA / 2000, m);
  const tEd = d.tu.value, compat = c.torsion === 'compatibility';
  const screen = tEd / tg.trdc + vEd / Math.max(shear.vrdc, 1e-9);
  const neglect = compat || tEd <= 1e-6 || screen <= 1;
  const vMax = (cot: number) => (d.b * shear.z * shear.nu1 * m.fcdShear * KPA) / (cot + 1 / cot);
  let cot = shear.cotTheta, torSection = true, aswS = shear.aswS, tPerLeg = 0, alReq = 0, interaction = 0;
  if (!neglect) {
    const strut = interactionStrut(tEd, vEd, tg, vMax, m, p, shear.cotTheta);
    torSection = strut !== null;
    cot = strut ?? p.cotThetaMin;
    aswS = vEd > shear.vrdc ? Math.max(vEd / (shear.z * m.fyd * KPA * cot), shear.aswMin) : shear.aswMin;
    const ts = torsionSteel(tEd, tg, m, cot);
    tPerLeg = ts.perLeg * 1e4; alReq = ts.asl * 1e4;
    interaction = tEd / torsionMax(tg, m, cot) + vEd / vMax(cot);
  }
  const stMax = Math.min(0.75 * dd, 0.6);
  const width = d.b - 2 * c.cover - c.stirrupDia / 1000;
  const legs = Math.max(2, Math.ceil(width / stMax - 1e-9) + 1);
  const sMax = Math.min(p.linkMaxSpacing * dd, neglect ? Infinity : Math.min(tg.uk / 8, Math.min(d.b, d.h)));
  const perLeg = (aswS * 1e4) / legs + tPerLeg;
  return {
    items, bottom, top, compTop: comp(pos), compBottom: comp(hogging), asMax: p.beamMaxRatio * d.b * d.h * 1e4, bySection, shear, vEd, sigmaCp, dShear: dd,
    tg, screen, neglect, compat, torSection, cot, aswS: aswS * 1e4, tPerLeg, alReq, interaction, legs, stMax, sMax, perLeg,
    skin: skinBars(d.b, d.h, m.fyd / GAMMA_G, m, c.diameters),
  };
}

export function flexChecks(set: Ec2Set, d: BeamDemand, c: BeamContext, a: BeamAdopted, m: Mat): FlexureCheck[] {
  const g = geomOf(d), sd = a.stirrups.dia;
  return itemsOf(d).map((it) => {
    const bars = barsAt(a, it.section);
    const [t, k] = it.sign === 'pos' ? [bars.bottom, bars.top] : [bars.top, bars.bottom];
    const r = beamCapacity(g, c.cover, sd, t, k, it.sign === 'pos', it.n, m, set.p);
    const ductile = !(it.mu > 1e-6) || r.ductile;
    const active = it.mu > 1e-6 || Math.abs(it.n) > 1e-6;
    return { section: it.section, sign: it.sign, phiMn: r.mrd, mu: it.mu, nc: it.n, epsT: r.epsS, epsTMin: r.epsMin, d: r.d, ductile, ok: !active || (r.feasible && r.mrd >= it.mu - 1e-6 && ductile) };
  });
}

/** The effective depth the stirrups work over, m: the shallowest tension face the adopted bars give at a section. */
export function shearDepth(d: BeamDemand, c: BeamContext, a: BeamAdopted, hogging: boolean): number {
  const sd = a.stirrups.dia;
  return Math.min(...SECTION_NAMES.flatMap((s) => {
    const g = barsAt(a, s);
    return [g.bottom, ...(hogging ? [g.top] : [])].filter((x) => x.some((y) => y.count > 0)).map((x) => d.h - faceLayout(x, d.b, c.cover, sd).centroidFromFace);
  }));
}

function evaluate(set: Ec2Set, d: BeamDemand, c: BeamContext, a: BeamAdopted, req: BeamReq, m: Mat): BeamEval {
  const sd = a.stirrups.dia, p = set.p;
  const flex = flexChecks(set, d, c, a, m);
  const xd = flex.map((f) => m.ecu3 / (f.epsT + m.ecu3));
  const fits = (face: 'top' | 'bottom') => SECTION_NAMES.every((s) => faceLayout(barsAt(a, s)[face], d.b, c.cover, sd).fits);
  const areaOk = (sign: 'pos' | 'neg') => req.bySection.filter((x) => x.sign === sign).every((x) => groupsArea(barsAt(a, x.section)[sign === 'pos' ? 'bottom' : 'top']) >= x.req - 1e-6);
  const maxOk = SECTION_NAMES.every((s) => groupsArea(barsAt(a, s).bottom) <= req.asMax + 1e-6 && groupsArea(barsAt(a, s).top) <= req.asMax + 1e-6);
  const reqAt = (s: SectionName, sign: 'pos' | 'neg') => Math.max(0, ...req.bySection.filter((x) => x.section === s && x.sign === sign).map((x) => x.req));
  const worstCrack = (face: 'top' | 'bottom', used: boolean) => {
    const all = SECTION_NAMES.map((s) => {
      const groups = barsAt(a, s)[face];
      const dd = d.h - faceLayout(groups, d.b, c.cover, sd).centroidFromFace;
      return crackFace(groups, d.b, d.h, dd, c.cover, sd, reqAt(s, face === 'bottom' ? 'pos' : 'neg'), m, used);
    });
    return all.find((x) => !x.ok) ?? all.reduce((w, x) => (x.sigma > w.sigma ? x : w));
  };
  const crackBottom = worstCrack('bottom', true), crackTop = worstCrack('top', req.top > 0);
  const ab = barArea(sd), legs = Math.max(1, a.stirrups.legs);
  const perLegProvided = a.stirrups.spacing > 0 ? ab / a.stirrups.spacing : 0;
  const forShear = Math.max(0, legs * (perLegProvided - req.tPerLeg)) * 1e-4;
  const asl = Math.min(groupsArea(a.bottom), req.top > 0 ? groupsArea(a.top) : groupsArea(a.bottom)) * 1e-4;
  const cap = shearCapacity(d.b, shearDepth(d, c, a, req.top > 0), asl, forShear, m, p, req.sigmaCp, req.neglect ? p.cotThetaMax : req.cot);
  const rhoW = a.stirrups.spacing > 0 ? (legs * ab * 1e-4) / (a.stirrups.spacing * d.b) : 0;
  const al = a.torsionLong;
  const alProvided = al ? al.count * barArea(al.dia) : 0;
  const alSpacing = al && al.count > 0 ? hoopPerimeter(d, c, sd) / al.count : Infinity;
  const ok = {
    stirrups: perLegProvided >= req.perLeg - 1e-6,
    linkMin: rhoW >= req.shear.rhoWMin - 1e-9,
    spacing: a.stirrups.spacing <= req.sMax + 1e-6,
    legs: a.stirrups.legs >= req.legs,
    al: req.neglect || alProvided >= req.alReq - 1e-6,
    alSpacing: req.neglect || alSpacing <= 0.35 + 1e-6,
    torsionSection: req.torSection,
  };
  const shearOk = req.vEd <= cap.vrd + 1e-6;
  const fitBottom = fits('bottom'), fitTop = fits('top'), areaBottom = areaOk('pos'), areaTop = areaOk('neg');
  const all = flex.every((f) => f.ok) && fitBottom && fitTop && areaBottom && areaTop && maxOk && crackBottom.ok && crackTop.ok && shearOk && Object.values(ok).every(Boolean);
  return { flex, xd, fitBottom, fitTop, areaBottom, areaTop, maxOk, crackBottom, crackTop, vrd: cap.vrd, vrdMax: cap.vrdMax, shearOk, perLegProvided, rhoW, ok, alProvided, alSpacing, all };
}

const LONG = (c: BeamContext) => c.diameters.filter((x) => x >= 10 && x <= 25);

function bumpFace(groups: BarGroup[], d: BeamDemand, c: BeamContext, sd: number): BarGroup[] {
  const cur = groups.find((g) => g.count > 0)?.dia ?? GUESS_DIA;
  return proposeBeamFace(groupsArea(groups) + barArea(cur) * 0.999, d.b, d.h, c.cover, sd, LONG(c));
}

function finerFace(groups: BarGroup[], d: BeamDemand, c: BeamContext, sd: number): BarGroup[] {
  const cur = groups.find((g) => g.count > 0)?.dia ?? GUESS_DIA;
  const pool = LONG(c).filter((x) => x < cur);
  return proposeBeamFace(groupsArea(groups), d.b, d.h, c.cover, sd, pool.length ? pool : LONG(c));
}

function improve(a: BeamAdopted, e: BeamEval, req: BeamReq, d: BeamDemand, c: BeamContext): BeamAdopted {
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
  if (!e.ok.legs) next.stirrups.legs = req.legs;
  if (!e.ok.spacing) next.stirrups.spacing = roundDown(req.sMax);
  if (!e.shearOk || !e.ok.stirrups || !e.ok.linkMin) {
    const more = moreStirrup(next.stirrups, c, Math.min(0.15, roundDown(req.sMax)));
    if (more) next.stirrups = more;
    else next.stirrups.legs += 2;
  }
  if (!e.ok.al || !e.ok.alSpacing) {
    const ph = hoopPerimeter(d, c, sd);
    const al = next.torsionLong ?? { count: 4, dia: 10 };
    const count = Math.max(4, al.count, 2 * Math.ceil(ph / 0.35 / 2));
    const dia = !e.ok.al ? beamBarWhere(c, (x) => count * barArea(x) >= req.alReq - 1e-6) : al.dia;
    next.torsionLong = { count: count * barArea(dia) < req.alReq - 1e-6 ? count + 2 : count, dia };
  }
  return next;
}


export function makeBeamRow(set: Ec2Set) {
  return function beamRow(d: BeamDemand, c: BeamContext, adopted: BeamAdopted | undefined, fmt: Fmt): BeamRow {
    const m = matOf(c.mat.fc, c.mat.fy, set.p);
    const req = requirement(set, d, c, m);
    const ph = hoopPerimeter(d, c, c.stirrupDia);
    const initial: BeamAdopted = {
      bottom: proposeBeamFace(req.bottom, d.b, d.h, c.cover, c.stirrupDia, c.diameters),
      top: req.top > 0 ? proposeBeamFace(req.top, d.b, d.h, c.cover, c.stirrupDia, c.diameters) : [{ count: 2, dia: hangerBar(c) }],
      stirrups: proposeStirrups(req.perLeg, req.legs, roundDown(req.sMax), c),
      ...(req.neglect ? {} : { torsionLong: { count: Math.max(4, 2 * Math.ceil(ph / 0.35 / 2)), dia: 10 } }),
    };
    let proposed = initial, iterations = 0;
    let ev = evaluate(set, d, c, proposed, req, m);
    const loop = () => {
      for (let k = 0; !ev.all && k < MAX_ITERATIONS; k++) {
        iterations++;
        proposed = improve(proposed, ev, req, d, c);
        ev = evaluate(set, d, c, proposed, req, m);
      }
    };
    loop();
    if (!adopted && !ev.flex.every((f) => f.ok)) {
      const faces = searchFaces(proposed, req.bottom, req.top, d, c, (x) => flexChecks(set, d, c, x, m).every((f) => f.ok));
      proposed = faces ?? { ...proposed, bottom: initial.bottom, top: initial.top };
      ev = evaluate(set, d, c, proposed, req, m);
      if (faces) loop();
    }
    for (let k = 0; !adopted && ev.all && k < MAX_ITERATIONS; k++) {
      const bad = beamCombos(set, d, c, proposed, req, m, fmt).rows.filter((r) => !r.ok);
      if (!bad.length) break;
      const next: BeamAdopted = JSON.parse(JSON.stringify(proposed));
      const sd = next.stirrups.dia;
      if (bad.some((r) => r.short.bottom)) next.bottom = bumpFace(next.bottom, d, c, sd);
      if (bad.some((r) => r.short.top)) next.top = bumpFace(next.top, d, c, sd);
      if (bad.some((r) => r.short.stirrups)) next.stirrups = moreStirrup(next.stirrups, c, Math.min(0.15, roundDown(req.sMax))) ?? { ...next.stirrups, legs: next.stirrups.legs + 2 };
      if (JSON.stringify(next) === JSON.stringify(proposed)) break;
      iterations++;
      proposed = next;
      ev = evaluate(set, d, c, proposed, req, m);
      loop();
    }
    const a = adopted ?? proposed;
    const e = adopted ? evaluate(set, d, c, a, req, m) : ev;
    const combos = beamCombos(set, d, c, a, req, m, fmt);
    const worst = combos.rows.reduce<(typeof combos.rows)[number] | undefined>((w, x) => (!w || x.ratio > w.ratio ? x : w), undefined);
    const verifications = [
      ...beamVerifications(set, d, req, e, a, m, fmt),
      ...(worst ? [check('rcSheets.v.everyCombo', worst.ok, { clause: '6.1, 6.2, 6.3', demand: worst.combo, ratio: worst.ratio })] : []),
    ];
    const allOk = verifications.every((v) => v.ok);
    const generous = isGenerous(verifications);
    const gPos = req.items.filter((x) => x.sign === 'pos').reduce((w, x) => (x.req > w.req + 1e-9 || (Math.abs(x.req - w.req) <= 1e-9 && x.mu > w.mu) ? x : w));
    const hog = req.items.filter((x) => x.sign === 'neg' && x.mu > 1e-6);
    const gNeg = hog.length ? hog.reduce((w, x) => (x.req > w.req + 1e-9 ? x : w)) : req.items.find((x) => x.sign === 'neg')!;
    return {
      family: 'beam', key: d.key, name: d.name, level: d.level, b: d.b, h: d.h, length: d.length, demand: d,
      req: {
        bottom: req.bottom, top: req.top, bottomAt: gPos.section, topAt: gNeg.section, stirrupPerLeg: req.perLeg, legs: req.legs, sMax: req.sMax,
        al: req.alReq, torsionNeglected: req.neglect, tuDesign: req.compat ? 0 : d.tu.value, skin: req.skin ? req.skin.mesh : null, bySection: req.bySection,
        ...(req.compTop > 0 || req.compBottom > 0 ? { compression: { top: req.compTop, bottom: req.compBottom } } : {}),
      },
      proposed, adopted: a, isAdopted: !!adopted, iterations: adopted ? 0 : iterations, flexure: e.flex, verifications,
      combos: { headers: combos.headers, rows: combos.rows.map(({ short: _, ...r }) => r) },
      status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous,
      steps: beamSteps(set, d, c, req, e, a, m, fmt, { gPos, gNeg, adopted: !!adopted, iterations, verified: ev.all }),
    };
  };
}
