import { expect, it } from 'vitest';
import { REBAR_DB } from '../codes/argentina/cirsoc201';
import { verifyProvidedReinforcement } from '../station-design-forces';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { cirsoc201Adapter2005, cirsoc201Adapter2025 } from '../design/adapters/cirsoc201-adapter';
import { buildStirrupOptions } from '../design/candidate-enumerate-beam';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2198' ? it : it.skip;
const section = { b: 0.4, h: 0.4, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const bars = { count: 4, diameter: 16 };
const capacity = (diameter: number, legs: number, spacing: number, depth: number, edition: '2005' | '2025') => {
  const area = REBAR_DB.find(r => r.diameter === diameter)!.area * 1e-4;
  return +(0.75 * ((edition === '2005' ? 1 / 6 : 0.17) * Math.sqrt(section.fc) * section.b * depth * 1000
    + Math.min(legs * area * section.fy * 1000 * depth / spacing,
      (edition === '2005' ? 2 / 3 : 0.66) * Math.sqrt(section.fc) * section.b * depth * 1000))).toFixed(2);
};

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const)
  for (const kind of ['beam', 'wall'] as const) for (const entry of ['direct', 'adapter'] as const)
    for (const layout of ['global', 'shared', 'ends'] as const) for (const diameter of [6, 8, 12])
      for (const factor of [0.999, 1, 1.001]) for (const shift of [0, 0.01]) {
        knownWrong(`known wrong result: #2198 primary uses actual cage ${edition} ${axis} ${kind} ${entry} ${layout} ${diameter} ${factor} ${shift}`, () => {
          const ctx = syntheticBeamContext({ elementType: kind, codeEdition: edition });
          ctx.section = { ...ctx.section, ...section };
          ctx.material = { ...ctx.material, ...section, maxAggregateSize: { value: 0, source: 'explicit' } };
          ctx.axes = { ...ctx.axes, bFlex: section.b, hFlex: section.h, ...(axis === 'Mz' ? {
            flexure: 'Mz', shear: 'Vy', secondaryFlexure: 'My', secondaryShear: 'Vz', sagCategory: 'Mz+', hogCategory: 'Mz-',
          } : {}) };
          ctx.finalGeometry = { bottomRaise: shift / 2, depthTolerance: shift / 2 };
          const cage = (dia: number) => ({ diameter: dia, legs: 4, secondaryLegs: 4, spacing: 0.1 });
          const diameters = layout === 'ends' ? [diameter, 8, 12] : [diameter, diameter];
          const expected = diameters.map(dia => capacity(dia, 4, 0.1,
            section.h - section.cover - dia / 1000 - bars.diameter / 2000 - shift, edition));
          const vu = Math.min(...expected) * factor;
          ctx.stations = { elementId: 1, length: 6, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1',
            stations: [0, 0.5, 1].map(t => ({ t, x: 6 * t, n: 0, my: 0, mz: 0, vy: axis === 'Mz' ? vu : 0, vz: axis === 'My' ? vu : 0, torsion: 0 })),
          }] };
          const rebar = { bottom: bars, top: bars, ...(layout === 'global' ? { stirrups: cage(diameter) } : { regions: {
            stirrupsSupport: cage(diameter), stirrupsSpan: cage(layout === 'ends' ? 8 : diameter),
            ...(layout === 'ends' ? { stirrupsStart: cage(diameter), stirrupsEnd: cage(12) } : {}),
          } }) };
          const result = entry === 'adapter' ? (edition === '2005' ? cirsoc201Adapter2005 : cirsoc201Adapter2025).verify(ctx, rebar)
            : verifyProvidedReinforcement(1, kind, rebar, undefined, {}, section, ctx.stations, undefined,
              { axes: ctx.axes, finalGeometry: ctx.finalGeometry, spacingRule: { edition, maxAggregateSizeMm: 0 } });
          const rows = result.checks.filter(c => c.demandCategory === ctx.axes.shear && c.limiting === 'shear');
          const labels = layout === 'ends' ? ['Support Start', 'Span', 'Support End'] : ['Support', 'Span'];
          expect(rows).toHaveLength(labels.length);
          for (const [i, label] of labels.entries()) {
            const row = rows.find(c => c.category.includes(label))!;
            expect(row.capacity).toBe(expected[i]);
            expect(row.ratio).toBe(+(vu / expected[i]!).toFixed(3));
            expect(row.status === 'fail').toBe(vu > expected[i]!);
          }
        });
      }

for (const edition of ['2005', '2025'] as const) {
  knownWrong(`known wrong result: #2198 generated cage may differ from nominal diameter ${edition}`, () => {
    const ctx = syntheticBeamContext({ codeEdition: edition });
    ctx.section = { ...ctx.section, ...section };
    ctx.axes = { ...ctx.axes, bFlex: section.b, hFlex: section.h };
    ctx.material = { ...ctx.material, ...section, stirrupDiametersMm: [12], maxAggregateSize: { value: 0, source: 'explicit' } };
    const cage = buildStirrupOptions(ctx, 1)[0]!;
    expect(cage.diameter).toBe(12);
    expect(cage.diameter).not.toBe(ctx.material.stirrupDia);
    const expected = capacity(cage.diameter, cage.legs, cage.spacing,
      section.h - section.cover - cage.diameter / 1000 - bars.diameter / 2000, edition);
    ctx.stations = { elementId: 1, length: 6, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1',
      stations: [0, 0.5, 1].map(t => ({ t, x: 6 * t, n: 0, my: 0, mz: 0, vy: 0, vz: expected * 1.001, torsion: 0 })),
    }] };
    const result = (edition === '2005' ? cirsoc201Adapter2005 : cirsoc201Adapter2025).verify(ctx, { bottom: bars, top: bars, stirrups: cage });
    const rows = result.checks.filter(c => c.demandCategory === ctx.axes.shear && c.limiting === 'shear');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.capacity).toBe(expected);
      expect(row.status).toBe('fail');
    }
  });
}
