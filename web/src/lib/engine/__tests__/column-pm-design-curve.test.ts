/**
 * The column check reads the DESIGN curve, φ(c)·Pn(c) = Pu, and carries the sign of the axial
 * force.
 *
 * It solved the nominal curve, Pn(c) = Pu, and took φ·Mn at that c. At high axial load that c
 * is too small and Mn too large: a 30×30 with 8Ø16 in H-25 read 71,7 kN·m at Pu = 1200 kN
 * where the design curve gives about 48. And it read |N|, so a tension was a compression.
 */
import { describe, it, expect } from 'vitest';
import { computeColumnCapacity, type BarInstance } from '../station-design-forces';

// 30×30 cm, bar centres 41 mm from each face (25 mm cover, Ø8 tie, Ø16 bar).
const e = 0.041, b = 0.30;
const at = (x: number, y: number, i: number): BarInstance => ({ face: y > b / 2 ? 'top' : 'bottom', row: 0, index: i, diameter: 16, x, y });
const BARS = [at(e, e, 0), at(b / 2, e, 1), at(b - e, e, 2), at(e, b / 2, 3), at(b - e, b / 2, 4), at(e, b - e, 5), at(b / 2, b - e, 6), at(b - e, b - e, 7)];
const As = 8 * 2.01; // cm²
const cap = (Nu: number, Mu = 50) => computeColumnCapacity(As, b, b, 25, 420, 0.025, 8, Nu, Mu, BARS, 'z');

describe('column P-M on the design curve', () => {
  it('reads φMn where φPn equals Pu, lower than the nominal-curve reading at high load', () => {
    expect(cap(900).phiMn).toBeCloseTo(66.6, -0.5);   // ±5 kN·m band around a hand calculation
    expect(cap(1200).phiMn).toBeCloseTo(47.7, -0.5);
    expect(cap(1200).phiMn).toBeLessThan(55);
  });

  it('loses moment capacity monotonically above the balance point', () => {
    const m = [900, 1000, 1100, 1200].map((p) => cap(p).phiMn);
    for (let i = 1; i < m.length; i++) expect(m[i]!).toBeLessThan(m[i - 1]!);
  });

  it('reads a tension as a tension: less moment than pure bending, and less than the same force in compression', () => {
    const bending = cap(0, 60).phiMn;
    const tension = cap(-400, 60).phiMn;
    const compression = cap(400, 60).phiMn;
    expect(tension).toBeLessThan(bending);
    expect(tension).toBeLessThan(compression);
  });

  it('fails a tension beyond what the yielded bars carry', () => {
    // 0,9·16,08 cm²·420 MPa = 607,8 kN.
    expect(cap(-700, 1).ratio).toBeLessThan(1);
    expect(cap(-500, 1).ratio).toBeGreaterThan(1);
  });
});
