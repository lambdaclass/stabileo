/**
 * The steps a manual solve goes through after the engine hands back its load cases, said to whoever
 * listens (the progress card). A frame is let through at most every `YIELD_EVERY_MS`, and never in a
 * hidden tab, where timers are throttled to a second. Nobody listening, nothing is said and nothing
 * waits: live calc and the tests solve at full speed.
 */
export type SolveStep = 'shells' | 'combine' | 'envelope' | 'checks' | 'publish';
export type SolveStepReporter = (step: SolveStep, done?: number, total?: number) => Promise<void>;
type Listener = (step: SolveStep, done: number, total: number) => void;

export const YIELD_EVERY_MS = 50;

let listener: Listener | null = null;
let lastYield = -Infinity;

export function onSolveStep(cb: Listener | null): void {
  listener = cb;
}

const nextFrame = () => new Promise<void>((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
  else setTimeout(resolve, 0);
});

const hidden = () => typeof document !== 'undefined' && document.hidden;

/** Bound to the listener of the moment, so a solve that a newer one superseded keeps telling its own. */
export function solveSteps(): SolveStepReporter {
  const told = listener;
  return async (step, done = 0, total = 0) => {
    if (!told) return;
    told(step, done, total);
    const at = performance.now();
    if (hidden() || at - lastYield < YIELD_EVERY_MS) return;
    lastYield = at;
    await nextFrame();
    lastYield = performance.now();
  };
}
