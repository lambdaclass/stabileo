import { describe, expect, it } from 'vitest';
import { liveSolver } from '../live-solve';

function frames() {
  const queue: (() => void)[] = [];
  return {
    frame: (callback: () => void) => queue.push(callback),
    cancel: (handle: number) => { queue[handle - 1] = () => {}; },
    async tick() {
      const due = queue.splice(0);
      for (const callback of due) callback();
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    get pending() { return queue.length; },
  };
}

describe('live solving', () => {
  it('solves once per frame with the latest input, however many arrive in between', async () => {
    const clock = frames();
    const solved: number[] = [];
    const settled: [number, boolean][] = [];
    const solver = liveSolver((n: number) => { solved.push(n); return n * 2; }, (outcome, input, superseded) => { if (outcome.ok) settled.push([input, superseded]); }, clock.frame, clock.cancel);
    for (const n of [1, 2, 3, 4]) solver.request(n);
    expect(clock.pending).toBe(1);
    await clock.tick();
    expect(solved).toEqual([4]);
    expect(settled).toEqual([[4, false]]);
    expect(solver.busy).toBe(false);
  });

  it('never runs two solves at once, and solves the newest input after the running one', async () => {
    const clock = frames();
    const release: (() => void)[] = [];
    const solved: number[] = [];
    const settled: [number, number, boolean][] = [];
    const solver = liveSolver(
      (n: number) => new Promise<number>(resolve => { solved.push(n); release.push(() => resolve(n * 10)); }),
      (outcome, input, superseded) => { if (outcome.ok) settled.push([input, outcome.value, superseded]); },
      clock.frame, clock.cancel,
    );
    solver.request(1);
    await clock.tick();
    solver.request(2);
    solver.request(3);
    await clock.tick();
    expect(solved).toEqual([1]);
    release.shift()!();
    await clock.tick();
    expect(settled).toEqual([[1, 10, true]]);
    await clock.tick();
    expect(solved).toEqual([1, 3]);
    release.shift()!();
    await clock.tick();
    expect(settled).toEqual([[1, 10, true], [3, 30, false]]);
    expect(solver.busy).toBe(false);
  });

  it('reports a failure with the input that caused it, and stops cleanly', async () => {
    const clock = frames();
    const failures: number[] = [];
    const solver = liveSolver((n: number) => { if (n < 0) throw new Error('negative'); return n; }, (outcome, input) => { if (!outcome.ok) failures.push(input); }, clock.frame, clock.cancel);
    solver.request(-1);
    await clock.tick();
    expect(failures).toEqual([-1]);
    solver.request(5);
    solver.stop();
    await clock.tick();
    expect(solver.busy).toBe(false);
  });
});
