/**
 * Wood–Armer design moments of an orthogonally reinforced plate, on the calculation side so the
 * shell contours and the slab design read one formula (`detailing/slab-design.ts` re-exports it).
 */

export interface DesignMoments {
  /** Bottom-face design moment about the x reinforcement direction, kN·m/m. */
  bottomX: number;
  bottomY: number;
  /** Top-face design moment magnitudes, kN·m/m, positive when top steel is needed. */
  topX: number;
  topY: number;
  /** True when a sign correction was applied — recorded so the memo can say so. */
  corrected: boolean;
}

/**
 * Wood-Armer design moments for an orthogonally reinforced slab.
 *
 * Sign convention: `mx`/`my` positive means sagging (tension at the bottom face).
 *
 * The correction branches matter. When `mx + |mxy|` comes out negative, the bottom needs
 * no steel in x and the twisting moment it would have carried is transferred to y as
 * `my + mxy²/|mx|`. Skipping that transfer is what leaves corner panels short.
 */
export function woodArmer(mx: number, my: number, mxy: number): DesignMoments {
  const a = Math.abs(mxy);
  let corrected = false;

  /**
   * One face of the transformation.
   *
   * The transfer applies ONLY when one direction needs steel and the other's design
   * moment comes out the wrong way. When NEITHER needs steel — the ordinary case for
   * the top face of a sagging panel — there is nothing to transfer and no correction
   * has occurred. Conflating the two made every sagging panel report a correction it
   * had not made.
   */
  const face = (px: number, py: number): [number, number] => {
    let dx = px + a;
    let dy = py + a;
    if (dx >= 0 && dy >= 0) return [dx, dy];
    if (dx < 0 && dy < 0) return [0, 0];          // no steel this face; nothing to transfer
    if (dx < 0) {
      dx = 0;
      dy = py + (a > 0 ? (mxy * mxy) / Math.max(Math.abs(px), 1e-9) : 0);
      corrected = true;
    } else {
      dy = 0;
      dx = px + (a > 0 ? (mxy * mxy) / Math.max(Math.abs(py), 1e-9) : 0);
      corrected = true;
    }
    return [Math.max(0, dx), Math.max(0, dy)];
  };

  const [bottomX, bottomY] = face(mx, my);
  // The top face is the same problem with the moment field reversed.
  const [topX, topY] = face(-mx, -my);

  return { bottomX, bottomY, topX, topY, corrected };
}

