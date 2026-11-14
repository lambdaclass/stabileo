import { ec2Shear } from '../../engine/design/eurocode/ec2-beam';
import { ec2CreepCoefficient } from '../../engine/design/eurocode/ec2-params';
import { wallVerticalBars } from '../../engine/detailing/wall-member';
import { barArea, roundDown } from '../bars';
import type { Fmt } from '../format';
import { wallLabel, type WallContext, type WallDemand, type WallRow } from '../wall-row';
import { check, ratioOf, type CheckLine, type ComboTable, type StepGroup, type WallAdopted } from '../types';
import { lapLength, matOf, momentCapacity, shearCapacity, type Ec2Set, type Layer, type Mat } from './basis';

const KPA = 1000;
const MAX_ITERATIONS = 12;

const rhoOf = (m: { diameter: number; spacing: number }, curtains: number, t: number) => (m.spacing > 0 ? (curtains * barArea(m.diameter) * 1e-4) / (m.spacing * t) : 0);
const nextDia = (d: number) => [8, 10, 12, 16, 20, 25].find((x) => x > d) ?? d;

function inPlane(d: WallDemand, c: WallContext, a: WallAdopted, m: Mat, N: number, M: number): number {
  const bars = wallVerticalBars(d.length, d.thickness, c.cover, a);
  const layers: Layer[] = bars.map((b) => ({ y: d.length / 2 - b.x, area: b.area }));
  const mEd = Math.max(Math.abs(M), N > 0 ? N * Math.max(d.length / 30, 0.02) : 0);
  const cap = momentCapacity(N, { b: d.thickness, h: d.length }, layers, m);
  if (!cap) return Number.POSITIVE_INFINITY;
  return mEd > 1e-9 ? (cap.mrd > 1e-9 ? mEd / cap.mrd : Number.POSITIVE_INFINITY) : 0;
}

interface OutRead { u: number; lambda: number; lambdaLim: number; slender: boolean; mEd: number; mrd: number }

function outOfPlane(d: WallDemand, c: WallContext, a: WallAdopted, m: Mat, N: number, muV: number, muH: number): { v: OutRead; h: number } {
  const t = d.thickness, hd = a.horizontal.diameter / 1000, vd = a.vertical.diameter / 1000;
  const n = Math.max(0, N / Math.max(d.length, 1e-6));
  const yV = c.cover + hd + vd / 2, yH = c.cover + hd / 2;
  const asV = barArea(a.vertical.diameter) * 1e-4 / a.vertical.spacing, asH = barArea(a.horizontal.diameter) * 1e-4 / a.horizontal.spacing;
  const layersV: Layer[] = a.curtains === 2 ? [{ y: yV, area: asV }, { y: t - yV, area: asV }] : [{ y: t / 2, area: asV }];
  const l0 = d.height, lambda = (l0 * Math.sqrt(12)) / t;
  const nu = n / (t * m.fcd * KPA);
  const lambdaLim = nu > 0 ? (20 * 0.7 * 1.1 * 0.7) / Math.sqrt(nu) : Number.POSITIVE_INFINITY;
  const slender = lambda > lambdaLim;
  let mEd = muV;
  if (slender) {
    const phiEf = ec2CreepCoefficient(m.fck, t * 1000);
    const beta = 0.35 + m.fck / 200 - lambda / 150, kphi = Math.max(1, 1 + beta * phiEf);
    const dd = a.curtains === 2 ? t - yV : t / 2;
    mEd = muV + n * (l0 / 400) + n * ((kphi * m.eyd) / (0.45 * dd)) * (l0 * l0) / 10;
  }
  mEd = Math.max(mEd, n * Math.max(t / 30, 0.02));
  const capV = momentCapacity(n, { b: 1, h: t }, layersV, m);
  const v = { lambda, lambdaLim, slender, mEd, mrd: capV?.mrd ?? 0, u: !capV ? Number.POSITIVE_INFINITY : mEd > 1e-9 ? mEd / Math.max(capV.mrd, 1e-9) : 0 };
  let h = 0;
  if (muH > 1e-6) {
    const layersH: Layer[] = a.curtains === 2 ? [{ y: t - yH, area: asH }, { y: yH, area: asH }] : [{ y: t / 2, area: asH }];
    const capH = momentCapacity(0, { b: 1, h: t }, layersH, m);
    h = capH && capH.mrd > 1e-9 ? muH / capH.mrd : Number.POSITIVE_INFINITY;
  }
  return { v, h };
}

interface Eval {
  pm: number[]; out: OutRead[]; outH: number[]; shear: number[];
  rhoV: number; rhoH: number; rhoVMin: number; rhoHMin: number; rhoHShear: number;
  sMaxV: number; sMaxH: number; vrdMin: number; vrdc: number; cot: number;
}

function evaluate(set: Ec2Set, d: WallDemand, c: WallContext, a: WallAdopted, m: Mat): Eval {
  const p = set.p, t = d.thickness, L = d.length;
  const rhoV = rhoOf(a.vertical, a.curtains, t), rhoH = rhoOf(a.horizontal, a.curtains, t);
  const dd = 0.8 * L;
  const asl = rhoV * t * (L / 2) + (a.boundary ? (a.boundary.count / 2) * barArea(a.boundary.diameter) * 1e-4 : 0);
  const aswS = a.horizontal.spacing > 0 ? (a.curtains * barArea(a.horizontal.diameter) * 1e-4) / a.horizontal.spacing : 0;
  const shear = d.combos.map((k) => shearCapacity(t, dd, asl, aswS, m, p, Math.max(0, k.pu) / (L * t * KPA)));
  const vuMax = Math.max(0, ...d.combos.map((k) => k.vu));
  const s0 = ec2Shear({ bw: t, d: dd, fck: m.fck, fyk: m.fyk, asl, VEd: vuMax }, p);
  const rhoHShear = vuMax > s0.vrdc ? vuMax / (s0.z * m.fyd * KPA * s0.cotTheta) / t : 0;
  const outs = d.combos.map((k) => outOfPlane(d, c, a, m, k.pu, k.muV, k.muH));
  return {
    pm: d.combos.map((k) => inPlane(d, c, a, m, k.pu, k.mu)),
    out: outs.map((o) => o.v), outH: outs.map((o) => o.h),
    shear: d.combos.map((k, i) => ratioOf(k.vu, shear[i]!.vrd)),
    rhoV, rhoH, rhoVMin: 0.002, rhoHMin: Math.max(0.25 * rhoV, 0.001), rhoHShear,
    sMaxV: Math.min(3 * t, 0.4), sMaxH: 0.4,
    vrdMin: Math.min(Infinity, ...shear.map((s) => s.vrd)), vrdc: s0.vrdc, cot: s0.cotTheta,
  };
}

const ok1 = (v: number) => v <= 1 + 1e-6;

export function makeWallRow(set: Ec2Set) {
  return function wallRow(d: WallDemand, c: WallContext, adopted: WallAdopted | undefined, fmt: Fmt): WallRow {
    const m = matOf(c.mat.fc, c.mat.fy, set.p);
    const curtains = 2 as const;
    const meshFor = (dia: number, rho: number, sMax: number) => ({ diameter: dia, spacing: roundDown(Math.max(0.075, Math.min(sMax, (curtains * barArea(dia) * 1e-4) / Math.max(rho * d.thickness, 1e-9)))) });
    const first = evaluate(set, d, c, { vertical: { diameter: c.barDia, spacing: 0.2 }, horizontal: { diameter: c.barDia, spacing: 0.2 }, curtains }, m);
    let a: WallAdopted = { vertical: meshFor(c.barDia, first.rhoVMin, first.sMaxV), horizontal: meshFor(c.barDia, Math.max(first.rhoHMin, first.rhoHShear), first.sMaxH), curtains };
    let e = evaluate(set, d, c, a, m), iterations = 0;
    const boundaries = [12, 16, 20, 25].flatMap((diameter) => [2, 4, 6, 8, 10, 12].map((count) => ({ count, diameter })))
      .sort((p, q) => p.count * barArea(p.diameter) - q.count * barArea(q.diameter));
    const holds = (x: Eval) => x.pm.every(ok1) && x.out.every((o) => ok1(o.u)) && x.outH.every(ok1) && x.shear.every(ok1) && x.rhoV >= x.rhoVMin - 1e-9 && x.rhoH >= x.rhoHMin - 1e-9;
    while (!holds(e) && iterations < MAX_ITERATIONS) {
      iterations++;
      if (!e.pm.every(ok1)) {
        const cur = a.boundary ? a.boundary.count * barArea(a.boundary.diameter) : 0;
        const next = boundaries.find((b) => b.count * barArea(b.diameter) > cur + 1e-9);
        a = next ? { ...a, boundary: next } : { ...a, vertical: { ...a.vertical, spacing: roundDown(Math.max(0.075, a.vertical.spacing - 0.025)) } };
      }
      if (!e.out.every((o) => ok1(o.u)) || e.rhoV < e.rhoVMin - 1e-9) a = { ...a, vertical: a.vertical.spacing > 0.1 + 1e-9 ? { ...a.vertical, spacing: roundDown(a.vertical.spacing - 0.025) } : { diameter: nextDia(a.vertical.diameter), spacing: a.vertical.spacing } };
      if (!e.shear.every(ok1) || !e.outH.every(ok1) || e.rhoH < e.rhoHMin - 1e-9) a = { ...a, horizontal: a.horizontal.spacing > 0.1 + 1e-9 ? { ...a.horizontal, spacing: roundDown(a.horizontal.spacing - 0.025) } : { diameter: nextDia(a.horizontal.diameter), spacing: a.horizontal.spacing } };
      e = evaluate(set, d, c, a, m);
    }
    const proposed = a;
    const ad = adopted ?? proposed;
    const ev = adopted ? evaluate(set, d, c, ad, m) : e;
    const worst = (xs: number[]) => xs.reduce((w, x, i) => (x > xs[w]! ? i : w), 0);
    const outU = ev.out.map((o, i) => Math.max(o.u, ev.outH[i] ?? 0));
    const ipm = worst(ev.pm), iout = worst(outU), ish = worst(ev.shear);
    const vuMax = Math.max(0, ...d.combos.map((k) => k.vu));
    const gOut = ev.out[iout];

    const verifications: CheckLine[] = [
      ...((d.baseElements ?? 2) < 2 ? [check('rcSheets.v.wallMesh', false, { clause: '', demand: String(d.baseElements ?? 0), capacity: '≥ 2' })] : []),
      ...(d.base && d.base.held < d.base.nodes ? [check('rcSheets.v.wallBase', false, { clause: '', demand: `${d.base.held} / ${d.base.nodes}`, capacity: `${d.base.nodes} / ${d.base.nodes}` })] : []),
      check('rcSheets.v.wallPM', ev.pm.every(ok1), { clause: '6.1, 6.1(4)', demand: d.combos[ipm]?.combo ?? '', ratio: Math.max(0, ...ev.pm) }),
      check('rcSheets.v.wallShear', ev.shear.every(ok1), { clause: '6.2.2(1), 6.2.3(3)', demand: `${fmt(vuMax)} kN`, capacity: `${fmt(ev.vrdMin)} kN`, ratio: Math.max(0, ...ev.shear) }),
      check('rcSheets.v.wallOut', outU.every(ok1), { clause: '6.1, 5.8.8', demand: d.combos[iout]?.combo ?? '', ratio: Math.max(0, ...outU) }),
      check('rcSheets.v.wallRhoL', ev.rhoV >= ev.rhoVMin - 1e-9, { clause: '9.6.2(1)', demand: `${fmt(ev.rhoVMin * 100, 3)} %`, capacity: `${fmt(ev.rhoV * 100, 3)} %`, ratio: ratioOf(ev.rhoVMin, ev.rhoV) }),
      check('rcSheets.ec2.v.wallRhoVMax', ev.rhoV <= 0.04 + 1e-9, { clause: '9.6.2(1)', demand: `${fmt(ev.rhoV * 100, 3)} %`, capacity: '≤ 4 %' }),
      check('rcSheets.v.wallRhoT', ev.rhoH >= Math.max(ev.rhoHMin, ev.rhoHShear) - 1e-9, { clause: '9.6.3(1), 6.2.3(3)', demand: `${fmt(Math.max(ev.rhoHMin, ev.rhoHShear) * 100, 3)} %`, capacity: `${fmt(ev.rhoH * 100, 3)} %`, ratio: ratioOf(Math.max(ev.rhoHMin, ev.rhoHShear), ev.rhoH) }),
      check('rcSheets.v.wallSpacing', ad.vertical.spacing <= ev.sMaxV + 1e-6 && ad.horizontal.spacing <= ev.sMaxH + 1e-6, { clause: '9.6.2(3), 9.6.3(2)', capacity: `V ≤ ${fmt(ev.sMaxV * 100, 0)} · H ≤ ${fmt(ev.sMaxH * 100, 0)} cm` }),
      check('rcSheets.ec2.v.wallCurtains', ad.curtains === 2, { clause: '9.6.2(1)', capacity: String(ad.curtains) }),
      check('rcSheets.ec2.v.wallLinks', ev.rhoV <= 0.02 + 1e-9, { clause: '9.6.4(1)', demand: `${fmt(ev.rhoV * 100, 3)} %`, capacity: '≤ 2 %' }),
    ];
    const allOk = verifications.every((v) => v.ok);
    const generous = ev.rhoV > 1.2 * ev.rhoVMin + 1e-6 && ev.rhoH > 1.2 * ev.rhoHMin + 1e-6 && Math.max(0, ...ev.pm, ...ev.shear, ...outU) < 0.5;
    const combos: ComboTable = {
      headers: ['Pu', 'Mu', 'Vu', 'Mv', 'Mh'],
      rows: d.combos.map((k, i) => {
        const ratio = Math.max(ev.pm[i] ?? 0, ev.shear[i] ?? 0, outU[i] ?? 0);
        return { combo: k.combo, values: [fmt(k.pu, 1), fmt(k.mu, 1), fmt(k.vu, 1), fmt(k.muV, 1), fmt(k.muH, 1)], ratio, ok: ratio <= 1 + 1e-6 };
      }),
    };
    const boundaryLabel = ad.boundary && ad.boundary.count > 0 ? `${ad.boundary.count} Ø${ad.boundary.diameter}` : '—';
    const steps: StepGroup[] = [
      {
        title: 'rcSheets.g.data',
        steps: [
          { label: 'rcSheets.s.wallGeometry', formula: 'lw × hw × t', value: `${fmt(d.length)} × ${fmt(d.height)} m × ${fmt(d.thickness * 100, 0)} cm` },
          { label: 'rcSheets.s.materials', formula: 'fck · fyk → fcd · fyd', value: `${fmt(m.fck, 0)} · ${fmt(m.fyk, 0)} → ${fmt(m.fcd)} · ${fmt(m.fyd)} MPa` },
          { label: 'rcSheets.s.wallBase', formula: 'N = −Σσvv·t·w; M = Σ(N·e); V = Στ·t·w', value: '' },
          { label: 'rcSheets.s.vu', formula: 'VEd', value: `${fmt(vuMax)} kN (${d.combos[ish]?.combo ?? ''})` },
        ],
      },
      {
        title: 'rcSheets.g.wallShear',
        steps: [
          { label: 'rcSheets.ec2.s.wallShearModel', formula: 'bw = t, d = 0.8·lw, z = 0.9·d, σcp = NEd/(lw·t); horizontal bars as links (6.2.2(1), 6.2.3(3))', value: '' },
          { label: 'rcSheets.ec2.s.vrdc', formula: 'VRd,c (6.2.2(1))', value: `${fmt(ev.vrdc)} kN` },
          { label: 'rcSheets.s.wallRhoTReq', formula: 'ρh = VEd/(z·fywd·cotθ)/t where VEd > VRd,c', value: `${fmt(ev.rhoHShear * 100, 3)} % (cotθ = ${fmt(ev.cot, 2)})` },
          { label: 'rcSheets.s.wallMin', formula: 'ρv ≥ 0.002 (9.6.2(1)); ρh ≥ max(0.25·ρv; 0.001) (9.6.3(1))', value: `${fmt(ev.rhoVMin * 100, 3)} · ${fmt(ev.rhoHMin * 100, 3)} %` },
          { label: 'rcSheets.s.wallVn', formula: 'VRd = max(VRd,c; min(VRd,s; VRd,max))', value: `${fmt(ev.vrdMin)} kN`, ok: ev.shear.every(ok1) },
        ],
      },
      {
        title: 'rcSheets.g.wallFlexure',
        steps: [
          { label: 'rcSheets.s.wallBoundary', formula: 'As at the ends (NEd, MEd)', value: boundaryLabel },
          { label: 'rcSheets.s.wallPM', formula: 'MRd(NEd) ≥ max(MEd; NEd·e0), e0 = max(lw/30; 20 mm) (6.1(4))', value: `${fmt(Math.max(0, ...ev.pm), 3)} (${d.combos[ipm]?.combo ?? ''})`, ok: ev.pm.every(ok1) },
          ...(gOut ? [{ label: 'rcSheets.s.slenderness', formula: 'λ = hw·√12/t; λlim = 20·0.7·1.1·0.7/√n (5.8.3.1(1)), l0 = hw', value: `${fmt(gOut.lambda, 1)} ≤ ${fmt(Number.isFinite(gOut.lambdaLim) ? gOut.lambdaLim : 0, 1)}?`, ok: !gOut.slender }] : []),
          { label: 'rcSheets.s.wallOut', formula: 'MEd,v (+ NEd·l0/400 + M2, 5.8.8) ≤ MRd(NEd/lw), b = 1 m; MEd,h ≤ MRd', value: `${fmt(Math.max(0, ...outU), 3)}`, ok: outU.every(ok1) },
        ],
      },
      {
        title: 'rcSheets.g.proposal',
        steps: [
          { label: 'rcSheets.s.adopted', formula: wallLabel(ad), value: '' },
          adopted ? { label: 'rcSheets.s.adoptedByUser', value: '' } : { label: 'rcSheets.s.iterations', formula: 'ρ,min → As,ends → (NEd, MEd), VEd, (Mv, Mh)', value: String(iterations) },
          { label: 'rcSheets.ec2.s.wallScope', value: '' },
        ],
      },
    ];
    return {
      family: 'wall', key: d.key, name: d.name, level: d.level, length: d.length, height: d.height, thickness: d.thickness, demand: d,
      req: { rhoL: ev.rhoVMin, rhoT: Math.max(ev.rhoHMin, ev.rhoHShear), sMaxV: ev.sMaxV, sMaxH: ev.sMaxH, curtains, boundary: proposed.boundary ? `${proposed.boundary.count} Ø${proposed.boundary.diameter}` : '—' },
      proposed, adopted: ad, isAdopted: !!adopted, iterations: adopted ? 0 : iterations, verifications, combos,
      utilization: Math.max(0, ...ev.pm, ...ev.shear, ...outU),
      status: allOk ? (generous ? 'warn' : 'ok') : 'fail', generous, steps,
      cover: c.cover, hLap: lapLength(m, ad.horizontal.diameter, true),
      vLaps: [...new Set([ad.vertical.diameter, ...(ad.boundary ? [ad.boundary.diameter] : [])])].map((dia) => ({ dia, lap: lapLength(m, dia, true) })),
    };
  };
}
