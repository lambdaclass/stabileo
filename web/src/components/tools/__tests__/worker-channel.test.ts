import { describe, expect, it } from 'vitest';
import { workerChannel } from '../worker-channel';

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: { token: number; n: number }[] = [];
  terminated = false;
  postMessage(message: { token: number; n: number }) { this.posted.push(message); }
  terminate() { this.terminated = true; }
  answer(token: number, outcome: string) { this.onmessage?.({ data: { token, outcome } } as MessageEvent); }
  fail(message: string) { this.onerror?.({ message } as ErrorEvent); }
}

describe('worker channel', () => {
  it('answers each request by its token', async () => {
    const workers: FakeWorker[] = [];
    const channel = workerChannel<{ n: number }, string>(() => { const w = new FakeWorker(); workers.push(w); return w; }, reason => `failed: ${reason}`);
    const a = channel.post({ n: 1 }), b = channel.post({ n: 2 });
    workers[0].answer(workers[0].posted[1].token, 'two');
    workers[0].answer(workers[0].posted[0].token, 'one');
    expect(await Promise.all([a, b])).toEqual(['one', 'two']);
    expect(workers).toHaveLength(1);
  });

  it('drops a worker that errors, answers what it held, and starts a fresh one for the next request', async () => {
    const workers: FakeWorker[] = [];
    const channel = workerChannel<{ n: number }, string>(() => { const w = new FakeWorker(); workers.push(w); return w; }, reason => `failed: ${reason}`);
    const held = channel.post({ n: 1 });
    workers[0].fail('module failed to load');
    expect(await held).toBe('failed: module failed to load');
    expect(workers[0].terminated).toBe(true);
    const next = channel.post({ n: 2 });
    expect(workers).toHaveLength(2);
    expect(workers[1].posted).toEqual([expect.objectContaining({ n: 2 })]);
    workers[0].fail('late error from the dropped worker');
    workers[1].answer(workers[1].posted[0].token, 'two');
    expect(await next).toBe('two');
  });
});
