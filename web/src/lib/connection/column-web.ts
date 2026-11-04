/**
 * A column under the flange forces of a moment connection — CIRSOC 301-2018 §J.10:
 *
 *   J.10.1  flange local bending (tension flange), φ = 0,90: Rn = 0,625·tf²·Fyf;
 *   J.10.2  web local yielding, φ = 1: Rn = (5k + N)·Fyw·tw away from the end, (2,5k + N) within d;
 *   J.10.6  panel zone shear, φ = 0,90, deformation not in the analysis:
 *           Rn = 0,6·Fy·dc·tw for Pu ≤ 0,4·Py, ·(1,4 − Pu/Py) above.
 *
 * Lengths in cm, stresses in MPa, forces in kN. Where a flange force exceeds J.10.1 or J.10.2, a
 * pair of transverse stiffeners is required; where the panel exceeds J.10.6, a doubler plate or
 * diagonal stiffeners.
 */
export function flangeLocalBending(tf: number, Fyf: number): number { return 0.9 * 0.625 * tf * tf * Fyf; }

export function webLocalYielding(i: { k: number; N: number; tw: number; Fyw: number; nearEnd?: boolean }): number {
  return 1.0 * ((i.nearEnd ? 2.5 : 5) * i.k + i.N) * i.Fyw * i.tw / 10;
}

export function panelZoneShear(i: { dc: number; tw: number; Fy: number; Pu: number; Py: number }): number {
  const base = 0.6 * i.Fy * i.dc * i.tw / 10;
  return 0.9 * (i.Pu <= 0.4 * i.Py ? base : base * (1.4 - i.Pu / i.Py));
}

/** The panel's shear demand: the flange forces of the beam moments less the column shear above. */
export function panelZoneDemand(i: { momentsKNm: readonly number[]; db: number; columnShearKN: number }): number {
  const flange = i.momentsKNm.reduce((s, m) => s + Math.abs(m), 0) / (i.db / 100);
  return Math.max(0, flange - Math.abs(i.columnShearKN));
}

export interface ColumnWebCheck { key: string; demandKN: number; phiRnKN: number; ratio: number; stiffener: boolean }

/** The four checks of a column at a beam's flange forces, and whether stiffeners are needed. */
export function columnAtMomentJoint(i: {
  column: { d: number; tw: number; tf: number; k: number; Fy: number; A: number };
  beam: { d: number; tf: number };
  momentsKNm: readonly number[]; columnShearKN: number; columnAxialKN: number; nearEnd?: boolean;
}): ColumnWebCheck[] {
  const Mmax = Math.max(0, ...i.momentsKNm.map(Math.abs));
  const Ff = Mmax / ((i.beam.d - i.beam.tf) / 100);
  const flb = flangeLocalBending(i.column.tf, i.column.Fy);
  const wly = webLocalYielding({ k: i.column.k, N: i.beam.tf, tw: i.column.tw, Fyw: i.column.Fy, nearEnd: i.nearEnd });
  const Py = i.column.Fy * i.column.A / 10;
  const pz = panelZoneShear({ dc: i.column.d, tw: i.column.tw, Fy: i.column.Fy, Pu: Math.abs(i.columnAxialKN), Py });
  const vpz = panelZoneDemand({ momentsKNm: i.momentsKNm, db: i.beam.d - i.beam.tf, columnShearKN: i.columnShearKN });
  const row = (key: string, demandKN: number, phiRnKN: number, stiffener: boolean): ColumnWebCheck => ({ key, demandKN, phiRnKN, ratio: demandKN / phiRnKN, stiffener: stiffener && demandKN > phiRnKN });
  return [row('J.10.1', Ff, flb, true), row('J.10.2', Ff, wly, true), row('J.10.6', vpz, pz, true)];
}
