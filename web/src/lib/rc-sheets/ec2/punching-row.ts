import { checkSlabJointPunching, slabJointPosition, RESIDUAL_TOL, type JointPositionResult } from '../../engine/detailing/slab-punching';
import type { Fmt } from '../format';
import type { PunchingContext, PunchingDemand, PunchingRow } from '../punching-row';
import { check, ratioOf, type CheckLine, type ComboTable, type StepGroup } from '../types';
import { matOf, type Ec2Set } from './basis';

export const PUNCHING_BETA = { interior: 1.15, edge: 1.4, corner: 1.5 } as const;
const RHO_MAX = 0.02;

export interface PunchingGeom { c1: number; c2: number; u0: number; u1: number }

export function punchingPerimeters(b: number, h: number, d: number, pos: JointPositionResult): PunchingGeom {
  const bearing = pos.openBearingDeg ?? 0;
  const edgeAlongX = Math.abs(Math.sin((bearing * Math.PI) / 180)) > Math.SQRT1_2;
  const c2 = edgeAlongX ? b : h, c1 = edgeAlongX ? h : b;
  if (pos.position === 'edge') return { c1, c2, u0: Math.min(c2 + 3 * d, c2 + 2 * c1), u1: c2 + 2 * c1 + 2 * Math.PI * d };
  if (pos.position === 'corner') return { c1, c2, u0: Math.min(3 * d, c1 + c2), u1: c1 + c2 + Math.PI * d };
  return { c1: b, c2: h, u0: 2 * (b + h), u1: 2 * (b + h) + 4 * Math.PI * d };
}

export function makePunchingRow(set: Ec2Set) {
  return function punchingRow(d: PunchingDemand, c: PunchingContext, fmt: Fmt): PunchingRow {
    const p = set.p, m = matOf(c.fc, c.fy, p);
    const position = slabJointPosition(d.joint.nodeId, d.adjoining);
    const r = checkSlabJointPunching({ panelId: d.key, joint: d.joint, position, thickness: d.thickness, cover: c.cover, topBarDiameterMm: c.topBarDia, fc: c.fc, qu: 0, staleAnalysis: false });
    const dd = d.thickness - c.cover - c.topBarDia / 1000;
    const unsupported = r.status === 'UNSUPPORTED' || position.position === null || !(dd > 0);
    const contributions = r.contributions.filter((k) => Number.isFinite(k.Vu) && Math.abs(k.equilibriumResidual) / k.residualDenominator <= RESIDUAL_TOL);
    if (unsupported || !contributions.length) {
      return {
        family: 'punching', key: d.key, name: d.name, level: d.level, demand: d, position: position.position ?? '—', vu: 0, phiVc: 0, utilization: 0,
        verifications: [check('rcSheets.v.punchingUnsupported', false, { clause: '6.4' })], combos: { headers: ['ΔN', 'MEd', 'VEd'], rows: [] },
        status: 'none', steps: [{ title: 'rcSheets.g.punching', steps: [{ label: 'rcSheets.s.punchPosition', formula: '', value: position.position ?? '—' }] }], isAdopted: true,
      };
    }
    const pos = position.position!;
    const beta = PUNCHING_BETA[pos];
    const g = punchingPerimeters(d.joint.b, d.joint.h, dd, position);
    const k = Math.min(1 + Math.sqrt(200 / (dd * 1000)), 2);
    const vmin = p.vminCoeff * k ** 1.5 * Math.sqrt(m.fck);
    const vrdcAt = (rho: number) => Math.max(p.crdc * k * (100 * Math.min(rho, RHO_MAX) * m.fck) ** (1 / 3), vmin);
    const vAt = (V: number, u: number) => (beta * V) / (u * dd * 1000);
    const gov = contributions.reduce((w, x) => (x.Vu > w.Vu ? x : w));
    const vEd = vAt(gov.Vu, g.u1), vEd0 = vAt(gov.Vu, g.u0);
    const rhoReq = vEd <= vmin ? 0 : (vEd / (p.crdc * k)) ** 3 / (100 * m.fck);
    const vrdc = vrdcAt(rhoReq);
    const concreteOk = rhoReq <= RHO_MAX + 1e-12;
    const nu = 0.6 * (1 - m.fck / 250);
    const vrdMax = set.punchingMaxCoeff * nu * m.fcdShear;
    const maxOk = vEd0 <= vrdMax + 1e-9;
    const fywdEf = Math.min(250 + 0.25 * dd * 1000, m.fyd);
    const vrdc2 = vrdcAt(RHO_MAX);
    const asw = concreteOk ? 0 : (Math.max(0, vEd - 0.75 * vrdc2) * g.u1 * dd) / (1.5 * (1 / 0.75) * fywdEf) * 1e4;
    const uOut = (beta * gov.Vu) / (vrdc2 * dd * 1000);
    const capForce = (vrdc * g.u1 * dd * 1000) / beta;

    const verifications: CheckLine[] = [
      check('rcSheets.v.punching', concreteOk, { clause: '6.4.3(2), 6.4.4(1)', demand: `vEd = ${fmt(vEd, 3)} MPa`, capacity: `${fmt(concreteOk ? vrdc : vrdc2, 3)} MPa`, ratio: ratioOf(vEd, concreteOk ? vrdc : vrdc2) }),
      check('rcSheets.ec2.v.punchingMax', maxOk, { clause: '6.4.5(3)', demand: `vEd,0 = ${fmt(vEd0, 3)} MPa`, capacity: `${fmt(vrdMax, 3)} MPa`, ratio: ratioOf(vEd0, vrdMax) }),
      ...(concreteOk && rhoReq > 0 ? [check('rcSheets.ec2.v.punchingRho', true, { clause: '6.4.4(1)', demand: `ρl ≥ ${fmt(rhoReq * 100, 3)} %`, capacity: `≤ ${fmt(RHO_MAX * 100, 0)} %` })] : []),
      ...(!concreteOk ? [check('rcSheets.ec2.v.punchingLinks', false, { clause: '6.4.5(1), 9.4.3', demand: `Asw ≥ ${fmt(asw)} cm² / perimeter, sr = 0.75·d`, capacity: '—' })] : []),
    ];
    const combos: ComboTable = {
      headers: ['ΔN', 'MEd', 'VEd'],
      rows: contributions.map((x) => {
        const ratio = Math.max(ratioOf(vAt(x.Vu, g.u1), concreteOk ? vrdc : vrdc2), ratioOf(vAt(x.Vu, g.u0), vrdMax));
        return { combo: x.combinationName, values: [fmt(x.axialStep, 1), fmt(x.unbalancedMoment, 1), fmt(x.Vu, 1)], ratio, ok: ratio <= 1 + 1e-6 };
      }),
    };
    const steps: StepGroup[] = [{
      title: 'rcSheets.g.punching',
      steps: [
        { label: 'rcSheets.s.punchPosition', formula: '', value: `${pos} (${fmt(position.coverageDeg, 0)}°)` },
        { label: 'rcSheets.s.punchSection', formula: 'c1 × c2 · h', value: `${fmt(d.joint.b * 100, 0)} × ${fmt(d.joint.h * 100, 0)} cm · ${fmt(d.thickness * 100, 0)} cm` },
        { label: 'rcSheets.ec2.s.punchDepth', formula: 'deff = h − c − Ø (mean of the two top layers, 6.4.2(1))', value: `${fmt(dd * 100, 1)} cm` },
        { label: 'rcSheets.ec2.s.punchPerimeters', formula: pos === 'interior' ? 'u0 = 2(c1 + c2); u1 = 2(c1 + c2) + 4π·d' : pos === 'edge' ? 'u0 = min(c2 + 3d; c2 + 2c1); u1 = c2 + 2c1 + 2π·d' : 'u0 = min(3d; c1 + c2); u1 = c1 + c2 + π·d', value: `${fmt(g.u0, 3)} · ${fmt(g.u1, 3)} m` },
        { label: 'rcSheets.ec2.s.punchBeta', formula: 'β, Fig. 6.21N (6.4.3(6)): 1.15 · 1.4 · 1.5', value: fmt(beta, 2) },
        { label: 'rcSheets.s.punchVu', formula: 'VEd = ΔN − beam shears at the joint; vEd = β·VEd/(u·d) (6.38)', value: `${fmt(gov.Vu)} kN (${gov.combinationName}) → ${fmt(vEd, 3)} MPa` },
        { label: 'rcSheets.ec2.s.punchVrdc', formula: 'vRd,c = CRd,c·k·(100·ρl·fck)^⅓ ≥ vmin = 0.035·k^1.5·√fck; ρl = √(ρly·ρlz) ≤ 0.02 (6.47)', value: `k = ${fmt(k, 3)}; vmin = ${fmt(vmin, 3)} MPa; ρl,req = ${fmt(rhoReq * 100, 3)} %`, ok: concreteOk },
        { label: 'rcSheets.ec2.s.punchMax', formula: `vEd,0 = β·VEd/(u0·d) ≤ ${fmt(set.punchingMaxCoeff, 1)}·ν·fcd, ν = 0.6(1 − fck/250) (6.4.5(3))`, value: `${fmt(vEd0, 3)} ≤ ${fmt(vrdMax, 3)} MPa`, ok: maxOk },
        ...(!concreteOk ? [
          { label: 'rcSheets.ec2.s.punchLinks', formula: 'vRd,cs = 0.75·vRd,c + 1.5·(d/sr)·Asw·fywd,ef/(u1·d), fywd,ef = 250 + 0.25·d ≤ fywd (6.52)', value: `Asw = ${fmt(asw)} cm²` },
          { label: 'rcSheets.ec2.s.punchOut', formula: 'uout,ef = β·VEd/(vRd,c·d) (6.54); the outer perimeter of links within 1.5·d of it (6.4.5(4))', value: `${fmt(uOut, 2)} m` },
        ] : []),
        { label: 'rcSheets.ec2.s.punchScope', value: '' },
      ],
    }];
    const ok = verifications.every((v) => v.ok);
    return {
      family: 'punching', key: d.key, name: d.name, level: d.level, demand: d, position: pos,
      vu: gov.Vu, phiVc: capForce, utilization: Math.max(ratioOf(vEd, concreteOk ? vrdc : vrdc2), ratioOf(vEd0, vrdMax)), verifications, combos,
      status: ok ? (rhoReq > 0 ? 'warn' : 'ok') : 'fail', steps, isAdopted: true,
        figure: { b: d.joint.b, h: d.joint.h, d: dd, offset: 2 * dd, rounded: true, bo: g.u1, clause: '6.4.2', position: pos, openBearingDeg: position.openBearingDeg },
    };
  };
}
