import { describe, expect, it } from 'vitest';
import { setImmediate } from 'node:timers';

let progressDelivered = false;

describe.sequential('worker progress between synchronous test cases', () => {
  it('queues a worker callback while the first test still owns the event loop', () => {
    setImmediate(() => { progressDelivered = true; });
    expect(progressDelivered).toBe(false);
  });

  it('delivers the pending callback before the next synchronous test', () => {
    expect(progressDelivered).toBe(true);
  });
});
