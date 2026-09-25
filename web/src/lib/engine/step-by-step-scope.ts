/**
 * What the two step-by-step wizards can honestly show.
 *
 * Both are teaching tools built on bars: frame members and truss bars, their
 * matrices written out in full. A model with shells, constraints or
 * connectors is solved by the analysis solver with machinery the wizards do
 * not have, and showing their matrices without those parts would be showing
 * the matrices of a different structure — which is exactly what happened
 * before this check: the wizard ignored the slabs and solved what was left.
 *
 * Size is the other limit. Step 4 prints the global K, cell by cell; at a
 * thousand DOFs that is a million cells, the panel freezes, and nothing is
 * learnt from it anyway. 360 DOFs is sixty space-frame nodes or a hundred and
 * twenty plane-frame nodes: every classroom structure, and the small examples.
 */
import type { SolverInput } from './types';
import type { SolverInput3D } from './types-3d';

export const STEP_BY_STEP_MAX_DOFS = 360;

export type ScopeVerdict =
  | { ok: true; dofs: number }
  | { ok: false; reason: 'shells' | 'constraints' | 'connectors' | 'tooBig' | 'empty'; dofs: number };

export function stepByStepScope(input: SolverInput | SolverInput3D, is3D: boolean): ScopeVerdict {
  const elements = [...input.elements.values()];
  if (elements.length === 0) return { ok: false, reason: 'empty', dofs: 0 };
  const i3 = input as SolverInput3D;
  const shells = (i3.plates?.size ?? 0) + (i3.quads?.size ?? 0) + (i3.curvedShells?.size ?? 0);
  const hasFrame = elements.some((e) => e.type === 'frame');
  const perNode = is3D ? (hasFrame ? 6 : 3) : (hasFrame ? 3 : 2);
  const dofs = input.nodes.size * perNode;
  if (shells > 0) return { ok: false, reason: 'shells', dofs };
  if ((input.constraints?.length ?? 0) > 0) return { ok: false, reason: 'constraints', dofs };
  if ((input.connectors?.size ?? 0) > 0) return { ok: false, reason: 'connectors', dofs };
  if (dofs > STEP_BY_STEP_MAX_DOFS) return { ok: false, reason: 'tooBig', dofs };
  return { ok: true, dofs };
}
