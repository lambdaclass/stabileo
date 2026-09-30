/**
 * Lasso selection: a freehand outline drawn on the screen, and what falls inside it. Pure.
 */
export type P2 = { x: number; y: number };

/** Even–odd rule: is `p` inside the closed polygon `poly`? */
export function insidePolygon(p: P2, poly: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A point is added to the outline once the pointer has moved this far, px. */
export const LASSO_STEP = 3;

export function extendLasso(path: readonly P2[], p: P2): P2[] {
  const last = path[path.length - 1];
  return !last || Math.hypot(p.x - last.x, p.y - last.y) >= LASSO_STEP ? [...path, p] : [...path];
}
