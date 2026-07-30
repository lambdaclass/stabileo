/**
 * The flagship run, shared by the coverage-invariant suites — computed once per FILE.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * These invariants have to be asserted against the real 408-member fixture through the real
 * production path; a smaller model would not exercise what they are about. But the run is
 * expensive, and the suite that used to hold them called `runDetailing` once per test — five
 * identical full runs of the same inputs, 8,6 s each. Measured, that was 43 s of a 47 s file,
 * and it was what pushed the CI worker past the reporter's RPC budget.
 *
 * So the run is memoised per module. Vitest isolates modules per test file, so each file gets
 * its own instance: the memo never crosses a file boundary, and no test can observe another
 * file's state. Within a file the result is READ-ONLY by contract — every assertion that uses
 * it inspects, none mutate — which is the same contract the previous file already relied on
 * for its solve-and-design step.
 *
 * This helper deliberately computes NOTHING the tests are about. It runs the production
 * entry points with production arguments and hands back what they returned; every invariant
 * is still asserted against a live result.
 */

import frame from '../../../../templates/fixtures/rc-design-frame.json';
import { runDesign } from '../../../design/candidate-search';
import { cirsoc201Adapter } from '../../../design/adapters/cirsoc201-adapter';
import { solveFixture, assertRealSolver } from '../../../design/__tests__/helpers';
import { runDetailing, type RunDetailingResult } from '../../run-detailing';
import type { MemberDesignOutcome } from '../../../design/outcome';

/** Solve + design the flagship. */
function computeRun() {
  assertRealSolver();
  const solved = solveFixture(frame);
  const summary = runDesign(cirsoc201Adapter, solved.contexts.values(), { maxRunMs: 180_000 });
  return { solved, summary };
}

let runCache: ReturnType<typeof computeRun> | null = null;

/** The solved and designed flagship. Same inputs, same result, once per file. */
export function flagshipRun(): ReturnType<typeof computeRun> {
  if (!runCache) runCache = computeRun();
  return runCache;
}

let detailCache: RunDetailingResult | null = null;

/** The flagship's detailing, through the production entry point. Once per file. */
export function flagshipDetailing(): RunDetailingResult {
  if (detailCache) return detailCache;
  const { solved, summary } = flagshipRun();
  detailCache = runDetailing({
    contexts: solved.contexts,
    outcomes: summary.outcomes as ReadonlyMap<number, MemberDesignOutcome>,
    nodes: solved.data.nodes as never,
    elements: solved.data.elements as never,
    edition: '2025',
    verifierId: 'coverage-invariant',
    demandRevision: 1,
    maxAggregateSizeMm: 19,
  });
  return detailCache;
}

/** How many members of a given kind the fixture carries. */
export function membersOfKind(kind: string): number[] {
  return [...flagshipRun().solved.contexts.values()]
    .filter((c) => c.elementType === kind).map((c) => c.elementId);
}
