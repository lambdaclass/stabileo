/**
 * Member end forces of a 3D P-Delta result, with the geometric stiffness put back.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * The engine's 3D P-Delta finds the right displacements (a cantilever's head moves as the exact
 * elastic P-Δ solution says, to 0.2 %) but reports member forces as K·u, the elastic stiffness
 * times those displacements, without the geometric part Kg(N)·u. Measured on a 4 m cantilever
 * under 60 kN and 0.12 kN of lateral load about its weak axis: base moment 0.824 kN·m reported,
 * 0.778 exact, and a horizontal reaction of 0.198 kN against 0.12 applied. That is recorded for
 * the engine (M8 in the engine's pending list), and until it is fixed there the forces are
 * corrected here: every caller in the app goes through `solvePDelta3DCorrected`.
 *
 * `pdelta-forces.test.ts` pins the engine's current behaviour with an `it.fails`. When the engine
 * is fixed, that test starts passing, fails the suite, and this module is to be removed rather
 * than left to count the geometric part twice.
 *
 * ── The correction ─────────────────────────────────────────────────
 *
 * Per frame member, in its local axes, the consistent geometric stiffness of a beam-column with
 * axial force N (tension positive) times its end displacements. A plane with an end released in
 * bending takes the string term only, N/L on the relative sway, since the consistent terms assume
 * both ends take moment. Torsion's geometric term (N·J/(A·L)) is left out; it is second order in
 * a quantity that is small for open steel sections.
 */
import type { SolverInput3D, AnalysisResults3D, SolverNode3D } from './types-3d';
import { computeLocalAxes3D } from './local-axes-3d';
import { solvePDelta3D } from './wasm-solver';

/** The engine's 3D P-Delta with the member forces corrected. What every caller in the app uses. */
export function solvePDelta3DCorrected(input: SolverInput3D, maxIter = 20, tolerance = 1e-4, leftHand = false) {
  const result = solvePDelta3D(input, maxIter, tolerance);
  if (result?.results) result.results = correctPDeltaForces(input, result.results, leftHand);
  return result;
}

export function correctPDeltaForces(input: SolverInput3D, results: AnalysisResults3D, leftHand = false): AnalysisResults3D {
  const disp = new Map((results.displacements ?? []).map((d) => [d.nodeId, d]));
  const elementForces = (results.elementForces ?? []).map((f) => {
    const e = input.elements.get(f.elementId);
    if (!e || e.type !== 'frame') return f;
    const a = input.nodes.get(e.nodeI), b = input.nodes.get(e.nodeJ);
    const di = disp.get(e.nodeI), dj = disp.get(e.nodeJ);
    if (!a || !b || !di || !dj) return f;
    const localY = e.localYx !== undefined && e.localYy !== undefined && e.localYz !== undefined ? { x: e.localYx, y: e.localYy, z: e.localYz } : undefined;
    const { ey, ez, L } = computeLocalAxes3D(a as SolverNode3D, b as SolverNode3D, localY, e.rollAngle, leftHand);
    const dot = (v: [number, number, number], x: number, y: number, z: number) => v[0] * x + v[1] * y + v[2] * z;
    const v1 = dot(ey, di.ux, di.uy, di.uz), v2 = dot(ey, dj.ux, dj.uy, dj.uz);
    const w1 = dot(ez, di.ux, di.uy, di.uz), w2 = dot(ez, dj.ux, dj.uy, dj.uz);
    const ty1 = dot(ey, di.rx, di.ry, di.rz), ty2 = dot(ey, dj.rx, dj.ry, dj.rz);
    const tz1 = dot(ez, di.rx, di.ry, di.rz), tz2 = dot(ez, dj.rx, dj.ry, dj.rz);
    const N = ((f.nStart ?? 0) + (f.nEnd ?? 0)) / 2;
    const k = N / L;

    // Plane x–y: sway v, rotation θz.
    let Fy1: number, Mz1: number, Mz2: number;
    if (e.releaseMzStart || e.releaseMzEnd) {
      Fy1 = k * (v1 - v2); Mz1 = 0; Mz2 = 0;
    } else {
      Fy1 = k * (6 / 5) * (v1 - v2) + (N / 10) * (tz1 + tz2);
      Mz1 = (N / 10) * (v1 - v2) + ((2 * N * L) / 15) * tz1 - ((N * L) / 30) * tz2;
      Mz2 = (N / 10) * (v1 - v2) - ((N * L) / 30) * tz1 + ((2 * N * L) / 15) * tz2;
    }
    // Plane x–z: sway w, rotation θy (θy = −dw/dx, hence the signs).
    let Fz1: number, My1: number, My2: number;
    if (e.releaseMyStart || e.releaseMyEnd) {
      Fz1 = k * (w1 - w2); My1 = 0; My2 = 0;
    } else {
      Fz1 = k * (6 / 5) * (w1 - w2) - (N / 10) * (ty1 + ty2);
      My1 = -(N / 10) * (w1 - w2) + ((2 * N * L) / 15) * ty1 - ((N * L) / 30) * ty2;
      My2 = -(N / 10) * (w1 - w2) - ((N * L) / 30) * ty1 + ((2 * N * L) / 15) * ty2;
    }
    // End forces on the member into the result's internal-force convention.
    return {
      ...f,
      vyStart: f.vyStart + S.vy * Fy1, vyEnd: f.vyEnd + S.vy * Fy1,
      vzStart: f.vzStart + S.vz * Fz1, vzEnd: f.vzEnd + S.vz * Fz1,
      mzStart: f.mzStart + S.mzI * Mz1, mzEnd: f.mzEnd + S.mzJ * Mz2,
      myStart: f.myStart + S.myI * My1, myEnd: f.myEnd + S.myJ * My2,
    };
  });
  return { ...results, elementForces };
}

/**
 * Signs from end forces (on the member, local axes) to the result's internal forces. Fixed by the
 * cantilever tests in both planes rather than assumed.
 */
const S = { vy: 1, vz: 1, mzI: 1, mzJ: -1, myI: 1, myJ: -1 };
