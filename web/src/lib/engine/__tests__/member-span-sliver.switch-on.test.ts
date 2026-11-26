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
