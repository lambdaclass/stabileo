import { barArea, faceLayout, groupsArea, groupsLabel, moreStirrup, proposeBeamFace, proposeStirrups, roundDown, stirrupsLabel } from '../bars';
import { beamBarWhere, hangerBar, peakSection } from '../beam-row';
import { SECTION_NAMES, type BeamContext, type BeamDemand, type BeamRow, type SectionName } from '../beam-row';
import type { Fmt } from '../format';
import { check, ratioOf, type BarGroup, type BeamAdopted, type CheckLine, type ComboTable, type MeshBars, type Step, type StepGroup, type Stirrups, isGenerous } from '../types';
import { toConfirm as U, ts500Mat, type Ts500Mat } from './basis';
import { barsAt, flexChecks, flexureNeeds, mrOf, sectionOf, type SectionNeed, type Ts500Flexure } from './beam-flexure';
import { shearState, torsionState, vrOf, type ShearState, type TorsionState } from './beam-shear';
import { materialSteps } from './steps';

const MAX_ITERATIONS = 12;

interface Requirement { bottom: number; top: number; bySection: BeamRow['req']['bySection'] }

interface Evaluation {
  flex: Ts500Flexure[];
  fitBottom: boolean; fitTop: boolean; areaBottom: boolean; areaTop: boolean;
  sh: ShearState; tor: TorsionState; vr: number; legs: number;
  perLegProvided: number; perLegRequired: number; sMax: number;
  alProvided: number;
  /** Each combination with the adopted bars, as the combinations' table reads it. */
  combos: ComboRatio[];
  ok: { shear: boolean; vmax: boolean; stirrups: boolean; spacing: boolean; al: boolean; torsionSection: boolean; combos: boolean };
  all: boolean;
}

interface ComboRatio { combo: string; pos: number; neg: number; stir: number; shear: number; ratio: number }

const shearDepth = (d: BeamDemand, c: BeamContext, a: BeamAdopted) => d.h - faceLayout(a.bottom, d.b, c.cover, a.stirrups.dia).centroidFromFace;

function evaluate(d: BeamDemand, c: BeamContext, t: Ts500Mat, a: BeamAdopted, req: Requirement): Evaluation {
  const sd = a.stirrups.dia;
  const flex = flexChecks(c, t, d, a);
  const fits = (face: 'top' | 'bottom') => SECTION_NAMES.every((s) => faceLayout(barsAt(a, s)[face], d.b, c.cover, sd).fits);
  const sh = shearState(t, d.b, d.h, shearDepth(d, c, a), d.vu.value, d.nAtV);
  const tor = torsionState(t, c, d.b, d.h, sh, d.tu.value, c.torsion, sd);
  const legs = Math.max(1, a.stirrups.legs);
  const perLegProvided = a.stirrups.spacing > 0 ? barArea(sd) / a.stirrups.spacing : 0;
  const perLegRequired = Math.max(sh.swReq, sh.swMin) / legs + tor.aoS;
  const sMax = Math.min(sh.sMax, tor.sMax);
  const vr = vrOf(t, sh, a.stirrups);
  const alProvided = a.torsionLong ? a.torsionLong.count * barArea(a.torsionLong.dia) : 0;
  const combos = comboRatios(d, c, t, a);
  const ok = {
    shear: sh.vd <= vr + 1e-6, vmax: sh.vd <= sh.vmax + 1e-6,
    stirrups: perLegProvided >= perLegRequired - 1e-6, spacing: a.stirrups.spacing <= sMax + 1e-6,
    al: !tor.design || alProvided >= tor.asl - 1e-6, torsionSection: tor.sectionOk,
    combos: combos.every((k) => k.ratio <= 1 + 1e-6),
  };
  const areaOk = (sign: 'pos' | 'neg') => req.bySection.filter((x) => x.sign === sign).every((x) => groupsArea(barsAt(a, x.section)[sign === 'pos' ? 'bottom' : 'top']) >= x.req - 1e-6);
  const fitBottom = fits('bottom'), fitTop = fits('top'), areaBottom = areaOk('pos'), areaTop = areaOk('neg');
  const all = flex.every((f) => f.ok) && fitBottom && fitTop && areaBottom && areaTop && Object.values(ok).every(Boolean);
  return { flex, fitBottom, fitTop, areaBottom, areaTop, sh, tor, vr, legs, perLegProvided, perLegRequired, sMax, alProvided, combos, ok, all };
}

const LONG = (c: BeamContext) => c.diameters.filter((x) => x >= 10 && x <= 25);

const bumpFace = (groups: BarGroup[], d: BeamDemand, c: BeamContext, sd: number) =>
  proposeBeamFace(groupsArea(groups) + barArea(groups.find((g) => g.count > 0)?.dia ?? 16) * 0.999, d.b, d.h, c.cover, sd, LONG(c));

function improve(a: BeamAdopted, e: Evaluation, d: BeamDemand, c: BeamContext): BeamAdopted {
  const sd = a.stirrups.dia;
  const next: BeamAdopted = JSON.parse(JSON.stringify(a));
  const pos = e.flex.filter((f) => f.sign === 'pos' && !f.ok), neg = e.flex.filter((f) => f.sign === 'neg' && !f.ok);
  const over = (k: 'pos' | 'neg' | 'stir' | 'shear') => e.combos.some((x) => x[k] > 1 + 1e-6);
  if (pos.some((f) => !f.ductile)) next.top = bumpFace(next.top, d, c, sd);
  else if (pos.length || !e.areaBottom || over('pos')) next.bottom = bumpFace(next.bottom, d, c, sd);
  if (neg.some((f) => !f.ductile)) next.bottom = bumpFace(next.bottom, d, c, sd);
  else if (neg.length || !e.areaTop || over('neg')) next.top = bumpFace(next.top, d, c, sd);
  if (!e.fitBottom) next.bottom = proposeBeamFace(groupsArea(next.bottom), d.b, d.h, c.cover, sd, LONG(c));
  if (!e.fitTop) next.top = proposeBeamFace(groupsArea(next.top), d.b, d.h, c.cover, sd, LONG(c));
  if (!e.ok.shear || !e.ok.stirrups || !e.ok.spacing || over('stir') || over('shear')) {
    if (!e.ok.spacing && next.stirrups.spacing > e.sMax + 1e-9) next.stirrups.spacing = roundDown(e.sMax);
    else {
      const more = moreStirrup(next.stirrups, c, Math.min(0.15, roundDown(e.sMax)));
      if (more) next.stirrups = more;
      else next.stirrups.legs += 2;
    }
  }
  if (!e.ok.al) {
    const al = next.torsionLong ?? { count: 4, dia: 10 };
    const count = Math.max(4, al.count, 2 * Math.ceil(e.tor.uk / 0.3 / 2));
    const dia = beamBarWhere(c, (x) => count * barArea(x) >= e.tor.asl - 1e-9);
    next.torsionLong = { count: count * barArea(dia) < e.tor.asl - 1e-9 ? count + 2 : count, dia };
  }
  return next;
}


/** Skin bars over a web deeper than 600 mm, both faces: 0.1 % of bw·d, at most 300 mm apart; more of them where Ø16 at that spacing is short of it. */
export function proposeSkin(d: Pick<BeamDemand, 'b' | 'h'>, c: Pick<BeamContext, 'cover' | 'stirrupDia'>, dEff: number): { mesh: MeshBars; need: number; area: number } | null {
  if (d.h <= 0.6 + 1e-9) return null;
  const zone = d.h - 2 * (c.cover + c.stirrupDia / 1000 + 0.02);
  const need = 0.001 * d.b * dEff * 1e4;
  for (let n = Math.max(1, Math.ceil(zone / 0.3) - 1); n <= 20; n++) {
    const dia = [10, 12, 14, 16].find((x) => 2 * n * barArea(x) >= need - 1e-9);
    if (dia) return { mesh: { dia, spacing: zone / (n + 1) }, need, area: 2 * n * barArea(dia) };
  }
  return { mesh: { dia: 16, spacing: zone / 21 }, need, area: 40 * barArea(16) };
}

export function beamRow(d: BeamDemand, c: BeamContext, adopted: BeamAdopted | undefined, fmt: Fmt): BeamRow {
  const t = ts500Mat(c.mat);
  const needs = flexureNeeds(c, t, d);
  const heavier = (p: SectionNeed, q: SectionNeed) => (q.r.asReq > p.r.asReq + 1e-9 || (Math.abs(q.r.asReq - p.r.asReq) <= 1e-9 && q.env.value > p.env.value) ? q : p);
  const gPos = needs.pos.reduce(heavier);
  const hogging = needs.neg.filter((x) => x.env.value > 1e-6);
  const gNeg = (hogging.length ? hogging : needs.neg).reduce(heavier);
  const bottomReq = gPos.r.asReq, topReq = hogging.length ? gNeg.r.asReq : 0;
  const bySection = [
    ...needs.pos.filter((x) => x.env.value > 1e-6 || x.s === 'span').map((x) => ({ section: x.s, sign: 'pos' as const, req: x.r.asReq })),
    ...hogging.map((x) => ({ section: x.s, sign: 'neg' as const, req: x.r.asReq })),
  ];
  const req: Requirement = { bottom: bottomReq, top: topReq, bySection };
  const d0 = gPos.r.d;
  const sh0 = shearState(t, d.b, d.h, d0, d.vu.value, d.nAtV);
  const tor0 = torsionState(t, c, d.b, d.h, sh0, d.tu.value, c.torsion);
  const legs = 2;
  const perLeg = Math.max(sh0.swReq, sh0.swMin) / legs + tor0.aoS;
  const sMax = Math.min(sh0.sMax, tor0.sMax);
  const skin = proposeSkin(d, c, d0);

  const initial: BeamAdopted = {
    bottom: proposeBeamFace(bottomReq, d.b, d.h, c.cover, c.stirrupDia, c.diameters),
    top: topReq > 0 ? proposeBeamFace(topReq, d.b, d.h, c.cover, c.stirrupDia, c.diameters) : [{ count: 2, dia: hangerBar(c) }],
    stirrups: proposeStirrups(perLeg, legs, roundDown(sMax), c),
    ...(tor0.design ? { torsionLong: { count: Math.max(4, 2 * Math.ceil(tor0.uk / 0.3 / 2)), dia: 10 } } : {}),
  };
  let proposed = initial, iterations = 0;
  let ev = evaluate(d, c, t, proposed, req);
  while (!ev.all && iterations < MAX_ITERATIONS) {
    iterations++;
    proposed = improve(proposed, ev, d, c);
    ev = evaluate(d, c, t, proposed, req);
  }
  const a = adopted ?? proposed;
  const e = adopted ? evaluate(d, c, t, a, req) : ev;
  const verifications = checks(d, e, a, bottomReq, topReq, skin, fmt);
  const allOk = verifications.every((v) => v.ok);
  const generous = isGenerous(verifications);
  const steps: StepGroup[] = [
    dataSteps(d, c, t, fmt),
    flexureSteps('rcSheets.g.flexBottom', t, gPos, a.bottom, e.flex.filter((x) => x.sign === 'pos'), fmt),
    ...(topReq > 0 ? [flexureSteps('rcSheets.g.flexTop', t, gNeg, a.top, e.flex.filter((x) => x.sign === 'neg'), fmt)] : []),
    shearSteps(d, e, a.stirrups, fmt),
    torsionSteps(c, e, a, fmt),
    {
      title: 'rcSheets.g.proposal',
      steps: [adopted ? { label: 'rcSheets.s.adoptedByUser', value: '' } : { label: 'rcSheets.s.iterations', formula: 'As(d) → Mr ≥ Md; ρ − ρ′ ≤ 0.85·ρb; s ≤ s,max', value: String(iterations), ok: ev.all }],
    },
  ];
  return {
    family: 'beam', key: d.key, name: d.name, level: d.level, b: d.b, h: d.h, length: d.length, demand: d,
    req: { bottom: bottomReq, top: topReq, bottomAt: gPos.s, topAt: gNeg.s, stirrupPerLeg: perLeg, legs, sMax, al: tor0.asl, torsionNeglected: !tor0.design, tuDesign: tor0.tdDesign, skin: skin?.mesh ?? null, bySection },
    proposed, adopted: a, isAdopted: !!adopted, iterations: adopted ? 0 : iterations, flexure: e.flex, verifications, combos: comboTable(d, c, t, a, fmt),
    status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
  };
}

function checks(d: BeamDemand, e: Evaluation, a: BeamAdopted, bottomReq: number, topReq: number, skin: ReturnType<typeof proposeSkin>, fmt: Fmt): CheckLine[] {
  const loaded = e.flex.filter((x) => x.mu > 1e-6);
  const worst = (f: (x: Ts500Flexure) => number) => loaded.reduce<Ts500Flexure | undefined>((w, x) => (!w || f(x) > f(w) ? x : w), undefined);
  const wRho = worst((x) => x.rho), wNet = worst((x) => x.rhoNet / Math.max(x.rhoLimit, 1e-12));
  const { sh, tor } = e;
  return [
    ...loaded.map((x) => check(x.sign === 'pos' ? `rcSheets.v.flexPos.${x.section}` : `rcSheets.v.flexNeg.${x.section}`, x.phiMn >= x.mu - 1e-6, {
      clause: '7.1', demand: `${fmt(x.mu)} kN·m`, capacity: `${fmt(x.phiMn)} kN·m`, ratio: ratioOf(x.mu, x.phiMn),
    })),
    ...(wRho ? [check('rcSheets.ts500.v.rhoMax', wRho.rho <= 0.02 + 1e-9, { clause: '7.3', demand: `ρ = ${fmt(wRho.rho * 100, 3)} %`, capacity: '≤ 2 %', ratio: wRho.rho / 0.02 })] : []),
    ...(wNet ? [check('rcSheets.ts500.v.rhoBal', wNet.rhoNet <= wNet.rhoLimit + 1e-9, { clause: '7.3', demand: `ρ − ρ′ = ${fmt(wNet.rhoNet * 100, 3)} %`, capacity: `≤ 0.85·ρb = ${fmt(wNet.rhoLimit * 100, 3)} %`, ratio: ratioOf(wNet.rhoNet, wNet.rhoLimit) })] : []),
    check('rcSheets.v.minBottom', e.areaBottom, { clause: '7.3', demand: `${fmt(bottomReq)} cm²`, capacity: `${fmt(groupsArea(a.bottom))} cm²`, ratio: ratioOf(bottomReq, groupsArea(a.bottom)) }),
    ...(topReq > 0 ? [check('rcSheets.v.minTop', e.areaTop, { clause: '7.3', demand: `${fmt(topReq)} cm²`, capacity: `${fmt(groupsArea(a.top))} cm²`, ratio: ratioOf(topReq, groupsArea(a.top)) })] : []),
    check(U('rcSheets.v.fitBottom'), e.fitBottom, { clause: 'TS 500', capacity: '≥ max(Ø; 25 mm)' }),
    check(U('rcSheets.v.fitTop'), e.fitTop, { clause: 'TS 500', capacity: '≥ max(Ø; 25 mm)' }),
    check('rcSheets.ts500.v.shearMax', e.ok.vmax, { clause: '8.1', demand: `${fmt(sh.vd)} kN`, capacity: `${fmt(sh.vmax)} kN`, ratio: ratioOf(sh.vd, sh.vmax) }),
    check('rcSheets.v.shear', e.ok.shear, { clause: '8.1.4', demand: `${fmt(sh.vd)} kN`, capacity: `${fmt(e.vr)} kN`, ratio: ratioOf(sh.vd, e.vr) }),
    check(tor.design ? U('rcSheets.v.stirrupsVT') : 'rcSheets.v.stirrupsVT', e.ok.stirrups, { clause: tor.design ? '8.1.4, 8.1.5, 8.2' : '8.1.4, 8.1.5', demand: `${fmt(e.perLegRequired)} cm²/m`, capacity: `${fmt(e.perLegProvided)} cm²/m`, ratio: ratioOf(e.perLegRequired, e.perLegProvided) }),
    check(U('rcSheets.v.stirrupSpacing'), e.ok.spacing, { clause: '8.1', demand: `${fmt(a.stirrups.spacing * 100, 1)} cm`, capacity: `≤ ${fmt(e.sMax * 100, 1)} cm` }),
    ...(tor.design ? [
      check(U('rcSheets.v.al'), e.ok.al, { clause: '8.2', demand: `${fmt(tor.asl)} cm²`, capacity: `${fmt(e.alProvided)} cm²`, ratio: ratioOf(tor.asl, e.alProvided) }),
      check(U('rcSheets.v.torsionSection'), e.ok.torsionSection, { clause: '8.2', demand: `${fmt(tor.vt)} kN`, capacity: `${fmt(tor.vtMax)} kN`, ratio: ratioOf(tor.vt, tor.vtMax) }),
    ] : d.tu.value > 1e-6 ? [check('rcSheets.ts500.v.torsionMinOnly', true, { clause: '8.2', demand: `(Vd/Vcr)² + (Td/Tcr)² = ${fmt(tor.interaction, 3)}`, capacity: '≤ 1' })] : []),
    ...(skin ? [check('rcSheets.ts500.v.skin', skin.area >= skin.need - 1e-6, { clause: 'TS 500', demand: `${fmt(skin.need)} cm²`, capacity: `Ø${skin.mesh.dia} c/${fmt(skin.mesh.spacing * 100, 1)} cm = ${fmt(skin.area)} cm²`, ratio: ratioOf(skin.need, skin.area) })] : []),
    ...((w) => (w ? [check('rcSheets.v.everyCombo', e.ok.combos, { clause: '7.1, 8.1', demand: w.combo, ratio: w.ratio })] : []))(e.combos.reduce<ComboRatio | undefined>((w, x) => (!w || x.ratio > w.ratio ? x : w), undefined)),
  ];
}

function comboTable(d: BeamDemand, c: BeamContext, t: Ts500Mat, a: BeamAdopted, fmt: Fmt): ComboTable {
  const ratios = comboRatios(d, c, t, a);
  return {
    headers: ['M i', 'M x*', 'M j', 'V', 'T', 'N'],
    rows: d.combos.map((k, i) => ({ combo: k.combo, values: [fmt(k.mStart, 1), fmt(k.mSpan, 1), fmt(k.mEnd, 1), fmt(k.v, 1), fmt(k.t, 1), fmt(k.nSpan, 1)], ratio: ratios[i]!.ratio, ok: ratios[i]!.ratio <= 1 + 1e-6 })),
  };
}

function comboRatios(d: BeamDemand, c: BeamContext, t: Ts500Mat, a: BeamAdopted): ComboRatio[] {
  const sd = a.stirrups.dia;
  const S = barsAt(a, 'start'), M = barsAt(a, 'span'), E = barsAt(a, 'end');
  const dS = shearDepth(d, c, a);
  const legs = Math.max(1, a.stirrups.legs);
  const perLegProvided = a.stirrups.spacing > 0 ? barArea(sd) / a.stirrups.spacing : 0;
  return d.combos.map((k) => {
    const mr = (bars: { top: BarGroup[]; bottom: BarGroup[] }, sag: boolean, n: number) => (sag ? mrOf(d, c, t, bars.bottom, bars.top, sd, true, n) : mrOf(d, c, t, bars.top, bars.bottom, sd, false, n));
    const at = (m: number, bars: { top: BarGroup[]; bottom: BarGroup[] }, n: number, sag: boolean) => (sag === m >= 0 ? ratioOf(Math.abs(m), mr(bars, m >= 0, n)) : 0);
    const bars = { start: [S, k.nStart], span: [M, k.nSpan], end: [E, k.nEnd] } as const;
    const peak = (sec: SectionName, sag: boolean) => mr(bars[sec][0], sag, bars[sec][1]);
    const sp = peakSection(d, k.xPos) ?? 'span', sn = peakSection(d, k.xNeg);
    const pos = Math.max(at(k.mStart, S, k.nStart, true), at(k.mSpan, M, k.nSpan, true), at(k.mEnd, E, k.nEnd, true), ratioOf(k.mPos, peak(sp, true)));
    const neg = Math.max(at(k.mStart, S, k.nStart, false), at(k.mSpan, M, k.nSpan, false), at(k.mEnd, E, k.nEnd, false),
      ratioOf(k.mNeg, sn ? peak(sn, false) : Math.min(mr(S, false, k.nStart), mr(E, false, k.nEnd), mr(M, false, k.nSpan))));
    const sh = shearState(t, d.b, d.h, dS, k.v, k.nV);
    const tor = torsionState(t, c, d.b, d.h, sh, k.t, c.torsion, sd);
    const stir = ratioOf(Math.max(sh.swReq, sh.swMin) / legs + tor.aoS, perLegProvided);
    const shear = Math.max(ratioOf(k.v, vrOf(t, sh, a.stirrups)), ratioOf(k.v, sh.vmax));
    return { combo: k.combo, pos, neg, stir, shear, ratio: Math.max(pos, neg, stir, shear) };
  });
}

function dataSteps(d: BeamDemand, c: BeamContext, t: Ts500Mat, f: Fmt): StepGroup {
  const src = (s: { source?: { combo: string } }) => (s.source ? ` (${s.source.combo})` : '');
  const sec = (name: SectionName): Step => {
    const e = sectionOf(d, name);
    return { label: `rcSheets.sec.${name}`, formula: `x = ${f(e.x)} m`, value: `M⁺ = ${f(e.pos.value)}${src(e.pos)} · M⁻ = ${f(e.neg.value)}${src(e.neg)} kN·m` };
  };
  return {
    title: 'rcSheets.g.data',
    steps: [
      { label: 'rcSheets.s.section', formula: 'bw × h · L', value: `${f(d.b * 100, 0)} × ${f(d.h * 100, 0)} cm · ${f(d.length)} m` },
      ...materialSteps(t, f),
      { label: 'rcSheets.s.cover', formula: 'c', value: `${f(c.cover * 100, 1)} cm` },
      d.faces ? { label: 'rcSheets.s.atFaces', formula: 'Md(x = c) · Vd, Td(x = c + d)', value: `${f(d.faces.start * 100, 0)} · ${f(d.faces.end * 100, 0)} cm; d = ${f(d.faces.shearAt * 100, 0)} cm` } : { label: 'rcSheets.s.assumptionAxis', value: '' },
      ...(d.flange ? [{ label: 'rcSheets.ts500.s.flangeGiven', formula: 'b (tabla)', value: `b = ${f(d.flange.bf * 100, 0)} cm; hf = ${f(d.flange.hf * 100, 0)} cm` }] : []),
      sec('start'), sec('span'), sec('end'),
      ...(d.negAny.value > Math.max(d.start.neg.value, d.span.neg.value, d.end.neg.value) + 1e-6
        ? [{ label: 'rcSheets.s.negAny', formula: `x = ${f(d.negAny.source?.x ?? 0)} m`, value: `M⁻ = ${f(d.negAny.value)} kN·m${src(d.negAny)}` }] : []),
      { label: 'rcSheets.s.vu', formula: 'Vd', value: `${f(d.vu.value)} kN${src(d.vu)}` },
      { label: 'rcSheets.s.tu', formula: 'Td', value: `${f(d.tu.value)} kN·m${src(d.tu)}` },
      { label: 'rcSheets.ts500.s.crackOut', value: '' },
    ],
  };
}

function flexureSteps(title: string, t: Ts500Mat, need: SectionNeed, bars: BarGroup[], fl: Ts500Flexure[], f: Fmt): StepGroup {
  const r = need.r;
  const steps: Step[] = [
    { label: `rcSheets.sec.${need.s}`, formula: `Md = ${f(need.env.value)} kN·m; Nd = ${f(need.n)} kN`, value: need.env.source?.combo ?? '' },
    { label: 'rcSheets.s.d', formula: 'd = h − c − Øw − Ø/2', value: `${f(r.d * 100, 1)} cm` },
    { label: 'rcSheets.ts500.s.block', formula: `εcu = 3 ‰; 0.85·fcd over k1·c; k1 = 0.85 − 0.006·(fck − 25) = ${f(t.k1, 3)}`, value: '' },
  ];
  if (need.env.value <= 1e-6) steps.push({ label: 'rcSheets.s.noMoment', value: '' });
  else {
    steps.push(
      { label: 'rcSheets.s.c', formula: 'ΣF = Nd → c', value: `${f(r.c * 100, 2)} cm` },
      { label: 'rcSheets.ts500.s.asLim', formula: 'As ≤ min(0.85·Asb; 0.02·bw·d)', value: `Asb = ${f(r.asb)} cm² → ${f(r.asLim)} cm²` },
      ...(r.asComp > 1e-6 ? [{ label: 'rcSheets.s.compression', formula: 'As′ = ΔM/((d − d′)·σs′)', value: `${f(r.asComp)} cm²` }] : []),
      { label: 'rcSheets.s.asStrength', formula: 'Mr(As) = Md', value: `${f(r.as)} cm²`, ok: !r.impossible },
    );
  }
  steps.push(
    { label: 'rcSheets.s.asMin', formula: 'ρmin = 0.8·fctd/fyd (7.3)', value: `${f(r.asMin)} cm²` },
    { label: 'rcSheets.s.asReq', formula: 'max(As; As,min)', value: `${f(r.asReq)} cm²` },
    { label: 'rcSheets.s.adopted', formula: groupsLabel(bars), value: `${f(groupsArea(bars))} cm²`, ok: groupsArea(bars) >= r.asReq - 1e-6 },
  );
  for (const k of fl.filter((x) => x.mu > 1e-6)) {
    steps.push({ label: `rcSheets.sec.${k.section}`, formula: `d = ${f(k.d * 100, 1)} cm; εs = ${f(k.epsT * 1000, 2)} ‰ (≥ ${f(k.epsTMin * 1000, 2)} ‰ ⇔ ρ − ρ′ ≤ 0.85·ρb)`, value: `Mr = ${f(k.phiMn)} ≥ ${f(k.mu)} kN·m`, ok: k.ok });
  }
  return { title, steps };
}

function shearSteps(d: BeamDemand, e: Evaluation, st: Stirrups, f: Fmt): StepGroup {
  const s = e.sh;
  return {
    title: 'rcSheets.g.shear',
    steps: [
      { label: 'rcSheets.s.vu', formula: `Vd; Nd = ${f(s.nd)} kN`, value: `${f(d.vu.value)} kN${d.vu.source ? ` (${d.vu.source.combo})` : ''}` },
      { label: 'rcSheets.ts500.s.vcr', formula: 'Vcr = 0.65·fctd·bw·d·(1 + γ·Nd/Ac), γ = 0.07 (8.1.3)', value: `${f(s.vcr)} kN` },
      { label: 'rcSheets.s.vc', formula: 'Vc = 0.8·Vcr (8.1.4)', value: `${f(s.vc)} kN` },
      { label: 'rcSheets.ts500.v.shearMax', formula: 'Vd ≤ 0.22·fcd·bw·d', value: `${f(s.vmax)} kN`, ok: e.ok.vmax },
      { label: 'rcSheets.s.avMin', formula: 'Asw/s ≥ 0.3·(fctd/fywd)·bw (8.1.5)', value: `${f(s.swMin)} cm²/m` },
      { label: 'rcSheets.s.avReq', formula: s.vd > s.vcr ? 'Asw/s = (Vd − Vc)/(fywd·d)' : 'Vd ≤ Vcr → minimum', value: `${f(s.swReq)} cm²/m` },
      { label: 'rcSheets.ts500.s.spacing', formula: s.dense ? 'Vd > 3·Vcr: s ≤ min(d/4; 300 mm)' : 's ≤ min(d/2; 600 mm)', value: `${f(e.sMax * 100, 1)} cm` },
      { label: 'rcSheets.s.stirrups', formula: stirrupsLabel(st), value: '' },
      { label: 'rcSheets.s.verifyShear', formula: 'Vr = Vc + Asw·fywd·d/s', value: `${f(e.vr)} ≥ Vd = ${f(d.vu.value)} kN`, ok: e.ok.shear },
    ],
  };
}

function torsionSteps(c: BeamContext, e: Evaluation, a: BeamAdopted, f: Fmt): StepGroup {
  const r = e.tor;
  const steps: Step[] = [
    { label: 'rcSheets.ts500.s.tcr', formula: 'Tcr = 1.35·fctd·Se; Se = x²·y/3', value: `${f(r.tcr)} kN·m` },
    ...(c.torsion === 'compatibility' && r.tdDesign < r.td - 1e-9 ? [{ label: 'rcSheets.ts500.s.compatibility', formula: 'Td ≤ Tcr', value: `${f(r.tdDesign)} kN·m` }] : []),
    { label: 'rcSheets.ts500.s.interaction', formula: '(Vd/Vcr)² + (Td/Tcr)² ≤ 1 → minimum', value: f(r.interaction, 3) },
  ];
  if (r.design) {
    steps.push(
      { label: 'rcSheets.s.atReq', formula: 'Ao/s = Td/(2·Ak·fywd)', value: `${f(r.aoS)} cm²/m` },
      { label: 'rcSheets.s.legReq', formula: 'Asw/(n·s) + Ao/s', value: `${f(e.perLegRequired)} cm²/m` },
      { label: 'rcSheets.s.legProv', formula: `${stirrupsLabel(a.stirrups)}: Ab/s`, value: `${f(e.perLegProvided)} cm²/m`, ok: e.ok.stirrups },
      { label: 'rcSheets.s.alReq', formula: 'Asl = Td·uk/(2·Ak·fyd)', value: `${f(r.asl)} cm²` },
      { label: 'rcSheets.s.alProv', formula: a.torsionLong ? groupsLabel([a.torsionLong]) : '—', value: `${f(e.alProvided)} cm²`, ok: e.ok.al },
      { label: 'rcSheets.s.torsionSection', formula: 'Vt = Vd + 1.6·Td/bw ≤ 0.22·fcd·bw·d', value: `${f(r.vt)} ≤ ${f(r.vtMax)} kN`, ok: r.sectionOk },
      { label: 'rcSheets.ts500.s.torsionSpacing', formula: 's ≤ min(uk/8; 300 mm)', value: `${f(r.sMax * 100, 1)} cm` },
    );
  }
  return { title: 'rcSheets.g.torsion', steps };
}
