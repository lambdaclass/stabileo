import { expect, it } from 'vitest';
import { linearProfile } from '../linear-profile';

it.skip('known wrong result: #2262 refuses interpolation of large cancelling profiles', () => {
  const q = 2 ** 50;
  const pieces = [{ a: 0, b: 1, qa: q, qb: -q + 1 }, { a: 0, b: 0.5, qa: -q, qb: -0.5 }];
  for (const sign of [-1, 1]) for (const reverse of [false, true]) {
    const signed = pieces.map(p => ({ ...p, qa: sign * p.qa, qb: sign * p.qb }));
    expect(() => linearProfile(reverse ? signed.reverse() : signed)).toThrow(/profile intensity.*1048576/);
  }
});

it.skip('known wrong result: #2262 checks every endpoint before interpolation or cancellation', () => {
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
