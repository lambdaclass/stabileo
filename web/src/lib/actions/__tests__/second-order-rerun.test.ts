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

  it.each(['buckling', 'pdelta'] as const)('retries the selected %s after the previous method refused', selected => {
    resultsStore.clearAdvanced();
    const pd = vi.fn(), bk = vi.fn();
    rerunSecondOrder(pd, bk, selected);
    expect(pd).toHaveBeenCalledTimes(Number(selected === 'pdelta'));
    expect(bk).toHaveBeenCalledTimes(Number(selected === 'buckling'));
  });

  it('with neither on screen nothing runs', () => {
    const pd = vi.fn(), bk = vi.fn();
    rerunSecondOrder(pd, bk);
    expect(pd).not.toHaveBeenCalled();
    expect(bk).not.toHaveBeenCalled();
  });
});

it.each(['pdelta', 'buckling'] as const)('reruns the restored %s even with a stale previous choice', kind => {
  const input = column('fixed', null, 4, 100, 5);
  const pd = vi.fn(), bk = vi.fn();
  if (kind === 'pdelta') {
    const run = runPDelta2D(input, DEFAULT_SETTINGS);
    if (!run.ok) throw Error('refused');
    resultsStore.setPDeltaResult(run.result);
  } else {
    const run = runBuckling2D(input, DEFAULT_SETTINGS);
    if (!run.ok) throw Error('refused');
    resultsStore.setBucklingResult(run.result as never);
  }
  rerunSecondOrder(pd, bk, kind === 'pdelta' ? 'buckling' : 'pdelta');
  expect(pd).toHaveBeenCalledTimes(Number(kind === 'pdelta'));
  expect(bk).toHaveBeenCalledTimes(Number(kind === 'buckling'));
});
