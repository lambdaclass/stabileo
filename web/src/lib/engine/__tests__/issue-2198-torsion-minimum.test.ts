import { afterEach, expect, it } from 'vitest';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import { verifyProvidedReinforcement } from '../station-design-forces';
import { declaredTestDemands } from './helpers/declared-demands';
import { solve, solvePDelta, solve3D, solvePDelta3D } from '../wasm-solver';
import { computeStationDemands, setCompactStationTransfer } from '../verification-service';

const section = { b: 0.3, h: 0.9, fc: 25, fy: 420, cover: 0.025, stirrupDia: 6 };
const minimum = (width: number) => Math.max(0.062 * Math.sqrt(section.fc), 0.35) * width / section.fy;
const threshold = (0.083 * Math.sqrt(section.fc) * 1000 * (section.b * section.h) ** 2 / (2 * (section.b + section.h))) * 0.75;
const area = Math.PI * (section.stirrupDia / 1000) ** 2 / 4;
const spacingLimit = 2 * area / minimum(section.h);
const demand = (torque: number, secondary: number, axis: 'My' | 'Mz') => declaredTestDemands([{ comboId: 1, comboName: 'minimum', forces: {
  t: 0, x: 0, n: 0, my: 0, mz: 0, vy: axis === 'My' ? secondary : 0, vz: axis === 'Mz' ? secondary : 0, torsion: torque,
} }])[0]!.section(axis);
const axes = (axis: 'My' | 'Mz') => ({ flexure: axis, secondaryFlexure: axis === 'My' ? 'Mz' as const : 'My' as const,
  shear: axis === 'My' ? 'Vz' as const : 'Vy' as const, secondaryShear: axis === 'My' ? 'Vy' as const : 'Vz' as const,
  bFlex: section.b, hFlex: section.h, biaxial: false, sagCategory: axis === 'My' ? 'My+' as const : 'Mz+' as const,
  hogCategory: axis === 'My' ? 'My-' as const : 'Mz-' as const, basis: 'stress-proxy' as const, secondaryRatio: 0 });
function provided(torque: number, secondary: number, axis: 'My' | 'Mz', factor: number, edition: '2005' | '2025', stations?: Parameters<typeof verifyProvidedReinforcement>[6]) {
  const cage = { diameter: section.stirrupDia, legs: 2, secondaryLegs: 2, spacing: spacingLimit * factor };
  const bars = { count: 4, diameter: 20 };
  return verifyProvidedReinforcement(1, 'beam', { regions: { bottomSpan: bars, topStart: bars, topEnd: bars,
    stirrupsSupport: cage, stirrupsSpan: cage } }, undefined, {}, section,
  stations ?? { elementId: 1, length: 6, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'minimum',
    stations: [0, 0.5, 1].map(t => ({ ...demand(torque, secondary, axis).source.forces, t, x: t * 6 })) }] },
  undefined, { spacingRule: { edition, maxAggregateSizeMm: 0 }, axes: axes(axis) });
}

for (const axis of ['My', 'Mz'] as const) for (const secondary of [0, 1]) for (const factor of [0.999, 1, 1.001]) {
  it(`known wrong result: #2198 active torsion secondary minimum ${axis} ${secondary} ${factor}`, () => {
    const r = checkTorsion2025({ ...section, d: section.h - 0.039, dSecondary: section.b - 0.039,
      stirrupDiaMm: section.stirrupDia, fyt: section.fy, demand: demand(threshold * 1.01, secondary, axis),
      stirrup: { diameter: section.stirrupDia, legs: 2, spacing: spacingLimit * factor } });
    expect(r.neglect).toBe(false);
    expect(2 * r.AtOverS).toBeLessThan(minimum(section.b));
    expect(r.transversePrimaryRequired).toBe(minimum(section.b));
    expect(r.transverseSecondaryRequired).toBe(minimum(section.h));
    expect(r.transverseRequired).toBe(minimum(section.h));
    expect(r.ratio).toBeCloseTo(factor, 12);
    expect(r.ratio > 1).toBe(factor > 1);
    for (const edition of ['2005', '2025'] as const) {
      const result = provided(threshold * 1.01, secondary, axis, factor, edition);
      const rows = result.checks.filter(c => c.category.startsWith('Torsion ') && !c.category.startsWith('Torsion Al'));
      expect(rows).toHaveLength(2);
      if (secondary === 0) expect(result.overallStatus === 'fail').toBe(factor > 1);
      for (const row of rows) {
        expect(row.ratio).toBeCloseTo(factor, 12);
        expect(row.status === 'fail').toBe(factor > 1);
      }
    }
  });
}
for (const ratio of [0.999, 1, 1.001]) it(`known wrong result: #2198 torsion minimum activation ${ratio}`, () => {
  const r = checkTorsion2025({ ...section, d: 0.861, dSecondary: 0.261, stirrupDiaMm: 6, fyt: section.fy,
    demand: demand(threshold * ratio, 0, 'My'), stirrup: { diameter: 6, legs: 2, spacing: spacingLimit * 1.1 } });
  expect(r.neglect).toBe(ratio < 1);
  expect(r.ratio).toBeCloseTo(ratio < 1 ? 0 : 1.1, 12);
  const result = provided(threshold * ratio, 0, 'My', 1.1, '2025');
  expect(result.checks.some(c => c.category.startsWith('Torsion '))).toBe(ratio >= 1);
});
for (const width of [0.2, 0.3, 0.9]) it(`known wrong result: #2198 each torsion minimum uses its own width ${width}`, () => {
  const r = checkTorsion2025({ ...section, h: width, d: width - 0.039, dSecondary: 0.261, stirrupDiaMm: 6, fyt: section.fy,
    demand: demand(0, 0, 'My') });
  expect(r.transversePrimaryRequired).toBe(minimum(section.b));
  expect(r.transverseSecondaryRequired).toBe(minimum(width));
  expect(r.ratio).toBe(0);
});

afterEach(() => setCompactStationTransfer(true));
for (const nonlinear of [false, true]) for (const compact of [false, true]) {
  it(`known wrong result: #2198 solved torsion minimum ${nonlinear} ${compact}`, () => {
    const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }]]);
    const elements = new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1,
      releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]);
    const sections = new Map([[1, { id: 1, name: 'RC', ...section, a: section.b * section.h,
      iy: section.b * section.h ** 3 / 12, iz: section.h * section.b ** 3 / 12, j: 0.001 }]]);
    const materials = new Map([[1, { id: 1, name: 'H25', fc: 25, fy: 420, e: 25000, nu: 0.2 }]]);
    const model = { nodes, elements, sections, materials, supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]) };
    const solver = { ...model, supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
      loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: 1, fz: 0, mx: threshold * 1.01, my: 0, mz: 0 } }] };
    const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
    setCompactStationTransfer(compact);
    const stations = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], model).stations.get(1)!;
    expect(stations.comboResults[0]!.stations.some(s => Math.abs(s.torsion) > threshold)).toBe(true);
    for (const factor of [0.999, 1.001]) {
      const result = provided(threshold * 1.01, 1, 'My', factor, '2025', stations);
      const rows = result.checks.filter(c => c.category.startsWith('Torsion ') && !c.category.startsWith('Torsion Al'));
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.ratio).toBeCloseTo(factor, 12);
        expect(row.status === 'fail').toBe(factor > 1);
      }
    }
    const planar = { nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 6, z: 0 }]]),
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, hingeStart: false, hingeEnd: false }]]),
      sections, materials, supports: model.supports, loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fz: 1, my: 0 } }] };
    const plane = nonlinear ? solvePDelta(planar).results : solve(planar);
    expect(plane.elementForces).toHaveLength(1);
    const f = plane.elementForces[0]!;
    const planarStations = { elementId: 1, length: f.length, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: '2D', stations: [0, 1].map(t => ({
      t, x: t * f.length, n: t ? f.nEnd : f.nStart, my: t ? f.mEnd : f.mStart, mz: 0, vy: 0, vz: t ? f.vEnd : f.vStart, torsion: 0,
    })) }] };
    const control = provided(0, 0, 'My', 1.001, '2025', planarStations);
    expect(control.checks.some(c => c.category.startsWith('Torsion'))).toBe(false);
    expect(control.checks.filter(c => c.status === 'fail')).toEqual([]);
    expect(control.overallStatus).not.toBe('fail');
  });
}
