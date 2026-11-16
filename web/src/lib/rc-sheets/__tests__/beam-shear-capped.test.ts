import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type SectionEnv } from '../beam-row';
import { makeFmt } from '../format';

const f = makeFmt('.');
const env = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U1', x } }, neg: { value: neg, source: { combo: 'U1', x } }, nPos: 0, nNeg: 0 });
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.03, stirrupDia: 8, diameters: [8, 10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const grade: BeamDemand = {
  key: 'beam:60:3', name: 'V4-4', length: 4.5, b: 0.2, h: 0.6,
  start: env(0, 0, 64.5), span: env(2.25, 217.7, 0), end: env(4.5, 217.7, 0),
  negAny: { value: 64.5 }, nNegAny: 0, vu: { value: 411.9 }, nAtV: 0, tu: { value: 2.3 }, combos: [],
};

describe('a beam whose shear the section cannot carry', () => {
  it('fails shear alone, with no more stirrup legs than bars to hold them', () => {
    const r = beamRow(grade, ctx, undefined, f);
    expect(r.verifications.filter((v) => !v.ok).map((v) => v.label)).toEqual(['rcSheets.v.shear']);
    expect(r.proposed.stirrups.legs).toBeLessThanOrEqual(Math.max(2, r.proposed.bottom[0]!.count));
  });

  it('with chapter 18, leaves the capacity shear to a larger section rather than to more legs', () => {
    const r = beamRow({ ...grade, vu: { value: 300 } }, { ...ctx, seismic: { overstrength: 1.25 } }, undefined, f);
    expect(r.proposed.stirrups.legs).toBeLessThanOrEqual(Math.max(2, r.proposed.bottom[0]!.count));
  });
});
