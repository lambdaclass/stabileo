/**
 * The core catalog entries: the two interactive wizards and the Galerkin
 * worked example, with the same applicability checks used to build them.
 */
import type { ExplainedMethod } from '../registry';
import { tx } from '../doc';
import { stepByStepScope, STEP_BY_STEP_MAX_DOFS } from '../../step-by-step-scope';
import { countIndeterminacy } from '../../force-method/primary';
import { FM_MAX_GH } from '../../force-method/solve';
import { buildGalerkin, galerkinApplies } from '../galerkin';

const scope = (input: Parameters<typeof stepByStepScope>[0]) => {
  const v = stepByStepScope(input, false);
  return v.ok ? null : tx(`sbs.scope.${v.reason}`, { n: v.dofs, max: STEP_BY_STEP_MAX_DOFS });
};

export const methods: ExplainedMethod[] = [
  {
    id: 'dsm', group: 'stiffness', example: 'portal-frame', wizard: 'dsm',
    applies: ({ input }) => {
      const r = scope(input);
      return r ? { ok: false, reason: r } : { ok: true };
    },
  },
  { id: 'galerkin', group: 'stiffness', example: 'galerkin-bar', applies: galerkinApplies, build: buildGalerkin },
  {
    id: 'fm', group: 'flexibility', example: 'portal-frame', wizard: 'fm',
    applies: ({ input }) => {
      const r = scope(input);
      if (r) return { ok: false, reason: r };
      const gh = countIndeterminacy(input).gh;
      if (gh < 0) return { ok: false, reason: tx('fm.err.hypostatic') };
      if (gh > FM_MAX_GH) return { ok: false, reason: tx('fm.err.tooHyperstatic', { gh, max: FM_MAX_GH }) };
      return { ok: true };
    },
  },
];
