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
 * the engine (M13 in the engine's pending list), and until it is fixed there the forces are
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
 *
 * The reactions take the same geometric end forces at their nodes, trusses' string term included:
 * without them a sway frame's horizontal reactions did not add up to its horizontal load.
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
  // The geometric end forces, in global axes, gathered per node for the reactions.
  const atNode = new Map<number, number[]>();
  const push = (node: number, f: [number, number, number], m: [number, number, number]) => {
    const a = atNode.get(node) ?? [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 3; i++) { a[i]! += f[i]!; a[i + 3]! += m[i]!; }
    atNode.set(node, a);
  };
  const along = (v: [number, number, number], s: number): [number, number, number] => [v[0] * s, v[1] * s, v[2] * s];
  const plus = (p: [number, number, number], q: [number, number, number]): [number, number, number] => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
  const elementForces = (results.elementForces ?? []).map((f) => {
    const e = input.elements.get(f.elementId);
    if (!e) return f;
    if (e.type !== 'frame') {
      // A truss has no bending to correct, but its string force N/L on the relative sway reaches
      // its nodes, and at a support it is part of the reaction.
      const a = input.nodes.get(e.nodeI), b = input.nodes.get(e.nodeJ);
      const di = disp.get(e.nodeI), dj = disp.get(e.nodeJ);
      if (!a || !b || !di || !dj) return f;
      const d: [number, number, number] = [b.x - a.x, b.y - a.y, b.z - a.z];
      const L = Math.hypot(d[0], d[1], d[2]);
      const ex = along(d, 1 / L);
      const du: [number, number, number] = [di.ux - dj.ux, di.uy - dj.uy, di.uz - dj.uz];
      const ax = du[0] * ex[0] + du[1] * ex[1] + du[2] * ex[2];
      const perp = plus(du, along(ex, -ax));
      const N = ((f.nStart ?? 0) + (f.nEnd ?? 0)) / 2;
      push(e.nodeI, along(perp, N / L), [0, 0, 0]);
      push(e.nodeJ, along(perp, -N / L), [0, 0, 0]);
      return f;
    }
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
    // The same end forces on the member, in global axes, for the reactions at its nodes.
    push(e.nodeI, plus(along(ey, Fy1), along(ez, Fz1)), plus(along(ey, My1), along(ez, Mz1)));
    push(e.nodeJ, plus(along(ey, -Fy1), along(ez, -Fz1)), plus(along(ey, My2), along(ez, Mz2)));
    // End forces on the member into the result's internal-force convention.
    return {
      ...f,
      vyStart: f.vyStart + S.vy * Fy1, vyEnd: f.vyEnd + S.vy * Fy1,
      vzStart: f.vzStart + S.vz * Fz1, vzEnd: f.vzEnd + S.vz * Fz1,
      mzStart: f.mzStart + S.mzI * Mz1, mzEnd: f.mzEnd + S.mzJ * Mz2,
      myStart: f.myStart + S.myI * My1, myEnd: f.myEnd + S.myJ * My2,
    };
  });
  // A reaction is the sum of the member end forces at its node less the load applied there, so
  // the geometric part of those end forces belongs to it too, on the restrained directions only:
  // a free rotation carries no reaction, and a spring's is its own stiffness times the movement.
  const supportAt = new Map([...input.supports.values()].map((sp) => [sp.nodeId, sp]));
  const reactions = (results.reactions ?? []).map((r) => {
    const g = atNode.get(r.nodeId), sp = supportAt.get(r.nodeId);
    if (!g || !sp) return r;
    const held = (fixed: boolean, k?: number) => fixed && !(k && k > 0);
    const add = [held(sp.rx, sp.kx), held(sp.ry, sp.ky), held(sp.rz, sp.kz), held(sp.rrx, sp.krx), held(sp.rry, sp.kry), held(sp.rrz, sp.krz)]
      .map((h, i) => (h ? g[i]! : 0));
    return { ...r, fx: r.fx + add[0]!, fy: r.fy + add[1]!, fz: r.fz + add[2]!, mx: r.mx + add[3]!, my: r.my + add[4]!, mz: r.mz + add[5]! };
  });
  return { ...results, elementForces, reactions };
}

/**
 * Signs from end forces (on the member, local axes) to the result's internal forces. Fixed by the
 * cantilever tests in both planes rather than assumed.
 */
const S = { vy: 1, vz: 1, mzI: 1, mzJ: -1, myI: 1, myJ: -1 };

/**
 * Second- over first-order drift, read from the two sets of displacements, and whether the
 * second-order answer is a physical one.
 *
 * Not the engine's `b2Factor`, and its `isStable` only when it says no: past the critical load in
 * a member's weak axis the engine was measured returning `converged`, `isStable` and a B2 of 1.0
 * with the displacement's sign reversed, a column under 300 kN whose weak-axis critical load is
 * 139 kN. It now reports such an equilibrium unstable, and it also gives up with the first-order
 * results when K + Kg is indefinite on a model too large for a dense fallback, where these
 * displacements would read as a B2 of 1. Here the displacement at the node that moves most in
 * first order is compared with its second-order counterpart: a reversed or vanishing one means no
 * equilibrium exists at this load.
 */
export function amplification(r: { results: AnalysisResults3D; linearResults?: AnalysisResults3D; isStable?: boolean }): { b2: number; stable: boolean } {
  if (r.isStable === false) return { b2: Infinity, stable: false };
  const lin = r.linearResults?.displacements ?? [];
  const second = new Map((r.results.displacements ?? []).map((d) => [d.nodeId, d]));
  let worst: { d1: [number, number, number]; d2: [number, number, number] } | null = null;
  let m1 = 0, b2 = 1;
  for (const d of lin) {
    const d2 = second.get(d.nodeId);
    if (!d2) continue;
    const a: [number, number, number] = [d.ux, d.uy, d.uz], b: [number, number, number] = [d2.ux, d2.uy, d2.uz];
    const h1 = Math.hypot(a[0], a[1]);
    if (h1 > m1) { m1 = h1; worst = { d1: a, d2: b }; }
  }
  if (!worst || m1 < 1e-12) return { b2: 1, stable: true };
  const dot = worst.d1[0] * worst.d2[0] + worst.d1[1] * worst.d2[1];
  if (!(dot > 0)) return { b2: Infinity, stable: false };
  b2 = Math.hypot(worst.d2[0], worst.d2[1]) / m1;
  return { b2, stable: Number.isFinite(b2) };
}

