import { expect, it } from 'vitest';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { buildStirrupOptions } from '../design/candidate-enumerate-beam';
import { buildTieOptions } from '../design/candidate-enumerate-column';
import { transverseSpacingForDemand } from '../../codes/cirsoc201/transverse-spacing';


for (const kind of ['beam', 'column'] as const) for (const axis of ['My', 'Mz'] as const) for (const direction of ['primary', 'secondary'] as const) for (const h of [1.121, 1.125, 1.138, 1.139, 1.140]) {
  it(`known wrong result: #2198 candidate diameter spacing boundary ${kind} ${axis} ${direction} ${h}`, () => {
    const ctx = syntheticBeamContext({ elementType: kind, codeEdition: '2025' });
    const [bFlex, hFlex] = direction === 'secondary' ? [0.4, h] : [h, 0.4];
    ctx.section = { ...ctx.section, b: bFlex, h: hFlex };
    ctx.axes = { ...ctx.axes, bFlex, hFlex, ...(axis === 'Mz' ? { flexure: 'Mz', shear: 'Vy', secondaryFlexure: 'My', secondaryShear: 'Vz', sagCategory: 'Mz+', hogCategory: 'Mz-' } : {}) };
    ctx.material = { ...ctx.material, fc: 25, cover: 0.025, stirrupDia: 12, stirrupDiametersMm: [6] };
    const shearAxis = direction === 'secondary' ? ctx.axes.secondaryShear : ctx.axes.shear;
    ctx.stations = { elementId: 1, length: 6, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map(t => ({ t, x: t * 6, n: 0, my: 0, mz: 0, vy: 0, vz: 0, torsion: 0, [shearAxis === 'Vy' ? 'vy' : 'vz']: 1 })) }] };
    const limits = transverseSpacingForDemand('2025', { Vu: 1, bw: h, d: 0.361, fc: 25, cover: 0.025, stirrupDiaMm: 6 });
    expect(limits.requiredLegs).toBe(h > 1.139 ? 5 : 4);
    const options = kind === 'beam' ? buildStirrupOptions(ctx, direction === 'primary' ? 1 : 0) : buildTieOptions(ctx, 16);
    if (h > 1.139) expect(options).toHaveLength(0);
    else {
      expect(options.length).toBeGreaterThan(0);
      expect(options.every(c => c.diameter === 6)).toBe(true);
      expect(options.some(c => (direction === 'primary' ? c.legs : c.secondaryLegs) === 4)).toBe(true);
      for (const c of options) expect(c.spacing).toBeLessThanOrEqual(limits.alongMax);
    }
  });
}
