/** The section engine's WASM boundary: registered by initialisation, freed, and strict. */
import { describe, expect, it, vi } from 'vitest';
import { Cirsoc201SectionKernel } from '../../../../wasm/dedaliano_engine.js';
import { cirsoc201EngineAvailable } from '../cirsoc201-engine';
import { refine } from '../cirsoc-flex-surface';

describe('CIRSOC 201 section kernel', () => {
  it('is registered by production WASM initialisation', () => {
    expect(cirsoc201EngineAvailable()).toBe(true);
  });

  it('releases prepared geometry if a refinement callback throws', () => {
    const freed = vi.spyOn(Cirsoc201SectionKernel.prototype, 'free');
    try {
      expect(() => refine({ kind: 'rect', b: 0.4, h: 0.6 }, [{ x: 0, y: 0.25, area: 3e-4 }], { fc: 30, fy: 420 }, 0, 0.1, 0.2,
        () => { throw new Error('refinement failure'); })).toThrow('refinement failure');
      expect(freed).toHaveBeenCalledTimes(1);
    } finally { freed.mockRestore(); }
  });

  it('rejects malformed geometry, materials and queries', () => {
    const ok = Float64Array.of(25e6, 420e6, 200e9, 2025, 0, 1);
    const square = Float64Array.of(-0.15, -0.15, 0.15, -0.15, 0.15, 0.15, -0.15, 0.15);
    expect(() => new Cirsoc201SectionKernel(new Float64Array(8), new Uint32Array([0, 5, 4]), new Float64Array(), new Float64Array(), ok)).toThrow();
    expect(() => new Cirsoc201SectionKernel(square, new Uint32Array([0, 4]), new Float64Array(), new Float64Array(), Float64Array.of(25e6, 420e6, 200e9, 2019, 0, 1))).toThrow();
    expect(() => new Cirsoc201SectionKernel(square, new Uint32Array([0, 4]), new Float64Array(), Float64Array.of(0, 0, -1e-4), ok)).toThrow();
    const section = new Cirsoc201SectionKernel(square, new Uint32Array([0, 4]), new Float64Array(), new Float64Array(), ok);
    try {
      expect(() => section.points(1, 0, Float64Array.of(NaN))).toThrow();
      expect(() => section.ray(NaN, 0)).toThrow();
    } finally { section.free(); }
  });
});
