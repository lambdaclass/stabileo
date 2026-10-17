/**
 * Second-order amplification of a 3D P-Delta result, read from its displacements.
 *
 * This module used to also put the geometric stiffness back into the member end forces, which
 * the engine reported as K·u alone. The engine now reports (K + Kg(N))·u − FEF itself
 * (`second_order_forces_3d` in `engine/src/solver/pdelta.rs`), so the app reads its P-Delta
 * member forces as the engine answers them; correcting them here as well would count Kg·u twice.
 */
import type { AnalysisResults3D } from './types-3d';

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

