/**
 * How the solve the engineer asked for is going: the step it is on, how many load cases are done of
 * how many, and once it ends, whether it worked and what it left to read. Live calc does not report
 * here: it runs on every edit and would flash a card at each one.
 */
export type SolvePhase = 'prepare' | 'mesh' | 'single' | 'cases' | 'combine' | 'done' | 'failed';

export interface SolveProgress {
  phase: SolvePhase;
  done: number;
  total: number;
  startedAt: number;
  /** When the load cases began and when the last of them finished, for the time left. */
  casesAt?: number;
  doneAt?: number;
  endedAt?: number;
  error?: string;
  warnings: number;
}

let now = $state.raw<SolveProgress | null>(null);

export const solveProgress = {
  get now() { return now; },
  begin(at = performance.now()): void {
    now = { phase: 'prepare', done: 0, total: 0, startedAt: at, warnings: 0 };
  },
  step(phase: Exclude<SolvePhase, 'done' | 'failed'>, done = 0, total = 0, at = performance.now()): void {
    if (!now || now.phase === 'done' || now.phase === 'failed') return;
    now = { ...now, phase, done, total, ...(phase === 'cases' && now.phase !== 'cases' ? { casesAt: at } : {}), ...(phase === 'cases' && done !== now.done ? { doneAt: at } : {}) };
  },
  finish(outcome: { ok: true; warnings: number } | { ok: false; error: string; warnings: number }, at = performance.now()): void {
    if (!now) return;
    now = { ...now, phase: outcome.ok ? 'done' : 'failed', endedAt: at, warnings: outcome.warnings, ...(outcome.ok ? {} : { error: outcome.error }) };
  },
  dismiss(): void { now = null; },
};

/** Seconds left on the load cases at the pace of those done, counted down from the last to finish; null before there is a pace. */
export function secondsLeft(p: SolveProgress, at = performance.now()): number | null {
  if (p.phase !== 'cases' || p.casesAt === undefined || p.doneAt === undefined || p.done < 1 || p.total <= p.done) return null;
  return Math.max(0, ((p.doneAt - p.casesAt) / p.done) * (p.total - p.done) - (at - p.doneAt)) / 1000;
}
