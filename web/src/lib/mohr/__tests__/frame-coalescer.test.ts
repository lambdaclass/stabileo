import { describe, it, expect, vi, afterEach } from 'vitest';
import { frameCoalescer } from '../frame-coalescer';

describe('frame coalescer', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeFrames() {
    const queue = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.set(++id, cb); return id; });
    vi.stubGlobal('cancelAnimationFrame', (n: number) => { queue.delete(n); });
    return { tick() { const cbs = [...queue.values()]; queue.clear(); for (const cb of cbs) cb(0); }, pending: () => queue.size };
  }

  it('many moves in one frame apply once, with their sum', () => {
    const frames = fakeFrames();
    const applied: [number, number][] = [];
    const c = frameCoalescer((x, y) => applied.push([x, y]));
    for (let i = 0; i < 50; i++) c.add(2, -1);
    expect(frames.pending()).toBe(1);
    expect(applied).toEqual([]);
    frames.tick();
    expect(applied).toEqual([[100, -50]]);
    c.add(1, 1);
    frames.tick();
    expect(applied).toEqual([[100, -50], [1, 1]]);
  });

  it('flush applies what is pending at once, and cancel drops it', () => {
    const frames = fakeFrames();
    const applied: [number, number][] = [];
    const c = frameCoalescer((x, y) => applied.push([x, y]));
    c.add(3, 4);
    c.flush();
    expect(applied).toEqual([[3, 4]]);
    expect(frames.pending()).toBe(0);
    c.add(5, 5);
    c.cancel();
    frames.tick();
    c.flush();
    expect(applied).toEqual([[3, 4]]);
  });
});
