/**
 * The engine re-check gate on the CIRSOC 201 verifier (cirsoc201-engine-gate.ts): a pass the
 * engine does not confirm is a failure, and an engine that cannot be asked is not a pass.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { verifyElement, type VerificationInput } from '../codes/argentina/cirsoc201';
import { engineRecheckElement } from '../codes/argentina/cirsoc201-engine-gate';
import { registerCirsoc201BeamKernel } from '../codes/argentina/cirsoc201-beam-kernel';
import { initSolver } from '../wasm-solver';
/*
 * The legacy designer as it was (2005-style TypeScript sizing). It now sizes against the engine,
 * so the defects these tests feed the gate come from the oracle: the gate must still catch them.
 */
import { verifyElement as legacyVerify } from './differential/oracle/cirsoc201';
import type { ElementVerification } from '../codes/argentina/cirsoc201';
const legacyVerifyElement = (i: VerificationInput) => legacyVerify(i) as unknown as ElementVerification;

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
    const legacy = legacyVerifyElement(beam());
    registerCirsoc201BeamKernel(null);
    // The designer itself asks the engine now: without it there is no design at all.
    expect(() => verifyElement(beam())).toThrow(expect.objectContaining({ code: 'ENGINE_UNAVAILABLE' }));
    const g = engineRecheckElement(legacy, { stirrupDia: 8, NuShear: 0 });
    expect(g.engineRecheck.unavailable).toBe(true);
    expect(g.overallStatus).toBe('fail');
    expect(g.diagnostics?.some((d) => d.code === 'VERIF_ENGINE_UNAVAILABLE')).toBe(true);
  });

  it('a beam that is not tension-controlled fails CIRSOC 201-2025 9.3.3.1', () => {
    // A heavy moment on a small section: the legacy TypeScript designer passed it ('warn').
    const v = legacyVerifyElement(beam({ Mu: 330, b: 0.25, h: 0.5, Vu: 10 }));
    const g = engineRecheckElement(v, { stirrupDia: 8, NuShear: 0, edition: '2025' });
    expect(g.engineRecheck.ductilityRatio!).toBeGreaterThan(1);
    expect(g.flexure.status).toBe('fail');
    // The legacy designer (the oracle) chose bars with εt = 2,6 ‰: below the 2005 floor of 4 ‰
    // (10.3.5) as well. The TypeScript reported the εt of the REQUIRED steel (2,9 ‰) and checked neither.
    const g05 = engineRecheckElement(v, { stirrupDia: 8, NuShear: 0, edition: '2005' });
    expect(g05.engineRecheck.disagreements).toContain('ductility');
    expect(g05.engineRecheck.ductilityRatio!).toBeCloseTo(0.004 / 0.00255, 2);
  });

  it('the designer, sizing against the engine, now designs that beam ductile, and the gate agrees', () => {
    for (const edition of ['2005', '2025'] as const) {
      const v = verifyElement(beam({ Mu: 330, b: 0.25, h: 0.5, Vu: 10, edition }));
      expect(v.flexure.status).not.toBe('fail');
      const g = engineRecheckElement(v, { stirrupDia: 8, NuShear: 0, edition });
      expect(g.engineRecheck.disagreements).toEqual([]);
      expect(g.engineRecheck.ductilityRatio!).toBeLessThanOrEqual(1);
      expect(g.engineRecheck.flexureRatio!).toBeLessThanOrEqual(1);
    }
  });

  it('a column is re-checked under the tension it also sees', () => {
    // The legacy designer sized this column for the compression only.
    const v = legacyVerifyElement({ ...beam({ elementType: 'column', b: 0.3, h: 0.3, Mu: 30, Vu: 10, Nu: 300 }) });
    // 4 Ø32 yield at 0,9·420·32,2 cm² = 1 216 kN; 1 500 kN of tension is more than the bars hold.
    expect(v.column!.bars).toBe('4 Ø32');
    const withTension = engineRecheckElement(v, { stirrupDia: 8, NuShear: -1500 });
    expect(withTension.engineRecheck.columnRatio!).toBeGreaterThan(1);
    expect(withTension.column!.status).toBe('fail');
    expect(engineRecheckElement(v, { stirrupDia: 8, NuShear: -900 }).engineRecheck.columnRatio!).toBeLessThan(1);
  });

  it('the designer sizes a column for every axial force it sees, tension included', () => {
    const input = beam({ elementType: 'column', b: 0.3, h: 0.3, Mu: 30, Vu: 10, Nu: 300, NuShear: -1500,
      axialLoads: [300, -1500] });
    const v = verifyElement(input);
    // 1 500 kN of tension needs at least 1 500/(0,9·420) = 39,7 cm² of bars.
    expect(v.column!.AsProv).toBeGreaterThanOrEqual(1500 / (0.9 * 42) - 1e-9);
    const g = engineRecheckElement(v, { stirrupDia: 8, NuShear: -1500, axialLoads: [300, -1500] });
    expect(g.engineRecheck.columnRatio!).toBeLessThanOrEqual(1);
    expect(g.engineRecheck.disagreements).toEqual([]);
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
