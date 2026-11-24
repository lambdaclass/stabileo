import { beforeAll, beforeEach, expect, it } from 'vitest';
import { modelStore } from '../../store';
import { singleSolveModel, withCaseEffects } from '../case-effects';
import { runDirectAnalysis, workerPDelta } from '../direct-analysis';
import { finishPDelta3D } from '../solve-finish';
import { solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';
import { solveCombinations3D, solveCombinations3DParallel } from '../solver-service';
import { initSolver } from '../wasm-solver';

beforeAll(initSolver);
beforeEach(() => modelStore.clear());

function cantilever(planar = false) {
  const base = modelStore.addNode(0, 0, 0);
  const tip = planar ? modelStore.addNode(0, 4) : modelStore.addNode(0, 0, 4);
  modelStore.addElement(base, tip, 'frame');
  modelStore.addSupport(base, planar ? 'fixed' : 'fixed3d');
  const gravity = modelStore.model.loadCases[0]!.id;
  if (planar) modelStore.addNodalLoad(tip, 0, -10, 0, gravity);
  else modelStore.addNodalLoad3D(tip, 0, 0, -10, 0, 0, 0, gravity);

  const leaf = modelStore.addLoadCase('Empty reference', '');
  const composite = modelStore.addLoadCase('Composite reference', '');
  modelStore.updateLoadCaseFields(leaf, { reference: true });
  modelStore.updateLoadCaseFields(composite, { reference: true });
  const model = modelStore.model;
  const controlCases = model.loadCases.filter(({ id }) => id !== composite && id !== leaf);
  const combo = { id: 1, name: 'Gravity', factors: [{ caseId: gravity, factor: 1 }] };
  const setOverflow = (factor: number) => modelStore.updateLoadCaseFields(composite, {
    includes: [{ caseId: leaf, factor }, { caseId: leaf, factor }],
  });
  setOverflow(Number.MAX_VALUE);
  const overflowRefusal = `Cannot combine results: load case ${leaf} has a non-finite number at net factor=inf`;
  return { tip, model, gravity, composite, controlCases, combo, setOverflow, overflowRefusal };
}

for (const method of ['linear', 'pdelta', 'solveEach', 'superpose'] as const) {
  for (const solve of [solveCombinations3D, solveCombinations3DParallel]) {
    it(`#2297 ${solve.name} skips unrelated inclusion overflow for ${method}`, async () => {
      const { tip, model, gravity, composite, controlCases, combo, setOverflow, overflowRefusal } = cantilever();
      if (method === 'pdelta') modelStore.adoptAnalysis({ perCombination: 'pdelta' });
      if (method === 'solveEach' || method === 'superpose') {
        const support = modelStore.addSupport(tip, 'custom3d', undefined, {
          dofRestraints: { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false },
        });
        modelStore.updateSupport(support, { curves: { z: [[0.01, 100], [0.05, 150]] } });
        modelStore.adoptAnalysis({ combinationMethod: method });
      }
      const read = async (cases: typeof controlCases) => {
        const result = await solve(model, cases, [combo]);
        return result && typeof result !== 'string' ? result.perCombo.get(1)?.displacements : result;
      };
      const expected = await read(controlCases);
      if (!Array.isArray(expected)) throw new Error(String(expected));
      expect(expected.find(row => row.nodeId === tip)?.uz).toBeLessThan(0);
      expect.soft(await read(model.loadCases)).toEqual(expected);

      modelStore.updateLoadCaseFields(gravity, { includes: [
        { caseId: composite, factor: 1 }, { caseId: composite, factor: -1 },
      ] });
      expect.soft(await read(model.loadCases)).toEqual(expected);
      modelStore.updateLoadCaseFields(gravity, { includes: [{ caseId: composite, factor: 1 }] });
      setOverflow(Number.MAX_VALUE / 2);
      expect.soft(await read(model.loadCases)).toEqual(expected);
      setOverflow(Number.MAX_VALUE);
      expect(await read(model.loadCases)).toBe(overflowRefusal);
    });
  }
}

for (const dimension of ['planar', 'spatial']) {
  for (const path of ['main thread', 'worker', 'worker fallback']) {
    it(`#2297 direct analysis skips unrelated inclusion overflow for ${dimension} on the ${path}`, async () => {
      const { model, gravity, composite, controlCases, combo, setOverflow, overflowRefusal } = cantilever(dimension === 'planar');
      let workerCalls = 0;
      const run = path === 'main thread' ? undefined : workerPDelta(async (wire, maxIter, tol) => {
        workerCalls++;
        if (path === 'worker fallback') throw new Error('Worker unavailable');
        const answer = JSON.parse(solve_pdelta_3d(JSON.stringify(wire), maxIter, tol));
        return finishPDelta3D(answer, wire as Parameters<typeof finishPDelta3D>[1]);
      });
      const read = (cases: typeof controlCases) => runDirectAnalysis(model, cases, [combo], { includeSelfWeight: false, run });
      const control = await read(controlCases);
      if (typeof control === 'string') throw new Error(control);
      expect(control.perCombo.has(1)).toBe(true);
      if (path !== 'main thread') expect(workerCalls).toBeGreaterThan(0);
      expect.soft(await read(model.loadCases)).toEqual(control);

      modelStore.updateLoadCaseFields(gravity, { includes: [{ caseId: composite, factor: 1 }] });
      expect(await read(model.loadCases)).toBe(overflowRefusal);
      setOverflow(Number.MAX_VALUE / 2);
      expect(await read(model.loadCases)).toEqual(control);
    });
  }
}

it('#2297 scoped inclusion assembly validates active transitive and notional dependencies', () => {
  const { model, gravity, composite, setOverflow } = cantilever();
  const opts = { includeSelfWeight: false, leftHand: false };
  const assemble = (target: number) => withCaseEffects(model, model.loadCases, opts, new Set([target]));
  const notional = modelStore.addLoadCase('N', 'N');
  modelStore.updateLoadCaseFields(notional, { reference: true, notional: { sourceCaseId: composite, ratio: 0.002, dir: '+X' } });
  const control = assemble(gravity).loads;
  expect(control).toHaveLength(1);
  expect(() => assemble(composite)).toThrow(/net factor=inf/);
  expect(() => assemble(notional)).toThrow(/net factor=inf/);
  modelStore.updateLoadCaseFields(gravity, { includes: [{ caseId: composite, factor: 1 }] });
  expect(() => assemble(gravity)).toThrow(/net factor=inf/);
  setOverflow(Number.MAX_VALUE / 2);
  expect(assemble(gravity).loads).toEqual(control);
  expect(assemble(notional).loads).toEqual([]);
});

it('#2297 single-solve assembly skips unused reference inclusions', () => {
  const { model, gravity, composite, controlCases, setOverflow } = cantilever();
  const control = singleSolveModel(model, controlCases).loads;
  expect(control).toHaveLength(1);
  expect(singleSolveModel(model, model.loadCases).loads).toEqual(control);
  modelStore.updateLoadCaseFields(gravity, { includes: [{ caseId: composite, factor: 1 }] });
  expect(() => singleSolveModel(model, model.loadCases)).toThrow(/net factor=inf/);
  setOverflow(Number.MAX_VALUE / 2);
  expect(singleSolveModel(model, model.loadCases).loads).toEqual(control);
});
