// TEST ORACLE — the station verifier's TypeScript column solver and Bresler estimate as they
// stood before the column moved into the Rust section engine (refactor/concrete-in-engine).
// Production code must not import it.
/* eslint-disable */
const ALPHA1 = 0.85;
export interface ColumnSectionData {
  sectionDepth: number; sectionWidth: number; fc_kPa: number; fy_kPa: number;
  fy: number; b1: number; phiPn: number;
  barData: Array<{ d: number; area_m2: number }>;
}
export interface ColumnSectionSolution { phiMn: number; phiPtMax: number; cNeutral: number }
export /** Uncached TS reference, retaining the station verifier's exact arithmetic and stopping rule. */
function solveColumnSectionReference(data: ColumnSectionData, Nu: number): ColumnSectionSolution {
  const { sectionDepth, sectionWidth, fc_kPa, fy_kPa, fy, b1, phiPn, barData } = data;
  const Es = 200000 * 1000;
  // Function: given neutral axis c, compute (N, M) about centroid
  function sectionForces(c: number): { N: number; M: number; epsTmax: number } {
    const a = Math.min(b1 * c, sectionDepth);
    // Concrete compression
    const Cc = ALPHA1 * fc_kPa * a * sectionWidth;
    let Nsteel = 0;
    let Msteel = 0;
    let epsTmax = 0;
    for (const bd of barData) {
      const eps = c > 0.001 ? 0.003 * (c - bd.d) / c : 0;
      const fs = Math.sign(eps) * Math.min(Es * Math.abs(eps), fy_kPa);
      // Net steel force (subtract displaced concrete for bars in compression zone)
      const fsNet = bd.d <= a ? fs - ALPHA1 * fc_kPa : fs;
      const Fs = bd.area_m2 * fsNet;
      Nsteel += Fs;
      // Moment about section centroid (h/2)
      Msteel += Fs * (sectionDepth / 2 - bd.d);
      // Track max tension strain
      if (eps < epsTmax) epsTmax = eps;
    }
    const Mc = Cc * (sectionDepth / 2 - a / 2);
    return { N: Cc + Nsteel, M: Mc + Msteel, epsTmax: Math.abs(epsTmax) };
  }

  /*
   * The point of the design curve where φ(c)·Pn(c) = Pu, and φ·Mn there.
   *
   * This solved Pn(c) = Pu, the NOMINAL curve, then took φ·Mn at that c. The design curve is
   * φPn, so the point sat at a smaller c than it should, where Mn is larger: on a 30×30 with
   * 8Ø16 in H-25 it gave 71,7 kN·m at Pu = 1200 kN against a correct 47,7.
   *
   * Pu carries its sign (compression positive): a column in tension was checked as if the same
   * force compressed it, and read the same capacity. In tension the bisection finds the c at
   * which the section, cracked through most of its depth, carries that tension.
   *
   * φ follows CIRSOC 201-2025 Tabla 21.2.2: 0,65 up to εty, 0,90 from εty + 0,003.
   */
  const epsY = fy / 200000;
  const epsTC = epsY + 0.003;
  const phiOf = (epsT: number) => epsT >= epsTC ? 0.9 : epsT >= epsY ? 0.65 + 0.25 * (epsT - epsY) / (epsTC - epsY) : 0.65;
  const phiN = (c: number) => { const f = sectionForces(c); return phiOf(f.epsTmax) * f.N; };
  let cLow = 0.001;
  let cHigh = sectionDepth * 5;
  const targetN = Math.min(Nu, phiPn); // kN, compression positive; the axial cap is checked below
  for (let iter = 0; iter < 60; iter++) {
    const cMid = (cLow + cHigh) / 2;
    if (phiN(cMid) < targetN) cLow = cMid;
    else cHigh = cMid;
    if (Math.abs(cHigh - cLow) < 1e-5) break;
  }
  const cSolved = (cLow + cHigh) / 2;
  const cNeutral = +cSolved.toFixed(4);
  const result = sectionForces(cSolved);
  const phi = phiOf(result.epsTmax);
  // The tension the section can carry at all: every bar yielded, φ = 0,90 (compression positive).
  const phiPtMax = -0.9 * fy_kPa * barData.reduce((sum, bd) => sum + bd.area_m2, 0);

  return { phiMn: phi * Math.abs(result.M), phiPtMax, cNeutral };
}


/**
 * Estimate uniaxial eccentric capacity for one axis.
 * Same method as CIRSOC 201 estimateUniaxialCapacity() in cirsoc201.ts.
 */
export function estimateUniaxialCapacityLocal(
  fc_kPa: number, fy_kPa: number,
  bw: number, d: number, Ag: number, As_m2: number,
  Mu: number, Nu: number,
): number {
  if (Nu < 0.01) return 0.65 * 0.80 * (0.85 * fc_kPa * Ag + fy_kPa * As_m2);
  const e = Mu / Nu;
  const eb = 0.4 * d;
  if (e <= eb) {
    const Pn0 = 0.85 * fc_kPa * (Ag - As_m2) + fy_kPa * As_m2;
    const Pb = 0.85 * fc_kPa * bw * 0.6 * d + As_m2 * fy_kPa * 0.5;
    const t = e / eb;
    return 0.65 * ((1 - t) * Pn0 * 0.80 + t * Pb);
  } else {
    const Mnb = As_m2 * fy_kPa * (d - 0.4 * d * 0.5);
    return 0.65 * Mnb / e;
  }
}
