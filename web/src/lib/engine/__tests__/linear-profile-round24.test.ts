import { expect, it } from 'vitest';
import { linearProfile } from '../linear-profile';
import { floorLoad } from '../loads/floor-loads';
import { physicalRegion, transferRegionToSide, type Side } from '../loads/physical-region-loads';
import { rectangle, regionModel } from '../loads/__tests__/physical-region-invariance';

it('known wrong result: #2262 refuses interpolation of large cancelling profiles', () => {
  const q = 2 ** 50;
  const pieces = [{ a: 0, b: 1, qa: q, qb: q + 1 }, { a: 0, b: 0.1, qa: -q, qb: -q }, { a: 0.1, b: 1, qa: -q, qb: -q }];
  for (const sign of [-1, 1]) for (const reverse of [false, true]) {
    const signed = pieces.map(p => ({ ...p, qa: sign * p.qa, qb: sign * p.qb }));
    expect(() => linearProfile(reverse ? signed.reverse() : signed)).toThrow(/profile intensity.*1048576/);
  }
});

it('known wrong result: #2262 checks every endpoint before interpolation or cancellation', () => {
  const bound = 2 ** 20;
  for (const key of ['qa', 'qb'] as const) for (const sign of [-1, 1]) {
    const piece = { a: 0, b: 1, qa: 0, qb: 0, [key]: sign * bound * (1 + Number.EPSILON) };
    expect(() => linearProfile([piece])).toThrow(/profile intensity/);
    expect(() => linearProfile([piece, { ...piece, qa: -piece.qa, qb: -piece.qb }])).toThrow(/profile intensity/);
  }
  for (const q of [NaN, Infinity, -Infinity]) expect(() => linearProfile([{ a: 0, b: 1, qa: q, qb: 1 }])).toThrow(/profile intensity/);
});

it('keeps boundary intensities, exact dyadic cancellation residuals and ordinary answers', () => {
  for (const sign of [-1, 1]) for (const q of [2 ** 20 * (1 - Number.EPSILON), 2 ** 20]) {
    expect(linearProfile([{ a: 0, b: 1, qa: sign * q, qb: sign * q }])).toEqual([{ a: 0, b: 1, qa: sign * q, qb: sign * q }]);
    expect(linearProfile([{ a: 0, b: 1, qa: sign * q, qb: sign * q }, { a: 0, b: 1, qa: sign * (-q + 0.5), qb: sign * (-q + 0.5) }])).toEqual([{ a: 0, b: 1, qa: sign * 0.5, qb: sign * 0.5 }]);
  }
  expect(linearProfile([{ a: 0, b: 1, qa: 1, qb: 2 }])).toEqual([{ a: 0, b: 1, qa: 1, qb: 2 }]);
});

it('returns stored endpoint intensities without cancelling a small end value', () => {
  for (const sign of [-1, 1]) {
    const piece = { a: 0, b: 1, qa: sign, qb: sign * 1e-30 };
    expect(linearProfile([piece])).toEqual([piece]);
  }
});

it('floor and physical region generation share the intensity refusal and retain ordinary answers', () => {
  const model = regionModel([rectangle(0, 0, 6, 4)]);
  const floor = (q: number) => floorLoad({ nodes: model.nodes, beams: [...model.elements.values()].map(e => ({ ...e, type: 'frame' as const })), q, distribution: 'oneWay', spanAxis: 'y' });
  const side: Side = { a: [0, 0], b: [6, 0], u: [1, 0], n: [0, 1], len: 6, segments: [{ elementId: 1, s0: 0, s1: 6, forward: true }], nodeA: 1, nodeB: 2 };
  const region = physicalRegion([[0, 0], [6, 0], [6, 2], [0, 2]]);
  for (const q of [1, 2 ** 19]) {
    const generated = floor(q).loads.filter(l => l.elementId === 1);
    expect(generated.reduce((sum, l) => sum + (l.qI + l.qJ) * ((l.b ?? 6) - (l.a ?? 0)) / 2, 0)).toBeCloseTo(12 * q, 8);
    expect(transferRegionToSide(side, region, q).pieces).toEqual([{ s0: 0, s1: 6, q0: 2 * q, q1: 2 * q }]);
  }
  for (const q of [2 ** 50, 2 ** 19 * (1 + Number.EPSILON)]) {
    expect(() => floor(q)).toThrow(/profile intensity/);
    expect(() => transferRegionToSide(side, region, q)).toThrow(/profile intensity/);
  }
});
