/**
 * What an incremental nonlinear solve (co-rotational) may show.
 *
 * When it does not converge, the engine reports `converged: false` and the last increment that
 * did converge, at `loadFactor` (a fraction of the applied load). The panel used to print "Not
 * converged" next to the peak displacement of the returned state, which read as the answer for the
 * model's loads; it was not even an equilibrium state (the engine returned the iterate it gave up
 * on). An unconverged solve now shows only how far it got, never displacements.
 */
export type IncrementalOutcome =
  | { kind: 'converged'; displacements: Array<{ ux?: number; uy?: number; uz?: number }> }
  | { kind: 'notConverged'; loadFactor: number };

export function incrementalOutcome(result: {
  converged?: boolean;
  loadFactor?: number;
  results?: { displacements?: Array<{ ux?: number; uy?: number; uz?: number }> };
}): IncrementalOutcome {
  if (result.converged === true) {
    return { kind: 'converged', displacements: result.results?.displacements ?? [] };
  }
  // Absent or not a number: nothing is known to have converged.
  const lf = typeof result.loadFactor === 'number' && Number.isFinite(result.loadFactor) ? result.loadFactor : 0;
  return { kind: 'notConverged', loadFactor: Math.min(Math.max(lf, 0), 1) };
}

/** The converged share of the load, in percent, rounded down so it never overstates. */
export function convergedPercent(loadFactor: number): string {
  return String(Math.floor(loadFactor * 1000) / 10);
}
