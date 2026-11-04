import { afterEach, expect, it, vi } from 'vitest';
import { solveSharedView } from '../solve-shared-view';

afterEach(() => vi.useRealTimers());

it('applies axialColor only after a solve lasting longer than 200 ms completes', async () => {
  vi.useFakeTimers();
  let finish!: (result: { ok: boolean }) => void;
  const solve = () => new Promise<{ ok: boolean }>(resolve => { finish = resolve; });
  const apply = vi.fn();
  const pending = solveSharedView('axialColor', solve, apply);
  await vi.advanceTimersByTimeAsync(2000);
  expect(apply).not.toHaveBeenCalled();
  finish({ ok: true });
  await pending;
  expect(apply).toHaveBeenCalledExactlyOnceWith('axialColor');
});

it('does not apply the shared view after failure or a superseded solve', async () => {
  const apply = vi.fn();
  await solveSharedView('axialColor', async () => ({ ok: false }), apply);
  expect(apply).not.toHaveBeenCalled();
  await expect(solveSharedView('axialColor', async () => { throw new Error('load failed'); }, apply)).rejects.toThrow('load failed');
  expect(apply).not.toHaveBeenCalled();
});
