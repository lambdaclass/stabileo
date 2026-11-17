import { expect, it } from 'vitest';
import { computeDirectionalShearCapacity, layerCentroid, verifyProvidedReinforcement } from '../station-design-forces';
import { stirrupLegs } from '../../design-contract/directional-stirrups';
import { seatedLongitudinalHalfExtents } from '../../codes/cirsoc201/transverse-cage';

function check(kind: 'beam' | 'column', axis: 'My' | 'Mz', nominal: number, diameter: number, factor: number, longDiameter = 16, direction: 'primary' | 'secondary' = 'primary', edition: '2005' | '2025' = '2025') {
  const section = { b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: nominal };
  const cage = { diameter, legs: 2, secondaryLegs: 6, spacing: 0.05 };
  const depth = direction === 'secondary'
    ? section.b / 2 + seatedLongitudinalHalfExtents(section.b, section.h, section.cover, diameter, longDiameter).corner.halfAcross
    : section.h - layerCentroid([{ count: 4, diameter: longDiameter, row: 0 }], section.cover, diameter);
  const cap = computeDirectionalShearCapacity(direction, diameter, stirrupLegs(cage, direction), cage.spacing, direction === 'primary' ? section.b : section.h, depth, section.fc, section.fy, 0,
    { h: direction === 'primary' ? section.h : section.b, Ag: section.b * section.h, edition });
  const bars = { count: kind === 'beam' ? 4 : 12, diameter: longDiameter };
  const provided = kind === 'beam' ? { regions: { bottomSpan: bars, topStart: bars, topEnd: bars, stirrupsSupport: cage, stirrupsSpan: cage } } : { longitudinal: bars, stirrups: cage };
  const primary = axis === 'My' ? 'Vz' : 'Vy';
  const loadAxis = direction === 'primary' ? primary : axis === 'My' ? 'Vy' : 'Vz';
  const result = verifyProvidedReinforcement(1, kind, provided, undefined, {}, section,
    { elementId: 1, length: 4, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map(t => ({
      t, x: t * 4, n: 0, my: 0, mz: 0, vy: loadAxis === 'Vy' ? cap.phiVn * factor : 0, vz: loadAxis === 'Vz' ? cap.phiVn * factor : 0, torsion: 0,
    })) }] }, undefined, { axes: { flexure: axis, shear: primary, secondaryFlexure: axis === 'My' ? 'Mz' : 'My', secondaryShear: axis === 'My' ? 'Vy' : 'Vz',
      bFlex: section.b, hFlex: section.h, biaxial: false, sagCategory: `${axis}+`, hogCategory: `${axis}-`, basis: 'stress-proxy', secondaryRatio: 0 }, spacingRule: { edition, maxAggregateSizeMm: 0 } });
  const rows = result.checks.filter(c => c.demandCategory === loadAxis && c.limiting === 'shear');
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.capacity).toBe(cap.phiVn);
    expect(row.ratio).toBe(factor);
    expect(row.status === 'fail').toBe(factor > 1);
  }
}
for (const kind of ['beam', 'column'] as const) for (const axis of ['My', 'Mz'] as const) for (const [nominal, diameter] of [[6, 6], [8, 6], [8, 8]]) for (const factor of [0.999, 1.001]) {
  it(`known wrong result: #2171 changing the cage does not move declared longitudinal bars ${kind} ${axis} ${nominal}/${diameter} ${factor}`, () => check(kind, axis, nominal!, diameter!, factor, 16, 'primary', '2025'));
  it(`known wrong result: #2171 changing the cage does not move declared longitudinal bars 2005 ${kind} ${axis} ${nominal}/${diameter} ${factor}`, () => check(kind, axis, nominal!, diameter!, factor, 16, 'primary', '2005'));
}
it('a cage matching the declared longitudinal geometry retains its answer', () => check('beam', 'My', 8, 8, 0.5));

for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) for (const longDiameter of [16, 20]) for (const factor of [0.999, 1.001]) {
  it(`known wrong result: #2171 secondary beam shear uses declared longitudinal geometry ${edition} ${axis} ${longDiameter} ${factor}`, () => check('beam', axis, 8, 6, factor, longDiameter, 'secondary', edition));
}
