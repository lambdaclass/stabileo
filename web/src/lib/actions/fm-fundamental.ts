/**
 * Re-solving the open force-method wizard with the reader's choices: the
 * releases that make the primary structure, and the axial term. A wrong set
 * of releases is not solved; the store keeps why, to say it next to the list.
 */
import { modelStore, uiStore, fmStepsStore } from '../store';
import { fmChoice, type FmChoiceError } from '../store/fm-choice.svelte';
import { solveForceMethod, ForceMethodError, FM_MAX_GH } from '../engine/force-method/solve';

const xName = (i: number) => `X${String(i).split('').map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('')}`;

export function choiceError(e: unknown): FmChoiceError {
  if (!(e instanceof ForceMethodError)) return { key: 'course.statics.err.noRedundants', params: {}, nodes: [] };
  const d = e.detail;
  const nodes = d.nodes ?? [];
  const params: Record<string, string | number> = {
    gh: e.gh, max: FM_MAX_GH, chosen: d.chosen ?? 0,
    nodes: nodes.join(', '), node: nodes[0] ?? '', k: d.k ?? 0, k1: Math.max(0, (d.k ?? 1) - 1),
    which: (d.which ?? []).map(xName).join(', '),
  };
  return { key: `course.statics.err.${e.key}`, params, nodes };
}

/** Solve again with `releases` (null: the method chooses) and `axial`, each kept as it is when not given. */
export function resolveFlexibility(next: { releases?: string[] | null; axial?: boolean }): boolean {
  const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
  if (!input) return false;
  const releases = next.releases !== undefined ? next.releases : fmChoice.applied;
  const axial = next.axial ?? fmChoice.axial;
  try {
    const result = solveForceMethod(input as never, { axial, ...(releases ? { releases } : {}) });
    fmChoice.setAxial(axial);
    fmChoice.solvedWith(releases, modelStore.modelVersion);
    fmStepsStore.replaceResult(result);
    return true;
  } catch (e) {
    fmChoice.fail(choiceError(e));
    return false;
  }
}
