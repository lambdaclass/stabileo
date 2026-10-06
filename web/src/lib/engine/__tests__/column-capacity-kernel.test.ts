import { afterEach, describe, expect, it, vi } from 'vitest';
import { solve_column_capacity_batch } from '../../wasm/dedaliano_engine.js';
import { getColumnCapacityKernel, registerColumnCapacityKernel, setColumnCapacityKernelEnabled } from '../column-capacity-kernel';
import { computeColumnCapacity, computeBiaxialCapacity, prepareColumnCapacity, verifyProvidedReinforcement,
  type BarInstance, type ColumnCapacitySection, type ElementStationResult } from '../station-design-forces';

function section(b = 0.3, h = 0.5): ColumnCapacitySection {
  const bars = Array.from({ length: 8 }, (_, i): BarInstance => ({
    face: i < 4 ? 'bottom' : 'top', row: 0, index: i, diameter: i % 2 ? 16 : 20,
    x: 0.045 + (i % 4) * (b - 0.09) / 3, y: i < 4 ? 0.045 : h - 0.045,
  }));
  return { b, h, AsProv_cm2: 4 * (2.01 + 3.14), fc: 25, fy: 420, cover: 0.025, stirrupDia: 8, bars };
}
function ts<T>(run: () => T): T {
  setColumnCapacityKernelEnabled(false);
  try { return run(); } finally { setColumnCapacityKernelEnabled(true); }
}
afterEach(() => {
  vi.restoreAllMocks(); setColumnCapacityKernelEnabled(true); registerColumnCapacityKernel(solve_column_capacity_batch);
});

describe('Rust column capacity', () => {
  it('is registered by production initialization', () => {
    expect(getColumnCapacityKernel()).toBe(solve_column_capacity_batch);
  });
  it('matches every TS capacity field for randomized sections, both axes and signed loads', () => {
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
      expect(direct()).toEqual(ts(direct));
    }
  });
  it('batches exact unique axial loads lazily per axis and preserves snapshots', () => {
    const kernel = vi.fn(solve_column_capacity_batch); registerColumnCapacityKernel(kernel);
    const loads = [300, 300, -300, 300 + 1e-10, NaN, Infinity];
    const s = section(), original = structuredClone(s);
    const capacity = prepareColumnCapacity(s, { axialLoads: { z: loads, y: loads } });
    loads.push(600); s.bars![0].y += 0.03; s.fc = 40;
    expect(kernel).not.toHaveBeenCalled();
    const reference = prepareColumnCapacity(original, { reference: true });
    expect(capacity.uniaxial(300, 40)).toEqual(reference.uniaxial(300, 40));
    expect(kernel).toHaveBeenCalledTimes(1);
    expect([...kernel.mock.calls[0][2]]).toEqual([300, -300, 300 + 1e-10]);
    capacity.uniaxial(-300, 80); capacity.uniaxial(300 + 1e-10, 60);
    expect(kernel).toHaveBeenCalledTimes(1);
    expect(capacity.biaxial(300, 20, 40)).toEqual(reference.biaxial(300, 20, 40));
    expect(kernel).toHaveBeenCalledTimes(2);
    expect(capacity.uniaxial(600, 20)).toEqual(reference.uniaxial(600, 20));
    expect(kernel).toHaveBeenCalledTimes(3);
    const changed = prepareColumnCapacity(s, { axialLoads: { z: [300] } });
    expect(changed.uniaxial(300, 40)).toEqual(prepareColumnCapacity(s, { reference: true }).uniaxial(300, 40));
    expect(changed.uniaxial(300, 40)).not.toEqual(capacity.uniaxial(300, 40));
  });
  it('preserves simplified, unavailable-WASM and nonfinite input behavior', () => {
    for (const bars of [undefined, [], section().bars!.slice(0, 3), section().bars]) {
      const s = { ...section(), bars };
      for (const kernel of [solve_column_capacity_batch, null]) {
        registerColumnCapacityKernel(kernel);
        const actual = prepareColumnCapacity(s, { axialLoads: { z: [-500, 0, 900, NaN], y: [-500, 0, 900, NaN] } });
        const reference = prepareColumnCapacity(s, { reference: true });
        for (const n of [0, -500, 900, Infinity, -Infinity, NaN]) {
          expect(actual.uniaxial(n, 60, 'y')).toEqual(reference.uniaxial(n, 60, 'y'));
          expect(actual.biaxial(n, 20, 60)).toEqual(reference.biaxial(n, 20, 60));
        }
      }
    }
    registerColumnCapacityKernel(solve_column_capacity_batch);
    for (const patch of [{ fc: NaN }, { b: 0 }, { fy: Infinity }]) {
      const s = { ...section(), ...patch };
      expect(prepareColumnCapacity(s).uniaxial(300, 40)).toEqual(prepareColumnCapacity(s, { reference: true }).uniaxial(300, 40));
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
    expect(run()).toEqual(ts(run));
    expect(kernel).toHaveBeenCalledTimes(2);
    const loads = kernel.mock.calls.map(([, , loads]) => [...loads]);
    expect(loads).toContainEqual([100, 200, 300]);
    expect(loads).toContainEqual([200]);
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
      expect(verify()).toEqual(ts(verify));
    }
    expect(kernel).toHaveBeenCalled();
    expect(kernel.mock.calls.some(([, , loads]) => loads.length > 1)).toBe(true);
  });
});
