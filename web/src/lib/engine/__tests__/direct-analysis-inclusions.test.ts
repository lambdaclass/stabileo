import { beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { mainThreadPDelta, runDirectAnalysis, workerPDelta } from '../direct-analysis';
import { finishPDelta3D } from '../solve-finish';
import { initSolver } from '../wasm-solver';
import { solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

const knownWrong = process.env.RUN_KNOWN_WRONG === '2297' ? it : it.skip;

function cantilever(planar: boolean) {
  const base = modelStore.addNode(0, 0, 0);
  const tip = planar ? modelStore.addNode(0, 4) : modelStore.addNode(0, 0, 4);
  modelStore.addElement(base, tip, 'frame');
  modelStore.addSupport(base, planar ? 'fixed' : 'fixed3d');
  const gravity = modelStore.model.loadCases[0]!.id;
  const notional = modelStore.addLoadCase('Notional', 'N');
  if (planar) {
    modelStore.addNodalLoad(tip, 0, -10, 0, gravity);
    modelStore.addNodalLoad(tip, 1, 0, 0, notional);
  } else {
    modelStore.addNodalLoad3D(tip, 0, 0, -10, 0, 0, 0, gravity);
    modelStore.addNodalLoad3D(tip, 1, 0, 0, 0, 0, 0, notional);
  }
  const outer = modelStore.addLoadCase('Outer', '');
  const model = modelStore.model;
  const solve = (caseId: number, factor: number, run = mainThreadPDelta) =>
    runDirectAnalysis(model, model.loadCases, [{
      id: 1, name: 'Gravity and notional',
      factors: [{ caseId: gravity, factor: 1 }, { caseId, factor }],
    }], { includeSelfWeight: false, settings: { notional: 0.002, tauB: 'unity' }, run });
  return { notional, outer, solve };
}

for (const dimension of ['planar', 'spatial']) {
  for (const path of ['main thread', 'worker', 'worker fallback']) {
    knownWrong(`known wrong result: #2297 direct analysis ignores nonexistent notional inclusions in ${dimension} on the ${path}`, async () => {
      const { notional, outer, solve } = cantilever(dimension === 'planar');
      const includes = [{ caseId: notional, factor: 1 }];
      let workerCalls = 0, workerAnswers = 0;
      const run = path === 'main thread' ? mainThreadPDelta : workerPDelta(async (wire, maxIter, tol) => {
        workerCalls++;
        if (path === 'worker fallback') throw new Error('Worker unavailable');
        const answer = finishPDelta3D(JSON.parse(solve_pdelta_3d(JSON.stringify(wire), maxIter, tol)), wire as Parameters<typeof finishPDelta3D>[1]);
        workerAnswers++;
        return answer;
      });

      modelStore.updateLoadCaseFields(outer, { includes });
      const control = await solve(outer, 1, run);
      if (typeof control === 'string') throw new Error(control);
      expect(control.info.get(1)?.notional).toBe('cases');
      expect(control.perCombo.has(1)).toBe(true);
      const before = workerCalls;
      const withExtra = (caseId: number, factor: number) => [
        ...includes, { caseId, factor }, { caseId, factor },
      ];
      for (const factor of [Number.MAX_VALUE / 2, Number.MAX_VALUE]) {
        modelStore.updateLoadCaseFields(outer, { includes: withExtra(999, factor) });
        const result = await solve(outer, 1, run);
        if (typeof result === 'string') throw new Error(result);
        expect(result).toEqual(control);
      }

      const empty = modelStore.addLoadCase('Existing empty case', '');
      modelStore.updateLoadCaseFields(outer, { includes: withExtra(empty, Number.MAX_VALUE / 2) });
      expect(await solve(outer, 1, run)).toEqual(control);
      modelStore.updateLoadCaseFields(outer, { includes: withExtra(empty, Number.MAX_VALUE) });
      expect(await solve(outer, 1, run)).toBe(
        `Cannot combine results: load case ${empty} has a non-finite number at net factor=inf`,
      );

      if (path !== 'main thread') expect(workerCalls).toBeGreaterThan(before);
      if (path === 'worker') expect(workerAnswers).toBe(workerCalls);
      if (path === 'worker fallback') expect(workerAnswers).toBe(0);
    });
  }
}
