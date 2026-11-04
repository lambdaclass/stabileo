/**
 * A masonry infill in a frame bay as an equivalent diagonal strut, for its interaction with the
 * frame under earthquake.
 *
 * The width is Mainstone's, as FEMA 356 §7.5.2.1 writes it:
 *   λ1 = [Em·t·sin2θ / (4·Efe·Icol·hinf)]^¼,   a = 0,175·(λ1·hcol)^−0,4·rinf,
 * with θ the slope of the diagonal of the infill and rinf its length. INPRES-CIRSOC 103 Parte III
 * does not give this model (its 4.1.1 truss, for confined walls, takes a tenth of the diagonal),
 * and FEMA 356 is not among the texts in the repository: the rows say `fema-356` so the source is
 * plain. The masonry modulus can come from [2-9] of 103 Parte III (`masonryModuli`).
 *
 * The strut's crushing is checked against a·t times a compressive strength the person states (the
 * expected strength of FEMA 356 or f'm), with no reduction unless one is given. m, kN, MPa.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';

export interface InfillBay {
  /** Column height between beam axes and infill clear height and length, m. */
  hcol: number; hinf: number; linf: number;
  /** Infill thickness, m. */
  t: number;
  /** Masonry and frame (column) moduli, MPa; second moment of the column about the bending axis, m⁴. */
  Em: number; Ec: number; Icol: number;
}

export interface InfillStrut {
  /** Equivalent width, m; slope of the diagonal, rad; its length, m. */
  width: number; theta: number; length: number;
  lambda1: number;
  /** Strut area, m², and its axial stiffness E·A/L, kN/m. */
  area: number; axialStiffness: number;
}

export function infillStrut(b: InfillBay): InfillStrut {
  const theta = Math.atan2(b.hinf, b.linf);
  const length = Math.hypot(b.hinf, b.linf);
  const lambda1 = Math.pow((b.Em * b.t * Math.sin(2 * theta)) / (4 * b.Ec * b.Icol * b.hinf), 0.25);
  const width = 0.175 * Math.pow(lambda1 * b.hcol, -0.4) * length;
  const area = width * b.t;
  return { width, theta, length, lambda1, area, axialStiffness: (b.Em * 1000 * area) / length };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });

/** The strut's crushing: compression demand against φ·a·t·f (f the strength the person states). */
export function infillRows(i: { strut: InfillStrut; t: number; strength: number; demand: number; phi?: number }): CheckRow[] {
  const phi = i.phi ?? 1;
  const cap = phi * i.strut.width * i.t * i.strength * 1000;
  const ratio = cap > 0 ? Math.abs(i.demand) / cap : Number.POSITIVE_INFINITY;
  return [{
    code: 'fema-356', clause: '7.5.2.1', title: 'Infill strut crushing', titleKey: 'check.infill.crushing', formula: 'Pu ≤ φ·a·t·f; a = 0,175·(λ1·hcol)^−0,4·rinf',
    inputs: [inp('a', i.strut.width, 'm'), inp('λ1', i.strut.lambda1, '1/m'), inp('θ', (i.strut.theta * 180) / Math.PI, '°'), inp('t', i.t * 1000, 'mm'), inp('f', i.strength, 'MPa'), inp('φ', phi)],
    demand: r3(Math.abs(i.demand)), capacity: r3(cap), unit: 'kN', ratio: r3(ratio), status: statusOfRatio(ratio),
    derivation: ['Mainstone width as in FEMA 356 §7.5.2.1; not in INPRES-CIRSOC 103 Parte III'],
  }];
}
