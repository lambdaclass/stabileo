import { describe, it, expect } from 'vitest';
import { peakSection, type BeamComboForces, type BeamDemand, type BeamEnd, type SectionEnv } from '../beam-row';
import { ec2LineCode } from '../ec2/beam-line';
import { EC2_SET } from '../ec2/basis';
import { TS500_LINE } from '../ts500/line';
import { CIRSOC_LINE } from '../beam-line';
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

/** One span fixed into two columns under w kN/m, laid out by `code`'s rules. */
function frameSpan(code: SheetCode, o: { w?: number; half?: number; L?: number; h?: number; end?: BeamEnd; seismic?: boolean } = {}) {
  const { w = 60, half = 0.175, L = 5.5, h = 0.55, end = { kind: 'column', half } } = o;
  const env = Array.from({ length: 23 }, (_, i) => {
    const x = (i * L) / 22, m = (w * x * (L - x)) / 2 - (w * L * L) / 12;
    return { x, pos: Math.max(0, m), neg: Math.max(0, -m), v: Math.abs(w * (L / 2 - x)), nPos: 0, nNeg: 0, nV: 0 };
  });
  const d: BeamDemand = {
    key: 'beam:1:0', name: 'V1', length: L, b: 0.25, h,
    start: sec(0, 0, (w * L * L) / 12), span: sec(L / 2, (w * L * L) / 24, 0), end: sec(L, 0, (w * L * L) / 12),
    negAny: { value: (w * L * L) / 12 }, nNegAny: 0, vu: { value: (w * L) / 2 }, nAtV: 0, tu: { value: 0 }, combos: [], env,
    supportHalf: { start: end.half, end: end.half }, ends: { start: end, end },
    line: { group: 1, index: 0, spans: 1, startNode: 1, endNode: 2, lineName: 'V1' },
  };
  const c = { ...ctx, ...(o.seismic ? { seismic: { overstrength: 1.25 } } : {}) };
  const rules = rulesFor(code);
  return rules.beamLine([rules.beamRow(d, c, undefined, fmt)], c, undefined, fmt);
}

describe('a beam\'s bars anchored in an end column', () => {
  const anchor = (l: ReturnType<typeof frameSpan>) => l.verifications.find((v) => v.label === 'rcSheets.v.lineEndAnchor')!;

  it('EN 1992 and TS 500 count the anchorage along the bar, bend and tail, and lengthen the tail down the joint', () => {
    for (const code of ['en1992-1-1', 'bs-en1992-1-1', 'ts500-2000'] as const) {
      const l = frameSpan(code, { half: 0.125 });
      expect(anchor(l).ok, code).toBe(true);
      expect(parseFloat(anchor(l).demand!.split('=')[1]!), code).toBeGreaterThan((0.25 - 0.025 - 0.008 - 0.016) * 100);
      const top = l.bars.find((b) => b.face === 'top' && b.kind === 'continuous')!;
      expect(top.tails, code).toBeDefined();
      expect(top.tails![0], code).toBeGreaterThan(5 * top.bars.dia / 1000);
      const leg = Math.abs(top.shape.pts[0]![1] - top.shape.pts[1]![1]);
      expect(leg, code).toBeCloseTo(top.tails![0] + (code === 'ts500-2000' ? 6 : top.bars.dia <= 16 ? 4 : 7) * top.bars.dia / 2000 + top.bars.dia / 2000, 6);
      expect(leg, code).toBeLessThanOrEqual(0.55 - 2 * (0.025 + 0.008) + 1e-9);
    }
  });

  it('reads the along-the-bar reach from the room, the bend\'s quarter arc and the tail', () => {
    const code = ec2LineCode(EC2_SET);
    expect(code.alongBar).toBe(true);
    expect(TS500_LINE.alongBar).toBe(true);
    expect(CIRSOC_LINE.alongBar).toBeUndefined();
  });

  it('under chapter 18 a hook in the joint takes ldh = fy·db/(5.4·√f\'c) (§18.8.5.1), not §25.4.3\'s', () => {
    expect(CIRSOC_LINE.jointHooked!(ctx, 16)).toBeCloseTo((420 * 16) / (5.4 * 5) / 1000, 9);
    expect(CIRSOC_LINE.jointHooked!({ ...ctx, mat: { fc: 64, fy: 420 } }, 10)).toBeCloseTo(0.15, 9);
    const l = frameSpan('cirsoc201-2025', { seismic: true });
    const v = anchor(l);
    expect(v.ok).toBe(true);
    expect(v.clause).toBe('§18.8.5.1');
    expect(frameSpan('cirsoc201-2025').verifications.find((x) => x.label === 'rcSheets.v.lineEndAnchor')!.clause).toBe('§25.4.3');
  });
});
