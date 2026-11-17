import { describe, it, expect } from 'vitest';
import type { BeamDemand, SectionEnv } from '../../beam-row';
import { beamRow, proposeSkin } from '../beam';
import { makeFmt } from '../../format';
import type { BeamAdopted } from '../../types';

const f = makeFmt('.');
const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, stirrupDia: 8, diameters: [10, 12, 14, 16, 20, 25], torsion: 'equilibrium' as const };
const env = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'A', x } }, neg: { value: neg, source: { combo: 'A', x } }, nPos: 0, nNeg: 0 });
const combo = (name: string, mSpan: number, v: number) => ({ combo: name, mStart: 0, mSpan, mEnd: 0, mPos: mSpan, mNeg: 0, nStart: 0, nSpan: 0, nEnd: 0, v, nV: 0, t: 0 });
const beam = (combos: BeamDemand['combos']): BeamDemand => ({
  key: 'beam:1:0', name: 'K1', length: 5, b: 0.3, h: 0.5, start: env(0, 0, 0), span: env(2.5, 80, 0), end: env(5, 0, 0),
  negAny: { value: 0 }, nNegAny: 0, vu: { value: 80 }, nAtV: 0, tu: { value: 0 }, combos,
});
const bars: BeamAdopted = { bottom: [{ count: 4, dia: 16 }], top: [{ count: 2, dia: 12 }], stirrups: { dia: 8, legs: 2, spacing: 0.15 } };

describe('TS 500 beams', () => {
  it('fail where any combination fails with the adopted bars, not only the envelope', () => {
    const fine = beamRow(beam([combo('A', 80, 80)]), ctx, bars, f);
    expect(fine.verifications.find((v) => v.label === 'rcSheets.v.everyCombo')!.ok).toBe(true);
    const r = beamRow(beam([combo('A', 80, 80), combo('B', 400, 80)]), ctx, bars, f);
    const v = r.verifications.find((x) => x.label === 'rcSheets.v.everyCombo')!;
    expect(v.ok).toBe(false);
    expect(v.demand).toBe('B');
    expect(r.status).toBe('fail');
    const p = beamRow(beam([combo('A', 80, 80), combo('B', 160, 80)]), ctx, undefined, f);
    expect(p.verifications.find((x) => x.label === 'rcSheets.v.everyCombo')!.ok).toBe(true);
  });

  it('give a deep web the skin steel it asks for, in more bars where Ø16 at 300 mm is short of it', () => {
    const s = proposeSkin({ b: 0.8, h: 0.7 }, { cover: 0.04, stirrupDia: 8 }, 0.64)!;
    expect(s.need).toBeCloseTo(0.001 * 0.8 * 0.64 * 1e4, 9);
    expect(s.area).toBeGreaterThanOrEqual(s.need);
  });
});
