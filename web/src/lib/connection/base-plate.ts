/**
 * A column base plate on concrete — CIRSOC 301-2018 §J.8 and §J.9, with the plate and the anchors
 * worked the usual way (the plate cantilevers from the column's footprint; under a large moment
 * the anchors on the far side take the tension).
 *
 *   Bearing (J.8): φc = 0,60, Pp = 0,85·f'c·A1·√(A2/A1) ≤ 1,7·f'c·A1; the stress limit
 *   fp = φc·0,85·f'c·√(A2/A1), ≤ φc·1,7·f'c.
 *   Plate, compression only: l = max(m, n, λn') with m = (N − 0,95d)/2, n = (B − 0,8bf)/2,
 *   λn' = √(d·bf)/4 (λ = 1); t ≥ l·√(2Pu/(0,9·Fy·B·N)).
 *   With a moment: e = M/P against ecrit = N/2 − P/(2·qmax); beyond it the anchors at f from the
 *   centre take T = qmax·Y − P, Y = (f + N/2) − √((f + N/2)² − 2P(e + f)/qmax); the plate is
 *   checked on the bearing side for fp and on the anchor side for T over x = f − d/2 + tf/2.
 *   Anchors (J.9 → Tabla J.3.2, threaded parts): φ = 0,75, Fnt = 0,75·Fu, Fnv = 0,40·Fu.
 *   Concrete breakout (CIRSOC 201 Cap. 17): φ = 0,70, Ncbg = (ANc/ANco)·kc·√f'c·hef^1,5, kc = 10,
 *   the group's projected area without edges.
 *
 * N along the column depth, B along its flanges; mm, MPa, kN, kN·m.
 */
export interface BasePlateInput {
  column: { d: number; bf: number; tf: number };
  plate: { N: number; B: number; t: number; Fy: number };
  concrete: { fc: number; /** Area of the support under the plate, mm²; absent, A2/A1 = 4. */ A2?: number };
  anchors: { count: number; diameter: number; Fu: number; /** Distance of the anchor line from the plate edge, mm. */ edge: number; hef?: number; spacing?: number };
  Pu: number; Mu?: number; Vu?: number;
}

export interface BasePlateCheck { key: string; demand: number; capacity: number; ratio: number; unit: string }

const area = (d: number) => (Math.PI * d * d) / 4;

export function checkBasePlate(i: BasePlateInput): { checks: BasePlateCheck[]; anchorTensionKN: number; bearingLengthMm: number } {
  const { N, B, t, Fy } = i.plate, { d, bf, tf } = i.column, fc = i.concrete.fc;
  const A1 = N * B, root = Math.min(2, Math.sqrt((i.concrete.A2 ?? 4 * A1) / A1));
  const fpMax = 0.6 * 0.85 * fc * root;                 // MPa
  const qMax = fpMax * B / 1000;                          // kN/mm
  const P = Math.max(0, i.Pu), M = Math.abs(i.Mu ?? 0);
  const checks: BasePlateCheck[] = [];
  const row = (key: string, demand: number, capacity: number, unit: string) => checks.push({ key, demand, capacity, ratio: capacity > 0 ? demand / capacity : Infinity, unit });
  const m = (N - 0.95 * d) / 2, n = (B - 0.8 * bf) / 2, ln = Math.sqrt(d * bf) / 4, l = Math.max(m, n, ln);
  let T = 0, Y = N;
  const e = P > 0 ? (M * 1000) / P : Infinity;            // mm
  const ecrit = N / 2 - P / (2 * qMax);
  if (M === 0 || e <= ecrit) {
    Y = M === 0 ? N : N - 2 * e;
    const fp = P * 1000 / (B * Y);
    row('J.8', fp, fpMax, 'MPa');
    const treq = M === 0 ? l * Math.sqrt((2 * P * 1000) / (0.9 * Fy * B * N)) : 1.5 * m * Math.sqrt(fp / Fy);
    row('placa', treq, t, 'mm');
  } else {
    const f = N / 2 - i.anchors.edge;
    const a = f + N / 2, disc = a * a - (2 * P * (e + f)) / qMax;
    if (disc < 0) { row('J.8', Infinity, fpMax, 'MPa'); return { checks, anchorTensionKN: Infinity, bearingLengthMm: NaN }; }
    Y = a - Math.sqrt(disc);
    T = qMax * Y - P;
    row('J.8', fpMax, fpMax, 'MPa');
    const tb = Y >= m ? 1.5 * m * Math.sqrt(fpMax / Fy) : 2.11 * Math.sqrt((fpMax * Y * (m - Y / 2)) / Fy);
    const x = f - d / 2 + tf / 2;
    const tt = T > 0 ? 2.11 * Math.sqrt((T * 1000 * Math.max(0, x)) / (B * Fy)) : 0;
    row('placa', Math.max(tb, tt), t, 'mm');
  }
  // Anchors: the tension side carries T (half the group), every anchor shares the shear.
  const nt = Math.max(1, i.anchors.count / 2), Ab = area(i.anchors.diameter);
  const phiRnt = 0.75 * 0.75 * i.anchors.Fu * Ab / 1000, phiRnv = 0.75 * 0.4 * i.anchors.Fu * Ab / 1000;
  if (T > 0) row('J.9 tracción', T / nt, phiRnt, 'kN');
  if (i.Vu) row('J.9 corte', Math.abs(i.Vu) / i.anchors.count, phiRnv, 'kN');
  if (T > 0) {
    const hef = i.anchors.hef ?? 300, s = i.anchors.spacing ?? B - 2 * i.anchors.edge;
    const ANco = 9 * hef * hef, ANc = (s * (nt - 1 > 0 ? 1 : 0) + 3 * hef) * 3 * hef;
    const Nb = 10 * Math.sqrt(fc) * Math.pow(hef, 1.5) / 1000;
    row('201 §17.6.2', T, 0.7 * Math.min(nt, ANc / ANco) * Nb, 'kN');
  }
  return { checks, anchorTensionKN: T, bearingLengthMm: Y };
}
