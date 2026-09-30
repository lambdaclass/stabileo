/**
 * A shell result read along a line: sample points from A to B, each placed on the shell it
 * falls on, the value there interpolated from that shell's corner values (the same nodal values
 * the contour paints). A point that falls on no shell reads as a gap.
 *
 * A point falls on a shell when its distance to the shell's plane is within `tol` and its
 * projection is inside one of the shell's triangles (a quadrilateral is its two triangles, split
 * on the 0–2 diagonal). Inside, the value is the triangle's barycentric interpolation.
 *
 * Pure.
 */
export type V3 = readonly [number, number, number];

export interface LineShell { corners: readonly V3[]; values: readonly number[] }
export interface LineSample { s: number; point: V3; value: number | null }

const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The value of a triangle at p, or null if p is off it. */
function onTriangle(p: V3, a: V3, b: V3, c: V3, va: number, vb: number, vc: number, tol: number): { value: number; dist: number } | null {
  const n = cross(sub(b, a), sub(c, a));
  const n2 = dot(n, n);
  if (n2 < 1e-24) return null;
  const dist = Math.abs(dot(sub(p, a), n)) / Math.sqrt(n2);
  if (dist > tol) return null;
  // Barycentric coordinates of p's projection.
  const wb = dot(cross(sub(p, a), sub(c, a)), n) / n2;
  const wc = dot(cross(sub(b, a), sub(p, a)), n) / n2;
  const wa = 1 - wb - wc;
  const eps = 1e-9;
  if (wa < -eps || wb < -eps || wc < -eps) return null;
  return { value: wa * va + wb * vb + wc * vc, dist };
}

export function sampleAlongLine(a: V3, b: V3, shells: readonly LineShell[], n = 101, tol = 0.05): LineSample[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const out: LineSample[] = [];
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : k / (n - 1);
    const p: V3 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
    let best: { value: number; dist: number } | null = null;
    for (const sh of shells) {
      const c = sh.corners, v = sh.values;
      const tris = c.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
      for (const [i, j, m] of tris) {
        const hit = onTriangle(p, c[i!]!, c[j!]!, c[m!]!, v[i!]!, v[j!]!, v[m!]!, tol);
        if (hit && (!best || hit.dist < best.dist)) best = hit;
      }
    }
    out.push({ s: t * L, point: p, value: best ? best.value : null });
  }
  return out;
}
