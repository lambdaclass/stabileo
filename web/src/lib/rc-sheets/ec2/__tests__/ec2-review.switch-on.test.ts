import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver } from '../../../engine/wasm-solver';
import type { BeamDemand, SectionEnv } from '../../beam-row';
import { beamRow as cirsocBeamRow } from '../../beam-row';
import { makeFmt } from '../../format';
import { EC2_SET } from '../basis';
import { makeBeamRow } from '../beam-row';
import type { BeamAdopted } from '../../types';

const f = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 500 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const env = (x: number, pos: number, neg: number, n = 0): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: n, nNeg: n });
const beam = (o: Partial<BeamDemand> = {}): BeamDemand => ({
  key: 'beam:1:0', name: 'V1', length: 6, b: 0.3, h: 0.6,
  start: env(0, 0, 0), span: env(3, 200, 0), end: env(6, 0, 0),
  negAny: { value: 0 }, nNegAny: 0, vu: { value: 250 }, nAtV: 0, tu: { value: 0 }, combos: [], ...o,
});
const tie: BeamDemand = beam({ start: env(0, 0, 0, -600), span: env(3, 0, 0, -600), end: env(6, 0, 0, -600), vu: { value: 10 }, nAtV: -600 });
const light: BeamAdopted = { bottom: [{ count: 2, dia: 12 }], top: [{ count: 2, dia: 12 }], stirrups: { dia: 8, legs: 2, spacing: 0.2 } };

beforeAll(async () => { await initSolver(); });

describe('EN 1992 beams', () => {
  it('read the shear depth from the bars they hold: two layers of large bars lower it, and the capacity with it', () => {
    const one: BeamAdopted = { bottom: [{ count: 3, dia: 16 }], top: [{ count: 2, dia: 12 }], stirrups: { dia: 8, legs: 2, spacing: 0.1 } };
    const two: BeamAdopted = { ...one, bottom: [{ count: 4, dia: 25 }, { count: 4, dia: 25 }] };
    const cap = (a: BeamAdopted) => parseFloat(makeBeamRow(EC2_SET)(beam(), ctx, a, f).verifications.find((v) => v.label === 'rcSheets.v.shear')!.capacity!);
    expect(cap(two)).toBeLessThan(cap(one) - 5);
  });

  it('fail a section pulled with no moment whose bars cannot take the tension, and propose the bars that can', () => {
    const r = makeBeamRow(EC2_SET)(tie, ctx, light, f);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.axialOnly')!.ok).toBe(false);
    expect(r.status).toBe('fail');
    const p = makeBeamRow(EC2_SET)(tie, ctx, undefined, f);
    expect(p.verifications.filter((v) => v.label === 'rcSheets.v.axialOnly').every((v) => v.ok)).toBe(true);
    expect(p.req.bottom).toBeGreaterThanOrEqual(600 / 2 / (500 / 1.15) * 10 - 1e-6);
  });
});

describe('CIRSOC 201 beams', () => {
  it('fail a section pulled with no moment whose bars cannot take the tension', () => {
    const r = cirsocBeamRow(tie, { ...ctx, mat: { fc: 25, fy: 420 } }, light, f);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.axialOnly')!.ok).toBe(false);
    expect(r.status).toBe('fail');
  });
});

describe('EN 1992 walls', () => {
  const wctx = { mat: { fc: 30, fy: 500 }, cover: 0.025, barDia: 10, diameters: [10, 12, 16, 20, 25] };
  const wall = (pu: number, muV: number) => ({ key: 'wall:1:0', name: 'M1', length: 3, height: 3, thickness: 0.2, combos: [{ combo: 'U', pu, mu: 50, vu: 50, muV, muH: 0 }] });
  const mesh = { vertical: { diameter: 10, spacing: 0.2 }, horizontal: { diameter: 10, spacing: 0.2 }, curtains: 2 as const };

  it('read the out-of-plane strength with the axial tension, which lowers it', async () => {
    const { makeWallRow } = await import('../wall-row');
    const out = (pu: number) => makeWallRow(EC2_SET)(wall(pu, 8), wctx, mesh, f).verifications.find((v) => v.label === 'rcSheets.v.wallOut')!.ratio!;
    expect(out(-600)).toBeGreaterThan(out(0) * 1.2);
  });

  it('count the boundary bars in the 4 % of vertical steel', async () => {
    const { makeWallRow } = await import('../wall-row');
    const heavy = makeWallRow(EC2_SET)(wall(500, 0), wctx, { ...mesh, boundary: { count: 60, diameter: 25 } }, f);
    const max = heavy.verifications.find((v) => v.label === 'rcSheets.ec2.v.wallRhoVMax')!;
    expect(max.ok).toBe(false);
    expect(heavy.status).toBe('fail');
  });
});
