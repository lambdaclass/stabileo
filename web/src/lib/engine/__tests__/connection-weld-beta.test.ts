import { describe, it, expect } from 'vitest';
import { checkFilletWeld } from '../connection-design';

/*
 * `checkFilletWeld` (the quick weld check in the Connections tab) against §J.2.1 / AISC
 * J2.2b(d), hand-derived from the clause:
 *   · L ≤ 100 w: Le = L;
 *   · 100 w < L ≤ 300 w: Le = (1,2 − 0,002 L/w) L;
 *   · L > 300 w: Le = 180 w.
 * φRn = 0,60 · 0,60 FEXX · 0,707 w · Le.
 */
const base = { legSize: 6, Fexx: 490, Vu: 0, plateThickness: 10 };
const cap = (le: number) => 0.6 * 0.6 * 490 * 0.707 * 6 * le / 1000;

describe('checkFilletWeld — end-loaded β', () => {
  it('is 1 up to 100 w', () => {
    expect(checkFilletWeld({ ...base, length: 600 }).phiRn).toBeCloseTo(cap(600), 9);
  });

  it('is 1,2 − 0,002 L/w between 100 w and 300 w', () => {
    expect(checkFilletWeld({ ...base, length: 1200 }).phiRn).toBeCloseTo(cap(0.8 * 1200), 9);
  });

  /* Was 0,6 L above 300 w — at L = 600 w that credits 360 w, twice the clause's 180 w. */
  it('caps the effective length at 180 w above 300 w', () => {
    expect(checkFilletWeld({ ...base, length: 3600 }).phiRn).toBeCloseTo(cap(180 * 6), 9);
  });

  it('is not applied to a weld declared not end-loaded', () => {
    expect(checkFilletWeld({ ...base, length: 3600, endLoaded: false }).phiRn)
      .toBeCloseTo(cap(3600), 9);
  });
});
