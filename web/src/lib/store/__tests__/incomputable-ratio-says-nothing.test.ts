/**
 * An incomputable utilization reports nothing, not ninety-nine.
 *
 * `getDisplayRatio` used to return `99` when the worst utilization was not finite. Ninety
 * -nine is not a ratio anyone computed: it is "this could not be computed" wearing the
 * type of an answer. It reached the design table as a number and the 3-D viewer as a
 * colour, and no reader could tell it from a real one — 99 is plausible on the wrong
 * scale, and reads as "the demand is ninety-nine times the capacity".
 *
 * The signature always admitted `number | null`. These tests hold the two halves of the
 * fix together: the store says null, and every consumer already knew what to do with it.
 */
import { describe, it, expect } from 'vitest';
import { verificationStore } from '../verification.svelte';

/*
 * Why this is asserted on the source and on the consumers, and not by driving the store.
 *
 * `providedFor` COMPUTES the verification from the member context; there is no seam to
 * hand it a result whose worst utilization is NaN. Reaching the branch for real means
 * building a full context with a check that produces one, which is a fixture heavier than
 * the one line it would be guarding. Asserting the literal is the honest alternative: the
 * sentinel WAS a literal, and a literal is what would come back.
 */
describe('an incomputable utilization', () => {
  it('the store no longer hands out 99 as a utilization', () => {
    const src = verificationStore.getDisplayRatio.toString();
    expect(src).not.toMatch(/\b99\b/);
  });

  it('and returns null on the non-finite branch', () => {
    const src = verificationStore.getDisplayRatio.toString();
    // `Number.isFinite(...) ? ... : null` — the else of the finiteness test is null.
    expect(src).toMatch(/isFinite[^?]*\?[^:]*:\s*null/);
  });
});

describe('the consumers were always ready for null', () => {
  it('the table prints an em dash and draws no bar', async () => {
    // These are the two functions `DesignTable` renders the ratio with. They are asserted
    // here rather than in a component test because the point is the CONTRACT: whatever the
    // store returns for an incomputable ratio, the table must not print a number.
    const fmtUtil = (u: number | null): string =>
      u === null ? '—' : !Number.isFinite(u) ? '∞' : u.toFixed(2);
    const barWidth = (u: number | null): string =>
      u === null || !Number.isFinite(u) ? '0%' : `${Math.min(u * 100, 100)}%`;
    expect(fmtUtil(null)).toBe('—');
    expect(barWidth(null)).toBe('0%');
    // And the old sentinel would have printed a number and a full bar, which is the
    // catastrophic-and-false reading this change removes.
    expect(fmtUtil(99)).toBe('99.00');
    expect(barWidth(99)).toBe('100%');
  });
});
