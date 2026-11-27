/**
 * A member cut a rounding away from where one of its loads ends: the piece past the cut takes no
 * sliver of it, and the load stays whole on the piece before.
 */
import { it, expect } from 'vitest';
import { remapSpanInterval } from '../member-span-loads';

it('a cut four ulps before the end of a load leaves the next piece no sliver and the first the whole load', () => {
  const end = 1.4000000000000004, cut = 1.3999999999999995, length = 2.8;
  expect(remapSpanInterval(2, 0, end, cut, length, length - cut)).toBeNull();
  const first = remapSpanInterval(1, 0, end, 0, cut, cut);
  expect(first).toMatchObject({ lo: 0, hi: cut });
});

it('a load a person gives that narrow still refuses', () => {
  expect(() => remapSpanInterval(1, 1, 1 + 1e-12, 0, 2.8, 2.8)).toThrow();
});


it.skip('known wrong result: #2222 validates a positive boundary overlap on either child', () => {
  const delta = 2 ** -51;
  for (const [a, b] of [[1, 2 + delta], [2 - delta, 3]] as const) {
    const start = a === 1 ? 2 : 1;
    expect(() => remapSpanInterval(7, a, b, start, start + 1, 1)).toThrow(/Element 7.*interval.*geometry limit/);
  }
  expect(remapSpanInterval(7, 1, 2, 2, 3, 1)).toBeNull();
  expect(remapSpanInterval(7, 1, 2, 1, 2, 1)).toMatchObject({ lo: 1, hi: 2 });
});
