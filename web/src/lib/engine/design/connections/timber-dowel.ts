/**
 * Dowel-type fasteners in timber (bolts, lag screws, nails) by the yield limit equations of the
 * NDS (12.3.1, Table 12.3.1A, with the reduction term Rd of Table 12.3.1B), which CIRSOC 601
 * follows. Neither text is in this repo, so the rows carry `code: 'nds'`, read as experimental.
 *
 * Single shear: modes Im, Is, II, IIIm, IIIs and IV; double shear (side members alike): Im, Is,
 * IIIs and IV. Rd is 4·Kθ (I), 3,6·Kθ (II) and 3,2·Kθ (III, IV) for 6,35 mm ≤ D ≤ 25,4 mm, with
 * Kθ = 1 + 0,25·θ/90; below 6,35 mm every mode takes KD (2,2 up to 4,32 mm, 10·D + 0,5 with D in
 * inches above). The dowel bearing strengths Fem and Fes and the bending yield strength Fyb are
 * the person's (from the species and the fastener), never read from a table this app does not
 * have.
 *
 * LRFD (NDS appendix N): Z' = Z·KF·φz·λ·C, KF = 3,32, φz = 0,65, λ the time effect factor of
 * the combination (`timeEffectFactor`), C the product of the other factors the person states
 * (CM, Ct, Cg, CΔ, Ceg, Cdi, Ctn; 1 when not stated). mm, MPa, kN.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import { timeEffectFactor } from '../materials/timber';

/** Format conversion factor and resistance factor of connections (NDS Tables N1 and N2). */
export const KF_Z = 3.32;
export const PHI_Z = 0.65;

export type DowelMode = 'Im' | 'Is' | 'II' | 'IIIm' | 'IIIs' | 'IV';

export interface DowelInput {
  /** Fastener diameter, mm; bending yield strength, MPa. */
  D: number; Fyb: number;
  /** Bearing lengths in the main and the side member, mm. */
  lm: number; ls: number;
  /** Dowel bearing strengths of the main and the side member, MPa. */
  Fem: number; Fes: number;
  /** Largest angle between load and grain in either member, degrees. */
  theta?: number;
  shear: 'single' | 'double';
}

/** Rd of Table 12.3.1B for a mode. */
export function reductionTerm(D: number, theta: number, mode: DowelMode): number {
  if (D < 6.35) {
    const din = D / 25.4;
    return din <= 0.17 ? 2.2 : 10 * din + 0.5;
  }
  const kt = 1 + 0.25 * (Math.min(Math.max(theta, 0), 90) / 90);
  return mode === 'Im' || mode === 'Is' ? 4 * kt : mode === 'II' ? 3.6 * kt : 3.2 * kt;
}

/** The yield limit values of every mode, kN per fastener, and the governing one. */
export function dowelYield(i: DowelInput): { modes: Partial<Record<DowelMode, number>>; governing: DowelMode; Z: number; Re: number; Rt: number } {
  const { D, Fyb, lm, ls, Fem, Fes } = i, th = i.theta ?? 0;
  const Re = Fem / Fes, Rt = lm / ls;
  const rd = (m: DowelMode) => reductionTerm(D, th, m);
  const k1 = (Math.sqrt(Re + 2 * Re * Re * (1 + Rt + Rt * Rt) + Rt * Rt * Re ** 3) - Re * (1 + Rt)) / (1 + Re);
  const k2 = -1 + Math.sqrt(2 * (1 + Re) + (2 * Fyb * (1 + 2 * Re) * D * D) / (3 * Fem * lm * lm));
  const k3 = -1 + Math.sqrt((2 * (1 + Re)) / Re + (2 * Fyb * (2 + Re) * D * D) / (3 * Fem * ls * ls));
  const iv = Math.sqrt((2 * Fem * Fyb) / (3 * (1 + Re)));
  const n: Partial<Record<DowelMode, number>> = i.shear === 'single'
    ? {
      Im: (D * lm * Fem) / rd('Im'),
      Is: (D * ls * Fes) / rd('Is'),
      II: (k1 * D * ls * Fes) / rd('II'),
      IIIm: (k2 * D * lm * Fem) / ((1 + 2 * Re) * rd('IIIm')),
      IIIs: (k3 * D * ls * Fem) / ((2 + Re) * rd('IIIs')),
      IV: ((D * D) / rd('IV')) * iv,
    }
    : {
      Im: (D * lm * Fem) / rd('Im'),
      Is: (2 * D * ls * Fes) / rd('Is'),
      IIIs: (2 * k3 * D * ls * Fem) / ((2 + Re) * rd('IIIs')),
      IV: ((2 * D * D) / rd('IV')) * iv,
    };
  const modes = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v! / 1000])) as Partial<Record<DowelMode, number>>;
  const [governing, Z] = (Object.entries(modes) as Array<[DowelMode, number]>).reduce((a, b) => (b[1] < a[1] ? b : a));
  return { modes, governing, Z, Re, Rt };
}

export interface TimberConnectionInput extends DowelInput {
  /** Fasteners in the connection, and the factored force it carries, kN. */
  n: number; demand: number;
  /** Time effect factor, or the kinds of load of the combination to read it from. */
  lambda?: number; caseTypes?: readonly string[];
  /** Group action factor (NDS 11.3.6); 1 when not stated. */
  cg?: number;
  /** The other adjustment factors' product (CM·Ct·CΔ·Ceg·Cdi·Ctn); 1 when not stated. */
  other?: number;
  comboName?: string;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });

export function timberConnectionRows(i: TimberConnectionInput): CheckRow[] {
  const y = dowelYield(i);
  const lambdaNote = i.lambda !== undefined ? `λ = ${i.lambda} (stated)` : i.caseTypes ? `λ from the combination's loads` : 'λ = 0,6, permanent load (no combination given)';
  const lambda = i.lambda ?? (i.caseTypes ? timeEffectFactor(i.caseTypes) : 0.6);
  const cg = i.cg ?? 1, other = i.other ?? 1;
  const zp = y.Z * KF_Z * PHI_Z * lambda * cg * other;
  const per = i.demand / Math.max(i.n, 1);
  const ratio = zp > 0 ? per / zp : Number.POSITIVE_INFINITY;
  const at = i.comboName ? { combination: i.comboName } : {};
  const modeList = (Object.entries(y.modes) as Array<[DowelMode, number]>).map(([m, v]) => `${m}: ${v.toFixed(2)} kN`).join('; ');
  return [
    {
      code: 'nds', clause: '12.3.1', title: 'Fastener lateral strength', titleKey: 'check.dowel.lateral',
      formula: "Zu/n ≤ Z' = Z·KF·φz·λ·Cg·C, Z the least yield mode",
      inputs: [inp('D', i.D, 'mm'), inp('Fem', i.Fem, 'MPa'), inp('Fes', i.Fes, 'MPa'), inp('Fyb', i.Fyb, 'MPa'), inp('Z', y.Z, 'kN'), inp('λ', lambda), inp('n', i.n)],
      demand: r3(per), capacity: r3(zp), unit: 'kN', ratio: r3(ratio), status: statusOfRatio(ratio), ...at,
      derivation: [`${i.shear === 'single' ? 'Single' : 'Double'} shear, Re = ${r3(y.Re)}, Rt = ${r3(y.Rt)}`, modeList, `governing mode ${y.governing}`, `KF = ${KF_Z}, φz = ${PHI_Z}, ${lambdaNote}, C = ${other}`],
    },
    {
      code: 'nds', clause: '11.3.6', title: 'Group action', titleKey: 'check.dowel.group', formula: 'Cg as stated',
      inputs: [inp('Cg', cg), inp('n', i.n)], ratio: null,
      status: i.cg !== undefined || i.n <= 1 ? 'ok' : 'notVerified',
      derivation: [i.cg !== undefined ? `Cg = ${i.cg} (stated)` : i.n <= 1 ? 'one fastener: Cg = 1' : 'Cg = 1 assumed: the group action of the rows was not evaluated'],
    },
  ];
}
