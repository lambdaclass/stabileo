import { expect, it } from 'vitest';
import { computeDirectionalShearCapacity, layerCentroid, verifyProvidedReinforcement } from '../station-design-forces';
import { stirrupLegs } from '../../design-contract/directional-stirrups';

const regression = process.env.RUN_KNOWN_WRONG === '2171' ? it : it.skip;
function check(kind: 'beam' | 'column', axis: 'My' | 'Mz', nominal: number, diameter: number, factor: number) {
  const section = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: nominal };
  const cage = { diameter, legs: 2, secondaryLegs: 6, spacing: 0.05 };
  const depth = section.h - layerCentroid([{ count: 4, diameter: 16, row: 0 }], section.cover, nominal);
  const cap = computeDirectionalShearCapacity('primary', diameter, stirrupLegs(cage, 'primary'), cage.spacing, section.b, depth, section.fc, section.fy, 0,
    { h: section.h, Ag: section.b * section.h, edition: '2025' });
  const bars = { count: kind === 'beam' ? 4 : 12, diameter: 16 };
  const provided = kind === 'beam' ? { regions: { bottomSpan: bars, topStart: bars, topEnd: bars, stirrupsSupport: cage, stirrupsSpan: cage } } : { longitudinal: bars, stirrups: cage };
  const primary = axis === 'My' ? 'Vz' : 'Vy';
  const result = verifyProvidedReinforcement(1, kind, provided, undefined, {}, section,
    { elementId: 1, length: 4, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map(t => ({
      t, x: t * 4, n: 0, my: 0, mz: 0, vy: primary === 'Vy' ? cap.phiVn * factor : 0, vz: primary === 'Vz' ? cap.phiVn * factor : 0, torsion: 0,
    })) }] }, undefined, { axes: { flexure: axis, shear: primary, secondaryFlexure: axis === 'My' ? 'Mz' : 'My', secondaryShear: axis === 'My' ? 'Vy' : 'Vz',
      bFlex: section.b, hFlex: section.h, biaxial: false, sagCategory: `${axis}+`, hogCategory: `${axis}-`, basis: 'stress-proxy', secondaryRatio: 0 }, spacingRule: { edition: '2025', maxAggregateSizeMm: 0 } });
  const rows = result.checks.filter(c => c.demandCategory === primary && c.limiting === 'shear');
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.capacity).toBe(cap.phiVn);
    expect(row.ratio).toBe(factor);
    expect(row.status === 'fail').toBe(factor > 1);
  }
}
for (const kind of ['beam', 'column'] as const) for (const axis of ['My', 'Mz'] as const) for (const [nominal, diameter] of [[6, 6], [8, 6], [8, 8]]) for (const factor of [0.999, 1.001]) {
  regression(`known wrong result: #2171 changing the cage does not move declared longitudinal bars ${kind} ${axis} ${nominal}/${diameter} ${factor}`, () => check(kind, axis, nominal!, diameter!, factor));
}
it('a cage matching the declared longitudinal geometry retains its answer', () => check('beam', 'My', 8, 8, 0.5));
