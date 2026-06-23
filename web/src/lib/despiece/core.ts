// Shared free-body ("despiece") primitives used by BOTH renderers — the 2D
// canvas (lib/canvas/draw-despiece.ts) and the 3D Three.js view
// (lib/three/despiece-3d.ts). These two drew the same diagram with hand-mirrored
// copies of the palette, the vector-mode/basis types, the anchor fractions, and
// the distributed-load resultant; the centroid clamp and the global-basis sign
// convention each had to be fixed in two places during the PR #66 review. This
// module is the single source for the parts that must agree. (The member-shrink
// fraction stays per-renderer: 2D uses 0.28, 3D 0.32 — the 3D perspective shrinks
// the apparent gap, so that one is intentionally NOT shared.)

/** Which side(s) of each cut to draw: member action, node action, or both. */
export type DespieceVectorMode = 'all' | 'members' | 'nodes';
/** Decompose end actions in the member-local frame (N/V) or global axes (Fx/Fz…). */
export type DespieceBasis = 'local' | 'global';

/** Free-body palette (shared hex). `load` is the applied distributed-load color. */
export const DESPIECE_COL = {
  axial: '#ff7070',
  shear: '#4ecdc4',
  moment: '#ffd166',
  reaction: '#00e676',
  member: '#9aa7c7',
  remnant: '#5a6478',
  load: '#ffa726',
} as const;

/** Node-action anchor: this fraction out from the node toward the member end. */
export const NODE_ANCHOR_FRAC = 0.18;
/** Dotted remnant starts this fraction out from the node — AFTER the node-side
 *  vector at NODE_ANCHOR_FRAC, not under it — and runs to the shrunken end. */
export const REMNANT_START_FRAC = 0.35;

/**
 * Equivalent resultant of a (trapezoidal/partial) distributed component with
 * intensities qI at `a` and qJ at `b` (metres from node I). Returns the signed
 * total magnitude and the centroid position. Trapezoidal centroid:
 *   x̄ = a + (L/3)·(qI + 2·qJ)/(qI + qJ),  L = b − a   (span middle when qI ≈ −qJ).
 * The centroid is clamped to [a, b]: a sign-reversing trapezoid (qI, qJ opposite
 * signs → small-but-not-tiny sum) can otherwise place it far off the member span,
 * which only matters for the drawn arrow position.
 */
export function distributedResultant(qI: number, qJ: number, a: number, b: number): { magnitude: number; centroid: number } {
  const L = b - a;
  const magnitude = (qI + qJ) / 2 * L;
  const sum = qI + qJ;
  let centroid = Math.abs(sum) < 1e-9 ? a + L / 2 : a + (L / 3) * (qI + 2 * qJ) / sum;
  centroid = Math.min(b, Math.max(a, centroid));
  return { magnitude, centroid };
}
