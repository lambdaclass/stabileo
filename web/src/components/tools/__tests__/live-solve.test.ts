import { describe, expect, it } from 'vitest';
import { liveSolver, type Clock } from '../live-solve';

function fakeClock() {
  let time = 0;
  let next = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  const clock: Clock = {
    frame: (callback) => { frames.set(next, callback); return next++; },
    cancelFrame: (handle) => { frames.delete(handle); },
    after: (callback, ms) => { timers.set(next, { at: time + ms, callback }); return next++; },
    cancelAfter: (handle) => { timers.delete(handle); },
    now: () => time,
  };
  return {
    clock,
    async tick() {
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback();
      await settle();
    },
    async advance(ms: number) {
      time += ms;
      for (const [handle, timer] of [...timers]) if (timer.at <= time) { timers.delete(handle); timer.callback(); }
      await settle();
    },
    get frames() { return frames.size; },
    get timers() { return timers.size; },
  };
}

describe('live solving', () => {
  it('solves once per frame with the latest input, however many arrive in between', async () => {
    const t = fakeClock();
    const solved: number[] = [];
    const settled: [number, boolean][] = [];
    const solver = liveSolver((n: number) => { solved.push(n); return n * 2; }, (outcome, input, superseded) => { if (outcome.ok) settled.push([input, superseded]); }, { clock: t.clock });
    for (const n of [1, 2, 3, 4]) solver.request(n);
    expect(t.frames).toBe(1);
    await t.tick();
    expect(solved).toEqual([4]);
    expect(settled).toEqual([[4, false]]);
    expect(solver.busy).toBe(false);
  });

  it('never runs two solves at once, and solves the newest input after the running one', async () => {
    const t = fakeClock();
    const release: (() => void)[] = [];
    const solved: number[] = [];
    const settled: [number, number, boolean][] = [];
    const solver = liveSolver(
      (n: number) => new Promise<number>(resolve => { solved.push(n); release.push(() => resolve(n * 10)); }),
      (outcome, input, superseded) => { if (outcome.ok) settled.push([input, outcome.value, superseded]); },
      { clock: t.clock },
    );
    solver.request(1);
    await t.tick();
    solver.request(2);
    solver.request(3);
    await t.tick();
    expect(solved).toEqual([1]);
    release.shift()!();
    await t.tick();
    expect(settled).toEqual([[1, 10, true]]);
    await t.tick();
    expect(solved).toEqual([1, 3]);
    release.shift()!();
    await t.tick();
    expect(settled).toEqual([[1, 10, true], [3, 30, false]]);
    expect(solver.busy).toBe(false);
  });

  it('reports a failure with the input that caused it, and stops cleanly', async () => {
    const t = fakeClock();
    const failures: number[] = [];
    const solver = liveSolver((n: number) => { if (n < 0) throw new Error('negative'); return n; }, (outcome, input) => { if (!outcome.ok) failures.push(input); }, { clock: t.clock });
    solver.request(-1);
    await t.tick();
    expect(failures).toEqual([-1]);
    solver.request(5);
    solver.stop();
    await t.tick();
    expect(solver.busy).toBe(false);
  });

  it('still solves the waiting input when settling an answer throws, and reports the error', async () => {
    const t = fakeClock();
    const release: (() => void)[] = [];
    const errors: unknown[] = [];
    const settled: number[] = [];
    const solver = liveSolver(
      (n: number) => new Promise<number>(resolve => release.push(() => resolve(n))),
      (outcome) => { if (!outcome.ok) return; if (outcome.value === 1) throw new Error('drawing failed'); settled.push(outcome.value); },
      { clock: t.clock, onError: error => errors.push(error) },
    );
    solver.request(1);
    await t.tick();
    solver.request(2);
    release.shift()!();
    await t.tick();
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('drawing failed');
    await t.tick();
    release.shift()!();
    await t.tick();
    expect(settled).toEqual([2]);
    expect(solver.busy).toBe(false);
  });

  it('with a delay, waits until the inputs stop for that long, then solves only the last one', async () => {
    const t = fakeClock();
    const solved: number[] = [];
    const solver = liveSolver((n: number) => { solved.push(n); return n; }, () => {}, { clock: t.clock, delay: 120 });
    solver.request(1);
    await t.advance(80);
    solver.request(2);
    await t.advance(80);
    await t.tick();
    expect(solved).toEqual([]);
    expect(solver.busy).toBe(true);
    await t.advance(40);
    expect(t.frames).toBe(1);
    await t.tick();
    expect(solved).toEqual([2]);
    expect(t.timers).toBe(0);
    expect(solver.busy).toBe(false);
  });

  it('with a delay, an input that arrives during a solve waits its delay after it, and never overlaps', async () => {
    const t = fakeClock();
    const release: (() => void)[] = [];
    let running = 0;
    let most = 0;
    const solved: number[] = [];
    const solver = liveSolver(
      (n: number) => new Promise<number>(resolve => { running++; most = Math.max(most, running); solved.push(n); release.push(() => { running--; resolve(n); }); }),
      () => {},
      { clock: t.clock, delay: 120 },
    );
    solver.request(1);
    await t.advance(120);
    await t.tick();
    solver.request(2);
    release.shift()!();
    await t.tick();
    expect(solved).toEqual([1]);
    await t.advance(120);
    await t.tick();
    expect(solved).toEqual([1, 2]);
    release.shift()!();
    await t.tick();
    expect(most).toBe(1);
  });
});

for (const delay of [0, 120]) {
  it(`invalidates running and queued work when a cached answer arrives with delay ${delay}`, async () => {
    const { currentSolver } = await import('../live-solve');
    const t = fakeClock();
    const release: ((value: string) => void)[] = [];
    const solved: string[] = [];
    const settled: string[] = [];
    const solver = currentSolver((input: string) => new Promise<string>(resolve => { solved.push(input); release.push(resolve); }),
      (outcome, input) => { if (outcome.ok) settled.push(`${input}:${outcome.value}`); }, { clock: t.clock, delay });
    solver.request('A');
    await t.advance(delay);
    await t.tick();
    solver.request('queued');
    solver.request('B', 'cached');
    expect(settled).toEqual(['B:cached']);
    release.shift()!('late');
    await t.tick();
    await t.advance(delay);
    await t.tick();
    expect(solved).toEqual(['A']);
    expect(settled).toEqual(['B:cached']);
    expect(solver.busy).toBe(false);
    solver.request('C');
    await t.advance(delay);
    await t.tick();
    release.shift()!('current');
    await t.tick();
    expect(settled).toEqual(['B:cached', 'C:current']);
    expect(solver.isCurrent('B')).toBe(false);
    expect(solver.isCurrent('C')).toBe(true);
  });

  it(`cancels a scheduled solve before its frame or delay when a cache hit arrives with delay ${delay}`, async () => {
    const { currentSolver } = await import('../live-solve');
    const t = fakeClock();
    const solved: string[] = [];
    const settled: string[] = [];
    const solver = currentSolver((input: string) => { solved.push(input); return input; },
      (outcome) => { if (outcome.ok) settled.push(outcome.value); }, { clock: t.clock, delay });
    solver.request('A');
    solver.request('B', 'cached');
    await t.advance(delay);
    await t.tick();
    expect(solved).toEqual([]);
    expect(settled).toEqual(['cached']);
    expect(t.frames).toBe(0);
    expect(t.timers).toBe(0);
    expect(solver.busy).toBe(false);
  });
}

it('drops a late failure while preserving a current failure and a current success', async () => {
  const { currentSolver } = await import('../live-solve');
  const t = fakeClock();
  const release: { resolve: (value: string) => void; reject: (error: unknown) => void }[] = [];
  const settled: string[] = [];
  const solver = currentSolver((_input: string) => new Promise<string>((resolve, reject) => release.push({ resolve, reject })),
    (outcome, input) => settled.push(`${input}:${outcome.ok ? outcome.value : 'error'}`), { clock: t.clock });
  solver.request('A');
  await t.tick();
  solver.request('B');
  release.shift()!.reject(new Error('late'));
  await t.tick();
  expect(settled).toEqual([]);
  await t.tick();
  release.shift()!.reject(new Error('current'));
  await t.tick();
  expect(settled).toEqual(['B:error']);
  solver.request('C');
  await t.tick();
  release.shift()!.resolve('answer');
  await t.tick();
  expect(settled).toEqual(['B:error', 'C:answer']);
});

it('does not accept an old completion when the same input is requested again or after disposal', async () => {
  const { currentSolver } = await import('../live-solve');
  const t = fakeClock();
  const release: ((value: string) => void)[] = [];
  const settled: string[] = [];
  const solver = currentSolver((_input: string) => new Promise<string>(resolve => release.push(resolve)),
    (outcome) => { if (outcome.ok) settled.push(outcome.value); }, { clock: t.clock });
  solver.request('A');
  await t.tick();
  solver.request('B', 'cached B');
  solver.request('A');
  release.shift()!('old A');
  await t.tick();
  expect(settled).toEqual(['cached B']);
  await t.tick();
  solver.stop();
  release.shift()!('new A after disposal');
  await t.tick();
  solver.request('C', 'cached after disposal');
  expect(settled).toEqual(['cached B']);
  expect(solver.isCurrent('A')).toBe(false);
  expect(solver.busy).toBe(false);
});
