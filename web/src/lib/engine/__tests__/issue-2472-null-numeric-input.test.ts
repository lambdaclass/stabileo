import { beforeEach, expect, it, vi } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { ensureLocale, i18n, setLocale, t } from '../../i18n';
import { conditionHolds } from '../../provenance/applicability';
import { registryLocale } from '../../provenance/registry';
import { G } from '../dynamics/requests';
import { modelFeatures } from '../../provenance/model-features';
import resultChange from '../../provenance/result-changes/invalid-solver-numbers.json';
import torsionChange from '../../provenance/result-changes/planar-member-torsion-refusal.json';
import dynamicDensityChange from '../../provenance/result-changes/invalid-dynamic-material-density.json';
import { runDirectAnalysis } from '../direct-analysis';
import { withSectionMass } from '../dynamics/section-mass';
import {
  buildSolverInput2D, buildSolverInput3D, solveCombinations2D, solveCombinations3D,
  solveCombinations3DParallel, validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D,
  validateAndSolve3DAsync,
} from '../solver-service';
import { finiteObjectWire, input2DToWireObject, input3DToWireObject } from '../wasm-solver';
import * as wasm from '../../wasm/dedaliano_engine.js';

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

it('#2472 stored planar member loads refuse an unsupported mx before either projection', async () => {
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
      const stored = modelStore.snapshot();
      modelStore.restore(stored);
      expect.soft(modelFeatures(stored).has('invalidPlanarMemberTorsion')).toBe(mx !== 0);
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

it('#2472 density can be absent for static solves and is required for self-weight', async () => {
  for (const [space, uplift] of [[false, false], [true, false], [true, true]] as const) {
    const model = cantilever(uplift);
    const material = model.materials.get(model.elements.values().next().value!.materialId)!;
    const solve = space ? validateAndSolve3D : validateAndSolve2D;
    const input = space ? buildSolverInput3D(model)! : buildSolverInput2D(model)!;
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
    expect.soft(() => withSectionMass(input, model)).toThrow(/\brho\b/);
    for (const rho of [null, '0', Infinity]) {
      Object.assign(material, { rho });
      expect.soft(solve(model)).toMatch(/\brho\b/);
    }
    material.rho = 0;
    expect(withSectionMass(input, model).densities.get(material.id)).toBe(0);
    const zero = solve(model, true);
    if (!zero || typeof zero === 'string') throw new Error(String(zero));
    expect(zero.reactions).toEqual(baseline.reactions);
    expect(zero.displacements).toEqual(baseline.displacements);
  }
});

it('#2472 dynamic mass checks every solver-side carrier of a material', () => {
  const model = cantilever();
  const input = buildSolverInput3D(model)!;
  const element = input.elements.values().next().value!;
  const material = model.materials.get(element.materialId)!;
  model.elements.delete(element.id);
  const shells = new Map([[1, { materialId: material.id }]]);
  for (const [kind, massInput] of [
    ['expanded member', input],
    ...['plates', 'quads', 'quad9s', 'solidShells', 'curvedShells'].map(key => [
      key, { ...input, elements: new Map(), [key]: shells },
    ] as const),
  ] as const) {
    for (const rho of [undefined, -Number.MIN_VALUE, -1, null, '0', NaN, Infinity]) {
      if (rho === undefined) Reflect.deleteProperty(material, 'rho');
      else Object.assign(material, { rho });
      expect.soft(() => withSectionMass(massInput, model), `${kind}/${rho}`).toThrow(/finite, nonnegative.*rho/);
    }
    for (const rho of [0, 1]) {
      material.rho = rho;
      expect(withSectionMass(massInput, model).densities.get(material.id), kind).toBe(rho * 1000 / G);
    }
  }
});

it('#2472 density refusals share the active locale for self-weight and dynamics', async () => {
  const savedLocale = i18n.locale;
  const model = cantilever();
  const input = buildSolverInput2D(model)!;
  const material = model.materials.get(model.elements.values().next().value!.materialId)!;
  material.rho = -1;
  try {
    for (const [locale, instruction] of [['en', 'finite, nonnegative'], ['es', 'finito y no negativo']] as const) {
      setLocale(locale);
      await ensureLocale(locale);
      const result = validateAndSolve2D(model, true);
      expect.soft(result, locale).toContain(instruction);
      expect.soft(() => withSectionMass(input, model), locale).toThrow(String(result));
    }
  } finally {
    setLocale(savedLocale);
  }
});

it('#2472 the null-moment notice follows explicit null and has its own translations', () => {
  cantilever();
  const snapshot = modelStore.snapshot();
  for (const type of ['pointOnElement', 'nodal']) {
    for (const [fields, applies] of [
      [{}, false], [{ my: 1 }, false], [{ mz: 1 }, false], [{ my: 1, mz: 2 }, false],
      [{ my: null }, true], [{ mz: null }, true], [{ my: 0, mx: -1 }, false],
    ] as const) {
      const loads = [{ type, data: { ...snapshot.loads[0]!.data, ...fields } }];
      const features = modelFeatures({ ...snapshot, loads });
      expect.soft(conditionHolds(resultChange.when, features), JSON.stringify(loads)).toBe(applies);
      expect.soft(conditionHolds(torsionChange.when, features), JSON.stringify(loads))
        .toBe(type === 'pointOnElement' && 'mx' in fields);
      expect.soft(conditionHolds(resultChange.when, modelFeatures(snapshot, { storedLoads: loads }))).toBe(applies);
    }
  }
  for (const locale of ['ar', 'hi', 'id', 'it', 'ja', 'ko']) {
    expect(registryLocale(locale, resultChange.title, resultChange.explanation)).toBe(locale);
    expect(registryLocale(locale, torsionChange.title, torsionChange.explanation)).toBe(locale);
    expect(registryLocale(locale, dynamicDensityChange.title, dynamicDensityChange.explanation)).toBe('en');
    for (const text of [resultChange.title, resultChange.explanation, torsionChange.title, torsionChange.explanation]) {
      const translated = (text as Record<string, string>)[locale];
      expect.soft(translated, locale).toBeTruthy();
      expect.soft(translated, locale).not.toBe(text.en);
    }
  }
});

it('#2472 the dynamic density notice requires an affected material and analysis', () => {
  const model = cantilever();
  const material = model.materials.get(model.elements.values().next().value!.materialId)!;
  for (const rho of [0, 1, undefined, -1, null]) {
    if (rho === undefined) Reflect.deleteProperty(material, 'rho');
    else Object.assign(material, { rho });
    const snapshot = modelStore.snapshot();
    for (const kind of ['linear', 'modal', 'spectral', 'timeHistory', 'harmonic']) {
      const features = modelFeatures(snapshot, { analysesRun: [kind], analysesRecorded: ['linear', 'modal', 'spectral', 'timeHistory', 'harmonic'] });
      expect(conditionHolds(dynamicDensityChange.when, features), `${kind}/${rho}`)
        .toBe(kind !== 'linear' && (rho === undefined || rho === null || rho < 0));
    }
  }
});

it('#2472 the Spanish result notice specifies literal null', () => {
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

it('#2472 wire adapters omit undefined numbers for object and JSON dispatch', async () => {
  const pool = await import('../solver-pool');
  for (const [field, worker, solve, linear, pdelta] of [
    ['kx', 'solve2DInWorker', validateAndSolve2DAsync, wasm.solve_2d, wasm.solve_pdelta_2d],
    ['krx', 'solve3DInWorker', validateAndSolve3DAsync, wasm.solve_3d, wasm.solve_pdelta_3d],
  ] as const) {
    const model = cantilever();
    Object.assign(model.loads[0]!.data, { p: -11 });
    const spy = vi.spyOn(pool, worker).mockImplementation(async wire => linear(wire));
    try {
      const answer = await solve(model);
      expect.soft(answer, field).toBeTypeOf('object');
      expect(spy).toHaveBeenCalledOnce();
      const [wire] = spy.mock.calls[0]!;
      const support = Object.values(wire.supports)[0]!;
      expect.soft(support, field).not.toHaveProperty(field);
      expect(JSON.parse(pdelta(JSON.stringify(wire), 20, 1e-8)).results.reactions.length).toBeGreaterThan(0);
      const invalid = structuredClone(wire);
      Object.assign(Object.values(invalid.supports)[0]!, { [field]: null });
      expect.soft(() => linear(invalid)).toThrow(new RegExp(`\\b${field}\\b`));
      expect.soft(() => pdelta(JSON.stringify(invalid), 20, 1e-8)).toThrow(new RegExp(`\\b${field}\\b`));
    } finally {
      spy.mockRestore();
    }
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

it('#2472 raw WASM shell self-weight refuses negative density before solving', () => {
  const surface = [[0, 0], [2, 0], [2, 2], [0, 2], [1, 0], [2, 1], [1, 2], [0, 1], [1, 1]];
  for (const [kind, collection, count] of [
    ['quadSelfWeight', 'quads', 4], ['quad9SelfWeight', 'quad9s', 9],
    ['curvedShellSelfWeight', 'curvedShells', 4], ['solidShellSelfWeight', 'solidShells', 8],
  ] as const) {
    const points = collection === 'solidShells'
      ? [0, 1].flatMap(z => surface.slice(0, 4).map(([x, y]) => ({ x, y, z })))
      : surface.slice(0, count).map(([x, y]) => ({ x, y, z: 0 }));
    const nodes = Object.fromEntries(points.map((point, i) => [i + 1, { id: i + 1, ...point }]));
    const fixed = collection === 'solidShells' ? [1, 2, 3, 4] : [1, 4];
    const data = { elementId: 1, density: 1, gz: -G };
    const input = {
      nodes, materials: { 1: { id: 1, e: 200000, nu: 0.3 } }, sections: {}, elements: {},
      supports: Object.fromEntries(fixed.map(nodeId => [nodeId, { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }])),
      loads: [{ type: kind, data }],
      [collection]: { 1: { id: 1, materialId: 1, thickness: 1, nodes: Array.from({ length: count }, (_, i) => i + 1) } },
    };
    const session = new wasm.LoadSession3D({ ...input, loads: [] });
    const reactions = (answer: { reactions: { fz: number }[] }) => answer.reactions.reduce((sum, reaction) => sum + reaction.fz, 0);
    try {
      for (const [path, solve] of Object.entries({
        linear: () => wasm.solve_3d(input),
        pdelta: () => JSON.parse(wasm.solve_pdelta_3d(JSON.stringify(input), 20, 1e-8)).results,
        session: () => session.solve(input.loads),
        combinations: () => wasm.solve_multi_case_3d({
          solver: { ...input, loads: [] },
          loadCases: [{ name: 'Weight', loads: input.loads }],
          combinations: [{ name: 'Weight', factors: { Weight: 1 } }],
        }).combinationResults[0].results,
      })) {
        data.density = 1;
        expect(reactions(solve()), `${kind}/${path}`).toBeGreaterThan(0);
        for (const zero of [0, -0]) {
          data.density = zero;
          expect(reactions(solve()), `${kind}/${path}`).toBe(0);
        }
        for (const bad of [-1, -Number.MIN_VALUE, null, '0', NaN, Infinity]) {
          Object.assign(data, { density: bad });
          expect.soft(solve, `${kind}/${path}/${bad}`).toThrow(/density/);
        }
        Reflect.deleteProperty(data, 'density');
        expect.soft(solve, `${kind}/${path}/omitted`).toThrow(/density/);
      }
    } finally {
      session.free();
    }
  }
});

it('#2472 raw WASM applies either planar point moment alias with its sign', () => {
  const { plane } = wireInputs();
  const session = new wasm.LoadSession2D({ ...plane, loads: [] });
  try {
    for (const solve of [
      () => wasm.solve_2d(plane), () => session.solve(plane.loads),
      () => JSON.parse(wasm.solve_pdelta_2d(JSON.stringify(plane), 20, 1e-8)).results,
    ]) {
      const data = plane.loads[0]!.data;
      const baseline = solve().reactions[0]!.my;
      for (const field of ['my', 'mz']) for (const moment of [-5, 5]) {
        Object.assign(data, { [field]: moment });
        expect(solve().reactions[0]!.my - baseline, field).toBeCloseTo(-moment, 8);
        Reflect.deleteProperty(data, field);
      }
    }
  } finally {
    session.free();
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
    expect.soft(result() - omitted, space ? '3D' : '2D').toBeCloseTo(space ? 5 : -5, 8);
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
