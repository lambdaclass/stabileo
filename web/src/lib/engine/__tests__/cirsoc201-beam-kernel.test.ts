/** The numeric boundary to the engine's CIRSOC 201 beam checker unpacks what Rust packs. */
import { describe, it, expect } from 'vitest';
import { evaluateBeamSection, evaluateBeamSections, cirsoc201BeamKernelAvailable, registerCirsoc201BeamKernel } from '../codes/argentina/cirsoc201-beam-kernel';
import { cirsoc201_beam_batch } from '../../wasm/dedaliano_engine.js';

const q = { edition: '2025' as const, fc: 25e6, fy: 420e6, b: 0.3, h: 0.5, d: 0.45, As: 12e-4, Av: 1.0e-4, s: 0.15 };

describe('cirsoc201 beam kernel adapter', () => {
  it('is registered by WASM initialisation', () => {
    expect(cirsoc201BeamKernelAvailable()).toBe(true);
  });

  it('reports a section it cannot evaluate as not valid, never as a strength', () => {
    const r = evaluateBeamSection({ ...q, As: 0 })!;
    expect(r.flexureValid).toBe(false);
    expect(Number.isNaN(r.phiMn)).toBe(true);
    expect(r.shearValid).toBe(true);
    const bad = evaluateBeamSection({ ...q, b: 0 })!;
    expect(bad.shearValid).toBe(false);
  });

  it('passes Es through', () => {
    // A stiffer steel strains less for the same stress: a heavily reinforced section moves.
    const heavy = { ...q, As: 60e-4 };
    expect(evaluateBeamSection({ ...heavy, es: 400e9 })!.phiMn).not.toBe(evaluateBeamSection(heavy)!.phiMn);
  });

  it('unpacks the flags', () => {
    const capped = evaluateBeamSection({ ...q, Av: 6e-4, s: 0.05 })!;
    expect(capped.vsCapped).toBe(true);
    expect(capped.avBelowMin).toBe(false);
    const bare = evaluateBeamSection({ ...q, Av: 0, s: 0 })!;
    expect(bare.vsCapped).toBe(false);
    expect(bare.avBelowMin).toBe(true);
    expect(evaluateBeamSection(q)!.vsCapped).toBe(false);
  });

  it('keeps sections apart in a batch and reads the edition', () => {
    const [a, b] = evaluateBeamSections([q, { ...q, edition: '2005' }])!;
    expect(a.epsilonTMin).toBeCloseTo(420 / 200000 + 0.003, 12);
    expect(b.epsilonTMin).toBe(0.004);
    expect(a.Vc).not.toBe(b.Vc);
  });

  it('answers null without the engine', () => {
    registerCirsoc201BeamKernel(null);
    try {
      expect(evaluateBeamSection(q)).toBeNull();
      expect(cirsoc201BeamKernelAvailable()).toBe(false);
    } finally {
      registerCirsoc201BeamKernel(cirsoc201_beam_batch);
    }
  });
});
