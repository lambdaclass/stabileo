import { describe, it, expect } from 'vitest';
import { effectiveFlange } from '../effective-flange';

describe('effective flange width, Table 6.3.2.1', () => {
  it('a T: each overhang the least of 8hf, sw/2 and ln/8', () => {
    // bw 0.25, hf 0.12, sw 4.75 m each side, ln 6 m: min(0.96, 2.375, 0.75) = 0.75 per side.
    expect(effectiveFlange(0.25, 6, [{ hf: 0.12, clear: 4.75 }, { hf: 0.12, clear: 4.75 }])).toEqual({ bf: 1.75, hf: 0.12, kind: 'T' });
    // A short clear distance governs: 1.0 m → 0.5 per side.
    expect(effectiveFlange(0.25, 6, [{ hf: 0.12, clear: 1 }, { hf: 0.12, clear: 1 }])!.bf).toBeCloseTo(1.25, 9);
  });
  it('an L: its overhang the least of 6hf, sw/2 and ln/12', () => {
    // min(0.72, 2.375, 0.5) = 0.5.
    expect(effectiveFlange(0.25, 6, [{ hf: 0.12, clear: 4.75 }])).toEqual({ bf: 0.75, hf: 0.12, kind: 'L' });
  });
  it('no slab, no flange', () => {
    expect(effectiveFlange(0.25, 6, [])).toBeNull();
  });
});
