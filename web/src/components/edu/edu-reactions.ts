/**
 * edu-reactions.ts — reading solver reactions the way Education grades them.
 *
 * Two defects motivated this module, both invisible until now because no test
 * covered `components/edu/**` and `.svelte` files were outside every type gate:
 *
 * 1. WRONG FIELD NAMES. Education read `reaction.ry` and `reaction.mz`. Those
 *    were the field names of the old TypeScript solver; the WASM migration
 *    (`Remove TS solver files, go WASM-only`) renamed them. The Rust struct
 *    serialises `rx`, `rz` and `my` — `ry`/`mz` survive only as *deserialise*
 *    aliases and are never emitted. So `reaction.ry` was `undefined` on every
 *    solve: every vertical-reaction answer graded incorrect (including the
 *    right one), every moment answer graded against a hard-coded 0, and the
 *    reveal button threw on `undefined.toFixed(2)`.
 *
 * 2. POSITIONAL MATCHING. `reactions[supportIndex]` assumed the solver returns
 *    reactions in the same order the exercise declares its supports. The
 *    engine's own tests never do this — they always look up by `nodeId` — and
 *    the exercises already carried a `nodeIndex` field that nothing read.
 *
 * Everything here reads through the shared display helpers in
 * `geometry/coordinate-system`, so Education grades exactly the numbers the
 * results table shows. No numerics live in this file.
 */

import type { AnalysisResults } from '../../lib/engine/types';
import {
  TWO_D_REACTION_LABELS,
  get2DDisplayReactionVertical,
  get2DDisplayMoment,
} from '../../lib/geometry/coordinate-system';
import { twoD } from '../../lib/axes/display';

/** The reaction components an exercise can ask about. */
export type ReactionDof = 'Rx' | 'Ry' | 'M';

export function reactionDofLabel(dof: string): string {
  return dof === 'Rx' ? TWO_D_REACTION_LABELS.horizontal : dof === 'Ry' ? TWO_D_REACTION_LABELS.vertical : dof;
}

/**
 * Node ids of the model an exercise built, in `addNode()` call order.
 *
 * `EduExercise.supports[].nodeIndex` is an index into this array, NOT a node
 * id: exercises are authored against their own construction order, while the
 * model store assigns ids from a counter shared with whatever was loaded
 * before. `EducativePanel` records the ids as it runs `exercise.build()`.
 */
export type NodeIdsByIndex = readonly number[];

/** Resolve an exercise-declared `nodeIndex` to the built model's node id. */
export function resolveSupportNodeId(
  nodeIndex: number,
  nodeIdsByIndex: NodeIdsByIndex,
): number | null {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 0) return null;
  return nodeIdsByIndex[nodeIndex] ?? null;
}

/**
 * Read one reaction component in the convention the application DISPLAYS.
 *
 * - `Rx` — horizontal, straight from the solver.
 * - `Ry` — vertical, positive upward. `get2DDisplayReactionVertical` resolves
 *   the current `rz` field and still accepts a legacy `ry` payload.
 * - `M`  — support moment, **negated**, because `ResultsTable` renders
 *   `-get2DDisplayMoment(r)`. Education must grade what the student can read
 *   on screen, so the sign flip belongs here too.
 *
 * Returns `null` when the reaction cannot be read at all (no results yet, or
 * the node carries no reaction) so callers can refuse to grade rather than
 * compare against a fabricated value.
 */
export function readDisplayedReaction(
  results: Pick<AnalysisResults, 'reactions'> | null | undefined,
  nodeId: number | null,
  dof: ReactionDof,
): number | null {
  if (!results || nodeId == null) return null;
  const reaction = results.reactions.find((r) => r.nodeId === nodeId);
  if (!reaction) return null;

  switch (dof) {
    case 'Rx':
      return Number.isFinite(reaction.rx) ? twoD.x(reaction.rx) : null;
    case 'Ry': {
      const vertical = get2DDisplayReactionVertical(reaction);
      return Number.isFinite(vertical) ? twoD.z(vertical) : null;
    }
    case 'M': {
      const moment = get2DDisplayMoment(reaction);
      return Number.isFinite(moment) ? twoD.rot(-moment) : null;
    }
    default:
      return null;
  }
}

/**
 * Convenience wrapper: resolve the support's node id, then read the component.
 * Returns `null` if either step fails.
 */
export function readSupportReaction(
  results: Pick<AnalysisResults, 'reactions'> | null | undefined,
  nodeIndex: number,
  nodeIdsByIndex: NodeIdsByIndex,
  dof: ReactionDof,
): number | null {
  return readDisplayedReaction(results, resolveSupportNodeId(nodeIndex, nodeIdsByIndex), dof);
}
