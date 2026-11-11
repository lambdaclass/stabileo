type Frame = (callback: () => void) => number;
type CancelFrame = (handle: number) => void;

const nextFrame: Frame = (callback) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : setTimeout(callback, 16) as unknown as number);
const cancelNextFrame: CancelFrame = (handle) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(handle) : clearTimeout(handle));

/**
 * Runs `solve` at most once per animation frame and never twice at once: inputs requested while a
 * solve is running are coalesced, and only the latest is solved next. `settle` sees each answer in
 * order with the input it answers and whether a newer input is already waiting.
 */
export function liveSolver<I, O>(
  solve: (input: I) => Promise<O> | O,
  settle: (outcome: { ok: true; value: O } | { ok: false; error: unknown }, input: I, superseded: boolean) => void,
  frame: Frame = nextFrame,
  cancel: CancelFrame = cancelNextFrame,
) {
  let waiting: { input: I } | null = null;
  let running = false;
  let handle: number | null = null;
  let stopped = false;

  function schedule() {
    if (handle === null && !running && waiting && !stopped) handle = frame(flush);
  }

  async function flush() {
    handle = null;
    if (!waiting || running || stopped) return;
    const { input } = waiting;
    waiting = null;
    running = true;
    let outcome: { ok: true; value: O } | { ok: false; error: unknown };
    try {
      outcome = { ok: true, value: await solve(input) };
    } catch (error) {
      outcome = { ok: false, error };
    }
    running = false;
    if (!stopped) settle(outcome, input, waiting !== null);
    schedule();
  }

  return {
    request(input: I) {
      waiting = { input };
      schedule();
    },
    get busy() {
      return running || waiting !== null;
    },
    stop() {
      stopped = true;
      waiting = null;
      if (handle !== null) cancel(handle);
      handle = null;
    },
  };
}
