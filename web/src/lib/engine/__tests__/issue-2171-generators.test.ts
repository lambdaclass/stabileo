import { expect, it } from 'vitest';
import { syntheticBeamContext } from '../design/__tests__/helpers';
import { buildStirrupOptions, createBeamCandidateGenerator, BEAM_LIMITS } from '../design/candidate-enumerate-beam';
import { buildTieOptions, COLUMN_LIMITS } from '../design/candidate-enumerate-column';
import { verifyProvidedReinforcement } from '../station-design-forces';
import { transverseSpacingForDemand } from '../../codes/cirsoc201/transverse-spacing';

for (const axis of ['My', 'Mz'] as const) for (const b of [0.2, 0.3, 0.4]) for (const kind of ['beam', 'column'] as const) {
  it(`known wrong result: #2171 automatic ${kind} cage keeps directional distribution ${axis} ${b}`, () => {
    const ctx = syntheticBeamContext({ codeEdition: '2025', elementType: kind });
    ctx.section = { ...ctx.section, b, h: 0.6 };
    if (kind === 'column') ctx.material = { ...ctx.material, stirrupDiametersMm: [12] };
    ctx.axes = { ...ctx.axes, flexure: axis, secondaryFlexure: axis === 'My' ? 'Mz' : 'My', shear: axis === 'My' ? 'Vz' : 'Vy', secondaryShear: axis === 'My' ? 'Vy' : 'Vz', bFlex: b, hFlex: 0.6 };
    ctx.stations = { elementId: 1, length: 6, stationTs: [0, 0.5, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 0.5, 1].map(t => ({ t, x: 6 * t, n: 0,
      my: axis === 'My' ? 1 : 0, mz: axis === 'Mz' ? 1 : 0, vy: 1, vz: 1, torsion: 0 })) }] };
    const options = kind === 'beam' ? buildStirrupOptions(ctx, 1) : buildTieOptions(ctx, 16);
    const limit = kind === 'beam' ? BEAM_LIMITS.maxLegs : COLUMN_LIMITS.maxLegs;
    const required = transverseSpacingForDemand('2025', { Vu: 1, bw: 0.6, d: b - ctx.material.cover - 0.008 - 0.008, fc: ctx.material.fc, cover: ctx.material.cover, stirrupDiaMm: 8 });
    if (kind === 'column') {
      const unloaded = { ...ctx, stations: undefined };
      const ordinary = (cage: { legs: number; secondaryLegs?: number }) => cage.legs === 2 && (cage.secondaryLegs ?? 2) === 2;
      expect(options.filter(ordinary)).toEqual(buildTieOptions(unloaded, 16).filter(ordinary));
      expect(options.length).toBeGreaterThan(0);
    } else {
      if (required.requiredLegs > limit) expect(options).toHaveLength(0);
      else expect(options.length).toBeGreaterThan(0);
      for (const cage of options) {
        const secondary = transverseSpacingForDemand('2025', { Vu: 1, bw: 0.6, d: b - ctx.material.cover - cage.diameter / 1000 - 0.008, fc: ctx.material.fc, cover: ctx.material.cover, stirrupDiaMm: cage.diameter });
        expect(cage.secondaryLegs).toBeGreaterThanOrEqual(secondary.requiredLegs);
        expect(cage.secondaryLegs).toBeLessThanOrEqual(limit);
        expect(cage.spacing).toBeLessThanOrEqual(secondary.alongMax);
      }
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

for (const shape of [
  { kind: 'circle', D: 0.4 }, { kind: 'tee', bf: 0.6, bw: 0.2, h: 0.6, hf: 0.2 }, { kind: 'L', b: 0.6, h: 0.6, tw: 0.2, tf: 0.2 },
] as const) for (const axis of ['My', 'Mz'] as const) it(`known wrong result: #2171 shaped automatic ties use the verifier's own webs ${shape.kind} ${axis}`, () => {
  const ctx = syntheticBeamContext({ codeEdition: '2025', elementType: 'column', shape });
  const size = shape.kind === 'circle' ? shape.D : shape.h;
  ctx.section = { ...ctx.section, b: size, h: size };
  ctx.axes = { ...ctx.axes, flexure: axis, secondaryFlexure: axis === 'My' ? 'Mz' : 'My', shear: axis === 'My' ? 'Vz' : 'Vy', secondaryShear: axis === 'My' ? 'Vy' : 'Vz', bFlex: size, hFlex: size };
  ctx.stations = { elementId: 1, length: 6, stationTs: [0, 1], comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 1].map(t => ({ t, x: 6 * t, n: 0, my: 0, mz: 0, vy: 1, vz: 1, torsion: 0 })) }] };
  const options = buildTieOptions(ctx, 16);
  expect(options.length).toBeGreaterThan(0);
  for (const cage of options.slice(0, 3)) {
    expect(cage.secondaryLegs).toBeDefined();
    const checked = verifyProvidedReinforcement(1, 'column', { shaped: { count: 8, diameter: 16 }, stirrups: cage }, undefined, {},
      { ...ctx.section, ...ctx.material }, ctx.stations, undefined, { shape, axes: ctx.axes, spacingRule: { edition: '2025', maxAggregateSizeMm: 0 } });
    for (const limiting of ['tieSpacing', 'shear']) {
      const checks = checked.checks.filter(c => c.limiting === limiting);
      expect(checks.length, limiting).toBeGreaterThan(0);
      expect(checks.filter(c => c.status === 'fail'), limiting).toEqual([]);
    }
  }
});
