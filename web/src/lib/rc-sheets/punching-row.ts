import { checkSlabJointPunching, slabJointPosition, type AdjoiningShell, type SlabColumnJoint } from './slab-punching';
import type { Fmt } from './format';
import { check, ratioOf, type CheckLine, type ComboTable, type RowStatus, type StepGroup } from './types';

/** A slab–column joint with no beams framing into it: where a flat slab punches. */
export interface PunchingDemand {
  key: string; name: string; level?: string;
  joint: SlabColumnJoint;
  adjoining: AdjoiningShell[];
  /** The slab's elements at the joint, by kind: its concrete is theirs, not the column's. */
  slab?: Array<{ kind: 'quad' | 'plate'; id: number }>;
  /** m. */
  thickness: number;
}

export interface PunchingContext {
  fc: number; fy: number; cover: number; topBarDia: number;
  /** The bottom bars the level's slab plan carries continuous through the column core, each way, against those §8.7.4.2.2 asks. */
  integrity?: { x: number; y: number; required: number; dia: number };
}

/** §8.7.4.2.2: bottom bars of the column strip, each way, through the region the column's bars enclose. */
export const INTEGRITY_BARS = 2;

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
  /** What the plan of the joint draws: the column, the code's control perimeter at `offset` from its faces, the free edges and any stirrup lines. */
  figure?: PunchingFigure;
}

export interface PunchingFigure {
  b: number; h: number; d: number;
  /** Distance of the control perimeter from the column faces, m, rounded at the corners or not; its length, m, and the clause. */
  offset: number; rounded: boolean; bo: number; clause: string;
  position: 'interior' | 'edge' | 'corner';
  /** Bearing the free edge faces, degrees CCW from +x; null inside a slab. */
  openBearingDeg: number | null;
  reinforcement?: { legDiameter: number; legs: number; spacing: number; lines: number; extent: number; overCeiling: boolean };
  /** Bottom bars drawn through the column, each way, and their diameter. */
  integrity?: { bars: number; dia: number };
}

export function punchingRow(d: PunchingDemand, c: PunchingContext, fmt: Fmt): PunchingRow {
  const position = slabJointPosition(d.joint.nodeId, d.adjoining);
  const r = checkSlabJointPunching({ panelId: d.key, joint: d.joint, position, thickness: d.thickness, cover: c.cover, topBarDiameterMm: c.topBarDia, fc: c.fc, fy: c.fy, qu: 0, staleAnalysis: false });
  const unsupported = r.status === 'UNSUPPORTED';
  const verifications: CheckLine[] = [
    check(unsupported ? 'rcSheets.v.punchingUnsupported' : 'rcSheets.v.punching', r.status === 'OK', { clause: '§22.6', demand: `${fmt(r.Vu)} kN`, capacity: `${fmt(r.phiVc)} kN`, ratio: unsupported ? undefined : r.utilization }),
    ...(c.integrity ? [check('rcSheets.v.punchingIntegrity', c.integrity.x >= c.integrity.required && c.integrity.y >= c.integrity.required, { clause: '§8.7.4.2.2', demand: `≥ ${c.integrity.required} (X) · ≥ ${c.integrity.required} (Y)`, capacity: `${c.integrity.x} (X) · ${c.integrity.y} (Y)` })] : []),
    ...(r.reinforcement ? [check('rcSheets.v.punchingStirrups', !r.reinforcement.overCeiling, { clause: '§22.6.7', demand: `${r.reinforcement.lines} × Ø${r.reinforcement.legDiameter} c/${fmt(r.reinforcement.spacing * 100, 1)} (${r.reinforcement.legs})`, capacity: r.reinforcement.overCeiling ? "> 0.5·√f'c" : `${fmt(r.reinforcement.extent * 100, 0)} cm` })] : []),
  ];
  const combos: ComboTable = {
    headers: ['ΔN', 'Mu', 'Vu'],
    rows: r.contributions.map((k) => ({ combo: k.combinationName, values: [fmt(k.axialStep, 1), fmt(k.unbalancedMoment, 1), fmt(k.Vu, 1)], ratio: k.utilization, ok: k.utilization <= 1 + 1e-6 })),
  };
  const p = r.perimeter;
  const integrity = { bars: c.integrity?.required ?? INTEGRITY_BARS, dia: c.integrity?.dia ?? c.topBarDia };
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
      { label: 'rcSheets.s.punchIntegrity', formula: `${integrity.bars} Ø${integrity.dia} (X) · ${integrity.bars} Ø${integrity.dia} (Y) (§8.7.4.2.2)`, value: c.integrity ? `${c.integrity.x} (X) · ${c.integrity.y} (Y)` : '', ...(c.integrity ? { ok: c.integrity.x >= c.integrity.required && c.integrity.y >= c.integrity.required } : {}) },
      { label: 'rcSheets.s.punchScope', value: '' },
    ],
  }];
  return {
    family: 'punching', key: d.key, name: d.name, level: d.level, demand: d, position: position.position ?? '—',
    // The engine's ratio carries the moment transfer's stress (§8.4.4.2); Vu/φVc alone reads lower than what decides.
    vu: r.Vu, phiVc: r.phiVc, utilization: Number.isFinite(r.utilization) ? r.utilization : ratioOf(r.Vu, r.phiVc), verifications, combos,
    status: unsupported ? 'none' : r.status === 'OK' ? 'ok' : 'fail', steps, isAdopted: true,
    ...(p && position.position ? { figure: {
      b: d.joint.b, h: d.joint.h, d: p.d, offset: p.halfX - d.joint.b / 2, rounded: false, bo: p.bo, clause: '§22.6.4.1',
      position: position.position, openBearingDeg: position.openBearingDeg, integrity,
      ...(r.reinforcement ? { reinforcement: { legDiameter: r.reinforcement.legDiameter, legs: r.reinforcement.legs, spacing: r.reinforcement.spacing, lines: r.reinforcement.lines, extent: r.reinforcement.extent, overCeiling: r.reinforcement.overCeiling } } : {}),
    } satisfies PunchingFigure } : {}),
  };
}
