/**
 * The effective flange width of a beam cast with its slab, CIRSOC 201-2025 Table 6.3.2.1: a slab
 * on both sides makes a T, each overhang the least of 8·hf, half the clear distance to the next
 * web and ln/8; a slab on one side makes an L, its overhang the least of 6·hf, half that distance
 * and ln/12.
 */
export interface FlangeSide { hf: number; clear: number }
export interface Flange { bf: number; hf: number; kind: 'T' | 'L' }

export function effectiveFlange(bw: number, ln: number, sides: FlangeSide[]): Flange | null {
  const s = sides.filter((x) => x.hf > 0 && x.clear > 0);
  if (s.length === 0) return null;
  const T = s.length >= 2;
  const over = (x: FlangeSide) => (T ? Math.min(8 * x.hf, x.clear / 2, ln / 8) : Math.min(6 * x.hf, x.clear / 2, ln / 12));
  const bf = bw + s.slice(0, 2).reduce((a, x) => a + over(x), 0);
  return { bf, hf: Math.min(...s.map((x) => x.hf)), kind: T ? 'T' : 'L' };
}
