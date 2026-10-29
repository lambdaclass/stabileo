import { afterEach, describe, expect, it, vi } from 'vitest';
import { unwrapCalculation } from '../calculation-gate';
import { solve_column_capacity_batch } from '../../wasm/dedaliano_engine.js';
import { getColumnCapacityKernel, registerColumnCapacityKernel, setColumnCapacityKernelEnabled } from '../column-capacity-kernel';
import { computeColumnCapacity, computeBiaxialCapacity, prepareColumnCapacity, verifyProvidedReinforcement, setColumnCapacityReuse,
  type BarInstance, type ColumnCapacitySection, type ElementStationResult } from '../station-design-forces';
import { solveColumnSectionReference } from './differential/oracle/column-section';
import { REBAR_DB } from '../codes/argentina/cirsoc201';

function section(b = 0.3, h = 0.5): ColumnCapacitySection {
  const bars = Array.from({ length: 8 }, (_, i): BarInstance => ({
    face: i < 4 ? 'bottom' : 'top', row: 0, index: i, diameter: i % 2 ? 16 : 20,
    x: 0.045 + (i % 4) * (b - 0.09) / 3, y: i < 4 ? 0.045 : h - 0.045,
  }));
  return { b, h, AsProv_cm2: 4 * (2.01 + 3.14), fc: 25, fy: 420, cover: 0.025, stirrupDia: 8, bars };
}
/** The same run with the per-member cache off (the uncached engine path). */
function uncached<T>(run: () => T): T {
  setColumnCapacityReuse(false);
  try { return run(); } finally { setColumnCapacityReuse(true); }
}
afterEach(() => {
  vi.restoreAllMocks(); setColumnCapacityKernelEnabled(true); registerColumnCapacityKernel(solve_column_capacity_batch);
});

describe('Rust column capacity', () => {
  it('is registered by production initialization', () => {
    expect(unwrapCalculation(getColumnCapacityKernel())).toBe(solve_column_capacity_batch);
  });
  it('the engine (section engine via the column kernel) agrees with the TypeScript solver it replaced', () => {
    /*
     * The oracle bisects φ·Pn(c) = Pu to |Δc| < 1e-5 m; the engine finds the first crossing of the
     * sampled curve and refines it to the float. Their φMn agree to that tolerance, and their
     * tension capacity exactly.
     */
    let seed = 77;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    let compared = 0;
    for (let i = 0; i < 80; i++) {
      const s = section(0.2 + random() * 0.6, 0.2 + random() * 0.7);
      s.fc = [20, 25, 35, 50][i % 4]; s.fy = [420, 500][i % 2];
      const depth = s.h, width = s.b;
      const area = (d: number) => REBAR_DB.find((r) => r.diameter === d)!.area * 1e-4;
      const barData = s.bars!.map((b) => ({ d: depth - b.y, area_m2: area(b.diameter) }));
      const Ast = barData.reduce((t, b) => t + b.area_m2, 0);
      const b1 = s.fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (s.fc - 28) / 7);
      const phiPn = 0.65 * 0.80 * (0.85 * s.fc * 1000 * (s.b * s.h - Ast) + s.fy * 1000 * Ast);
      const data = { sectionDepth: depth, sectionWidth: width, fc_kPa: s.fc * 1000, fy_kPa: s.fy * 1000, fy: s.fy, b1, phiPn, barData };
      const constants = Float64Array.of(depth, width, s.fc * 1000, s.fy * 1000, s.fy, b1, phiPn, 0.85);
      const bars = Float64Array.from(barData.flatMap((b) => [b.d, b.area_m2]));
      for (const Nu of [-0.8 * 0.9 * s.fy * 1000 * Ast, -300, 0, 400, 900, 0.9 * phiPn]) {
        const [mn, pt] = solve_column_capacity_batch(constants, bars, Float64Array.of(Nu));
        const o = solveColumnSectionReference(data, Nu);
        expect(pt).toBe(o.phiPtMax);
        expect(Math.abs(mn - o.phiMn), `Nu ${Nu}: ${mn} vs ${o.phiMn}`).toBeLessThanOrEqual(2e-3 * Math.max(o.phiMn, 1));
        compared++;
      }
    }
    expect(compared).toBe(480);
  });
  it('matches every uncached capacity field for randomized sections, both axes and signed loads', () => {
    let seed = 5129;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 80; i++) {
      const s = section(0.2 + random() * 0.6, 0.2 + random() * 0.7);
      s.fc = [20, 25, 35, 50][i % 4]; s.fy = [280, 420, 500][i % 3];
      s.bars = s.bars!.map(b => ({ ...b, x: b.x + random() * 0.005,
        y: b.y + random() * 0.005, diameter: i % 3 ? b.diameter : 17 }));
      const axialCap = 0.65 * 0.80 * (0.85 * s.fc * 1000 * (s.b * s.h - s.AsProv_cm2 * 1e-4) + s.fy * 1000 * s.AsProv_cm2 * 1e-4);
      const tensionCap = -0.9 * s.fy * 1000 * s.bars.reduce((sum, b) => sum +
        (b.diameter === 16 ? 2.01e-4 : b.diameter === 20 ? 3.14e-4 : (Math.PI / 4) * (b.diameter / 1000) ** 2), 0);
      const loads = [-2000, -700, -400, -0.01, -0, 0, 0.01, 400, 900, 1200, 6000,
        axialCap - 0.1, axialCap, axialCap + 0.1, axialCap + 0.100001, tensionCap, tensionCap - 0.1, tensionCap - 0.100001, random() * 4000 - 500];
      const actual = prepareColumnCapacity(s, { axialLoads: { z: loads, y: loads } });
      const reference = prepareColumnCapacity(s, { reference: true });
      for (const Nu of loads) for (const Mu of [0, 0.0099, 0.01, 30, 85.741, 300]) {
        for (const axis of ['z', 'y'] as const) expect(actual.uniaxial(Nu, Mu, axis)).toEqual(reference.uniaxial(Nu, Mu, axis));
        expect(actual.biaxial(Nu, Mu * 0.4, Mu)).toEqual(reference.biaxial(Nu, Mu * 0.4, Mu));
      }
      const direct = () => [
        computeColumnCapacity(s.AsProv_cm2, s.b, s.h, s.fc, s.fy, s.cover, s.stirrupDia, -400, 60, s.bars, 'y'),
        computeBiaxialCapacity(s.AsProv_cm2, s.b, s.h, s.fc, s.fy, s.cover, s.stirrupDia, 400, 20, 60, s.bars),
      ];
      expect(direct()).toEqual(uncached(direct));
    }
  });
  it('batches exact unique axial loads lazily per axis and preserves snapshots', () => {
    const loads = [300, 300, -300, 300 + 1e-10, NaN, Infinity];
    const s = section(), original = structuredClone(s);
    // The uncached answers, computed first (they ask the kernel too).
    const ref = prepareColumnCapacity(original, { reference: true });
    const expected = { u300: ref.uniaxial(300, 40), b300: ref.biaxial(300, 20, 40), u600: ref.uniaxial(600, 20) };
    const kernel = vi.fn(solve_column_capacity_batch); registerColumnCapacityKernel(kernel);
    const capacity = prepareColumnCapacity(s, { axialLoads: { z: loads, y: loads } });
    loads.push(600); s.bars![0].y += 0.03; s.fc = 40;
    expect(kernel).not.toHaveBeenCalled();
    expect(capacity.uniaxial(300, 40)).toEqual(expected.u300);
    expect(kernel).toHaveBeenCalledTimes(1);
    expect([...kernel.mock.calls[0][2]]).toEqual([300, -300, 300 + 1e-10]);
    capacity.uniaxial(-300, 80); capacity.uniaxial(300 + 1e-10, 60);
    expect(kernel).toHaveBeenCalledTimes(1);
    // The biaxial check is the section engine's load contour: it asks this kernel nothing.
    expect(capacity.biaxial(300, 20, 40)).toEqual(expected.b300);
    expect(kernel).toHaveBeenCalledTimes(1);
    expect(capacity.uniaxial(600, 20)).toEqual(expected.u600);
    expect(kernel).toHaveBeenCalledTimes(2);
    const changed = prepareColumnCapacity(s, { axialLoads: { z: [300] } });
    expect(changed.uniaxial(300, 40)).toEqual(prepareColumnCapacity(s, { reference: true }).uniaxial(300, 40));
    expect(changed.uniaxial(300, 40)).not.toEqual(capacity.uniaxial(300, 40));
  });
  it('no bars, no engine and non-finite inputs are never a pass', () => {
    for (const bars of [undefined, [], section().bars!.slice(0, 3), section().bars]) {
      const s = { ...section(), bars };
      const actual = prepareColumnCapacity(s, { axialLoads: { z: [-500, 0, 900, NaN], y: [-500, 0, 900, NaN] } });
      const reference = prepareColumnCapacity(s, { reference: true });
      for (const n of [0, -500, 900, Infinity, -Infinity, NaN]) {
        const u = actual.uniaxial(n, 60, 'y');
        expect(u).toEqual(reference.uniaxial(n, 60, 'y'));
        expect(actual.biaxial(n, 20, 60)).toEqual(reference.biaxial(n, 20, 60));
        // Without bar positions (fewer than four bars) the column is not verified at all.
        if (!bars || bars.length < 4 || !Number.isFinite(n)) expect(u.status).toBe('fail');
      }
      if (bars && bars.length >= 4) {
        // Without the engine there is no column capacity: an error, never a TypeScript stand-in.
        registerColumnCapacityKernel(null);
        expect(() => prepareColumnCapacity(s).uniaxial(300, 60, 'y')).toThrow(expect.objectContaining({ code: 'ENGINE_UNAVAILABLE' }));
        registerColumnCapacityKernel(solve_column_capacity_batch);
      }
    }
    // Materials that are not numbers are refused by the engine.
    for (const patch of [{ fc: NaN }, { fy: Infinity }]) {
      const s = { ...section(), ...patch };
      expect(() => prepareColumnCapacity(s).uniaxial(300, 40)).toThrow();
    }
  });
  it('does not batch unused axial loads onto a rarely used bending axis', () => {
    const kernel = vi.fn(solve_column_capacity_batch); registerColumnCapacityKernel(kernel);
    const provided = { column: { cornerDia: 20, faceDia: 16, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 },
      stirrups: { diameter: 8, legs: 2, spacing: 0.15 } };
    const demands: ElementStationResult = {
      elementId: 1, length: 2, stationTs: [0, 0.5, 1],
      comboResults: [{ comboId: 1, comboName: 'U', stations: [0, 0.5, 1].map((t, i) => ({
        t, x: t * 2, n: -(i + 1) * 100, vy: 20, vz: 30,
        my: i === 1 ? 20 : 0, mz: 40, torsion: 0,
      })) }],
    };
    const run = () => verifyProvidedReinforcement(1, 'column', provided, undefined, {}, section(), demands,
      undefined, { slenderDeltaNs: 1 });
    expect(run()).toEqual(uncached(run));
    kernel.mockClear();
    run();
    // One batch, for the axis the uniaxial checks use; the biaxial station goes to the section
    // engine's load contour and batches nothing onto the other axis.
    expect(kernel).toHaveBeenCalledTimes(1);
    const loads = kernel.mock.calls.map(([, , loads]) => [...loads]);
    expect(loads).toContainEqual([100, 200, 300]);
  });
  it('rejects malformed buffers at the public WASM boundary', () => {
    const c = Float64Array.of(0.3, 0.3, 25000, 420000, 420, 0.85, 1200, 0.85);
    const bars = Float64Array.of(0.045, 0.000201, 0.255, 0.000201);
    expect(() => solve_column_capacity_batch(c.slice(1), bars, Float64Array.of(0))).toThrow();
    expect(() => solve_column_capacity_batch(c, bars.slice(1), Float64Array.of(0))).toThrow();
    for (const n of [NaN, Infinity, -Infinity]) {
      expect(() => solve_column_capacity_batch(c, bars, Float64Array.of(n))).toThrow();
    }
    expect(solve_column_capacity_batch(c, bars, new Float64Array())).toHaveLength(0);
  });
  it('preserves complete station reports including slender minimum moments and governing tuples', () => {
    const provided = { column: { cornerDia: 20, faceDia: 16, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 },
      stirrups: { diameter: 8, legs: 2, spacing: 0.15 } };
    const demands: ElementStationResult = {
      elementId: 1, length: 6, stationTs: [0, 0.5, 1],
      comboResults: [-500, 0, 300, 800, 2000].map((Nu, i) => ({ comboId: i, comboName: `U${i}`,
        stations: [0, 0.5, 1].map(t => ({ t, x: t * 6, n: -Nu, vy: 20, vz: 30,
          my: i % 2 ? 0 : t * 80, mz: i % 2 ? 40 : t * 30, torsion: 0 })) })),
    };
    const kernel = vi.fn(solve_column_capacity_batch); registerColumnCapacityKernel(kernel);
    for (const delta of [1, 1.2, 5]) {
      const verify = () => verifyProvidedReinforcement(1, 'column', provided, undefined, {}, section(), demands,
        undefined, { slenderDeltaNs: delta });
      expect(verify()).toEqual(uncached(verify));
    }
    expect(kernel).toHaveBeenCalled();
    expect(kernel.mock.calls.some(([, , loads]) => loads.length > 1)).toBe(true);
  });
});
