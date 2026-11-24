import { beforeEach, expect, it, vi } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { t } from '../../i18n';
import resultChange from '../../provenance/result-changes/invalid-solver-numbers.json';
import { runDirectAnalysis } from '../direct-analysis';
import {
  buildSolverInput2D, buildSolverInput3D, solveCombinations2D, solveCombinations3D,
  solveCombinations3DParallel, validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D,
  validateAndSolve3DAsync,
} from '../solver-service';
import { finiteObjectWire, input2DToWireObject, input3DToWireObject } from '../wasm-solver';
import * as wasm from '../../wasm/dedaliano_engine.js';

const review2472 = process.env.RUN_KNOWN_WRONG === '2472' ? it : it.skip;

const cases = [{ id: 1, name: 'Load', type: 'D' as const }];
const combinations = [{ id: 1, name: 'Load', factors: [{ caseId: 1, factor: 1 }] }];

beforeEach(() => {
  uiStore.analysisMode = '2d';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
});

function cantilever(uplift = false) {
  modelStore.clear();
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

it('#2472 a direct planar point load refuses null in 2D and 3D', async () => {
  for (const [space, uplift] of [[false, false], [true, false], [true, true]]) {
    const model = cantilever(uplift);
    Object.assign(model.loads[0]!.data, { my: null });
    for (const [path, result] of Object.entries(await modelSolves(model, space))) {
      expect.soft(typeof result === 'string' ? result : 'solve returned ' + typeof result, `${space}/${uplift}/${path}`)
        .toMatch(/\bmy\b/);
    }
  }
});

it('#2472 malformed model numbers refuse before projection and defaults', async () => {
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

review2472('known wrong result: #2472 stored planar member loads refuse an unsupported mx before either projection', async () => {
  for (const [space, uplift] of [[false, false], [true, false], [true, true]] as const) {
    const model = cantilever(uplift);
    const snap = modelStore.snapshot();
    const baseline = await modelSolves(model, space);
    for (const [path, answer] of Object.entries(baseline)) {
      expect(answer, `${space}/${uplift}/${path}`).toBeTypeOf('object');
      expect(answer).not.toBeNull();
    }
    const result = (answer: unknown) => JSON.stringify(answer, (key, value) =>
      key === 'timings' ? undefined : value instanceof Map ? [...value] : value);
    for (const mx of [0, -0, Number.MIN_VALUE, -5, null, '0', NaN, Infinity]) {
      modelStore.restore(snap);
      Object.assign(modelStore.model.loads[0]!.data, { mx });
      modelStore.restore(modelStore.snapshot());
      for (const [path, answer] of Object.entries(await modelSolves(modelStore.model, space))) {
        const label = `${space}/${uplift}/${path}/${String(mx)}`;
        if (mx === 0) expect.soft(result(answer), label).toBe(result(baseline[path as keyof typeof baseline]));
        else if (typeof mx === 'number' && Number.isFinite(mx)) {
          expect.soft(answer, label).toBe(`${t('svc.engine.unsupportedPointLoadMoment')} loads[0].data.mx: ${t('svc.engine.applyPointLoadMomentAtNode')}`);
        } else {
          expect.soft(typeof answer === 'string' ? answer : '', label).toMatch(/\bmx\b/);
        }
      }
    }
  }
});

review2472('known wrong result: #2472 density can be absent for static solves and is required for self-weight', async () => {
  for (const [space, uplift] of [[false, false], [true, false], [true, true]] as const) {
    const model = cantilever(uplift);
    const material = model.materials.get(model.elements.values().next().value!.materialId)!;
    const solve = space ? validateAndSolve3D : validateAndSolve2D;
    const baseline = solve(model);
    if (!baseline || typeof baseline === 'string') throw new Error(String(baseline));
    Reflect.deleteProperty(material, 'rho');
    const omitted = solve(model);
    expect.soft(typeof omitted, `${space}/${uplift}/omitted`).toBe('object');
    if (omitted && typeof omitted !== 'string') {
      expect(omitted.reactions).toEqual(baseline.reactions);
      expect(omitted.displacements).toEqual(baseline.displacements);
    }
    for (const [path, answer] of Object.entries(await modelSolves(model, space))) {
      expect.soft(answer, path).toBeTypeOf('object');
      expect.soft(answer, path).not.toBeNull();
    }
    expect.soft(solve(model, true)).toMatch(/\brho\b/);
    for (const rho of [null, '0', Infinity]) {
      Object.assign(material, { rho });
      expect.soft(solve(model)).toMatch(/\brho\b/);
    }
    material.rho = 0;
    const zero = solve(model, true);
    if (!zero || typeof zero === 'string') throw new Error(String(zero));
    expect(zero.reactions).toEqual(baseline.reactions);
    expect(zero.displacements).toEqual(baseline.displacements);
  }
});

review2472('known wrong result: #2472 the Spanish result notice specifies literal null', () => {
  expect(resultChange.title.es).toBe('Rechazo de momentos planos con valor null');
});

it('#2472 malformed planar nodal aliases refuse before projection', async () => {
  for (const [space, uplift] of [[false, false], [true, false], [true, true]] as const) {
    const model = cantilever(uplift);
    const nodeId = model.elements.values().next().value!.nodeJ;
    model.loads = [{ type: 'nodal', data: { id: 1, caseId: 1, nodeId, fx: 0, fz: -10, my: 0 } }];
    for (const field of ['my', 'mz'] as const) {
      const load = model.loads[0]!.data;
      Object.assign(load, { [field]: null });
      for (const [path, answer] of Object.entries(await modelSolves(model, space))) {
        expect.soft(typeof answer === 'string' ? answer : '', `${space}/${uplift}/${path}/${field}`)
          .toMatch(new RegExp(`\\b${field}\\b`));
      }
      if (field === 'my') Object.assign(load, { my: 0 });
    }
  }
});

review2472('known wrong result: #2472 wire adapters omit undefined numbers for object and JSON dispatch', () => {
  const model = cantilever();
  const plane = input2DToWireObject(buildSolverInput2D(model)!);
  const space = input3DToWireObject(buildSolverInput3D(model)!);
  for (const [wire, field, linear, pdelta] of [
    [plane, 'kx', wasm.solve_2d, wasm.solve_pdelta_2d],
    [space, 'krx', wasm.solve_3d, wasm.solve_pdelta_3d],
  ] as const) {
    const support = Object.values(wire.supports)[0]!;
    expect.soft(support, field).not.toHaveProperty(field);
    expect.soft(() => linear(wire)).not.toThrow();
    expect(JSON.parse(pdelta(JSON.stringify(wire), 20, 1e-8)).results.reactions.length).toBeGreaterThan(0);
    Object.assign(support, { [field]: null });
    expect.soft(() => linear(wire)).toThrow(new RegExp(`\\b${field}\\b`));
    expect.soft(() => pdelta(JSON.stringify(wire), 20, 1e-8)).toThrow(new RegExp(`\\b${field}\\b`));
  }
});

function wireInputs() {
  const model = cantilever();
  const plane = finiteObjectWire(input2DToWireObject(buildSolverInput2D(model)!));
  const space = finiteObjectWire(input3DToWireObject(buildSolverInput3D(model)!));
  space.loads = [{ type: 'pointOnElement', data: { elementId: 1, a: 1, py: 0, pz: -10 } }] as typeof space.loads;
  return { plane, space };
}

it('#2472 WASM linear and P-Delta decode numeric fields before solving', () => {
  const { plane, space } = wireInputs();
  for (const [input, linear, pdelta] of [
    [plane, wasm.solve_2d, wasm.solve_pdelta_2d],
    [space, wasm.solve_3d, wasm.solve_pdelta_3d],
  ] as const) {
    expect(linear(input).reactions.length).toBeGreaterThan(0);
    expect(JSON.parse(pdelta(JSON.stringify(input), 20, 1e-8)).results.reactions.length).toBeGreaterThan(0);
    for (const field of ['my', 'mz', 'px', 'kx', 'e']) {
      const malformed = structuredClone(input);
      const record = field === 'kx' ? Object.values(malformed.supports)[0]!
        : field === 'e' ? Object.values(malformed.materials)[0]! : malformed.loads[0]!.data;
      Object.assign(record, { [field]: null });
      const named = field === 'e' ? /Invalid numeric input at e \(/ : new RegExp(`\\b${field}\\b`);
      expect.soft(() => linear(malformed), `linear/${field}`).toThrow(named);
      expect.soft(() => pdelta(JSON.stringify(malformed), 20, 1e-8), `pdelta/${field}`).toThrow(named);
    }
    for (const value of [NaN, Infinity, -Infinity]) {
      const nonfinite = structuredClone(input);
      Object.assign(Object.values(nonfinite.materials)[0]!, { e: value });
      expect.soft(() => linear(nonfinite)).toThrow(/\be\b/);
    }
  }
});

it('#2472 WASM member point loads reject unsupported moments and accept zero', () => {
  const { plane, space } = wireInputs();
  for (const [input, linear, pdelta, Session, fields] of [
    [plane, wasm.solve_2d, wasm.solve_pdelta_2d, wasm.LoadSession2D, ['mx']],
    [space, wasm.solve_3d, wasm.solve_pdelta_3d, wasm.LoadSession3D, ['mx', 'my', 'mz']],
  ] as const) {
    const session = new Session({ ...input, loads: [] });
    try {
      const solves = {
        linear,
        pdelta: (value: typeof input) => JSON.parse(pdelta(JSON.stringify(value), 20, 1e-8)).results,
        session: (value: typeof input) => session.solve(value.loads),
      };
      const zero = structuredClone(input);
      for (const field of fields) Object.assign(zero.loads[0]!.data, { [field]: -0 });
      for (const [path, solve] of Object.entries(solves)) {
        const answer = solve(input);
        expect(answer.reactions.length).toBeGreaterThan(0);
        expect.soft(() => {
          const actual = solve(zero);
          expect(actual.reactions).toEqual(answer.reactions);
          expect(actual.displacements).toEqual(answer.displacements);
        }, path + ' explicit zero').not.toThrow();
        for (const field of fields) {
          for (const value of [null, '0', 1e-20, -10]) {
            const changed = structuredClone(input);
            Object.assign(changed.loads[0]!.data, { [field]: value });
            const diagnostic = typeof value === 'number' ? 'Unsupported point load field ' : 'Invalid numeric input at ';
            expect.soft(() => solve(changed), [path, field, value].join('/')).toThrow(diagnostic + field);
          }
        }
      }
    } finally {
      session.free();
    }
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
    expect(result() - omitted).toBeCloseTo(space ? 5 : -5, 8);
  }
});

it('#2472 the worker and prepared sessions refuse null point fields', async () => {
  const { plane, space } = wireInputs();
  const postMessage = vi.fn();
  const worker = { postMessage, onmessage: undefined as ((event: { data: object }) => Promise<void>) | undefined };
  vi.stubGlobal('self', worker);
  try {
    await import('../solver-worker');
    const { readFileSync } = await import('node:fs');
    const wasmModule = await WebAssembly.compile(readFileSync(new URL('../../wasm/dedaliano_engine_bg.wasm', import.meta.url)));
    await worker.onmessage!({ data: { type: 'init', wasmModule } });
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'ready' });
    for (const [type, input, Session] of [
      ['solve', plane, wasm.LoadSession2D],
      ['solve3d', space, wasm.LoadSession3D],
    ] as const) {
      const session = new Session({ ...input, loads: [] });
      try {
        expect(session.solve(input.loads).reactions.length).toBeGreaterThan(0);
        await worker.onmessage!({ data: { type, id: 1, input } });
        expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1, result: expect.any(Object) }));
        const invalid = structuredClone(input);
        Object.assign(invalid.loads[0]!.data, { my: null });
        expect.soft(() => session.solve(invalid.loads), type).toThrow(/\bmy\b/);
        await worker.onmessage!({ data: { type, id: 2, input: invalid } });
        expect.soft(postMessage, type).toHaveBeenLastCalledWith({ type: 'result', id: 2, error: expect.stringMatching(/\bmy\b/) });
      } finally {
        session.free();
      }
    }
  } finally {
    vi.unstubAllGlobals();
  }
});
