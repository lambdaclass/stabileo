import { expect, it } from 'vitest';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { buildStirrupOptions, createBeamCandidateGenerator, BEAM_LIMITS } from '../design/candidate-enumerate-beam';
import { buildTieOptions, COLUMN_LIMITS } from '../design/candidate-enumerate-column';
import { transverseSpacingForDemand } from '../../codes/cirsoc201/transverse-spacing';

const regression = process.env.RUN_KNOWN_WRONG === '2171' ? it : it.skip;
for (const axis of ['My', 'Mz'] as const) for (const b of [0.2, 0.3, 0.4]) for (const kind of ['beam', 'column'] as const) {
  regression(`known wrong result: #2171 automatic ${kind} cage keeps directional distribution ${axis} ${b}`, () => {
    const ctx = syntheticBeamContext({ codeEdition: '2025', elementType: kind });
    ctx.section = { ...ctx.section, b, h: 0.6 };
    ctx.axes = { ...ctx.axes, flexure: axis, secondaryFlexure: axis === 'My' ? 'Mz' : 'My', shear: axis === 'My' ? 'Vz' : 'Vy', secondaryShear: axis === 'My' ? 'Vy' : 'Vz', bFlex: b, hFlex: 0.6 };
    ctx.stations = { elementId: 1, length: 6, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map(t => ({ t, x: 6 * t, n: 0,
      my: axis === 'My' ? 1 : 0, mz: axis === 'Mz' ? 1 : 0, vy: 1, vz: 1, torsion: 0 })) }] };
    const options = kind === 'beam' ? buildStirrupOptions(ctx, 1) : buildTieOptions(ctx, 16);
    const limit = kind === 'beam' ? BEAM_LIMITS.maxLegs : COLUMN_LIMITS.maxLegs;
    const required = transverseSpacingForDemand('2025', { Vu: 1, bw: 0.6, d: b - ctx.material.cover - 0.008 - 0.008, fc: ctx.material.fc, cover: ctx.material.cover, stirrupDiaMm: 8 });
    if (required.requiredLegs > limit) expect(options).toHaveLength(0);
    else expect(options.length).toBeGreaterThan(0);
    for (const cage of options) {
      const secondary = transverseSpacingForDemand('2025', { Vu: 1, bw: 0.6, d: b - ctx.material.cover - cage.diameter / 1000 - 0.008, fc: ctx.material.fc, cover: ctx.material.cover, stirrupDiaMm: cage.diameter });
      expect(cage.secondaryLegs).toBeGreaterThanOrEqual(secondary.requiredLegs);
      expect(cage.secondaryLegs).toBeLessThanOrEqual(limit);
      expect(cage.spacing).toBeLessThanOrEqual(secondary.alongMax);
    }
    if (kind === 'beam') {
      const first = createBeamCandidateGenerator(ctx).next(null)?.reinforcement;
      for (const cage of [first?.regions?.stirrupsSupport, first?.regions?.stirrupsSpan]) {
        if (options.length) expect(cage?.secondaryLegs).toBeGreaterThanOrEqual(2);
      }
    }
  });
}

it('planar automatic cages retain their existing two-leg default', () => {
  const ctx = syntheticBeamContext({ codeEdition: '2025' });
  const options = buildStirrupOptions(ctx, 1);
  expect(options.length).toBeGreaterThan(0);
  for (const cage of options) expect(cage.secondaryLegs ?? 2).toBe(2);
});
