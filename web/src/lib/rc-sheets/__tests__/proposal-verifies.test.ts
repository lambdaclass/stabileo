import { describe, it, expect } from 'vitest';
import { peakSection, type BeamComboForces, type BeamDemand, type SectionEnv } from '../beam-row';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import type { BeamAdopted, SheetCode } from '../types';

const fmt = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const sec = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const combo = (o: Partial<BeamComboForces>): BeamComboForces => ({ combo: 'U', mStart: 0, mSpan: 0, mEnd: 0, mPos: 0, mNeg: 0, nStart: 0, nSpan: 0, nEnd: 0, v: 60, nV: 0, t: 0, ...o });
const demand = (o: Partial<BeamDemand> = {}): BeamDemand => ({
  key: 'beam:1:0', name: 'V1', length: 6, b: 0.25, h: 0.5,
  start: sec(0, 0, 90), span: sec(2.8, 60, 0), end: sec(6, 0, 130),
  negAny: { value: 130 }, nNegAny: 0, vu: { value: 120 }, nAtV: 0, tu: { value: 0 }, combos: [], ...o,
});
const CODES: SheetCode[] = ['cirsoc201-2025', 'aci318-19', 'en1992-1-1', 'bs-en1992-1-1', 'ts500-2000'];

describe('a combination\'s peak moment is carried by the bars where it acts', () => {
  it('maps the peak to the nearest of the three sections', () => {
    const d = demand();
    expect(peakSection(d, 6)).toBe('end');
    expect(peakSection(d, 0.4)).toBe('start');
    expect(peakSection(d, 3.5)).toBe('span');
    expect(peakSection(d, undefined)).toBeNull();
  });

  it('a span whose support bars stop short of mid-span reads its hogging peak at the support, in every code', () => {
    const k = combo({ mStart: -90, mSpan: 60, mEnd: -130, mPos: 60, mNeg: 130, xPos: 2.8, xNeg: 6 });
    const d = demand({ combos: [k] });
    for (const code of CODES) {
      const r = rulesFor(code).beamRow(d, ctx, undefined, fmt);
      const cut: BeamAdopted = {
        ...r.proposed,
        top: [{ count: 2, dia: 10 }],
        at: {
          start: { top: [{ count: 2, dia: 10 }, ...r.proposed.top], bottom: r.proposed.bottom },
          span: { top: [{ count: 2, dia: 10 }], bottom: r.proposed.bottom },
          end: { top: [{ count: 2, dia: 10 }, ...r.proposed.top], bottom: r.proposed.bottom },
        },
      };
      const row = rulesFor(code).beamRow(d, ctx, cut, fmt);
      expect(row.combos.rows[0]!.ratio, code).toBeLessThan(1);
      expect(row.verifications.find((v) => v.label === 'rcSheets.v.everyCombo')?.ok ?? true, code).toBe(true);
      const old = rulesFor(code).beamRow(demand({ combos: [{ ...k, xNeg: undefined }] }), ctx, cut, fmt);
      expect(old.combos.rows[0]!.ratio, code).toBeGreaterThan(1);
    }
  });
});
