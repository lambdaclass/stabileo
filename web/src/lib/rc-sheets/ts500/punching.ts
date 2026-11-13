import { checkSlabJointPunching, slabJointPosition } from '../../engine/detailing/slab-punching';
import { criticalSection } from '../../engine/detailing/punching-shear';
import type { Fmt } from '../format';
import type { PunchingContext, PunchingDemand, PunchingRow } from '../punching-row';
import { check, ratioOf, type CheckLine, type ComboTable, type StepGroup } from '../types';
import { toConfirm as U, ts500Mat } from './basis';

export const punchingGamma = (ex: number, ey: number, bx: number, by: number): number => 1 / (1 + 1.5 * (ex + ey) / Math.sqrt(bx * by));

export function punchingRow(d: PunchingDemand, c: PunchingContext, fmt: Fmt): PunchingRow {
  const t = ts500Mat({ fc: c.fc, fy: c.fy });
  const position = slabJointPosition(d.joint.nodeId, d.adjoining);
  const r = checkSlabJointPunching({ panelId: d.key, joint: d.joint, position, thickness: d.thickness, cover: c.cover, topBarDiameterMm: c.topBarDia, fc: c.fc, fy: c.fy, qu: 0, staleAnalysis: false });
  const dd = d.thickness - c.cover - c.topBarDia / 1000;
  const geometryOk = position.position !== null && dd > 0 && d.joint.b > 0 && d.joint.h > 0;
  const crit = geometryOk ? criticalSection(d.joint.b, d.joint.h, dd, position.position!) : null;
  const bx = d.joint.b + dd, by = d.joint.h + dd;
  const usable = r.contributions.filter((k) => Math.abs(k.equilibriumResidual) / Math.max(k.residualDenominator, 1e-9) <= 1e-6 && !(k.axialBelow != null && k.axialAbove != null && k.axialBelow - k.axialAbove < -1e-9));
  const per = usable.map((k) => {
    const f = d.joint.forces.find((x) => x.combinationId === k.combinationId);
    const vpd = k.Vu;
    const ex = vpd > 1e-9 ? 0.4 * Math.abs(f?.unbalancedMomentY ?? 0) / vpd : 0, ey = vpd > 1e-9 ? 0.4 * Math.abs(f?.unbalancedMomentX ?? 0) / vpd : 0;
    const gamma = punchingGamma(ex, ey, bx, by);
    const vpr = crit ? gamma * t.fctd * crit.bo * dd * 1000 : 0;
    return { k, vpd, gamma, ex, ey, vpr, u: ratioOf(vpd, vpr) };
  });
  const gov = per.reduce<(typeof per)[number] | undefined>((w, x) => (!w || x.u > w.u + 1e-12 || (Math.abs(x.u - w.u) <= 1e-12 && x.vpd > w.vpd) ? x : w), undefined);
  const unsupported = !crit || !gov;
  const u = gov?.u ?? 0;
  const ok = !unsupported && u <= 1 + 1e-6;
  const verifications: CheckLine[] = [
    check(unsupported ? 'rcSheets.v.punchingUnsupported' : 'rcSheets.v.punching', ok, { clause: '8.3.1', demand: `${fmt(gov?.vpd ?? 0)} kN`, capacity: `${fmt(gov?.vpr ?? 0)} kN`, ...(unsupported ? {} : { ratio: u }) }),
    ...(!unsupported && u > 1 + 1e-6 ? [check(U('rcSheets.v.punchingSteel'), u <= 1.5 + 1e-6, { clause: '8.3', demand: `${fmt(gov!.vpd)} kN`, capacity: `1.5·Vpr = ${fmt(1.5 * gov!.vpr)} kN`, ratio: ratioOf(gov!.vpd, 1.5 * gov!.vpr) })] : []),
  ];
  const combos: ComboTable = {
    headers: ['ΔN', 'Mu', 'Vpd'],
    rows: per.map((x) => ({ combo: x.k.combinationName, values: [fmt(x.k.axialStep, 1), fmt(x.k.unbalancedMoment, 1), fmt(x.vpd, 1)], ratio: x.u, ok: x.u <= 1 + 1e-6 })),
  };
  const steps: StepGroup[] = [{
    title: 'rcSheets.g.punching',
    steps: [
      { label: 'rcSheets.s.punchPosition', formula: '', value: position.position ? `${position.position} (${fmt(position.coverageDeg, 0)}°)` : '—' },
      { label: 'rcSheets.s.punchSection', formula: 'c1 × c2 · h', value: `${fmt(d.joint.b * 100, 0)} × ${fmt(d.joint.h * 100, 0)} cm · ${fmt(d.thickness * 100, 0)} cm` },
      { label: 'rcSheets.ts500.s.basis', formula: 'fctd = 0.35·√fck/1.5', value: `${fmt(t.fctd, 3)} MPa` },
      ...(crit ? [{ label: 'rcSheets.s.punchPerimeter', formula: 'up (d/2) · d', value: `${fmt(crit.bo)} m · ${fmt(dd * 100, 1)} cm` }] : []),
      ...(gov ? [
        { label: U('rcSheets.s.punchGamma'), formula: 'γ = 1/(1 + 1.5·(ex + ey)/√(bx·by)); e = 0.4·M/Vpd', value: `ex = ${fmt(gov.ex * 100, 1)} · ey = ${fmt(gov.ey * 100, 1)} cm → γ = ${fmt(gov.gamma, 3)}` },
        { label: 'rcSheets.ts500.s.punchVpr', formula: 'Vpr = γ·fctd·up·d', value: `${fmt(gov.vpr)} kN` },
      ] : []),
      { label: 'rcSheets.s.punchVu', formula: 'Vpd = ΔN − F (beams, nodal load)', value: `${fmt(gov?.vpd ?? 0)} kN (${gov?.k.combinationName ?? ''})`, ok },
      { label: 'rcSheets.s.punchScope', value: '' },
    ],
  }];
  return {
    family: 'punching', key: d.key, name: d.name, level: d.level, demand: d, position: position.position ?? '—',
    vu: gov?.vpd ?? 0, phiVc: gov?.vpr ?? 0, utilization: u, verifications, combos,
    status: unsupported ? 'none' : ok ? 'ok' : 'fail', steps, isAdopted: true,
    ...(crit && position.position ? { figure: { b: d.joint.b, h: d.joint.h, d: dd, offset: dd / 2, rounded: false, bo: crit.bo, clause: '8.3.1', position: position.position, openBearingDeg: position.openBearingDeg } } : {}),
  };
}
