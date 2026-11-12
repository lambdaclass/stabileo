export type Clock = {
  frame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  after: (callback: () => void, ms: number) => number;
  cancelAfter: (handle: number) => void;
  now: () => number;
};

const browserClock: Clock = {
  frame: (callback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 16) as unknown as number),
  cancelFrame: (handle) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(handle) : clearTimeout(handle)),
  after: (callback, ms) => setTimeout(callback, ms) as unknown as number,
  cancelAfter: (handle) => clearTimeout(handle),
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
};

/** The pause after the last change before a heavier tool solves: a drag is solved when it pauses, not at every frame. */
export const SOLVE_DELAY = 120;

type Outcome<O> = { ok: true; value: O } | { ok: false; error: unknown };

/**
 * Runs `solve` at most once per animation frame and never twice at once: inputs requested while a
 * solve is running are coalesced, and only the latest is solved next. With `delay`, a solve waits
 * until no input has arrived for that long. `settle` sees each answer in order with the input it
 * answers and whether a newer input is already waiting; an error it throws goes to `onError` and
 * does not stop the inputs still waiting.
 */
export function liveSolver<I, O>(
  solve: (input: I) => Promise<O> | O,
  settle: (outcome: Outcome<O>, input: I, superseded: boolean) => void,
  options: { delay?: number | (() => number); clock?: Partial<Clock>; onError?: (error: unknown) => void } = {},
) {
  const clock = { ...browserClock, ...options.clock };
  const delay = typeof options.delay === 'function' ? options.delay : () => (options.delay as number | undefined) ?? 0;
  const onError = options.onError ?? ((error: unknown) => console.error('Live solve failed to settle', error));
  let waiting: { input: I } | null = null;
  let running = false;
  let pending: { kind: 'frame' | 'after'; handle: number } | null = null;
  let stopped = false;
  let requestedAt = -Infinity;

  function cancelPending() {
    if (!pending) return;
    if (pending.kind === 'frame') clock.cancelFrame(pending.handle);
    else clock.cancelAfter(pending.handle);
    pending = null;
  }

  function schedule() {
    if (pending || running || !waiting || stopped) return;
    const wait = delay() - (clock.now() - requestedAt);
    if (wait > 0) pending = { kind: 'after', handle: clock.after(() => { pending = null; schedule(); }, wait) };
    else pending = { kind: 'frame', handle: clock.frame(() => { pending = null; void flush(); }) };
  }

  async function flush() {
    if (!waiting || running || stopped) return;
    const { input } = waiting;
    waiting = null;
    running = true;
    let outcome: Outcome<O>;
    try {
      outcome = { ok: true, value: await solve(input) };
    } catch (error) {
      outcome = { ok: false, error };
    }
    running = false;
    try {
      if (!stopped) settle(outcome, input, waiting !== null);
    } catch (error) {
      onError(error);
    } finally {
      schedule();
    }
  }

  return {
    request(input: I) {
      waiting = { input };
      requestedAt = clock.now();
      if (pending?.kind === 'after') cancelPending();
      schedule();
    },
    get busy() {
      return running || waiting !== null;
    },
    stop() {
      stopped = true;
      waiting = null;
      cancelPending();
    },
  };
}
