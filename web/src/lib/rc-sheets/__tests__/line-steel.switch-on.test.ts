import { describe, it, expect } from 'vitest';
import { beamRow, type BeamDemand, type BeamEnd, type SectionEnv } from '../beam-row';
import { beamLine } from '../beam-line';
import { requiredAreas, shortStretches, withMinimum } from '../line-steel';
import { barArea, faceLayout, groupsArea } from '../bars';
import { makeFmt } from '../format';

const fmt = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
const sec = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });

function simpleBeam(w = 30, L = 5, b = 0.25, h = 0.5) {
  const end: BeamEnd = { kind: 'support', half: 0.1 };
  const env = Array.from({ length: 21 }, (_, i) => {
    const x = (i * L) / 20;
    return { x, pos: (w * x * (L - x)) / 2, neg: 0, v: Math.abs(w * (L / 2 - x)), nPos: 0, nNeg: 0, nV: 0 };
  });
  const d: BeamDemand = {
    key: 'beam:1:0', name: 'V1', length: L, b, h,
    start: sec(0, 0, 0), span: sec(L / 2, (w * L * L) / 8, 0), end: sec(L, 0, 0),
    negAny: { value: 0 }, nNegAny: 0, vu: { value: (w * L) / 2 }, nAtV: 0, tu: { value: 0 }, combos: [], env,
    supportHalf: { start: 0.1, end: 0.1 }, ends: { start: end, end },
    line: { group: 1, index: 0, spans: 1, startNode: 1, endNode: 2, lineName: 'V1' },
  };
  return beamLine([beamRow(d, ctx, undefined, fmt)], ctx, undefined, fmt);
}

describe('the steel area along a line', () => {
  it('asks at mid-span what the rectangular stress block asks of Mu, by hand', () => {
    const line = simpleBeam();
    const mid = line.steel!.reduce((a, s) => (Math.abs(s.x - 2.5) < Math.abs(a.x - 2.5) ? s : a));
    const run = line.bars.find((x) => x.face === 'bottom' && x.kind === 'continuous')!;
    const bottomAtMid = line.bars.filter((x) => x.face === 'bottom' && x.from <= 2.5 && x.to >= 2.5).map((x) => x.bars);
    const d = 0.5 - faceLayout(bottomAtMid, 0.25, 0.025, 8).centroidFromFace;
    const mu = (30 * 25) / 8, fc = 25, fy = 420, b = 0.25;
    const k = (mu / 1000) / (0.9 * 0.85 * fc * b * d * d);
    const hand = ((0.85 * fc * b * d) / fy) * (1 - Math.sqrt(1 - 2 * k)) * 1e4;
    expect(mid.bottom.strength).toBeGreaterThan(0.97 * hand);
    expect(mid.bottom.strength).toBeLessThan(1.03 * hand);
    expect(mid.bottom.provided).toBeCloseTo(groupsArea(bottomAtMid), 6);
    expect(mid.bottom.provided).toBeGreaterThanOrEqual(mid.bottom.strength);
    expect(run.bars.count).toBeGreaterThanOrEqual(2);
    expect(mid.top.strength).toBe(0);
    expect(mid.top.withMin).toBe(0);
  });

  it('takes the minimum ratio over the strength where it is less, up to 4/3 of it', () => {
    expect(withMinimum(2, 3)).toBeCloseTo(8 / 3, 9);
    expect(withMinimum(2, 2.4)).toBeCloseTo(2.4, 9);
    expect(withMinimum(4, 3)).toBe(4);
    expect(withMinimum(0, 3)).toBe(0);
  });

  it('a verified line is asked nowhere more than it has, and the supports of a simple beam nothing', () => {
    const line = simpleBeam();
    expect(line.status).not.toBe('fail');
    expect(shortStretches(line.steel!, 'bottom', 'strength')).toEqual([]);
    expect(shortStretches(line.steel!, 'top', 'strength')).toEqual([]);
    expect(line.steel![0]!.bottom.strength).toBe(0);
  });

  it('solves each moment within a fraction of a percent, and says when no multiple of the bars reaches it', () => {
    const cap = (asks: ReadonlyArray<{ i: number; tension: Array<{ count: number; dia: number }> }>) => asks.map(({ tension }) => 100 * Math.sqrt(groupsArea(tension)));
    const [a, b, none] = requiredAreas([{ mu: 100, tension: [{ count: 2, dia: 16 }], dia: 16 }, { mu: 50, tension: [], dia: 12 }, { mu: 0, tension: [], dia: 12 }], cap);
    expect(a).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(0.25, 2);
    expect(none).toBe(0);
    const [far] = requiredAreas([{ mu: 1e6, tension: [{ count: 1, dia: 10 }], dia: 10 }], cap);
    expect(far).toBe(Infinity);
    expect(barArea(16)).toBeGreaterThan(0);
  });
});
