/**
 * Structural-solve counter.
 *
 * Incremented by the app's solve entry points in `solver-service.ts`. Exposed to
 * browser tests through the `?e2e=1` hooks so a Playwright spec can assert
 * "a reinforcement-only edit triggers ZERO structural solves" directly, instead of
 * inferring it from timing or network activity.
 *
 * Deliberately placed OUTSIDE the solver: it counts app-side dispatches, which is
 * exactly the property the UI contract is about.
 */

let solveCount = 0;

export function noteStructuralSolve(): void {
  solveCount += 1;
}

export function getStructuralSolveCount(): number {
  return solveCount;
}

/** Test-only reset. */
export function _resetStructuralSolveCount(): void {
  solveCount = 0;
}
