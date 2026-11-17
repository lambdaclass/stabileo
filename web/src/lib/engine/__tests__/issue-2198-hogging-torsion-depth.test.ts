import { expect, it } from 'vitest';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import { verifyProvidedReinforcement, layerCentroid } from '../station-design-forces';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { cirsoc201Adapter } from '../design/adapters/cirsoc201-adapter';
import { declaredTestDemands } from './helpers/declared-demands';
import { solve3D, solvePDelta3D } from '../wasm-solver';
import { computeStationDemands } from '../verification-service';

for (const axis of ['My', 'Mz'] as const) for (const entry of ['direct', 'adapter'] as const) {
  it(`known wrong result: #2198 shear and torsion share the active face depth ${axis} ${entry}`, () => {
    const section = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 12 };
    const cage = { diameter: 8, legs: 4, secondaryLegs: 4, spacing: 0.15 };
    const top = [{ count: 2, diameter: 16, row: 0 }, { count: 2, diameter: 16, row: 1 }];
    const bottom = [{ count: 4, diameter: 16, row: 0 }];
    const rebar = { stirrups: cage, regions: { bottomSpanLayers: bottom, topStartLayers: top, topEndLayers: top } };
    const ctx = syntheticBeamContext();
    ctx.section = { ...ctx.section, ...section };
    ctx.material = { ...ctx.material, ...section, maxAggregateSize: { value: 0, origin: 'project', refs: [] } };
    ctx.axes = { ...ctx.axes, bFlex: section.b, hFlex: section.h, ...(axis === 'Mz' ? {
      flexure: 'Mz', shear: 'Vy', secondaryFlexure: 'My', secondaryShear: 'Vz', sagCategory: 'Mz+', hogCategory: 'Mz-',
    } : {}) };
    const torsion = 6;
    const dSecondary = section.b - section.cover - cage.diameter / 1000 - 0.008;
    for (const m of [-60, 60]) {
      const depth = section.h - layerCentroid(m < 0 ? top : bottom, section.cover, cage.diameter);
      const forcesAt = (t: number, v: number) => ({
        t, x: t * 6, n: 0, my: axis === 'My' ? m : 0, mz: axis === 'Mz' ? m : 0,
        vy: axis === 'Mz' ? v : 0, vz: axis === 'My' ? v : 0, torsion,
      });
      const check = (v: number) => checkTorsion2025({ ...section, d: depth, dSecondary, stirrupDiaMm: cage.diameter,
        fyt: section.fy, demand: declaredTestDemands([{ comboId: 1, comboName: 'torsion', forces: forcesAt(0, v) }])[0]!.section(axis),
        stirrup: cage,
      });
      const trial = check(0);
      expect(trial.neglect).toBe(false);
      const vc = 0.17 * Math.sqrt(section.fc) * section.b * depth * 1000;
      const limit = 0.75 * (vc + (trial.transverseProvided - 2 * trial.AtOverS) * section.fy * 1000 * depth);
      for (const factor of [0.999, 1.001]) {
        const v = limit * factor;
        const expected = check(v);
        expect(expected.ratio > 1).toBe(factor > 1);
        ctx.stations = { elementId: 1, length: 6, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'torsion',
          stations: [forcesAt(0, v), forcesAt(1, v)] }] };
        const result = entry === 'adapter' ? cirsoc201Adapter.verify(ctx, rebar)
          : verifyProvidedReinforcement(1, 'beam', rebar, undefined, {}, section, ctx.stations, undefined, { axes: ctx.axes });
        const interaction = result.checks.find(c => c.category === `Torsion Support (${ctx.axes.shear})`)!;
        expect(interaction.ratio).toBe(+expected.ratio.toFixed(3));
        expect(interaction.status === 'fail').toBe(factor > 1);
        const longitudinal = result.checks.find(c => c.category === `Torsion Al Support (${ctx.axes.shear})`)!;
        const asFlex = Math.abs(m) / (0.9 * section.fy * 1000 * 0.9 * depth);
        expect(longitudinal.required).toBe(+((asFlex + Math.max(expected.Al, expected.AlMin) / 2) * 1e4).toFixed(2));
      }
    }
  });
}


for (const nonlinear of [false, true]) {
  it(`known wrong result: #2198 solved hogging torsion depth nonlinear=${nonlinear}`, () => {
    const section = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 12 };
    const cage = { diameter: 8, legs: 4, secondaryLegs: 4, spacing: 0.15 };
    const top = [{ count: 2, diameter: 16, row: 0 }, { count: 2, diameter: 16, row: 1 }];
    const bottom = [{ count: 4, diameter: 16, row: 0 }];
    const model = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }]]),
      elements: new Map([[1, { id: 1, type: 'frame' as const, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1,
        releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }]]),
      sections: new Map([[1, { id: 1, name: 'RC', ...section, a: section.b * section.h, iy: section.b * section.h ** 3 / 12,
        iz: section.h * section.b ** 3 / 12, j: 0.001 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: section.fc, fy: section.fy, e: 25000, nu: 0.2 }]]),
      supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    };
    const ctx = syntheticBeamContext({ codeEdition: '2025', modelData: undefined });
    ctx.axes = { ...ctx.axes, bFlex: section.b, hFlex: section.h };
    ctx.material = { ...ctx.material, ...section, maxAggregateSize: { value: 0, origin: 'project', refs: [] } };
    ctx.section = { ...ctx.section, ...section };
    const rebar = { stirrups: cage, regions: { bottomSpanLayers: bottom, topStartLayers: top, topEndLayers: top } };
    for (const my of [-60, 60]) {
      const solver = { ...model, loads: [{ type: 'nodal' as const, data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 6, my, mz: 0 } }] };
      const raw = nonlinear ? solvePDelta3D(solver).results : solve3D(solver);
      ctx.stations = computeStationDemands(new Map([[1, raw]]), [{ id: 1, name: 'C1', factors: [] }], {
        ...model, supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
      }).stations.get(1)!;
      const f = ctx.stations.comboResults[0]!.stations[0]!;
      expect(Math.abs(f.my)).toBeCloseTo(Math.abs(my), 6);
      expect(Math.abs(f.torsion)).toBeCloseTo(6, 6);
      const d = section.h - layerCentroid(f.my < 0 ? top : bottom, section.cover, cage.diameter);
      const torsion = checkTorsion2025({ ...section, d, dSecondary: section.b - section.cover - cage.diameter / 1000 - 0.008,
        stirrupDiaMm: cage.diameter, fyt: section.fy, stirrup: cage,
        demand: declaredTestDemands([{ comboId: 1, comboName: 'C1', forces: f }])[0]!.section('My'),
      });
      expect(torsion.neglect).toBe(false);
      const asFlex = Math.abs(f.my) / (0.9 * section.fy * 1000 * 0.9 * d);
      const result = cirsoc201Adapter.verify(ctx, rebar);
      const longitudinal = result.checks.find(c => c.category === 'Torsion Al Support (Vz)')!;
      expect(longitudinal.required).toBe(+((asFlex + Math.max(torsion.Al, torsion.AlMin) / 2) * 1e4).toFixed(2));
    }
  });
}
