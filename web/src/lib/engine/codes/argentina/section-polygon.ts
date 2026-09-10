/**
 * Polygon geometry for a cracked concrete section.
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

/** Signed area, positive for a counter-clockwise ring. */
export function polygonArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return a / 2;
}

/**
 * Area and centroid together, because a caller that wants one almost always
 * wants the other and computing them separately walks the ring twice.
 *
 * A degenerate ring returns zero area and the origin rather than NaN: a
 * vanishing compression zone is an ordinary state at the tension end of an
 * interaction diagram, not an error.
 */
export function polygonAreaCentroid(poly: readonly Pt[]): { area: number; cx: number; cy: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    a += cross;
    cx += (poly[j].x + poly[i].x) * cross;
    cy += (poly[j].y + poly[i].y) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-14) return { area: 0, cx: 0, cy: 0 };
  return { area: a, cx: cx / (6 * a), cy: cy / (6 * a) };
}

/**
 * The part of `poly` on the compressed side of a line.
 *
 * The line is given by its unit normal `(nx, ny)` pointing INTO compression
 * and its offset `d`, so the kept half-plane is `n·p ≥ d`. Sutherland–Hodgman:
 * walk the edges, keep what is inside, and insert the crossing point wherever
 * an edge changes side.
 *
 * Convex clipping of a possibly concave polygon — a T section is concave — is
 * safe here because the CLIP region is the half-plane, and Sutherland–Hodgman
 * is exact whenever the clip is convex. The known artefact, a degenerate
 * zero-width bridge across a concavity, contributes exactly zero area and
 * zero first moment, so it cannot disturb either quantity this file exists to
 * produce.
 */
export function clipHalfPlane(
  poly: readonly Pt[],
  nx: number,
  ny: number,
  d: number,
): Pt[] {
  const out: Pt[] = [];
  const side = (p: Pt) => nx * p.x + ny * p.y - d;

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const A = poly[j];
    const B = poly[i];
    const sA = side(A);
    const sB = side(B);
    const inA = sA >= 0;
    const inB = sB >= 0;

    if (inA !== inB) {
      const t = sA / (sA - sB);
      out.push({ x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) });
    }
    if (inB) out.push(B);
  }
  return out;
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

/**
 * Area and first moment of a compression zone made of one outer ring and any
 * number of holes.
 *
 * Each ring is clipped independently and the holes are subtracted. The
 * subtraction is why this returns a first moment rather than a centroid: the
 * centroid of a difference is not the difference of centroids, and a caller
 * that added them would get a plausible wrong answer.
 */
export function compressedZone(
  outer: readonly Pt[],
  holes: ReadonlyArray<readonly Pt[]>,
  nx: number,
  ny: number,
  d: number,
): { area: number; mx: number; my: number } {
  const take = (ring: readonly Pt[], sign: number) => {
    const cut = clipHalfPlane(ring, nx, ny, d);
    if (cut.length < 3) return { area: 0, mx: 0, my: 0 };
    const { area, cx, cy } = polygonAreaCentroid(cut);
    const A = Math.abs(area) * sign;
    return { area: A, mx: A * cx, my: A * cy };
  };

  let area = 0;
  let mx = 0;
  let my = 0;
  for (const part of [take(outer, +1), ...holes.map((hRing) => take(hRing, -1))]) {
    area += part.area;
    mx += part.mx;
    my += part.my;
  }
  return { area: Math.max(area, 0), mx, my };
}
