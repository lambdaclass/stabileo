import { expect, it } from 'vitest';
import { checkTorsion2025 } from '../../codes/cirsoc201/torsion';
import { verifyProvidedReinforcement, layerCentroid } from '../station-design-forces';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { cirsoc201Adapter } from '../design/adapters/cirsoc201-adapter';
import { declaredTestDemands } from './helpers/declared-demands';

for (const axis of ['My', 'Mz'] as const) for (const entry of ['direct', 'adapter'] as const) {
  it.skip(`known wrong result: #2198 shear and torsion share the active face depth ${axis} ${entry}`, () => {
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
