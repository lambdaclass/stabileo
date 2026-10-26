/**
 * What the special foundations add to the checks the project already has.
 *
 *  · A pile: its geotechnical capacity is `model/foundation/piles.ts`'s (the strata's allowable
 *    shaft friction and tip resistance); here, the rows that compare a pile's load with it and
 *    with the strength of its own section (CIRSOC 201-2025 22.4.2.1).
 *  · A mat on a Winkler bed: its springs are `engine/foundation-springs.ts`'s (kz = ks·A at each
 *    node); here, after the solve, the soil pressure each spring's reaction stands for and the
 *    part of the mat that lifts off.
 *
 * m, kN, kPa.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../design-contract';
import { pileCapacity } from '../../model/foundation/piles';
import type { SoilStratum } from '../../model/geotechnical';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });

/** A pile's rows: its service load against the strata's allowable capacity, its factored load against its section. */
export function pileRows(strata: readonly SoilStratum[], pile: { diameter: number; length: number }, load: { service: number; factored: number; comboName?: string }, section: { fc: number; fy: number; as: number }): CheckRow[] {
  const cap = pileCapacity(strata, pile.diameter, pile.length);
  const ag = (Math.PI * pile.diameter ** 2) / 4;
  // 22.4.2.1: Pn,max = 0,80·Po for a tied member, φ = 0,65 (21.2.2).
  const po = (0.85 * section.fc * (ag - section.as) + section.fy * section.as) * 1000;
  const phiPn = 0.65 * 0.8 * po;
  const rows: CheckRow[] = [];
  if (strata.length === 0 || cap.beyondStrata) {
    rows.push({ code: 'geotech', clause: 'report', title: 'Strata', titleKey: 'check.pile.missing', formula: 'strata down to the pile toe', inputs: [], ratio: null, status: 'unsupported' });
  } else {
    const ratio = load.service / cap.total;
    rows.push({ code: 'geotech', clause: 'report', title: 'Geotechnical capacity', titleKey: 'check.pile.geo', formula: 'P ≤ Qs + Qp (allowable)',
      inputs: [inp('Qs', cap.shaft, 'kN'), inp('Qp', cap.tip, 'kN')], demand: r3(load.service), capacity: r3(cap.total), unit: 'kN', ratio: r3(ratio), status: statusOfRatio(ratio),
      derivation: [`tip in ${cap.tipStratum}`] });
  }
  const ratioS = load.factored / phiPn;
  rows.push({ code: 'cirsoc-201', edition: '2025', clause: '22.4.2.1', title: 'Pile section', titleKey: 'check.pile.section', formula: 'Pu ≤ φ·0,80·Po',
    inputs: [inp('Ag', ag * 1e4, 'cm²'), inp('Ast', section.as * 1e4, 'cm²'), inp('Po', po, 'kN')], demand: r3(load.factored), capacity: r3(phiPn), unit: 'kN', ratio: r3(ratioS), status: statusOfRatio(ratioS),
    ...(load.comboName ? { combination: load.comboName } : {}) });
  return rows;
}

export interface MatPressure { nodeId: number; area: number; q: number; lift: boolean }

/** The soil pressure under each spring node from its reaction (upward positive), and where it lifts off. */
export function matPressures(reactions: ReadonlyMap<number, number>, areas: ReadonlyMap<number, number>): MatPressure[] {
  return [...areas].filter(([, a]) => a > 0).map(([nodeId, area]) => {
    const r = reactions.get(nodeId) ?? 0;
    return { nodeId, area, q: r / area, lift: r < -1e-9 };
  });
}

/** The mat's rows: the worst pressure against the allowable, and how much of it lifts off. */
export function matRows(pressures: readonly MatPressure[], qadm: number | null, comboName?: string): CheckRow[] {
  const worst = pressures.reduce((m, p) => Math.max(m, p.q), 0);
  const total = pressures.reduce((s, p) => s + p.area, 0), lifted = pressures.filter((p) => p.lift).reduce((s, p) => s + p.area, 0);
  const rows: CheckRow[] = [];
  if (qadm && qadm > 0) {
    const ratio = worst / qadm;
    rows.push({ code: 'cirsoc-201', edition: '2025', clause: '13.3.1.1', title: 'Soil pressure', titleKey: 'check.mat.pressure', formula: 'q,max ≤ q,adm',
      inputs: [inp('q,max', worst, 'kPa'), inp('q,adm', qadm, 'kPa')], demand: r3(worst), capacity: r3(qadm), unit: 'kPa', ratio: r3(ratio), status: statusOfRatio(ratio), ...(comboName ? { combination: comboName } : {}) });
  } else {
    rows.push({ code: 'cirsoc-201', edition: '2025', clause: '13.3.1.1', title: 'Soil pressure', titleKey: 'check.mat.pressure', formula: 'q,max ≤ q,adm (q,adm not stated)', inputs: [inp('q,max', worst, 'kPa')], ratio: null, status: 'unsupported' });
  }
  rows.push({ code: 'geotech', clause: 'Winkler', title: 'Lift-off', titleKey: 'check.mat.lift', formula: 'no spring in tension', inputs: [inp('A,lift', lifted, 'm²'), inp('A', total, 'm²')],
    ratio: null, status: lifted > 0 ? 'fail' : 'ok', ...(comboName ? { combination: comboName } : {}),
    ...(lifted > 0 ? { derivation: [`${((100 * lifted) / (total || 1)).toFixed(1)} % of the area lifts off; one-way springs (uplift) let it`] } : {}) });
  return rows;
}
