/**
 * The reaction filter for vanishing rotational springs, on its own.
 *
 * `orphan-rotations-3d.ts` adds the springs and needs the local axes, which
 * pull in the i18n store — a `.svelte.ts` module whose runes are not compiled
 * inside a web worker. The solver worker and `wasm-solver` only need this
 * filter, and importing it from there killed every worker at start-up with
 * "$state is not defined": the combinations fell back to the main thread.
 * So it depends on types alone, and the worker imports it from here.
 */
import type { SolverSupport3D } from './types-3d';

/**
 * Drop the reaction entries of nodes that had no support of their own and
 * only gained a vanishing spring — the solver reports them, as zeros. Takes
 * the wire object or the input: both carry `supports` with the mark.
 */
export function stripStabilisedReactions<T extends { reactions?: Array<{ nodeId: number }> }>(
  result: T, input: { supports: Map<number, SolverSupport3D> | Record<string, SolverSupport3D> },
): T {
  if (!result?.reactions) return result;
  const sups = input.supports instanceof Map ? [...input.supports.values()] : Object.values(input.supports ?? {});
  const created = new Set(sups.filter((s) => s?.stabilised === 'created').map((s) => s.nodeId));
  if (created.size === 0) return result;
  result.reactions = result.reactions.filter((r) => !created.has(r.nodeId));
  return result;
}
