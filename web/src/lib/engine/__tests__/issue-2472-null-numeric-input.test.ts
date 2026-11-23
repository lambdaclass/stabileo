import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { runDirectAnalysis } from '../direct-analysis';
import {
  buildSolverInput2D, buildSolverInput3D, solveCombinations2D, solveCombinations3D,
  solveCombinations3DParallel, validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D,
  validateAndSolve3DAsync,
} from '../solver-service';
import { input2DToWireObject, input3DToWireObject } from '../wasm-solver';
import * as wasm from '../../wasm/dedaliano_engine.js';

const knownWrong = process.env.RUN_KNOWN_WRONG === '2472' ? it : it.skip;
const cases = [{ id: 1, name: 'Load', type: 'D' as const }];
const combinations = [{ id: 1, name: 'Load', factors: [{ caseId: 1, factor: 1 }] }];

beforeEach(() => {
  uiStore.analysisMode = '2d';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  modelStore.clear();
});

function cantilever(uplift = false) {
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(2, 0, 0);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupportEntry({ nodeId: root, type: 'fixed', ...(uplift ? { uplift } : {}) });
  const model = modelStore.model;
  model.loads = [{ type: 'pointOnElement', data: { id: 1, elementId: member, caseId: 1, a: 1, p: -10 } }];
  return model;
}

async function modelSolves(model: ReturnType<typeof cantilever>, space: boolean) {
  if (!space) return {
    sync: validateAndSolve2D(model),
    async: await validateAndSolve2DAsync(model),
    combination: solveCombinations2D(model, cases, combinations),
  };
  return {
    sync: validateAndSolve3D(model),
    async: await validateAndSolve3DAsync(model),
    combination: solveCombinations3D(model, cases, combinations),
    parallel: await solveCombinations3DParallel(model, cases, combinations),
    direct: await runDirectAnalysis(model, cases, combinations, { includeSelfWeight: false }),
  };
}

knownWrong('known wrong result: #2472 a direct planar point load refuses null in 2D and 3D', async () => {
  for (const [space, uplift] of [[false, false], [true, false], [true, true]]) {
    const model = cantilever(uplift);
    Object.assign(model.loads[0]!.data, { my: null });
    for (const [path, result] of Object.entries(await modelSolves(model, space))) {
      expect.soft(typeof result === 'string' ? result : 'solve returned ' + typeof result, `${space}/${uplift}/${path}`)
        .toMatch(/\bmy\b/);
    }
  }
});

knownWrong('known wrong result: #2472 malformed model numbers refuse before projection and defaults', async () => {
  for (const space of [false, true]) {
    for (const [field, bad] of [['mz', null], ['px', null], ['p', undefined], ['angle', '0']] as const) {
      const model = cantilever();
      Object.assign(model.loads[0]!.data, { [field]: bad });
      const solved = space ? validateAndSolve3D(model) : validateAndSolve2D(model);
      expect.soft(typeof solved === 'string' ? solved : 'solve returned ' + typeof solved, `${space}/${field}`)
        .toMatch(new RegExp(`\\b${field}\\b`));
    }
    for (const [kind, field] of [['supports', 'kx'], ['materials', 'alpha']] as const) {
      const model = cantilever();
      Object.assign(model[kind].values().next().value!, { [field]: null });
      const solved = space ? validateAndSolve3D(model) : validateAndSolve2D(model);
      expect.soft(typeof solved === 'string' ? solved : 'solve returned ' + typeof solved, `${space}/${kind}`)
        .toMatch(new RegExp(`\\b${field}\\b`));
    }
  }
});

knownWrong('known wrong result: #2472 WASM linear and P-Delta decode numeric fields before solving', () => {
  const model = cantilever();
  const plane = input2DToWireObject(buildSolverInput2D(model)!);
  const space = input3DToWireObject(buildSolverInput3D(model)!);
  for (const [input, linear, pdelta] of [
    [plane, wasm.solve_2d, wasm.solve_pdelta_2d],
    [space, wasm.solve_3d, wasm.solve_pdelta_3d],
  ] as const) {
    expect(linear(input).reactions).toHaveLength(1);
    expect(JSON.parse(pdelta(JSON.stringify(input), 20, 1e-8)).results.reactions).toHaveLength(1);
    for (const field of ['my', 'px', 'kx', 'e']) {
      const malformed = structuredClone(input);
      const record = field === 'kx' ? Object.values(malformed.supports)[0]!
        : field === 'e' ? Object.values(malformed.materials)[0]! : malformed.loads[0]!.data;
      Object.assign(record, { [field]: null });
      const named = new RegExp(`\\b${field}\\b`);
      expect.soft(() => linear(malformed), `linear/${field}`).toThrow(named);
      expect.soft(() => pdelta(JSON.stringify(malformed), 20, 1e-8), `pdelta/${field}`).toThrow(named);
    }
    const nonfinite = structuredClone(input);
    Object.assign(Object.values(nonfinite.materials)[0]!, { e: NaN });
    expect.soft(() => linear(nonfinite)).toThrow(/\be\b/);
  }
});

it('#2472 keeps omitted and explicit-zero planar moments and applies a finite legacy alias', () => {
  const model = cantilever();
  for (const space of [false, true]) {
    const solve = space ? validateAndSolve3D : validateAndSolve2D;
    const result = () => {
      const solved = solve(model);
      if (!solved || typeof solved === 'string') throw new Error(String(solved));
      return solved.reactions[0]!.my;
    };
    const load = model.loads[0]!.data;
    delete (load as { my?: number }).my;
    delete (load as { mz?: number }).mz;
    const omitted = result();
    Object.assign(load, { my: 0 });
    expect(result()).toBe(omitted);
    Object.assign(load, { mz: 5 });
    expect(Math.abs(result() - omitted)).toBeCloseTo(5, 8);
  }
});
