/**
 * The outlines of the concrete sections the app draws and hands to the engine.
 *
 * Only the vertices live here. The engineering arithmetic on them — area, the compressed zone
 * clipped by the neutral axis, its first moments — is the Rust section engine's
 * (`engine/src/postprocess/cirsoc201_section.rs`); the TypeScript that did it is kept as a
 * test oracle (`__tests__/differential/oracle/section-polygon.ts`).
 *
 * ── Why a polygon and not more closed forms ────────────────────────
 *
 * `cirsoc201-circular.ts` computes its compression zone from the circular
 * segment's closed form, which is exact and takes four lines. That works
 * because a round column bends about a diameter and the neutral axis is
 * always perpendicular to it.
 *
 * The moment the axis can be at ANY angle — which is what biaxial bending is
 * — the closed form has to know about corners, and there is one per outline
 * per quadrant. A T section under skew bending has enough cases to be a file
 * of its own, and every one of them is a place to be wrong in a way no test
 * would notice.
 *
 * Clipping a polygon by a half-plane has one case. It is exact for anything
 * with straight sides and as accurate as the discretisation for a circle,
 * and the same forty lines serve a rectangle, a T, a circle, a hollow pier
 * and whatever is added next.
 *
 * ── The hole ───────────────────────────────────────────────────────
 *
 * Represented as a second polygon subtracted from the first, by signing its
 * area negative rather than by clipping one against the other. That is exact
 * for the area and the first moment — which is all a stress block needs —
 * and avoids implementing polygon boolean operations for a case that is
 * always "a smaller shape entirely inside a bigger one".
 */

export interface Pt {
  x: number;
  y: number;
}

/**
 * Whether the vertices run counter-clockwise (x right, y up): the order of the drawing, read from
 * the sign of the shoelace sum. The section's area is the engine's; this only says which way the
 * outline turns, for the callers that offset or walk it.
 */
export function isCounterClockwise(poly: readonly Pt[]): boolean {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    s += p.x * q.y - q.x * p.y;
  }
  return s > 0;
}

/** A rectangle centred on the origin, counter-clockwise. */
export function rectPolygon(b: number, h: number): Pt[] {
  const x = b / 2;
  const y = h / 2;
  return [{ x: -x, y: -y }, { x, y: -y }, { x, y }, { x: -x, y }];
}

/**
 * A T, centred on its own centroid so that moments come out about the
 * section's axis rather than about an arbitrary corner.
 *
 * `hf` is the flange at the TOP, which is where a T beam carries compression
 * and therefore the only orientation the flexural case needs. A section with
 * the flange in tension is a rectangle of width bw and should be asked for as
 * one, because that is what it is.
 */
export function teePolygon(bf: number, hf: number, bw: number, h: number): Pt[] {
  const aF = bf * hf;
  const aW = bw * (h - hf);
  /* Measured from the top fibre, then shifted so y = 0 is the centroid. */
  const yBar = (aF * (hf / 2) + aW * (hf + (h - hf) / 2)) / (aF + aW);
  const Y = (yDown: number) => yBar - yDown;
  const xf = bf / 2;
  const xw = bw / 2;
  return [
    { x: -xf, y: Y(0) }, { x: xf, y: Y(0) }, { x: xf, y: Y(hf) },
    { x: xw, y: Y(hf) }, { x: xw, y: Y(h) }, { x: -xw, y: Y(h) },
    { x: -xw, y: Y(hf) }, { x: -xf, y: Y(hf) },
  ];
}

/**
 * A circle as a polygon.
 *
 * 360 sides puts the area within 0.005 % of πr² — measured, not assumed: the
 * first version said that of 180 sides and it is 0.02 %, which the test
 * caught. Still negligible either way, but a comment that states a number
 * should state the right one.
 *
 * Fixed rather than adaptive, so a result never depends on how the caller
 * happened to ask.
 */
export function circlePolygon(D: number, sides = 360): Pt[] {
  const r = D / 2;
  const out: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides;
    out.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return out;
}
