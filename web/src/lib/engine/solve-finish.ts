/**
 * What every 3D solve does to the engine's answer before anyone reads it, wherever it ran.
 *
 * The main-thread wrappers (`wasm-solver.ts`) and the solver worker both finish a solve here, so
 * a result cannot depend on the thread that produced it. That was not so: the worker only dropped
 * the stabilised reactions, and every worker solve (PRO's Solve, live calc, the direct analysis)
 * read the average axial force of a loaded member where the main thread read its end forces.
 *
 * Depends on types and pure modules only: the worker imports it (see `stabilised-reactions.ts`).
 */
import type { SolverSupport3D, SolverLoad3D } from './types-3d';
import { stripStabilisedReactions } from './stabilised-reactions';
import { axialShares, giveBackAxialShares } from './axial-shares';

type Input = { supports: Map<number, SolverSupport3D> | Record<string, SolverSupport3D>; loads?: readonly SolverLoad3D[] };
type Result = { reactions?: Array<{ nodeId: number }>; elementForces?: any[] };

/** A linear solve: the stabilised reactions out, the axial part of member loads back to its members. In place. */
export function finishSolve3D<T extends Result>(result: T, input: Input): T {
  return giveBackAxialShares(stripStabilisedReactions(result, input) as T & { elementForces: any[] }, axialShares(input.loads ?? []));
}

/** A P-Delta solve: the same, on its second-order and its linear results. In place. */
export function finishPDelta3D<T extends { results?: Result; linearResults?: Result }>(result: T, input: Input): T {
  if (result?.results) finishSolve3D(result.results, input);
  if (result?.linearResults) finishSolve3D(result.linearResults, input);
  return result;
}
