import { checkSlabJointPunching, slabJointPosition, type AdjoiningShell, type SlabColumnJoint } from '../engine/detailing/slab-punching';
import type { Fmt } from './format';
import { check, ratioOf, type CheckLine, type ComboTable, type RowStatus, type StepGroup } from './types';

/** A slab–column joint with no beams framing into it: where a flat slab punches. */
export interface PunchingDemand {
  key: string; name: string; level?: string;
  joint: SlabColumnJoint;
  adjoining: AdjoiningShell[];
  /** m. */
  thickness: number;
}

export interface PunchingContext { fc: number; fy: number; cover: number; topBarDia: number }

export interface PunchingRow {
  family: 'punching';
  key: string; name: string; level?: string;
  demand: PunchingDemand;
  position: string;
  vu: number; phiVc: number; utilization: number;
  verifications: CheckLine[];
  combos: ComboTable;
  status: RowStatus;
  steps: StepGroup[];
  isAdopted: true;
}

export function punchingRow(d: PunchingDemand, c: PunchingContext, fmt: Fmt): PunchingRow {
  const position = slabJointPosition(d.joint.nodeId, d.adjoining);
  const r = checkSlabJointPunching({ panelId: d.key, joint: d.joint, position, thickness: d.thickness, cover: c.cover, topBarDiameterMm: c.topBarDia, fc: c.fc, fy: c.fy, qu: 0, staleAnalysis: false });
  const unsupported = r.status === 'UNSUPPORTED';
  const verifications: CheckLine[] = [
    check(unsupported ? 'rcSheets.v.punchingUnsupported' : 'rcSheets.v.punching', r.status === 'OK', { clause: '§22.6', demand: `${fmt(r.Vu)} kN`, capacity: `${fmt(r.phiVc)} kN`, ratio: unsupported ? undefined : r.utilization }),
  ];
  const combos: ComboTable = {
    headers: ['ΔN', 'Mu', 'Vu'],
    rows: r.contributions.map((k) => ({ combo: k.combinationName, values: [fmt(k.axialStep, 1), fmt(k.unbalancedMoment, 1), fmt(k.Vu, 1)], ratio: k.utilization, ok: k.utilization <= 1 + 1e-6 })),
  };
  const p = r.perimeter;
  const steps: StepGroup[] = [{
    title: 'rcSheets.g.punching',
    steps: [
      { label: 'rcSheets.s.punchPosition', formula: '', value: position.position ? `${position.position} (${fmt(position.coverageDeg, 0)}°)` : '—' },
      { label: 'rcSheets.s.punchSection', formula: 'c1 × c2 · h', value: `${fmt(d.joint.b * 100, 0)} × ${fmt(d.joint.h * 100, 0)} cm · ${fmt(d.thickness * 100, 0)} cm` },
      ...(p ? [
        { label: 'rcSheets.s.punchPerimeter', formula: 'bo (d/2) · β · d', value: `${fmt(p.bo)} m · ${fmt(p.beta)} · ${fmt(p.d * 100, 1)} cm` },
        { label: 'rcSheets.s.punchVc', formula: "φvc = φ·min(0.33; 0.17(1 + 2/β); 0.083(2 + αs·d/bo))·λs·√f'c", value: `φVc = ${fmt(r.phiVc)} kN` },
      ] : []),
      { label: 'rcSheets.s.punchVu', formula: 'Vu = ΔN − q·A (+ γv·Mu)', value: `${fmt(r.Vu)} kN (${r.governingCombination ?? ''})`, ok: r.status === 'OK' },
      { label: 'rcSheets.s.punchScope', value: '' },
    ],
  }];
  return {
    family: 'punching', key: d.key, name: d.name, level: d.level, demand: d, position: position.position ?? '—',
    vu: r.Vu, phiVc: r.phiVc, utilization: ratioOf(r.Vu, r.phiVc), verifications, combos,
    status: unsupported ? 'none' : r.status === 'OK' ? 'ok' : 'fail', steps, isAdopted: true,
  };
}
