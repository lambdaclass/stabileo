import { barArea, groupsArea, groupsLabel, meshLabel, stirrupsLabel } from '../bars';
import type { BeamContext, BeamDemand, SectionName } from '../beam-row';
import type { Fmt } from '../format';
import { check, ratioOf, type BeamAdopted, type CheckLine, type ComboTable, type Signed, type Step, type StepGroup } from '../types';
import { shearCapacity, xuLimit, type Ec2Set, type Mat } from './basis';
import { barsAt, beamCapacity, geomOf } from './beam-section';
import type { BeamEval, BeamReq } from './beam-row';

const KPA = 1000;
type ReqItem = BeamReq['items'][number];

export function beamVerifications(set: Ec2Set, d: BeamDemand, req: BeamReq, e: BeamEval, a: BeamAdopted, m: Mat, fmt: Fmt): CheckLine[] {
  const f2 = (v: number) => fmt(v);
  const faceMax = Math.max(...(['start', 'span', 'end'] as const).flatMap((s) => [groupsArea(barsAt(a, s).bottom), groupsArea(barsAt(a, s).top)]));
  const cr = [e.crackBottom, ...(req.top > 0 ? [e.crackTop] : [])].reduce((w, x) => (!x.ok ? x : w));
  return [
    ...e.flex.filter((x) => x.mu > 1e-6).map((x) => check(x.sign === 'pos' ? `rcSheets.v.flexPos.${x.section}` : `rcSheets.v.flexNeg.${x.section}`, x.ok, {
      clause: '6.1, 3.1.7(3)', demand: `${f2(x.mu)} kN·m`, capacity: `${f2(x.phiMn)} kN·m`, ratio: ratioOf(x.mu, x.phiMn),
    })),
    ...e.flex.map((x, i) => ({ x, xd: e.xd[i]! })).filter(({ x }) => x.mu > 1e-6 && !x.ductile).map(({ xd }) => check('rcSheets.ec2.v.xd', false, {
      clause: '5.5(4)', demand: `x/d = ${fmt(xd, 3)}`, capacity: `≤ ${fmt(xuLimit(m.fck, set.p), 2)}`,
    })),
    check('rcSheets.v.minBottom', e.areaBottom, { clause: '6.1, 9.2.1.1(1)', demand: `${f2(req.bottom)} cm²`, capacity: `${f2(groupsArea(a.bottom))} cm²`, ratio: ratioOf(req.bottom, groupsArea(a.bottom)) }),
    ...(req.top > 0 ? [check('rcSheets.v.minTop', e.areaTop, { clause: '6.1, 9.2.1.1(1)', demand: `${f2(req.top)} cm²`, capacity: `${f2(groupsArea(a.top))} cm²`, ratio: ratioOf(req.top, groupsArea(a.top)) })] : []),
    check('rcSheets.ec2.v.asMax', e.maxOk, { clause: '9.2.1.1(3)', demand: `${f2(faceMax)} cm²`, capacity: `≤ ${f2(req.asMax)} cm²`, ratio: ratioOf(faceMax, req.asMax) }),
    check('rcSheets.v.fitBottom', e.fitBottom, { clause: '8.2(2)' }),
    check('rcSheets.v.fitTop', e.fitTop, { clause: '8.2(2)' }),
    check('rcSheets.ec2.v.crack', e.crackBottom.ok && e.crackTop.ok, {
      clause: '7.3.3(2)', demand: `σs = ${fmt(cr.sigma, 0)} MPa; s = ${fmt(cr.s, 0)} mm; Ø${cr.dia}`, capacity: `s ≤ ${fmt(cr.sMax, 0)} mm | Ø ≤ ${fmt(cr.diaMax, 1)} mm`,
    }),
    check('rcSheets.v.shear', e.shearOk, { clause: '6.2.2(1), 6.2.3(3)', demand: `${f2(req.vEd)} kN`, capacity: `${f2(e.vrd)} kN`, ratio: ratioOf(req.vEd, e.vrd) }),
    check('rcSheets.ec2.v.linkMin', e.ok.linkMin, { clause: '9.2.2(5)', demand: `ρw,min = ${fmt(req.shear.rhoWMin * 1000, 3)} ‰`, capacity: `ρw = ${fmt(e.rhoW * 1000, 3)} ‰`, ratio: ratioOf(req.shear.rhoWMin, e.rhoW) }),
    check('rcSheets.v.stirrupSpacing', e.ok.spacing, { clause: req.neglect ? '9.2.2(6)' : '9.2.2(6), 9.2.3(3)', demand: `${fmt(a.stirrups.spacing * 100, 1)} cm`, capacity: `≤ ${fmt(req.sMax * 100, 1)} cm` }),
    check('rcSheets.ec2.v.legs', e.ok.legs, { clause: '9.2.2(8)', demand: String(a.stirrups.legs), capacity: `≥ ${req.legs} (st ≤ ${fmt(req.stMax * 100, 1)} cm)` }),
    ...torsionLines(d, req, e, fmt),
    ...(req.skin ? [check('rcSheets.ec2.v.skin', true, { clause: '7.3.3(3)', capacity: `${meshLabel(req.skin.mesh)} (${f2(req.skin.area)} cm²)` })] : []),
  ];
}

function torsionLines(d: BeamDemand, req: BeamReq, e: BeamEval, fmt: Fmt): CheckLine[] {
  if (d.tu.value <= 1e-6) return [];
  if (req.compat) return [check('rcSheets.ec2.v.torsionCompat', true, { clause: '6.3.1(2)', demand: `${fmt(d.tu.value)} kN·m` })];
  if (req.neglect) return [check('rcSheets.ec2.v.torsionMin', true, { clause: '6.3.2(5)', demand: fmt(req.screen, 3), capacity: '≤ 1', ratio: req.screen })];
  return [
    check('rcSheets.v.stirrupsVT', e.ok.stirrups, { clause: '6.2.3(3), 6.3.2(2)', demand: `${fmt(req.perLeg)} cm²/m`, capacity: `${fmt(e.perLegProvided)} cm²/m`, ratio: ratioOf(req.perLeg, e.perLegProvided) }),
    check('rcSheets.v.al', e.ok.al, { clause: '6.3.2(3)', demand: `${fmt(req.alReq)} cm²`, capacity: `${fmt(e.alProvided)} cm²`, ratio: ratioOf(req.alReq, e.alProvided) }),
    check('rcSheets.v.alSpacing', e.ok.alSpacing, { clause: '9.2.3(4)', demand: `${fmt(Number.isFinite(e.alSpacing) ? e.alSpacing * 100 : 0, 1)} cm`, capacity: '≤ 35 cm' }),
    check('rcSheets.v.torsionSection', e.ok.torsionSection, { clause: '6.3.2(4)', demand: fmt(req.interaction, 3), capacity: '≤ 1', ratio: req.interaction }),
  ];
}

export function beamCombos(set: Ec2Set, d: BeamDemand, c: BeamContext, a: BeamAdopted, req: BeamReq, m: Mat, fmt: Fmt): ComboTable {
  const g = geomOf(d), sd = a.stirrups.dia, p = set.p;
  const S = barsAt(a, 'start'), M = barsAt(a, 'span'), E = barsAt(a, 'end');
  const cap = (t: typeof S.top, k: typeof S.top, sag: boolean, n: number) => beamCapacity(g, c.cover, sd, t, k, sag, n, m, p).mrd;
  const legs = Math.max(1, a.stirrups.legs), ab = barArea(sd);
  const perLegProvided = a.stirrups.spacing > 0 ? ab / a.stirrups.spacing : 0;
  const asl = Math.min(groupsArea(a.bottom), req.top > 0 ? groupsArea(a.top) : groupsArea(a.bottom)) * 1e-4;
  const fywd = m.fyd * KPA;
  const rows = d.combos.map((k) => {
    const r = (mo: number, pos: () => number, neg: () => number) => (mo >= 0 ? ratioOf(mo, pos()) : ratioOf(-mo, neg()));
    const flex = Math.max(
      r(k.mStart, () => cap(S.bottom, S.top, true, k.nStart), () => cap(S.top, S.bottom, false, k.nStart)),
      r(k.mSpan, () => cap(M.bottom, M.top, true, k.nSpan), () => cap(M.top, M.bottom, false, k.nSpan)),
      r(k.mEnd, () => cap(E.bottom, E.top, true, k.nEnd), () => cap(E.top, E.bottom, false, k.nEnd)),
      ratioOf(k.mPos, cap(M.bottom, M.top, true, k.nSpan)),
      k.mNeg > 1e-6 ? ratioOf(k.mNeg, Math.min(cap(S.top, S.bottom, false, k.nStart), cap(E.top, E.bottom, false, k.nEnd), cap(M.top, M.bottom, false, k.nSpan))) : 0,
    );
    const t = req.compat ? 0 : k.t;
    const torsion = !req.neglect && t > 1e-6;
    const tLeg = torsion ? (t / (2 * req.tg.ak * fywd * req.cot)) * 1e4 : 0;
    const sCap = shearCapacity(d.b, req.dShear, asl, Math.max(0, legs * (perLegProvided - tLeg)) * 1e-4, m, p, k.nV / (d.b * d.h * KPA), torsion ? req.cot : p.cotThetaMax);
    const need = k.v > sCap.vrdc ? (k.v / (req.shear.z * fywd * (torsion ? req.cot : sCap.cot))) * 1e4 : 0;
    const stir = ratioOf(need / legs + tLeg, perLegProvided);
    const ratio = Math.max(flex, stir, ratioOf(k.v, sCap.vrd));
    return { combo: k.combo, values: [fmt(k.mStart, 1), fmt(k.mSpan, 1), fmt(k.mEnd, 1), fmt(k.v, 1), fmt(k.t, 1), fmt(k.nSpan, 1)], ratio, ok: ratio <= 1 + 1e-6 };
  });
  return { headers: ['M i', 'M x*', 'M j', 'V', 'T', 'N'], rows };
}

interface StepMeta { gPos: ReqItem; gNeg: ReqItem; adopted: boolean; iterations: number; verified: boolean }

export function beamSteps(set: Ec2Set, d: BeamDemand, c: BeamContext, req: BeamReq, e: BeamEval, a: BeamAdopted, m: Mat, f: Fmt, meta: StepMeta): StepGroup[] {
  return [
    dataSteps(set, d, c, m, f),
    flexureSteps('rcSheets.g.flexBottom', set, meta.gPos, req, e, a.bottom, 'pos', m, f),
    ...(req.top > 0 ? [flexureSteps('rcSheets.g.flexTop', set, meta.gNeg, req, e, a.top, 'neg', m, f)] : []),
    shearSteps(d, req, e, a, f),
    torsionSteps(d, req, e, a, f),
    crackSteps(req, e, f),
    {
      title: 'rcSheets.g.proposal',
      steps: [meta.adopted ? { label: 'rcSheets.s.adoptedByUser', value: '' } : { label: 'rcSheets.s.iterations', formula: 'As(d) → MRd ≥ MEd; x/d ≤ xu/d; VRd ≥ VEd; s ≤ s,max', value: String(meta.iterations), ok: meta.verified }],
    },
  ];
}

function dataSteps(set: Ec2Set, d: BeamDemand, c: BeamContext, m: Mat, f: Fmt): StepGroup {
  const src = (s: Signed) => (s.source ? ` (${s.source.combo})` : '');
  const sec = (name: SectionName, e: BeamDemand['start']): Step => ({
    label: `rcSheets.sec.${name}`, formula: `x = ${f(e.x)} m`, value: `M⁺ = ${f(e.pos.value)}${src(e.pos)} · M⁻ = ${f(e.neg.value)}${src(e.neg)} kN·m`,
  });
  const p = set.p;
  return {
    title: 'rcSheets.g.data',
    steps: [
      { label: 'rcSheets.s.section', formula: 'b × h · L', value: `${f(d.b * 100, 0)} × ${f(d.h * 100, 0)} cm · ${f(d.length)} m` },
      { label: 'rcSheets.s.materials', formula: 'fck · fyk', value: `${f(m.fck, 0)} · ${f(m.fyk, 0)} MPa` },
      { label: 'rcSheets.ec2.s.design', formula: `fcd = αcc·fck/γc (αcc = ${f(p.alphaCC, 2)}, γc = ${f(p.gammaC, 2)}); fyd = fyk/γs (γs = ${f(p.gammaS, 2)}) (3.1.6, 3.2.7, 2.4.2.4)`, value: `${f(m.fcd)} · ${f(m.fyd)} MPa` },
      { label: 'rcSheets.ec2.s.block', formula: 'λ · η · εcu3 (3.1.7(3))', value: `${f(m.lambda, 2)} · ${f(m.eta, 2)} · ${f(m.ecu3 * 1000, 2)} ‰` },
      { label: 'rcSheets.s.cover', formula: 'c', value: `${f(c.cover * 100, 1)} cm` },
      d.faces ? { label: 'rcSheets.s.atFaces', formula: 'MEd(x = c) · VEd, TEd(x = c + d)', value: `${f(d.faces.start * 100, 0)} · ${f(d.faces.end * 100, 0)} cm; d = ${f(d.faces.shearAt * 100, 0)} cm` } : { label: 'rcSheets.s.assumptionAxis', value: '' },
      ...(d.flange ? [{ label: 'rcSheets.s.flange', formula: 'beff = Σbeff,i + bw (5.3.2.1(3))', value: `beff = ${f(d.flange.bf * 100, 0)} cm; hf = ${f(d.flange.hf * 100, 0)} cm` }] : []),
      sec('start', d.start), sec('span', d.span), sec('end', d.end),
      ...(d.negAny.value > Math.max(d.start.neg.value, d.span.neg.value, d.end.neg.value) + 1e-6
        ? [{ label: 'rcSheets.s.negAny', formula: `x = ${f(d.negAny.source?.x ?? 0)} m`, value: `M⁻ = ${f(d.negAny.value)} kN·m${src(d.negAny)}` }] : []),
      { label: 'rcSheets.s.vu', formula: 'VEd', value: `${f(d.vu.value)} kN${src(d.vu)}` },
      { label: 'rcSheets.s.tu', formula: 'TEd', value: `${f(d.tu.value)} kN·m${src(d.tu)}` },
      { label: 'rcSheets.ec2.s.aggregate', formula: 'dg = 20 mm (8.2(2))', value: '' },
    ],
  };
}

function flexureSteps(title: string, set: Ec2Set, g: ReqItem, req: BeamReq, e: BeamEval, bars: BeamAdopted['bottom'], sign: 'pos' | 'neg', m: Mat, f: Fmt): StepGroup {
  const r = g.r, xl = xuLimit(m.fck, set.p);
  const steps: Step[] = [
    { label: `rcSheets.sec.${g.section}`, formula: `MEd = ${f(g.mu)} kN·m; NEd = ${f(g.n)} kN`, value: g.src.source?.combo ?? '' },
    { label: 'rcSheets.s.d', formula: 'd = h − c − Øw − Ø/2', value: `${f(req.dShear * 100, 1)} cm` },
  ];
  if (g.mu <= 1e-6) steps.push({ label: 'rcSheets.s.noMoment', value: '' });
  else {
    steps.push(
      { label: 'rcSheets.s.mus', formula: 'Ms = MEd + NEd·(d − h/2)', value: `${f(r.ms)} kN·m` },
      { label: 'rcSheets.ec2.s.xLimit', formula: `xu/d ≤ ${f(xl, 2)} (5.5(4), δ = 1); Mlim`, value: `${f(r.mlim)} kN·m` },
      { label: 'rcSheets.s.c', formula: 'η·fcd·b·λx·(d − λx/2) = Ms', value: `x = ${f(r.x * 100, 2)} cm; z = ${f(r.z * 100, 1)} cm` },
    );
    if (r.as2 > 0) steps.push({ label: 'rcSheets.s.compression', formula: "As2 = (Ms − Mlim)/(σs2·(d − d2))", value: `${f(r.as2 * 1e4)} cm²` });
    steps.push({ label: 'rcSheets.s.asStrength', formula: 'As = (η·fcd·b·λx + As2·σs2 − NEd)/fyd', value: `${f(r.as * 1e4)} cm²` });
  }
  steps.push(
    { label: 'rcSheets.s.asMin', formula: 'As,min = max(0.26·fctm/fyk; 0.0013)·bt·d (9.2.1.1(1))', value: `${f(g.asMin)} cm²` },
    { label: 'rcSheets.ec2.s.asMax', formula: 'As,max = 0.04·Ac (9.2.1.1(3))', value: `${f(req.asMax)} cm²` },
    { label: 'rcSheets.s.asReq', formula: 'As,req', value: `${f(sign === 'pos' ? req.bottom : req.top)} cm²` },
    { label: 'rcSheets.s.adopted', formula: groupsLabel(bars), value: `${f(groupsArea(bars))} cm²`, ok: groupsArea(bars) >= (sign === 'pos' ? req.bottom : req.top) - 1e-6 },
  );
  e.flex.forEach((k, i) => {
    if (k.sign !== sign || k.mu <= 1e-6) return;
    steps.push({ label: `rcSheets.sec.${k.section}`, formula: `d = ${f(k.d * 100, 1)} cm; x/d = ${f(e.xd[i]!, 3)} ≤ ${f(xl, 2)}; εs = ${f(k.epsT * 1000, 2)} ‰`, value: `MRd = ${f(k.phiMn)} ≥ ${f(k.mu)} kN·m`, ok: k.ok });
  });
  return { title, steps };
}

function shearSteps(d: BeamDemand, req: BeamReq, e: BeamEval, a: BeamAdopted, f: Fmt): StepGroup {
  const s = req.shear;
  return {
    title: 'rcSheets.g.shear',
    steps: [
      { label: 'rcSheets.s.vu', formula: 'VEd', value: `${f(d.vu.value)} kN${d.vu.source ? ` (${d.vu.source.combo})` : ''}` },
      { label: 'rcSheets.ec2.s.vrdc', formula: 'VRd,c = [CRd,c·k·(100·ρl·fck)^⅓ + k1·σcp]·bw·d ≥ (vmin + k1·σcp)·bw·d (6.2.2(1))', value: `k = ${f(s.k, 3)}; ρl = ${f(s.rhoL * 100, 3)} %; σcp = ${f(req.sigmaCp, 2)} MPa → ${f(s.vrdc)} kN` },
      { label: 'rcSheets.ec2.s.strut', formula: `VRd,max = bw·z·ν1·fcd/(cotθ + tanθ), z = 0.9·d, ${f(1, 0)} ≤ cotθ ≤ ${f(2.5, 1)} (6.2.3(2), (3))`, value: `cotθ = ${f(req.cot, 3)}; VRd,max = ${f(e.vrdMax)} kN` },
      { label: 'rcSheets.s.avReq', formula: 'Asw/s = VEd/(z·fywd·cotθ) (6.8)', value: `${f(req.aswS)} cm²/m` },
      { label: 'rcSheets.s.avMin', formula: 'ρw,min = 0.08·√fck/fyk (9.2.2(5))', value: `${f(s.rhoWMin * 1000, 3)} ‰ → ${f(s.aswMin * 1e4)} cm²/m` },
      { label: 'rcSheets.ec2.s.legs', formula: 'st,max = min(0.75·d; 600 mm) (9.2.2(8))', value: `${req.legs} · st,max = ${f(req.stMax * 100, 1)} cm` },
      { label: 'rcSheets.s.sMax', formula: req.neglect ? 'sl,max = 0.75·d (9.2.2(6))' : 'min(0.75·d; uk/8; min(b; h)) (9.2.2(6), 9.2.3(3))', value: `${f(req.sMax * 100, 1)} cm` },
      { label: 'rcSheets.s.stirrups', formula: stirrupsLabel(a.stirrups), value: '' },
      { label: 'rcSheets.s.verifyShear', formula: 'VRd = max(VRd,c; min(Asw/s·z·fywd·cotθ; VRd,max))', value: `${f(e.vrd)} ≥ VEd = ${f(d.vu.value)} kN`, ok: e.shearOk },
    ],
  };
}

function torsionSteps(d: BeamDemand, req: BeamReq, e: BeamEval, a: BeamAdopted, f: Fmt): StepGroup {
  const t = req.tg;
  const steps: Step[] = [
    { label: 'rcSheets.ec2.s.thinWall', formula: 'tef = A/u ≥ 2·c,bar; Ak; uk (6.3.2(1))', value: `${f(t.tef * 100, 1)} cm · ${f(t.ak * 1e4, 0)} cm² · ${f(t.uk, 2)} m` },
    { label: 'rcSheets.ec2.s.trdc', formula: 'TRd,c = 2·Ak·tef·fctd, fctd = αct·0.7·fctm/γc', value: `${f(t.trdc)} kN·m` },
  ];
  if (req.compat && d.tu.value > 1e-6) steps.push({ label: 'rcSheets.ec2.s.compatibility', formula: '6.3.1(2)', value: `${f(d.tu.value)} kN·m`, ok: true });
  else if (req.neglect) steps.push({ label: 'rcSheets.s.torsionNeglected', formula: 'TEd/TRd,c + VEd/VRd,c ≤ 1 (6.3.2(5))', value: f(req.screen, 3), ok: true });
  else {
    steps.push(
      { label: 'rcSheets.ec2.s.torsionScreen', formula: 'TEd/TRd,c + VEd/VRd,c > 1 (6.3.2(5))', value: f(req.screen, 3) },
      { label: 'rcSheets.s.torsionSection', formula: 'TEd/TRd,max + VEd/VRd,max ≤ 1, TRd,max = 2·ν·fcd·Ak·tef·sinθ·cosθ (6.29, 6.30)', value: `cotθ = ${f(req.cot, 3)} → ${f(req.interaction, 3)}`, ok: e.ok.torsionSection },
      { label: 'rcSheets.s.atReq', formula: 'Asw/s = TEd/(2·Ak·fywd·cotθ) (6.28)', value: `${f(req.tPerLeg)} cm²/m` },
      { label: 'rcSheets.s.legReq', formula: 'Asw/(n·s) + Asw,T/s', value: `${f(req.perLeg)} cm²/m` },
      { label: 'rcSheets.s.legProv', formula: `${stirrupsLabel(a.stirrups)}: Ab/s`, value: `${f(e.perLegProvided)} cm²/m`, ok: e.ok.stirrups },
      { label: 'rcSheets.s.alReq', formula: 'ΣAsl = TEd·uk·cotθ/(2·Ak·fyd) (6.28)', value: `${f(req.alReq)} cm²` },
      { label: 'rcSheets.s.alProv', formula: a.torsionLong ? `${groupsLabel([a.torsionLong])}, s ≤ 350 mm (9.2.3(4))` : '—', value: `${f(e.alProvided)} cm²`, ok: e.ok.al && e.ok.alSpacing },
    );
  }
  return { title: 'rcSheets.g.torsion', steps };
}

function crackSteps(req: BeamReq, e: BeamEval, f: Fmt): StepGroup {
  const face = (label: string, c: BeamEval['crackBottom']): Step[] => (c.used ? [
    { label, formula: 'σs = fyd·(As,req/As,prov)/γG, γG = 1.35', value: `${f(c.sigma, 0)} MPa` },
    { label: 'rcSheets.ec2.s.crackSpacing', formula: `s ≤ s,max (Table 7.3N, wk = 0.3 mm)`, value: `${f(c.s, 0)} ≤ ${f(c.sMax, 0)} mm`, ok: c.s <= c.sMax + 1e-6 },
    { label: 'rcSheets.ec2.s.crackDia', formula: 'Ø ≤ φs*·(fct,eff/2.9)·kc·hcr/(2(h − d)) (Table 7.2N, 7.6N)', value: `Ø${c.dia} ≤ ${f(c.diaMax, 1)} mm`, ok: c.dia <= c.diaMax + 1e-6 },
  ] : []);
  return {
    title: 'rcSheets.ec2.g.crack',
    steps: [
      ...face('rcSheets.g.flexBottom', e.crackBottom),
      ...face('rcSheets.g.flexTop', e.crackTop),
      req.skin
        ? { label: 'rcSheets.ec2.s.skin', formula: 'As,surf = kc·k·fctm·Act/fyk, kc = 1, k = 0.5, Act = b·h/2 (7.3.3(3), 7.3.2(2))', value: `${f(req.skin.area)} cm² → ${meshLabel(req.skin.mesh)} c/ face` }
        : { label: 'rcSheets.ec2.s.noSkin', formula: 'h < 1 m (7.3.3(3))', value: '' },
    ],
  };
}

