/**
 * The steps a manual solve goes through after the engine hands back its load cases, said to whoever
 * listens (the progress card), with a frame let through after each so the page can draw it. Nobody
 * listening, nothing is said and nothing waits: live calc and the tests solve at full speed.
 */
export type SolveStep = 'shells' | 'combine' | 'envelope' | 'checks' | 'publish';

let listener: ((step: SolveStep, done: number, total: number) => void) | null = null;

export function onSolveStep(cb: ((step: SolveStep, done: number, total: number) => void) | null): void {
  listener = cb;
}

const nextFrame = () => new Promise<void>((resolve) => {
  if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && !document.hidden) requestAnimationFrame(() => setTimeout(resolve, 0));
  else setTimeout(resolve, 0);
});

export async function solveStep(step: SolveStep, done = 0, total = 0): Promise<void> {
  if (!listener) return;
  listener(step, done, total);
  await nextFrame();
}
