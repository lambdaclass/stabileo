import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeColumnCapacity, computeBiaxialCapacity, prepareColumnCapacity, setColumnCapacityReuse, verifyProvidedReinforcement,
  type BarInstance, type ColumnCapacitySection, type ElementStationResult } from '../station-design-forces';

function section(b = 0.3, h = 0.5): ColumnCapacitySection {
  const bars = Array.from({ length: 8 }, (_, i): BarInstance => ({
    face: i < 4 ? 'bottom' : 'top', row: 0, index: i, diameter: i % 2 ? 16 : 20,
    x: 0.045 + (i % 4) * (b - 0.09) / 3, y: i < 4 ? 0.045 : h - 0.045,
  }));
  return { b, h, AsProv_cm2: 4 * (2.01 + 3.14), fc: 25, fy: 420, cover: 0.025, stirrupDia: 8, bars };
}
function reference(s: ColumnCapacitySection, Nu: number, Mu: number, axis: 'z' | 'y') {
  return computeColumnCapacity(s.AsProv_cm2, s.b, s.h, s.fc, s.fy, s.cover, s.stirrupDia, Nu, Mu, s.bars, axis);
}
function biaxial(s: ColumnCapacitySection, Nu: number, Muy: number, Muz: number) {
  return computeBiaxialCapacity(s.AsProv_cm2, s.b, s.h, s.fc, s.fy, s.cover, s.stirrupDia, Nu, Muy, Muz, s.bars);
}
afterEach(() => { vi.restoreAllMocks(); setColumnCapacityReuse(true); });

describe('prepared station-column capacity', () => {
  it('matches every reference field for both axes and signed axial demands', () => {
    let seed = 5129;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 32; i++) {
      const s = section(0.2 + random() * 0.6, 0.2 + random() * 0.7);
      s.fc = [20, 25, 35, 50][i % 4]; s.fy = [280, 420, 500][i % 3];
      // Mixed and non-catalogue diameters, asymmetric bar positions.
      s.bars = s.bars!.map(b => ({ ...b, x: b.x + random() * 0.005,
        y: b.y + random() * 0.005, diameter: i % 3 ? b.diameter : 17 }));
      const prepared = prepareColumnCapacity(s);
      for (const Nu of [-2000, -700, -400, -0.01, -0, 0, 0.01, 400, 900, 1200, 6000, random() * 4000 - 500]) {
        for (const Mu of [0, 0.0099, 0.01, 30, 85.741, 300]) {
          for (const axis of ['z', 'y'] as const) expect(prepared.uniaxial(Nu, Mu, axis)).toEqual(reference(s, Nu, Mu, axis));
          expect(prepared.biaxial(Nu, Mu * 0.4, Mu)).toEqual(biaxial(s, Nu, Mu * 0.4, Mu));
        }
      }
    }
  });
  it('reuses exact axial loads independently of moments, without sharing axes or rounding loads', () => {
    const s = section(), prepared = prepareColumnCapacity(s);
    const strain = vi.spyOn(Math, 'sign');
    prepared.uniaxial(300, 10);
    const first = strain.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    prepared.uniaxial(300, 20);
    prepared.uniaxial(300, 100);
    expect(strain).toHaveBeenCalledTimes(first);
    prepared.biaxial(300, 10, 20);
    const both = strain.mock.calls.length;
    expect(both).toBeGreaterThan(first);
    prepared.biaxial(300, 30, 40);
    expect(strain).toHaveBeenCalledTimes(both);
    prepared.uniaxial(300 + 1e-10, 10);
    const nearby = strain.mock.calls.length;
    expect(nearby).toBeGreaterThan(both);
    prepared.uniaxial(-300, 10);
    expect(strain.mock.calls.length).toBeGreaterThan(nearby);
  });
  it('snapshots geometry and starts a fresh cache for another section or reinforcement edit', () => {
    const s = section(), original = structuredClone(s), first = prepareColumnCapacity(s);
    const expected = first.uniaxial(500, 20);
    s.bars![0].y += 0.03; s.bars![0].diameter = 32; s.fc = 40;
    const second = prepareColumnCapacity(s);
    expect(first.uniaxial(600, 20)).toEqual(reference(original, 600, 20, 'z'));
    expect(first.uniaxial(500, 20)).toEqual(expected);
    expect(second.uniaxial(500, 20)).toEqual(reference(s, 500, 20, 'z'));
    expect(second.uniaxial(500, 20)).not.toEqual(expected);
    const modifiedOutput = first.uniaxial(500, 20);
    modifiedOutput.phiMn = -1;
    expect(first.uniaxial(500, 20)).toEqual(expected);
  });
  it('retains simplified fallback and non-finite reference behavior', () => {
    for (const bars of [undefined, [], section().bars!.slice(0, 3), section().bars]) {
      const s = { ...section(), bars }, prepared = prepareColumnCapacity(s);
      for (const n of [0, -500, 900, Infinity, NaN]) {
        expect(prepared.uniaxial(n, 60, 'y')).toEqual(reference(s, n, 60, 'y'));
        expect(prepared.biaxial(n, 20, 60)).toEqual(biaxial(s, n, 20, 60));
      }
    }
  });
});

const provided = { column: { cornerDia: 20, faceDia: 16, nBottom: 1, nTop: 1, nLeft: 1, nRight: 1 },
  stirrups: { diameter: 8, legs: 2, spacing: 0.15 } };
const demands: ElementStationResult = {
  elementId: 1, length: 6, stationTs: [0, 0.5, 1],
  comboResults: [-500, 0, 300, 800, 2000].map((Nu, i) => ({ comboId: i, comboName: `U${i}`,
    stations: [0, 0.5, 1].map(t => ({ t, x: t * 6, n: -Nu, vy: 20, vz: 30,
      my: i % 2 ? 0 : t * 80, mz: i % 2 ? 40 : t * 30, torsion: 0 })) })),
};
const verify = (delta: number) => verifyProvidedReinforcement(1, 'column', provided, undefined, {}, section(), demands,
  undefined, { slenderDeltaNs: delta });
it('preserves complete verification reports, governing tuples and slender minimum moments', () => {
  for (const delta of [1, 1.2, 5]) {
    setColumnCapacityReuse(false);
    const reference = verify(delta);
    setColumnCapacityReuse(true);
    expect(verify(delta)).toEqual(reference);
  }
});
