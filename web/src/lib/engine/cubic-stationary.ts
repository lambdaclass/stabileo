/** Where the cubic through g at four Chebyshev points of (lo, hi) is stationary, inside (lo, hi): exact when g is a cubic there. */
export function cubicStationaryPoints(g: (t: number) => number, lo: number, hi: number): number[] {
  const w = hi - lo;
  if (!(w > 1e-9)) return [];
  const s = [0, 1, 2, 3].map((k) => (1 - Math.cos(((2 * k + 1) * Math.PI) / 8)) / 2);
  const y = s.map((x) => g(lo + w * x));
  const c = [...y];
  for (let j = 1; j < 4; j++) for (let i = 3; i >= j; i--) c[i] = (c[i] - c[i - 1]) / (s[i] - s[i - j]);
  const a3 = c[3];
  const a2 = c[2] - c[3] * (s[0] + s[1] + s[2]);
  const a1 = c[1] - c[2] * (s[0] + s[1]) + c[3] * (s[0] * s[1] + s[0] * s[2] + s[1] * s[2]);
  const A = 3 * a3, B = 2 * a2, C = a1;
  const roots: number[] = [];
  const scale = Math.max(Math.abs(A), Math.abs(B), Math.abs(C));
  if (!(scale > 0)) return roots;
  if (Math.abs(A) <= 1e-12 * scale) {
    if (Math.abs(B) > 0) roots.push(-C / B);
  } else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const q = -0.5 * (B + Math.sign(B || 1) * Math.sqrt(disc));
      roots.push(q / A);
      if (q !== 0) roots.push(C / q);
    }
  }
  return roots.filter((x) => x > 0 && x < 1).map((x) => lo + w * x);
}
