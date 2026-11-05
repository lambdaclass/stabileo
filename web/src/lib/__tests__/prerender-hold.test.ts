import { afterEach, describe, expect, it } from 'vitest';
import { holdPrerender } from '../prerender-hold';

const holds = () => (globalThis as { __prerenderHolds?: number }).__prerenderHolds ?? 0;
const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

afterEach(() => { delete (globalThis as { __prerenderHolds?: number }).__prerenderHolds; });

describe('holdPrerender (#1452)', () => {
  it('holds the capture from the call until a task after the work settles, so the result is rendered first', async () => {
    let finish!: (value: string) => void;
    const work = new Promise<string>(resolve => { finish = resolve; });
    const seen: number[] = [];
    const held = holdPrerender(work).then(value => { seen.push(holds()); return value; });
    expect(holds()).toBe(1);
    finish('replay');
    await expect(held).resolves.toBe('replay');
    await Promise.resolve();
    expect(seen).toEqual([1]);
    expect(holds()).toBe(1);
    await nextTask();
    expect(holds()).toBe(0);
  });

  it('a failed load releases its hold too, and overlapping holds release independently', async () => {
    let fail!: (error: Error) => void;
    const first = holdPrerender(new Promise<never>((_, reject) => { fail = reject; }));
    let finish!: () => void;
    const second = holdPrerender(new Promise<void>(resolve => { finish = resolve; }));
    expect(holds()).toBe(2);
    fail(new Error('offline'));
    await expect(first).rejects.toThrow('offline');
    await nextTask();
    expect(holds()).toBe(1);
    finish();
    await second;
    await nextTask();
    expect(holds()).toBe(0);
  });

  it('returns the same promise it was given', () => {
    const work = Promise.resolve(1);
    expect(holdPrerender(work)).toBe(work);
  });
});
