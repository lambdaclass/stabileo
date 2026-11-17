import { expect, it } from 'vitest';
import { coalesceQuadraticProfile, quadraticAt, type Quadratic, type QuadraticProfilePiece } from '../member-moments';

const reverse = (pieces: QuadraticProfilePiece[]) => [...pieces].reverse().map(p => ({ a: 2 - p.b, b: 2 - p.a, values: p.values.map(v => [...v].reverse() as Quadratic) }));

it.skip('known wrong result: #2219 independent components retain a small real quadratic', () => {
  for (const count of [2, 3]) for (let small = 0; small < count; small++) for (let large = 0; large < count; large++) {
    if (small === large) continue;
    for (const sign of [-1, 1]) for (const magnitude of [1e-30, 1, 1e14]) {
      const values = (bump: boolean): Quadratic[] => Array.from({ length: count }, (_, k) => k === large ? [1e14, 1e14, 1e14] : k === small && bump ? [0, sign * magnitude, 0] : [0, 0, 0]);
      const pieces = [{ a: 0, b: 1, values: values(true) }, { a: 1, b: 2, values: values(false) }];
      for (const input of [pieces, reverse(pieces)]) {
        const output = coalesceQuadraticProfile(input);
        expect(output).toEqual(input);
        for (const piece of input) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const x = piece.a + t * (piece.b - piece.a);
          const actual = output.find(p => p.a <= x && x <= p.b)!;
          expect(quadraticAt(actual.values[small]!, (x - actual.a) / (actual.b - actual.a))).toBe(quadraticAt(piece.values[small]!, t));
        }
      }
    }
  }
});

it('coalesces the same quadratic in every independent component and preserves gaps', () => {
  const pieces: QuadraticProfilePiece[] = [
    { a: 0, b: 1, values: [[1e14, 1e14, 1e14], [0, 0.25, 1], [0, 0, 0]] },
    { a: 1, b: 2, values: [[1e14, 1e14, 1e14], [1, 2.25, 4], [0, 0, 0]] },
  ];
  expect(coalesceQuadraticProfile(pieces)).toEqual([{ a: 0, b: 2, values: [[1e14, 1e14, 1e14], [0, 1, 4], [0, 0, 0]] }]);
  const gap = [pieces[0]!, { ...pieces[1]!, a: 1.25 }];
  expect(coalesceQuadraticProfile(gap)).toEqual(gap);
});

it.skip('known wrong result: #2219 coalescing roundoff uses each component scale on both sides of its threshold', () => {
  for (const multiplier of [128, 256]) {
    const pieces: QuadraticProfilePiece[] = [
      { a: 0, b: 1, values: [[1e14, 1e14, 1e14], [1, 1 + multiplier * Number.EPSILON, 1]] },
      { a: 1, b: 2, values: [[1e14, 1e14, 1e14], [1, 1, 1]] },
    ];
    for (const input of [pieces, reverse(pieces)]) expect(coalesceQuadraticProfile(input)).toHaveLength(multiplier === 128 ? 1 : 2);
  }
});
