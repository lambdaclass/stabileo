import { describe, it, expect, beforeEach } from 'vitest';
import { solveProgress, secondsLeft } from '../solve-progress.svelte';

describe('solve progress', () => {
  beforeEach(() => solveProgress.dismiss());

  it('runs through its steps and ends with how it went', () => {
    solveProgress.begin(1000);
    expect(solveProgress.now).toMatchObject({ phase: 'prepare', startedAt: 1000 });
    solveProgress.step('mesh');
    solveProgress.step('cases', 0, 4, 1200);
    solveProgress.step('cases', 1, 4, 1400);
    expect(solveProgress.now).toMatchObject({ phase: 'cases', done: 1, total: 4, casesAt: 1200 });
    solveProgress.step('combine');
    solveProgress.finish({ ok: true, warnings: 2 }, 2000);
    expect(solveProgress.now).toMatchObject({ phase: 'done', endedAt: 2000, warnings: 2 });
    solveProgress.step('single');
    expect(solveProgress.now?.phase).toBe('done');
    solveProgress.dismiss();
    expect(solveProgress.now).toBeNull();
  });

  it('a failure keeps its reason', () => {
    solveProgress.begin(0);
    solveProgress.finish({ ok: false, error: 'Mechanism at node 4', warnings: 0 }, 10);
    expect(solveProgress.now).toMatchObject({ phase: 'failed', error: 'Mechanism at node 4' });
  });

  it('estimates the time left from the pace of the cases done, counting down until the next one finishes', () => {
    solveProgress.begin(0);
    solveProgress.step('cases', 0, 5, 1000);
    expect(secondsLeft(solveProgress.now!, 1500)).toBeNull();
    solveProgress.step('cases', 2, 5, 3000);
    expect(secondsLeft(solveProgress.now!, 3000)).toBeCloseTo(3, 9);
    expect(secondsLeft(solveProgress.now!, 4000)).toBeCloseTo(2, 9);
    expect(secondsLeft(solveProgress.now!, 9000)).toBe(0);
    solveProgress.step('cases', 5, 5, 4000);
    expect(secondsLeft(solveProgress.now!, 4000)).toBeNull();
  });
});
