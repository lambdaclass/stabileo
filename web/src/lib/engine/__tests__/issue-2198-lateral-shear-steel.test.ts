import { expect, it } from 'vitest';
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';
import { REBAR_DB } from '../codes/argentina/cirsoc201';
import { cirsoc201Adapter } from '../design/adapters/cirsoc201-adapter';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { computeShearCapacity, verifyProvidedReinforcement } from '../station-design-forces';

for (const axis of ['My', 'Mz'] as const) for (const entry of ['direct', 'adapter'] as const) {
  it.skip(`known wrong result: #2198 developed lateral corner steel ${axis} ${entry}`, () => {
    const section = { b: 0.4, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 6 };
    const cage = { diameter: 6, legs: 4, secondaryLegs: 3, spacing: 0.175 };
    const bars = { count: 4, diameter: 16 };
    const ctx = syntheticBeamContext();
    ctx.section = { ...ctx.section, ...section };
    ctx.material = { ...ctx.material, ...section, maxAggregateSize: { value: 19, origin: 'project', refs: [] } };
    ctx.axes = { ...ctx.axes, bFlex: section.b, hFlex: section.h, ...(axis === 'Mz' ? {
      flexure: 'Mz', shear: 'Vy', secondaryFlexure: 'My', secondaryShear: 'Vz', sagCategory: 'Mz+', hogCategory: 'Mz-',
    } : {}) };
    const d = section.b / 2 + seatedLongitudinalHalfExtents(section.b, section.h, section.cover, cage.diameter, bars.diameter).corner.halfAcross;
    const area = REBAR_DB.find(bar => bar.diameter === bars.diameter)!.area * 1e-4;
    const rhoW = 2 * area / (section.h * d);
    const cap = computeShearCapacity(cage.diameter, cage.secondaryLegs, cage.spacing, section.h, d, section.fc, section.fy, 0,
      { h: section.b, Ag: section.b * section.h, rhoW });
    expect(cap.avBelowMin).toBe(true);
    const noCorners = computeShearCapacity(cage.diameter, cage.secondaryLegs, cage.spacing, section.h, d, section.fc, section.fy, 0,
      { h: section.b, Ag: section.b * section.h, rhoW: 0 });
    const vu = 60;
    expect(noCorners.phiVnUnrounded).toBeLessThan(vu);
    expect(cap.phiVnUnrounded).toBeGreaterThan(vu);
    for (const motion of [-0.1, 0, 0.1]) {
      ctx.stations = { elementId: 1, length: 6, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'secondary shear',
        stations: [0, 0.5, 1].map(t => ({ t, x: t * 6, n: 0, my: axis === 'My' ? 20 : motion, mz: axis === 'Mz' ? 20 : motion,
          vy: axis === 'My' ? vu : 0, vz: axis === 'Mz' ? vu : 0, torsion: 0 })) }] };
      const result = entry === 'adapter' ? cirsoc201Adapter.verify(ctx, { bottom: bars, top: bars, stirrups: cage })
        : verifyProvidedReinforcement(1, 'beam', { bottom: bars, top: bars, stirrups: cage }, undefined, {}, section, ctx.stations, undefined, { axes: ctx.axes });
      expect(result.overallStatus).toBe('ok');
      const rows = result.checks.filter(c => c.demandCategory === ctx.axes.secondaryShear && c.limiting === 'shear');
      expect(rows.map(row => row.capacity)).toEqual([cap.phiVn, cap.phiVn]);
    }
  });
}
