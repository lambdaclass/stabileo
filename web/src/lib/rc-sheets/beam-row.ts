import { checkFlexure, checkShear, checkTorsion, type ConcreteDesignParams } from '../engine/codes/argentina/cirsoc201';
import { evaluateBeamSection } from '../engine/codes/argentina/cirsoc201-beam-kernel';
import { beta1, ductilityStrain, phiFromStrain, shearSqrtFc, tensionControlledStrain } from '../engine/codes/argentina/cirsoc201-basis';
import { barArea, faceLayout, groupsArea, groupsLabel, proposeBeamFace, roundDown, stirrupsLabel } from './bars';
import type { Fmt } from './format';
import type { BarGroup, BeamAdopted, Materials, RowStatus, Signed, Step, StepGroup, Stirrups, TorsionMode } from './types';

const EDITION = '2025' as const;
const PHI_V = 0.75;

export interface BeamDemand {
  key: string;
  name: string;
  level?: string;
  /** m. */
  length: number; b: number; h: number;
  /** kN·m, magnitudes. */
  mPos: Signed; mNegStart: Signed; mNegEnd: Signed;
  /** kN, positive in compression, at each governing moment and at the governing shear. */
  nAtPos: number; nAtNegStart: number; nAtNegEnd: number;
  vu: Signed; nAtV: number;
  tu: Signed;
}

export interface BeamContext {
  mat: Materials;
  /** m, clear cover to the stirrup. */
  cover: number;
  /** mm, the stirrup the depth arithmetic assumes. */
  stirrupDia: number;
  diameters: readonly number[];
  torsion: TorsionMode;
}

export interface FlexureCheck { phiMn: number; mu: number; epsT: number; epsTMin: number; d: number; ok: boolean }

export interface BeamRow {
  family: 'beam';
  key: string; name: string; level?: string;
  b: number; h: number; length: number;
  demand: BeamDemand;
  req: {
    bottom: number; top: number; topSide: 'start' | 'end';
    /** cm²/m per stirrup leg, shear and torsion together. */
    stirrupPerLeg: number; legs: number; sMax: number;
    al: number; torsionNeglected: boolean; tuDesign: number;
  };
  proposed: BeamAdopted;
  adopted: BeamAdopted;
  isAdopted: boolean;
  checks: {
    sag: FlexureCheck; hogStart: FlexureCheck; hogEnd: FlexureCheck;
    fitBottom: boolean; fitTop: boolean;
    areaBottom: boolean; areaTop: boolean;
    shear: { phiVn: number; vu: number; ok: boolean };
    stirrups: { provided: number; required: number; ok: boolean };
    al: { provided: number; required: number; ok: boolean };
    torsionSection: boolean;
  };
  status: RowStatus;
  /** Adopted steel more than 1,2 times what is needed somewhere: the sheets' «VER». */
  generous: boolean;
  steps: StepGroup[];
}

const paramsOf = (d: BeamDemand, c: BeamContext, stirrupDia = c.stirrupDia): ConcreteDesignParams =>
  ({ fc: c.mat.fc, fy: c.mat.fy, cover: c.cover, b: d.b, h: d.h, stirrupDia });

function flexCheck(c: BeamContext, d: BeamDemand, tension: BarGroup[], compression: BarGroup[], stirrupDia: number, mu: number, nc: number): FlexureCheck {
  const t = faceLayout(tension, d.b, c.cover, stirrupDia);
  const k = faceLayout(compression, d.b, c.cover, stirrupDia);
  const depth = d.h - t.centroidFromFace;
  const r = evaluateBeamSection({
    edition: EDITION, fc: c.mat.fc * 1e6, fy: c.mat.fy * 1e6, b: d.b, h: d.h, d: depth,
    As: groupsArea(tension) * 1e-4, AsComp: groupsArea(compression) * 1e-4, dPrime: k.centroidFromFace,
    Ag: d.b * d.h, NuCompression: nc * 1e3,
  });
  const phiMn = r && r.flexureValid && Number.isFinite(r.phiMn) ? r.phiMn / 1e3 : 0;
  const epsT = r?.epsilonT ?? 0, epsTMin = r?.epsilonTMin ?? 0;
  const ductile = !(mu > 1e-6) || epsT >= epsTMin - 1e-9;
  return { phiMn, mu, epsT, epsTMin, d: depth, ok: phiMn >= mu - 1e-6 && ductile };
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

export function beamRow(d: BeamDemand, c: BeamContext, adopted: BeamAdopted | undefined, fmt: Fmt): BeamRow {
  const p = paramsOf(d, c);
  const fc = c.mat.fc;

  const sag = checkFlexure(p, d.mPos.value, d.nAtPos, { edition: EDITION });
  const hs = checkFlexure(p, d.mNegStart.value, d.nAtNegStart, { edition: EDITION });
  const he = checkFlexure(p, d.mNegEnd.value, d.nAtNegEnd, { edition: EDITION });
  const topSide: 'start' | 'end' = he.AsReq > hs.AsReq ? 'end' : 'start';
  const hog = topSide === 'end' ? he : hs;
  const mHog = topSide === 'end' ? d.mNegEnd : d.mNegStart;
  const nHog = topSide === 'end' ? d.nAtNegEnd : d.nAtNegStart;

  const shear = checkShear(p, d.vu.value, d.nAtV, { edition: EDITION, AsTensionCm2: sag.AsReq });
  const tor0 = checkTorsion(p, d.tu.value, d.vu.value, EDITION);
  const tuDesign = !tor0.neglect && c.torsion === 'compatibility' ? Math.min(d.tu.value, PHI_V * tor0.Tcr) : d.tu.value;
  const tor = tuDesign === d.tu.value ? tor0 : checkTorsion(p, tuDesign, d.vu.value, EDITION);
  const legs = Math.max(2, shear.stirrupLegs);
  const ph = 2 * ((d.b - 2 * c.cover - c.stirrupDia / 1000) + (d.h - 2 * c.cover - c.stirrupDia / 1000));
  const shearPerLeg = Math.max(shear.AvOverSReq ?? 0, shear.AvOverSMin) / legs;
  const perLeg = shearPerLeg + (tor.neglect ? 0 : tor.AtOverS);
  const sMax = Math.min(sMaxShear(shear.d, d.b, fc, shear.Vs), tor.neglect ? Infinity : Math.min(ph / 8, 0.3));

  const proposed: BeamAdopted = {
    bottom: proposeBeamFace(sag.AsReq, d.b, d.h, c.cover, c.stirrupDia, c.diameters),
    top: proposeBeamFace(hog.AsReq, d.b, d.h, c.cover, c.stirrupDia, c.diameters),
    stirrups: proposeStirrups(perLeg, legs, roundDown(sMax), [6, 8, 10, 12], c.stirrupDia),
    ...(tor.neglect ? {} : { torsionLong: { count: 4, dia: alDia(tor.AlReq) } }),
  };
  const a = adopted ?? proposed;
  const sd = a.stirrups.dia;

  const sagC = flexCheck(c, d, a.bottom, a.top, sd, d.mPos.value, d.nAtPos);
  const hsC = flexCheck(c, d, a.top, a.bottom, sd, d.mNegStart.value, d.nAtNegStart);
  const heC = flexCheck(c, d, a.top, a.bottom, sd, d.mNegEnd.value, d.nAtNegEnd);
  const fitBottom = faceLayout(a.bottom, d.b, c.cover, sd).fits;
  const fitTop = faceLayout(a.top, d.b, c.cover, sd).fits;
  const shearA = checkShear(paramsOf(d, c, sd), d.vu.value, d.nAtV, { edition: EDITION, AsTensionCm2: groupsArea(a.bottom), spacing: a.stirrups.spacing, legs: a.stirrups.legs });
  const providedPerLeg = a.stirrups.spacing > 0 ? barArea(sd) / a.stirrups.spacing : 0;
  const reqPerLegA = Math.max(shearA.AvOverSReq ?? 0, shearA.AvOverSMin) / Math.max(1, a.stirrups.legs) + (tor.neglect ? 0 : tor.AtOverS);
  const alProv = a.torsionLong ? a.torsionLong.count * barArea(a.torsionLong.dia) : 0;
  const alReq = tor.neglect ? 0 : tor.AlReq;

  const checks: BeamRow['checks'] = {
    sag: sagC, hogStart: hsC, hogEnd: heC, fitBottom, fitTop,
    areaBottom: groupsArea(a.bottom) >= sag.AsReq - 1e-6, areaTop: groupsArea(a.top) >= hog.AsReq - 1e-6,
    shear: { phiVn: shearA.phiVn, vu: d.vu.value, ok: shearA.status !== 'fail' },
    stirrups: { provided: providedPerLeg, required: reqPerLegA, ok: providedPerLeg >= reqPerLegA - 1e-6 },
    al: { provided: alProv, required: alReq, ok: alProv >= alReq - 1e-6 },
    torsionSection: tor.status !== 'fail',
  };
  const allOk = sagC.ok && hsC.ok && heC.ok && fitBottom && fitTop && checks.areaBottom && checks.areaTop && checks.shear.ok && checks.stirrups.ok && checks.al.ok && checks.torsionSection;
  const generous = groupsArea(a.bottom) > 1.2 * sag.AsReq + 1e-6 || groupsArea(a.top) > 1.2 * hog.AsReq + 1e-6;

  const steps: StepGroup[] = [
    dataSteps(d, c, fmt),
    flexureSteps('rcSheets.g.flexSpan', d, c, sag, d.mPos, d.nAtPos, a.bottom, sagC, fitBottom, fmt),
    flexureSteps('rcSheets.g.flexSupport', d, c, hog, mHog, nHog, a.top, topSide === 'end' ? heC : hsC, fitTop, fmt),
    shearSteps(d, c, shear, shearA, a.stirrups, fmt),
    torsionSteps(d, tor0, tor, tuDesign, perLeg, providedPerLeg, alReq, alProv, a, fmt),
  ];

  return {
    family: 'beam', key: d.key, name: d.name, level: d.level, b: d.b, h: d.h, length: d.length, demand: d,
    req: { bottom: sag.AsReq, top: hog.AsReq, topSide, stirrupPerLeg: perLeg, legs, sMax, al: alReq, torsionNeglected: tor.neglect, tuDesign },
    proposed, adopted: a, isAdopted: !!adopted, checks,
    status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
  };
}

function sMaxShear(dEff: number, bw: number, fc: number, vs: number): number {
  const lim = 0.33 * shearSqrtFc(fc) * bw * dEff * 1000;
  return vs > lim ? Math.min(dEff / 4, 0.3) : Math.min(dEff / 2, 0.6);
}

function alDia(al: number): number {
  for (const dia of [10, 12, 16, 20, 25]) if (4 * barArea(dia) >= al) return dia;
  return 25;
}

function dataSteps(d: BeamDemand, c: BeamContext, f: Fmt): StepGroup {
  const src = (s: Signed) => (s.source ? ` (${s.source.combo})` : '');
  return {
    title: 'rcSheets.g.data',
    steps: [
      { label: 'rcSheets.s.section', formula: 'b × h', value: `${f(d.b * 100, 0)} × ${f(d.h * 100, 0)} cm` },
      { label: 'rcSheets.s.materials', formula: "f'c · fy", value: `${f(c.mat.fc, 0)} · ${f(c.mat.fy, 0)} MPa` },
      { label: 'rcSheets.s.cover', formula: 'r', value: `${f(c.cover * 100, 1)} cm` },
      { label: 'rcSheets.s.muSpan', formula: 'Mu⁺', value: `${f(d.mPos.value)} kN·m${src(d.mPos)}` },
      { label: 'rcSheets.s.muSupport', formula: 'Mu⁻ (i · j)', value: `${f(d.mNegStart.value)} · ${f(d.mNegEnd.value)} kN·m` },
      { label: 'rcSheets.s.vu', formula: 'Vu', value: `${f(d.vu.value)} kN${src(d.vu)}` },
      { label: 'rcSheets.s.tu', formula: 'Tu', value: `${f(d.tu.value)} kN·m${src(d.tu)}` },
      { label: 'rcSheets.s.nu', formula: 'Nu', value: `${f(d.nAtPos)} kN` },
    ],
  };
}

function flexureSteps(
  title: string, d: BeamDemand, c: BeamContext, r: ReturnType<typeof checkFlexure>, mu: Signed, nc: number,
  bars: BarGroup[], chk: FlexureCheck, fits: boolean, f: Fmt,
): StepGroup {
  const fy = c.mat.fy, fc = c.mat.fc;
  const b1 = beta1(fc);
  const etc = tensionControlledStrain(fy, EDITION);
  const epsMin = ductilityStrain(fy, EDITION);
  const mus = mu.value + nc * (r.d - d.h / 2);
  const a = r.aReq, cc = 0.85 * fc * 1000 * a * d.b;
  const phi = r.epsilonT > 0 ? phiFromStrain(r.epsilonT, fy, 'ties', EDITION) : 0.9;
  const steps: Step[] = [
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
    if (r.isDoublyReinforced && r.AsComp) {
      steps.push({ label: 'rcSheets.s.compression', formula: "A's (Cs = ΔM/jds)", value: `${f(r.AsComp)} cm²` });
    }
    steps.push({ label: 'rcSheets.s.asStrength', formula: 'T = Mus/(φ·jdc) − Nu/φ; As = T/fy', value: `${f(r.AsFlexural)} cm²` });
  }
  steps.push(
    { label: 'rcSheets.s.asMin', formula: "As,min = max(√f'c/(4·fy); 1.4/fy)·bw·d", value: `${f(r.AsMin)} cm²` },
    { label: 'rcSheets.s.asReq', formula: 'As,nec', value: `${f(r.AsReq)} cm²` },
    { label: 'rcSheets.s.adopted', formula: groupsLabel(bars), value: `${f(groupsArea(bars))} cm²`, ok: groupsArea(bars) >= r.AsReq - 1e-6 },
    { label: 'rcSheets.s.fits', formula: 'b − 2r − 2Øe − n·Ø − (n − 1)·max(Ø; 25 mm) ≥ 0', value: '', ok: fits },
    { label: 'rcSheets.s.verify', formula: `d = ${f(chk.d * 100, 1)} cm; εt = ${f(chk.epsT * 1000, 2)} ‰ ≥ ${f(chk.epsTMin * 1000, 2)} ‰`, value: `φMn = ${f(chk.phiMn)} ≥ Mu = ${f(chk.mu)} kN·m`, ok: chk.ok },
  );
  return { title, steps };
}

function shearSteps(d: BeamDemand, c: BeamContext, s: ReturnType<typeof checkShear>, sa: ReturnType<typeof checkShear>, st: Stirrups, f: Fmt): StepGroup {
  const sq = shearSqrtFc(c.mat.fc);
  const vc = s.phiVc / PHI_V;
  const l1 = 0.33 * sq * d.b * s.d * 1000, l2 = 0.66 * sq * d.b * s.d * 1000;
  const zone = s.Vs <= 1e-9 ? 'rcSheets.s.zone1' : s.Vs <= l1 ? 'rcSheets.s.zone2' : s.Vs <= l2 ? 'rcSheets.s.zone3' : 'rcSheets.s.zoneOver';
  return {
    title: 'rcSheets.g.shear',
    steps: [
      { label: 'rcSheets.s.vc', formula: 'Vc (Tabla 22.5.5.1)', value: `${f(vc)} kN` },
      { label: 'rcSheets.s.vs', formula: 'Vs = Vu/φ − Vc', value: `${f(s.Vs)} kN` },
      { label: zone, formula: `0.33·√f'c·bw·d = ${f(l1, 1)} kN; 0.66·√f'c·bw·d = ${f(l2, 1)} kN`, value: '', ok: s.Vs <= l2 + 1e-6 },
      { label: 'rcSheets.s.avMin', formula: 'Av,min/s (§9.6.3.4)', value: `${f(s.AvOverSMin)} cm²/m` },
      { label: 'rcSheets.s.avReq', formula: 'Av/s = Vs/(fyt·d)', value: `${f(s.AvOverSReq ?? 0)} cm²/m` },
      { label: 'rcSheets.s.stirrups', formula: stirrupsLabel(st), value: '' },
      { label: 'rcSheets.s.verifyShear', formula: 'φVn = φ·(Vc + Av·fyt·d/s)', value: `${f(sa.phiVn)} ≥ Vu = ${f(d.vu.value)} kN`, ok: sa.status !== 'fail' },
    ],
  };
}

function torsionSteps(
  d: BeamDemand, t0: ReturnType<typeof checkTorsion>, t: ReturnType<typeof checkTorsion>, tuDesign: number,
  perLeg: number, provided: number, alReq: number, alProv: number, a: BeamAdopted, f: Fmt,
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
      { label: 'rcSheets.s.legReq', formula: 'Av/(n·s) + At/s', value: `${f(perLeg)} cm²/m` },
      { label: 'rcSheets.s.legProv', formula: `${stirrupsLabel(a.stirrups)}: Ab/s`, value: `${f(provided)} cm²/m`, ok: provided >= perLeg - 1e-6 },
      { label: 'rcSheets.s.alReq', formula: 'Al = (At/s)·ph', value: `${f(alReq)} cm²` },
      { label: 'rcSheets.s.alProv', formula: a.torsionLong ? groupsLabel([a.torsionLong]) : '—', value: `${f(alProv)} cm²`, ok: alProv >= alReq - 1e-6 },
      { label: 'rcSheets.s.torsionSection', formula: "√((Vu/bw·d)² + (Tu·ph/1.7·Aoh²)²) ≤ φ·(Vc/bw·d + 0.66·√f'c)", value: '', ok: t.status !== 'fail' },
    );
  }
  return { title: 'rcSheets.g.torsion', steps };
}
