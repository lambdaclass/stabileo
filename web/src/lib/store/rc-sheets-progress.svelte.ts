/** How far the sheets' design has got, for the card at the viewer's foot; apart, so the card imports none of the sheets. */
export interface SheetProgress {
  phase: 'demands' | 'design' | 'foundations';
  done: number;
  total: number;
  /** While the foundation layouts are compared: the one being designed, which of how many, and how far through its footings or the levelling of their founding level. */
  layout?: { system: string; index: number; count: number; footing: number; footings: number; levelling: boolean };
}

export const sheetsProgress = $state<{ now: SheetProgress | null; startedAt: number | null }>({ now: null, startedAt: null });

/** Seconds the run still needs at the pace it has kept, once it has gone long enough for that pace to mean something. */
export function sheetsSecondsLeft(p: SheetProgress, startedAt: number | null, at = performance.now()): number | null {
  if (startedAt === null || p.total <= 0 || p.done <= 0 || p.done >= p.total) return null;
  const elapsed = at - startedAt;
  if (elapsed < 1500 || p.done / p.total < 0.05) return null;
  return (elapsed / p.done) * (p.total - p.done) / 1000;
}
