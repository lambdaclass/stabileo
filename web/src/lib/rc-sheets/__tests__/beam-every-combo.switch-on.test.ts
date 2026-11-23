import { describe, it, expect } from 'vitest';
import type { BeamDemand, SectionEnv } from '../beam-row';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import type { BeamAdopted } from '../types';

const f = makeFmt('.');
const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const env = (x: number, pos: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'A', x } }, neg: { value: 0 }, nPos: 0, nNeg: 0 });
const combo = (name: string, mSpan: number, n: number) => ({ combo: name, mStart: 0, mSpan, mEnd: 0, mPos: mSpan, mNeg: 0, nStart: n, nSpan: n, nEnd: n, v: 40, nV: n, t: 0 });
const beam = (combos: BeamDemand['combos']): BeamDemand => ({
  key: 'beam:1:0', name: 'K1', length: 5, b: 0.3, h: 0.5, start: env(0, 0), span: env(2.5, 80), end: env(5, 0),
  negAny: { value: 0 }, nNegAny: 0, vu: { value: 40 }, nAtV: 0, tu: { value: 0 }, combos,
});
const bars: BeamAdopted = { bottom: [{ count: 3, dia: 16 }], top: [{ count: 2, dia: 12 }], stirrups: { dia: 8, legs: 2, spacing: 0.15 } };
const everyCombo = (r: { verifications: Array<{ label: string; ok: boolean; demand?: string }> }) => r.verifications.find((v) => v.label === 'rcSheets.v.everyCombo')!;

describe.each(['cirsoc201-2025', 'aci318-19', 'en1992-1-1'] as const)('a %s beam', (code) => {
  const beamRow = rulesFor(code).beamRow;

  it('fails where a smaller moment with more tension fails with the adopted bars, though the envelope passes', () => {
    const fine = beamRow(beam([combo('A', 80, 0)]), ctx, bars, f);
    expect(everyCombo(fine).ok).toBe(true);
    const r = beamRow(beam([combo('A', 80, 0), combo('B', 70, -900)]), ctx, bars, f);
    expect(everyCombo(r).ok).toBe(false);
    expect(everyCombo(r).demand).toBe('B');
    expect(r.status).toBe('fail');
  });

  it('is proposed with the bars that combination asks for', () => {
    const p = beamRow(beam([combo('A', 80, 0), combo('B', 70, -900)]), ctx, undefined, f);
    expect(everyCombo(p).ok).toBe(true);
    expect(p.status).not.toBe('fail');
  });
});
