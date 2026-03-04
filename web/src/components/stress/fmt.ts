// Shared formatting helpers for stress analysis components

/** Compact number formatting for MPa values */
export function fmt(v: number, decimals = 1): string {
  if (Math.abs(v) < 0.01) return '0';
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(decimals);
  if (Math.abs(v) >= 1) return v.toFixed(decimals + 1);
  return v.toPrecision(3);
}

/** Format force value with sign prefix */
export function fmtForce(v: number): string {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return sign + fmt(abs);
}

/** Point-in-convex-polygon test (for central core boundary check) */
export function isPointInConvexPolygon(
  pz: number, py: number,
  vertices: Array<{ ez: number; ey: number }>,
): boolean {
  const n = vertices.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % n];
    const cross = (v2.ez - v1.ez) * (py - v1.ey) - (v2.ey - v1.ey) * (pz - v1.ez);
    if (Math.abs(cross) < 1e-15) continue; // on the edge
    if (sign === 0) sign = cross > 0 ? 1 : -1;
    else if ((cross > 0 ? 1 : -1) !== sign) return false;
  }
  return true;
}

/** Stress color: blue = compression (negative), red = tension (positive) */
export function stressColor(sigma: number, maxAbs: number): string {
  if (maxAbs < 1e-6) return '#666';
  const ratio = sigma / maxAbs;
  if (ratio > 0) {
    const r = Math.min(255, Math.round(80 + 175 * ratio));
    return `rgb(${r}, 60, 60)`;
  } else {
    const b = Math.min(255, Math.round(80 + 175 * Math.abs(ratio)));
    return `rgb(60, 60, ${b})`;
  }
}
