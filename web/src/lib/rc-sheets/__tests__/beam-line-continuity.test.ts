/**
 * Continuity of a beam line over its interior supports: the extra top bars of neighbouring
 * supports run on as one where less than max(d; 12·db) would be left between their cut points, set out from the
 * supports they join and lapped mid-span where they outgrow a stock bar.
 */
import { CRITERION } from '../criteria';
import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type BeamEnd, type SectionEnv } from '../beam-row';
import { beamLine, CIRSOC_LINE, type LineLayout } from '../beam-line';
import { makeFmt } from '../format';
import { setOut } from '../line-geometry';

const fmt = makeFmt('.');
const env = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
const bctx = { mat: { fc: 30, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const column: BeamEnd = { kind: 'column', half: 0.2 };

/** A line on columns, each span hogging `hog` at its supports and sagging `sag` mid-span, kN·m. */
function lineOf(spans: number[], hog: number, sag: number, ends: [BeamEnd, BeamEnd] = [column, column]): LineLayout {
  const n = spans.length;
  const rows = spans.map((L, k) => {
    const mAt = (t: number) => (sag + hog) * 4 * t * (1 - t) - hog;
    const stations = Array.from({ length: 33 }, (_, i) => { const x = (i / 32) * L, t = x / L, m = mAt(t); return { x, pos: Math.max(0, m), neg: Math.max(0, -m), v: 160 * Math.abs(1 - 2 * t) + 30 }; });
    const d: BeamDemand = {
      key: `beam:1:${k}`, name: `V1-${k + 1}`, level: 'N1', length: L, b: 0.3, h: 0.5,
      start: env(0, 0, hog), span: env(L / 2, sag, 0), end: env(L, 0, hog),
      negAny: { value: hog }, nNegAny: 0, vu: { value: 190 }, nAtV: 0, tu: { value: 0 }, combos: [], env: stations,
      supportHalf: { start: 0.2, end: 0.2 }, ends: { start: k === 0 ? ends[0] : column, end: k === n - 1 ? ends[1] : column },
      line: { group: 1, index: k, spans: n, startNode: k + 1, endNode: k + 2, lineName: 'V1' },
    };
    return beamRow(d, bctx as never, undefined, fmt);
  });
  return beamLine(rows, bctx, undefined, fmt, CIRSOC_LINE);
}

const supportBars = (l: LineLayout) => l.bars.filter((b) => b.kind === 'support').sort((p, q) => p.from - q.from);

describe('extra top bars over neighbouring supports', () => {
  it('runs them on as one over a short span whose two cut points would leave less than max(d; 12·db) between them', () => {
    const l = lineOf([5, 2.6, 5], 140, 60);
    const over = supportBars(l).filter((b) => b.from < 5 - 1e-6 && b.to > 7.6 + 1e-6);
    expect(over.length).toBe(1);
    const bar = over[0]!;
    expect(l.joined).toEqual([{ mark: bar.mark, from: bar.from, to: bar.to, supports: [1, 2] }]);
    expect(setOut(l, bar)).toEqual({ axes: [5, 7.6], d: [5 - bar.from, bar.to - 7.6] });
    expect(l.steps.flatMap((g) => g.steps).some((s) => s.label === 'rcSheets.s.lineJoined' && s.value === CRITERION)).toBe(true);
    expect(l.cutoffs.filter((x) => x.mark === bar.mark).every((x) => x.x < 5 || x.x > 7.6)).toBe(true);
    expect(l.verifications.find((v) => v.label === 'rcSheets.v.lineEnvelope')!.ok).toBe(true);
  });

  it('leaves no two extras of one diameter stopping closer than max(d; 12·db) to each other', () => {
    for (const l of [lineOf([5, 2.6, 5], 140, 60), lineOf([6, 6, 6], 120, 90), lineOf([4, 3, 3, 4], 160, 50)]) {
      const bars = supportBars(l);
      for (let i = 1; i < bars.length; i++) {
        const p = bars[i - 1]!, q = bars[i]!;
        if (p.bars.dia !== q.bars.dia || q.from <= p.from + 1e-6 || q.to <= p.to + 1e-6) continue;
        expect(q.from - p.to).toBeGreaterThanOrEqual(Math.max(0.5 - 0.025 - 0.008 - 0.01, 12 * p.bars.dia / 1000) - 1e-6);
      }
    }
  });

  it('makes a joined bar that would cover every support the top run where every section keeps the area its span row asks', () => {
    const l = lineOf([3, 3, 3, 3], 150, 30);
    expect(l.adopted.top).toEqual({ count: 5, dia: 16 });
    expect(l.joined).toEqual([]);
    expect(l.adopted.supportTop.map((g) => g.count)).toEqual([3, 0, 0, 0, 3]);
    expect(l.status).not.toBe('fail');
  });

  it('keeps separate bars at supports whose cut points stand well apart', () => {
    const l = lineOf([6, 6, 6], 120, 90);
    expect(l.joined).toEqual([]);
    for (const b of supportBars(l)) expect(setOut(l, b)!.axes[0]).toBe(setOut(l, b)!.axes[1]);
  });

  it('laps a joined bar longer than a stock bar mid-span, half the bars a little apart from the other half', () => {
    const l = lineOf([4.5, 2.4, 2.4, 2.4, 2.4, 2.4, 4.5], 160, 40);
    const long = supportBars(l).find((b) => b.to - b.from > 12);
    expect(long).toBeDefined();
    const laps = l.splices.filter((s) => s.mark === long!.mark);
    expect(laps.length).toBeGreaterThan(0);
    const mids = l.spans.map((s) => (s.x0 + s.x1) / 2);
    for (const sp of laps) expect(mids.some((m) => Math.abs(m - sp.x) <= sp.length / 2 + 0.1)).toBe(true);
  });
});

describe('one diameter for the supports\' extra bars', () => {
  /** Two 7 m spans on 50 cm columns, hogging `hEnd` at the end supports and `hMid` over the middle one, kN·m. */
  const twoSpans = (hEnd: number, hMid: number) => {
    const rows = [0, 1].map((k) => {
      const L = 7, h0 = k === 0 ? hEnd : hMid, h1 = k === 0 ? hMid : hEnd, sag = 150;
      const mAt = (t: number) => -(h0 * (1 - t) + h1 * t) + (sag + (h0 + h1) / 2) * 4 * t * (1 - t);
      const stations = Array.from({ length: 33 }, (_, i) => { const x = (i / 32) * L, t = x / L, m = mAt(t); return { x, pos: Math.max(0, m), neg: Math.max(0, -m), v: 200 * Math.abs(1 - 2 * t) + 30 }; });
      const end: BeamEnd = { kind: 'column', half: 0.25 };
      const d: BeamDemand = {
        key: `beam:1:${k}`, name: `V1-${k + 1}`, level: 'N1', length: L, b: 0.3, h: 0.6,
        start: env(0, 0, h0), span: env(L / 2, sag, 0), end: env(L, 0, h1), negAny: { value: Math.max(h0, h1) }, nNegAny: 0, vu: { value: 230 }, nAtV: 0, tu: { value: 0 }, combos: [], env: stations,
        supportHalf: { start: 0.25, end: 0.25 }, ends: { start: end, end }, line: { group: 1, index: k, spans: 2, startNode: k + 1, endNode: k + 2, lineName: 'V1' },
      };
      return beamRow(d, bctx as never, undefined, fmt);
    });
    return beamLine(rows, bctx, undefined, fmt, CIRSOC_LINE);
  };

  it('takes the diameter between the ends\' and the middle support\'s when it lays every face and keeps the envelope', () => {
    const l = twoSpans(100, 250);
    const used = l.adopted.supportTop.filter((g) => g.count > 0);
    expect(new Set(used.map((g) => g.dia))).toEqual(new Set([20]));
    expect(l.adopted.supportTop.map((g) => g.count)).toEqual([2, 5, 2]);
    expect(l.status).not.toBe('fail');
  });
});

describe('a line ending at a frame corner (FIUBA §16.1)', () => {
  const corner: BeamEnd = { kind: 'column', half: 0.2, corner: true };
  const knee = (l: LineLayout) => l.steps.flatMap((g) => g.steps).filter((s) => s.label === 'rcSheets.s.lineKnee');

  it('checks the top bars\' bend against the lever arm where the column stops, and only there', () => {
    const l = lineOf([5, 5], 120, 90, [corner, column]);
    const k = knee(l);
    expect(k).toHaveLength(1);
    expect(k[0]!.formula!.startsWith('← ')).toBe(true);
    expect(k[0]!.ok).toBe(true);
    expect(k[0]!.value).toBe(CRITERION);
    expect(knee(lineOf([5, 5], 120, 90))).toHaveLength(0);
  });

  it('advises a haunch where the top bars there pass 0.70 %', () => {
    const haunch = (l: LineLayout) => l.steps.flatMap((g) => g.steps).filter((s) => s.label === 'rcSheets.s.lineKneeHaunch');
    expect(haunch(lineOf([5, 5], 60, 90, [corner, corner]))).toHaveLength(0);
    const heavy = lineOf([5, 5], 260, 90, [corner, corner]);
    expect(haunch(heavy).length).toBeGreaterThan(0);
  });
});

