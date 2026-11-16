import { expect, it } from 'vitest';
import { verifyProvidedReinforcement, computeDirectionalShearCapacity } from '../station-design-forces';
import { stirrupLegs } from '../../design-contract/directional-stirrups';
import { transverseSpacingForDemand } from '../../codes/cirsoc201/transverse-spacing';
import { membersFromLine } from '../design/beam-line';
import type { ProvidedReinforcement, StirrupDef } from '../../design-contract/reinforcement';
import type { DesignAxes } from '../design/design-axes';

const regression = process.env.RUN_KNOWN_WRONG === '2171' ? it : it.skip;
const section = { b: 0.2, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8 };
const bars = { count: 8, diameter: 16 };
const axesFor = (axis: 'My' | 'Mz'): DesignAxes => ({ flexure: axis, shear: axis === 'My' ? 'Vz' : 'Vy',
  secondaryFlexure: axis === 'My' ? 'Mz' : 'My', secondaryShear: axis === 'My' ? 'Vy' : 'Vz',
  bFlex: section.b, hFlex: section.h, biaxial: false, sagCategory: `${axis}+`, hogCategory: `${axis}-`, basis: 'stress-proxy', secondaryRatio: 0 });
const provided = (kind: 'beam' | 'column' | 'wall', cage: StirrupDef): ProvidedReinforcement => kind === 'column'
  ? { longitudinal: bars, stirrups: cage }
  : { regions: { bottomSpan: bars, topStart: bars, topEnd: bars, stirrupsSpan: cage, stirrupsSupport: cage } };
function verify(kind: 'beam' | 'column' | 'wall', cage: StirrupDef, edition: '2005' | '2025', axis: 'My' | 'Mz', direction: 'primary' | 'secondary', shear: number, sec = section, reinforcement = provided(kind, cage)) {
  const axes = axesFor(axis);
  const loadAxis = direction === 'primary' ? axes.shear : axes.secondaryShear;
  return verifyProvidedReinforcement(1, kind, reinforcement, undefined, {}, sec,
    { elementId: 1, length: 4, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map(t => ({
      t, x: t * 4, n: 0, my: 0, mz: 0, vy: loadAxis === 'Vy' ? shear : 0, vz: loadAxis === 'Vz' ? shear : 0, torsion: 0,
    })) }] }, undefined, { axes, spacingRule: { edition, maxAggregateSizeMm: 0 } });
}
for (const edition of ['2005', '2025'] as const) for (const axis of ['My', 'Mz'] as const) {
  for (const kind of ['beam', 'wall'] as const) for (const primary of [2, 6]) for (const secondary of [5, 6]) for (const factor of [0.999, 1.001]) {
    regression(`known wrong result: #2171 provided ${kind} zero-torque secondary strength ${edition} ${axis} ${primary}/${secondary} ${factor}`, () => {
      const cage = { diameter: 8, legs: primary, secondaryLegs: secondary, spacing: 0.05 };
      const cap = computeDirectionalShearCapacity('secondary', cage.diameter, stirrupLegs(cage, 'secondary'), cage.spacing,
        section.h, section.b - section.cover - 0.008 - 0.008, section.fc, section.fy, 0, { h: section.b, Ag: section.b * section.h, edition });
      const result = verify(kind, cage, edition, axis, 'secondary', cap.phiVn * factor);
      const rows = result.checks.filter(c => c.category.startsWith('Shear ') && c.demandCategory === axesFor(axis).secondaryShear);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.capacity).toBe(cap.phiVn);
        expect(row.ratio).toBe(factor);
        expect(row.status === 'fail').toBe(factor > 1);
      }
      expect(result.checkedAxes).toContain(axesFor(axis).secondaryShear);
      expect(result.checks.some(c => c.category.startsWith('Torsion'))).toBe(false);
    });
  }
  for (const kind of ['column', 'beam', 'wall'] as const) for (const direction of ['primary', 'secondary'] as const) for (const legs of [2, 4, 5, 6]) {
    regression(`known wrong result: #2171 provided ${kind} low-demand distribution ${edition} ${axis} ${direction} ${legs}`, () => {
      const sec = direction === 'primary' ? { ...section, b: section.h, h: section.b } : section;
      const cage = { diameter: 8, legs: direction === 'primary' ? legs : 6, secondaryLegs: direction === 'secondary' ? legs : 6, spacing: 0.05 };
      const result = verify(kind, cage, edition, axis, direction, 1, sec);
      const shearAxis = direction === 'primary' ? axesFor(axis).shear : axesFor(axis).secondaryShear;
      const strength = result.checks.filter(c => c.demandCategory === shearAxis && c.limiting === 'shear');
      expect(strength.length).toBeGreaterThan(0);
      for (const row of strength) expect(row.ratio).toBeLessThan(1);
      const distribution = result.checks.filter(c => c.category.includes(`(${shearAxis})`) && c.category.endsWith('s,max across'));
      expect(distribution.length > 0).toBe(legs < 5);
      for (const row of distribution) expect(row.status).toBe('fail');
    });
  }
  for (const offset of [-1e-8, 0, 1e-8]) for (const direction of ['primary', 'secondary'] as const) {
    regression(`known wrong result: #2171 provided column two-leg geometry boundary ${edition} ${axis} ${direction} ${offset}`, () => {
      const depth = section.b - section.cover - 0.008 - 0.008;
      const width = depth + 2 * section.cover + 0.008 + offset;
      const sec = direction === 'primary' ? { ...section, b: width, h: section.b } : { ...section, h: width };
      const result = verify('column', { diameter: 8, legs: 2, secondaryLegs: 2, spacing: 0.05 }, edition, axis, direction, 1, sec);
      const shearAxis = direction === 'primary' ? axesFor(axis).shear : axesFor(axis).secondaryShear;
      expect(result.checks.some(c => c.category === `Ties (${shearAxis}) s,max across`)).toBe(offset > 0);
    });
  }
}

for (const swap of [false, true]) for (const spacing of [0.1, 0.15]) {
  regression(`known wrong result: #2171 line end cages keep their own spacing and diameter ${swap} ${spacing}`, () => {
    const start = { diameter: 6, legs: 6, secondaryLegs: 6, spacing: 0.1 };
    const end = { diameter: 8, legs: 2, secondaryLegs: 6, spacing };
    const ends = swap ? [end, start] : [start, end];
    const members = [{ id: 1, L: 4, tStart: 0.25, tEnd: 0.25, faceStart: 0, faceEnd: 0 }];
    const line = { version: 1 as const, members: [1], lengths: [4], bars: [], stirrups: [
      { id: 'start', from: 0, to: 1, ...ends[0]! }, { id: 'span', from: 1, to: 3, ...start }, { id: 'end', from: 3, to: 4, ...ends[1]! },
    ] };
    const r = membersFromLine(line, members).get(1)!;
    const sec = { ...section, h: 0.3 };
    const result = verify('beam', start, '2025', 'My', 'primary', 1, sec, r);
    const limit = transverseSpacingForDemand('2025', { Vu: 1, bw: sec.b, d: sec.h - sec.cover - end.diameter / 1000 - 0.008, fc: sec.fc, cover: sec.cover, stirrupDiaMm: end.diameter });
    const rows = result.checks.filter(c => c.category.includes('Support') && c.category.endsWith('s,max'));
    expect(rows.some(c => c.provided === spacing * 100 && c.status === 'fail')).toBe(spacing > limit.alongMax);
    const strengths = result.checks.filter(c => c.category.startsWith('Shear Support') && c.limiting === 'shear');
    expect(strengths).toHaveLength(2);
    for (const cage of ends) {
      const cap = computeDirectionalShearCapacity('primary', cage.diameter, stirrupLegs(cage, 'primary'), cage.spacing,
        sec.b, sec.h - sec.cover - cage.diameter / 1000 - 0.008, sec.fc, sec.fy, 0, { h: sec.h, Ag: sec.b * sec.h, edition: '2025' });
      expect(strengths.some(c => c.capacity === cap.phiVn)).toBe(true);
    }
  });
}
