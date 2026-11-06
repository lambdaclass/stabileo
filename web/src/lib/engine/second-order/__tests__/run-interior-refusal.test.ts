import { describe, it, expect, vi } from 'vitest';
import { runPDelta2D } from '../run-pdelta';
import { DEFAULT_SETTINGS } from '../settings';
import { portal } from './fixtures';

const flag = vi.hoisted(() => ({ broken: false }));
vi.mock('../beam-column-interior', async (orig) => {
  const real = await orig<typeof import('../beam-column-interior')>();
  return { ...real, interiorMoments: (...a: Parameters<typeof real.interiorMoments>) => (flag.broken ? null : real.interiorMoments(...a)) };
});

describe('a φ P-Δ whose moment inside a member is not finite', () => {
  it('is refused with a reason, not thrown', () => {
    flag.broken = true;
    const pd = runPDelta2D(portal(4, 6, 300, 10), { ...DEFAULT_SETTINGS, method: 'phi', n: 1 });
    flag.broken = false;
    expect(pd.ok).toBe(false);
    if (!pd.ok) expect(pd.reason.key).toBe('course.second-order.refuse.interiorNotFinite');
  });

  it('the same model solves when the interior is finite', () => {
    const pd = runPDelta2D(portal(4, 6, 300, 10), { ...DEFAULT_SETTINGS, method: 'phi', n: 1 });
    expect(pd.ok).toBe(true);
  });
});
