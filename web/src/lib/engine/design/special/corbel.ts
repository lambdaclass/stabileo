/**
 * A corbel (ménsula corta) by CIRSOC 201-2025 16.5, the section at the face of the support carrying
 * the factored shear Vu, the restraint force Nuc and the moment Mu = Vu·av + Nuc·(h − d) together
 * (16.5.3.1).
 *
 * Limits: av/d ≤ 1 and Nuc ≤ Vu (16.5.1.1), depth at the outer edge ≥ 0,5d (16.5.2.2), Vu/φ within
 * the least of 16.5.2.4 (normal weight) or 16.5.2.5 (lightweight). Steel: Af for Mu by the block
 * of 22.2, An = Nuc/(φ·fy) (16.5.4.3), Avf = Vu/(φ·μ·fy) by shear friction (22.9.4.2, μ of Tabla
 * 22.9.4.2), the primary tension steel Asc as the largest of 16.5.5.1 (a) to (c), and closed
 * stirrups Ah = 0,5·(Asc − An) (16.5.5.2) spread over the 2/3·d below it (16.5.6.6).
 * φ = 0,75 throughout (Tabla 21.2.1(f)). m, kN, MPa.
 *
 * Nuc: as stated; else 20 % of the sustained unfactored reaction times 1,6 (16.2.2.3(b), bearing
 * pads); else, with neither, 0,2·Vu as a stated assumption.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import { flexuralSteel } from '../slabs/ribbed';

export interface CorbelInput {
  /** Width, total depth at the face, effective depth at the face and shear span, m. */
  bw: number; h: number; d: number; av: number;
  /** Factored shear and restraint force, kN (Nuc tension positive). */
  Vu: number; Nuc?: number;
  /** Sustained unfactored reaction, kN, for Nuc by 16.2.2.3(b) when Nuc is not stated. */
  sustained?: number;
  fc: number; fy: number; lambda?: number;
  /** Cast monolithically with its support (μ = 1,4λ), else against roughened hardened concrete (μ = 1,0λ). */
  monolithic: boolean;
  /** Total depth at the outer edge of the bearing area, m. */
  hEdge?: number;
  /** Primary tension steel and closed stirrups placed, m². */
  ascProvided?: number; ahProvided?: number;
}

export interface CorbelDesign { rows: CheckRow[]; mu: number; nuc: number; asPrimary: number; ah: number; af: number | null; an: number; avf: number }

const PHI = 0.75;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });
const row = (key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[], derivation?: string[]): CheckRow => {
  const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
  return { code: 'cirsoc-201', edition: '2025', clause, title, titleKey: `check.corbel.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio), ...(derivation ? { derivation } : {}) };
};
/** A required area: against what is placed when stated, else reported as not verified (nothing to check it against). cm². */
const steelRow = (key: string, title: string, clause: string, formula: string, need: number, have: number | undefined, inputs: CheckInput[], derivation: string[]): CheckRow =>
  have === undefined
    ? { code: 'cirsoc-201', edition: '2025', clause, title, titleKey: `check.corbel.${key}`, formula, inputs: [...inputs, inp('As,req', need * 1e4, 'cm²')], demand: r3(need * 1e4), unit: 'cm²', ratio: null, status: 'notVerified', derivation }
    : row(key, title, clause, formula, need * 1e4, have * 1e4, 'cm²', inputs, derivation);

export function corbelDesign(c: CorbelInput): CorbelDesign {
  const lambda = c.lambda ?? 1;
  const nucNote = c.Nuc !== undefined ? 'Nuc as stated' : c.sustained !== undefined ? 'Nuc = 0,2·1,6·sustained reaction (16.2.2.3(b))' : 'Nuc = 0,2·Vu (assumed, no restraint force stated)';
  const nuc = c.Nuc ?? (c.sustained !== undefined ? 0.2 * 1.6 * c.sustained : 0.2 * c.Vu);
  const fyk = c.fy * 1000; // kN/m²
  const mu = c.Vu * c.av + nuc * (c.h - c.d);
  const af = flexuralSteel(mu, c.bw, c.d, c.fc, c.fy, PHI);
  const an = nuc / (PHI * fyk);
  const muF = (c.monolithic ? 1.4 : 1.0) * lambda;
  const avf = c.Vu / (PHI * muF * fyk);
  const asMin = 0.04 * (c.fc / c.fy) * c.bw * c.d;
  const asPrimary = Math.max((af ?? 0) + an, (2 / 3) * avf + an, asMin);
  const ah = 0.5 * (asPrimary - an);
  const bd = c.bw * c.d * 1000; // MPa·m² → kN
  const ad = c.av / c.d;
  const vnMax = lambda < 1
    ? Math.min((0.2 - 0.07 * ad) * c.fc * bd, (5.5 - 1.9 * ad) * bd)
    : Math.min(0.2 * c.fc * bd, (3.3 + 0.08 * c.fc) * bd, 11 * bd);

  const rows: CheckRow[] = [
    row('span', 'Shear span over depth', '16.5.1.1', 'av/d ≤ 1,0', ad, 1, '—', [inp('av', c.av * 1000, 'mm'), inp('d', c.d * 1000, 'mm')]),
    row('restraint', 'Restraint force within the shear', '16.5.1.1', 'Nuc ≤ Vu', nuc, c.Vu, 'kN', [inp('Nuc', nuc, 'kN')], [nucNote]),
    ...(c.hEdge !== undefined ? [row('edge', 'Depth at the outer edge', '16.5.2.2', 'h,edge ≥ 0,5·d', 0.5 * c.d, c.hEdge, 'm', [inp('h,edge', c.hEdge * 1000, 'mm')])] : []),
    row('shearLimit', 'Shear limit of the section', lambda < 1 ? '16.5.2.5' : '16.5.2.4', lambda < 1 ? 'Vu/φ ≤ min((0,2 − 0,07·av/d)·f\'c; (5,5 − 1,9·av/d))·bw·d' : 'Vu/φ ≤ min(0,2·f\'c; 3,3 + 0,08·f\'c; 11)·bw·d',
      c.Vu / PHI, vnMax, 'kN', [inp('φ', PHI), inp('bw', c.bw * 1000, 'mm')]),
    af === null
      ? { code: 'cirsoc-201', edition: '2025', clause: '16.5.4.5', title: 'Flexure at the face', titleKey: 'check.corbel.flexure', formula: 'Mu ≤ φ·Mn (22.2)', inputs: [inp('Mu', mu, 'kN·m')], ratio: null, status: 'fail', derivation: ['the compression block does not fit the corbel'] }
      : steelRow('flexure', 'Flexure at the face', '16.5.4.5', 'Af for Mu = Vu·av + Nuc·(h − d), block of 22.2', af, undefined, [inp('Mu', mu, 'kN·m')], ['Af by the rectangular block, φ = 0,75 (Tabla 21.2.1(f))']),
    steelRow('primary', 'Primary tension steel', '16.5.5.1', 'Asc ≥ max(Af + An; 2/3·Avf + An; 0,04·f\'c/fy·bw·d)', asPrimary, c.ascProvided,
      [inp('An', an * 1e4, 'cm²'), inp('Avf', avf * 1e4, 'cm²'), inp('μ', muF)],
      [`An = Nuc/(φ·fy) (16.5.4.3); Avf = Vu/(φ·μ·fy) (22.9.4.2, μ ${c.monolithic ? '1,4λ' : '1,0λ'} by Tabla 22.9.4.2)`, `0,04·f'c/fy·bw·d = ${(asMin * 1e4).toFixed(2)} cm²`]),
    steelRow('stirrups', 'Closed stirrups', '16.5.5.2', 'Ah = 0,5·(Asc − An)', ah, c.ahProvided, [], [`spread evenly over 2/3·d = ${Math.round((2 / 3) * c.d * 1000)} mm below the primary steel (16.5.6.6)`]),
  ];
  return { rows, mu: r3(mu), nuc: r3(nuc), asPrimary, ah, af, an, avf };
}
