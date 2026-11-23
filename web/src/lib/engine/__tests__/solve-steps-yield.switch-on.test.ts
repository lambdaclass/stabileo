import { describe, it, expect, afterEach, vi } from 'vitest';
import { onSolveStep, solveSteps, YIELD_EVERY_MS } from '../solve-steps';

async function settles(p: Promise<void>): Promise<boolean> {
  let done = false;
  void p.then(() => { done = true; });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return done;
}

describe('progress yields', () => {
  afterEach(() => { onSolveStep(null); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('lets a frame through at most every 50 ms, and tells every step', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { hidden: false });
    const seen: string[] = [];
    onSolveStep((step, done) => seen.push(`${step}:${done}`));
    const report = solveSteps();
    vi.advanceTimersByTime(YIELD_EVERY_MS);

    const first = report('combine', 0, 3);
    expect(await settles(first)).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(await settles(first)).toBe(true);

    expect(await settles(report('combine', 1, 3))).toBe(true);
    vi.advanceTimersByTime(YIELD_EVERY_MS);
    expect(await settles(report('combine', 2, 3))).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(seen).toEqual(['combine:0', 'combine:1', 'combine:2']);
  });

  it('never waits in a hidden tab', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { hidden: true });
    let told = 0;
    onSolveStep(() => { told++; });
    const report = solveSteps();
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(YIELD_EVERY_MS * 2);
      expect(await settles(report('combine', i, 4))).toBe(true);
    }
    expect(told).toBe(4);
  });

  it('a reporter taken with nobody listening says nothing, even once a listener arrives', async () => {
    const report = solveSteps();
    let told = 0;
    onSolveStep(() => { told++; });
    expect(await settles(report('envelope'))).toBe(true);
    expect(told).toBe(0);
  });
});
