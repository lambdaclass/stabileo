import { afterEach, describe, expect, it, vi } from 'vitest';
import { resultsStore } from '../../store';
import { runPDelta2D } from '../../engine/second-order/run-pdelta';
import { runBuckling2D } from '../../engine/second-order/run-buckling';
import { DEFAULT_SETTINGS } from '../../engine/second-order/settings';
import { column } from '../../engine/second-order/__tests__/fixtures';
import { rerunSecondOrder } from '../second-order';

afterEach(() => resultsStore.clearAdvanced());

describe('new second-order settings rerun what is on screen', () => {
  it('a P-Δ result is run again, and a refused rerun leaves no result under the new settings', () => {
    const got = runPDelta2D(column('fixed', null, 4, 100, 5), DEFAULT_SETTINGS);
    if (!got.ok) throw new Error('refused');
    resultsStore.setPDeltaResult(got.result);
    const pd = vi.fn(), bk = vi.fn();
    rerunSecondOrder(pd, bk);
    expect(pd).toHaveBeenCalledTimes(1);
    expect(bk).not.toHaveBeenCalled();
    expect(resultsStore.pdeltaResult).toBeNull();
  });

  it('a buckling result is run again the same way', () => {
    const got = runBuckling2D(column('fixed', null, 4, 100), DEFAULT_SETTINGS);
    if (!got.ok) throw new Error('refused');
    resultsStore.setBucklingResult(got.result as never);
    const pd = vi.fn(), bk = vi.fn();
    rerunSecondOrder(pd, bk);
    expect(bk).toHaveBeenCalledTimes(1);
    expect(pd).not.toHaveBeenCalled();
    expect(resultsStore.bucklingResult).toBeNull();
  });

  it('with neither on screen nothing runs', () => {
    const pd = vi.fn(), bk = vi.fn();
    rerunSecondOrder(pd, bk);
    expect(pd).not.toHaveBeenCalled();
    expect(bk).not.toHaveBeenCalled();
  });
});
