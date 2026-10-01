import { beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { initSolver } from '../../wasm-solver';
import { planeModel } from '../plane-model';
import { solveReference } from '../reference';
import { methods as continuous } from '../methods/continuous';
import { methods as frames } from '../methods/frames';
import { stepsEs, stepsEn, stepsPt } from '../../../i18n/locales/steps';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

function context() {
  const input = modelStore.buildSolverInput(false)!;
  return { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] } };
}

for (const method of [...continuous, ...frames]) {
  for (const coupling of ['constraint', 'connector'] as const) {
    it(`${method.id} refuses an otherwise supported example with a ${coupling}`, async () => {
      await modelStore.loadExample(method.example!);
      expect(method.applies(context())).toEqual({ ok: true });
      const member = [...modelStore.elements.values()][0]!;
      if (coupling === 'constraint') {
        modelStore.addConstraint({ type: 'equalDOF', masterNode: member.nodeI, slaveNode: member.nodeJ, dofs: [4] });
      } else {
        modelStore.addConnector({ nodeI: member.nodeI, nodeJ: member.nodeJ, kAxial: 1e6, kShear: 1e6, kMoment: 1e3 });
      }
      const ctx = context();
      expect(ctx.ref).not.toBeNull();
      expect(method.applies(ctx)).toEqual({ ok: false, reason: { key: 'steps.req.constraints' } });
      for (const dict of [stepsEs, stepsEn, stepsPt]) expect(dict['steps.req.constraints']).toBeTypeOf('string');
    });
  }
}
