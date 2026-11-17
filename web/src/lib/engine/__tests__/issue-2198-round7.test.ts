import { expect, it } from 'vitest';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { buildStirrupOptions } from '../design/candidate-enumerate-beam';
import { buildTieOptions, maxTieSpacing } from '../design/candidate-enumerate-column';
import { computeDirectionalShearCapacity } from '../station-design-forces';
import { stirrupLegs } from '../../design-contract/directional-stirrups';
import { DESIGN_TARGET_UTILIZATION } from '../design/outcome';
import { SPACING_GRID } from '../design/objective';
import { transverseSpacingForDemand } from '../../codes/cirsoc201/transverse-spacing';


for (const kind of ['beam', 'column'] as const) for (const axis of ['My', 'Mz'] as const) for (const direction of ['primary', 'secondary'] as const) for (const h of [1.121, 1.125, 1.138, 1.139, 1.140]) {
  it(`known wrong result: #2198 candidate diameter spacing boundary ${kind} ${axis} ${direction} ${h}`, () => {
    const ctx = syntheticBeamContext({ elementType: kind, codeEdition: '2025' });
    const [bFlex, hFlex] = direction === 'secondary' ? [0.4, h] : [h, 0.4];
    ctx.section = { ...ctx.section, b: bFlex, h: hFlex };
    ctx.axes = { ...ctx.axes, bFlex, hFlex, ...(axis === 'Mz' ? { flexure: 'Mz', shear: 'Vy', secondaryFlexure: 'My', secondaryShear: 'Vz', sagCategory: 'Mz+', hogCategory: 'Mz-' } : {}) };
    ctx.material = { ...ctx.material, fc: 25, cover: 0.025, stirrupDia: 12, stirrupDiametersMm: [6] };
    const shearAxis = direction === 'secondary' ? ctx.axes.secondaryShear : ctx.axes.shear;
    ctx.stations = { elementId: 1, length: 6, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map(t => ({ t, x: t * 6, n: kind === 'column' ? -1000 : 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0, [shearAxis === 'Vy' ? 'vy' : 'vz']: 1 })) }] };
    const limits = transverseSpacingForDemand('2025', { Vu: 1, bw: h, d: 0.361, fc: 25, cover: 0.025, stirrupDiaMm: 6 });
    expect(limits.requiredLegs).toBe(h > 1.139 ? 5 : 4);
    const options = kind === 'beam' ? buildStirrupOptions(ctx, direction === 'primary' ? 1 : 0) : buildTieOptions(ctx, 16);
    if (kind === 'column') {
      const limit = maxTieSpacing(16, 6, bFlex, hFlex, '2025');
      const top = Math.floor((limit * DESIGN_TARGET_UTILIZATION + 1e-9) / SPACING_GRID) * SPACING_GRID;
      const capacity = computeDirectionalShearCapacity(direction, 6, stirrupLegs({ legs: 2, secondaryLegs: 2 }, direction), top, h, 0.361, 25, 420, 1000, { edition: '2025', Ag: bFlex * hFlex });
      expect(1).toBeLessThan(0.5 * capacity.phiVcUnrounded);
      const baseline = buildTieOptions({ ...ctx, stations: undefined }, 16);
      expect(options.filter(c => c.legs === 2 && c.secondaryLegs === 2)).toEqual(baseline.filter(c => c.legs === 2 && c.secondaryLegs === 2));
      expect(options.length).toBeGreaterThan(0);
      expect(options.some(c => c.legs === 2 && c.secondaryLegs === 2)).toBe(true);
      expect(Math.max(...options.map(c => c.spacing))).toBe(top);
      for (const cage of options) expect(cage.spacing).toBeLessThanOrEqual(limit);
    } else if (h > 1.139) expect(options).toHaveLength(0);
    else {
      expect(options.length).toBeGreaterThan(0);
      expect(options.every(c => c.diameter === 6)).toBe(true);
      expect(options.some(c => (direction === 'primary' ? c.legs : c.secondaryLegs) === 4)).toBe(true);
      for (const c of options) expect(c.spacing).toBeLessThanOrEqual(limits.alongMax);
    }
  });
}
