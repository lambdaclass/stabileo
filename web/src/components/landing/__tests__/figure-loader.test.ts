import { afterEach, expect, it, vi } from 'vitest';
import { createFigureLoader, FIGURE_LOAD_TIMEOUT_MS } from '../hero/figure-loader';

afterEach(() => vi.useRealTimers());

it('shares the same failed loader invocation across preload, selection and later cycles', async () => {
  const loader = vi.fn().mockRejectedValue(new Error('chunk unavailable'));
  const load = createFigureLoader(loader);
  expect(loader).not.toHaveBeenCalled();
  const preload = load();
  const selection = load();
  expect(selection).toBe(preload);
  await expect(selection).resolves.toBeUndefined();
  for (let frame = 0; frame < 60; frame++) {
    await expect(load()).resolves.toBeUndefined();
  }
  expect(loader).toHaveBeenCalledTimes(1);
});

it('accepts a module that resolves just before its deadline', async () => {
  vi.useFakeTimers();
  const module = {};
  const chunk = Promise.withResolvers<typeof module>();
  const loader = vi.fn(() => chunk.promise);
  const load = createFigureLoader(loader);
  const selection = load();
  await vi.advanceTimersByTimeAsync(FIGURE_LOAD_TIMEOUT_MS - 1);
  chunk.resolve(module);
  await expect(selection).resolves.toBe(module);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(2);
  await expect(load()).resolves.toBe(module);
  expect(loader).toHaveBeenCalledTimes(1);
});

it('expires at the deadline and discards a module that arrives after it', async () => {
  vi.useFakeTimers();
  const chunk = Promise.withResolvers<object>();
  const loader = vi.fn(() => chunk.promise);
  const load = createFigureLoader(loader);
  const preload = load();
  const selection = load();
  expect(selection).toBe(preload);
  await vi.advanceTimersByTimeAsync(FIGURE_LOAD_TIMEOUT_MS);
  await expect(selection).resolves.toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  chunk.resolve({});
  await chunk.promise;
  await expect(load()).resolves.toBeUndefined();
  expect(loader).toHaveBeenCalledTimes(1);
});
