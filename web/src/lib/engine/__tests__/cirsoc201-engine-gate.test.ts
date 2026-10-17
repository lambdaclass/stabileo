/**
 * The engine re-check gate on the CIRSOC 201 verifier (cirsoc201-engine-gate.ts): a pass the
 * engine does not confirm is a failure, and an engine that cannot be asked is not a pass.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { verifyElement, type VerificationInput } from '../codes/argentina/cirsoc201';
import { engineRecheckElement } from '../codes/argentina/cirsoc201-engine-gate';
import { registerCirsoc201BeamKernel } from '../codes/argentina/cirsoc201-beam-kernel';
import { initSolver } from '../wasm-solver';

const beam = (over: Partial<VerificationInput> = {}): VerificationInput => ({
  elementId: 1, elementType: 'beam', Mu: 120, Vu: 90, Nu: 0,
  b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8, ...over,
});

describe('engine re-check gate', () => {
  afterEach(async () => {
    // Re-register the real kernel after a test that removed it.
    registerCirsoc201BeamKernel(null);
    const wasm = await import('../../wasm/dedaliano_engine.js');
    registerCirsoc201BeamKernel(wasm.cirsoc201_beam_batch);
    await initSolver();
  });

  it('confirms an ordinary beam the TypeScript passed', () => {
    const v = verifyElement(beam());
    expect(v.overallStatus).not.toBe('fail');
    const g = engineRecheckElement(v, { stirrupDia: 8, NuShear: 0 });
    expect(g.engineRecheck.unavailable).toBe(false);
    expect(g.engineRecheck.disagreements).toEqual([]);
    expect(g.engineRecheck.flexureRatio!).toBeLessThanOrEqual(1);
    expect(g.engineRecheck.shearRatio!).toBeLessThanOrEqual(1);
    expect(g.overallStatus).toBe(v.overallStatus);
  });

  it('a TypeScript pass the engine contradicts becomes a failure', () => {
    const v = verifyElement(beam());
    // The arrangement the TypeScript certified, with half its steel: a defect upstream that
    // left the verdict 'ok' — exactly what the gate exists to catch.
    const tampered = { ...v, flexure: { ...v.flexure, AsProv: v.flexure.AsProv / 2.5 } };
    const g = engineRecheckElement(tampered, { stirrupDia: 8, NuShear: 0 });
    expect(g.engineRecheck.disagreements).toContain('flexure');
    expect(g.flexure.status).toBe('fail');
    expect(g.overallStatus).toBe('fail');
    expect(g.diagnostics?.some((d) => d.code === 'VERIF_ENGINE_DISAGREES')).toBe(true);
  });

  it('no engine, no pass', () => {
    registerCirsoc201BeamKernel(null);
    const g = engineRecheckElement(verifyElement(beam()), { stirrupDia: 8, NuShear: 0 });
    expect(g.engineRecheck.unavailable).toBe(true);
    expect(g.overallStatus).toBe('fail');
    expect(g.diagnostics?.some((d) => d.code === 'VERIF_ENGINE_UNAVAILABLE')).toBe(true);
  });

  it('a beam that is not tension-controlled fails CIRSOC 201-2025 9.3.3.1', () => {
    // A heavy moment on a small section: the TypeScript designer passes it ('warn').
    const v = verifyElement(beam({ Mu: 330, b: 0.25, h: 0.5, Vu: 10 }));
    const g = engineRecheckElement(v, { stirrupDia: 8, NuShear: 0, edition: '2025' });
    expect(g.engineRecheck.ductilityRatio!).toBeGreaterThan(1);
    expect(g.flexure.status).toBe('fail');
    // Its εt, with the bars it chose, is 2,6 ‰: below the 2005 floor of 4 ‰ (10.3.5) as well.
    // The TypeScript reported the εt of the REQUIRED steel (2,9 ‰) and checked neither.
    const g05 = engineRecheckElement(v, { stirrupDia: 8, NuShear: 0, edition: '2005' });
    expect(g05.engineRecheck.disagreements).toContain('ductility');
    expect(g05.engineRecheck.ductilityRatio!).toBeCloseTo(0.004 / 0.00255, 2);
  });

  it('a column is re-checked under the tension it also sees', () => {
    const v = verifyElement({ ...beam({ elementType: 'column', b: 0.3, h: 0.3, Mu: 30, Vu: 10, Nu: 300 }) });
    // 4 Ø32 yield at 0,9·420·32,2 cm² = 1 216 kN; 1 500 kN of tension is more than the bars hold.
    expect(v.column!.bars).toBe('4 Ø32');
    const withTension = engineRecheckElement(v, { stirrupDia: 8, NuShear: -1500 });
    expect(withTension.engineRecheck.columnRatio!).toBeGreaterThan(1);
    expect(withTension.column!.status).toBe('fail');
    expect(engineRecheckElement(v, { stirrupDia: 8, NuShear: -900 }).engineRecheck.columnRatio!).toBeLessThan(1);
  });
});

describe('provided-reinforcement verifier without the engine', () => {
  it('a column is not verified when the Rust column kernel is not registered', async () => {
    const { registerColumnCapacityKernel } = await import('../column-capacity-kernel');
    const { verifyProvidedReinforcement } = await import('../station-design-forces');
    const wasm = await import('../../wasm/dedaliano_engine.js');
    registerColumnCapacityKernel(null);
    try {
      const r = verifyProvidedReinforcement(1, 'column', { longitudinal: { count: 8, diameter: 16 }, stirrups: { diameter: 8, legs: 2, spacing: 0.15 } },
        undefined, {}, { b: 0.3, h: 0.3, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 },
        { elementId: 1, length: 3, comboResults: [{ comboId: 1, comboName: 'U', stations: [
          { t: 0, x: 0, n: -500, vy: 5, vz: 5, my: 10, mz: 20, mx: 0 }] }] } as never);
      const c = r.checks.find((k) => k.category.includes('engine unavailable'));
      expect(c?.status).toBe('fail');
      expect(r.overallStatus).not.toBe('pass');
    } finally {
      registerColumnCapacityKernel(wasm.solve_column_capacity_batch);
    }
  });
});
