import { beforeEach, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { loadFixture, type JSONModel, type FixtureLoader } from '../load-fixture';
import { getFixture, is2DFixture } from '../fixture-index';
import { CODE_EXAMPLES, loadCodeExample, type CodeExampleId } from '../examples';
import { VALIDATION_MODELS, loadValidationModel, type ValidationModelId } from '../validation';
import { modelStore, uiStore } from '../../store';
import type { Support } from '../../store/model.svelte';
import { supportDofs3D } from '../../engine/support-dofs-3d';
import { buildSolverInput3D, validateAndSolve2D, validateAndSolve3D, validateAndSolve3DAsync, solveCombinations3D, solveCombinations3DParallel } from '../../engine/solver-service';

const directory = 'src/lib/templates/fixtures';
const fixtures = readdirSync(directory).filter(f => f.endsWith('.json')).sort().map(file => ({
  name: file.slice(0, -5),
  json: JSON.parse(readFileSync(`${directory}/${file}`, 'utf8')) as JSONModel,
}));
const modes = ['3d', 'pro'] as const;
const adapters = ['three arguments', 'four arguments', 'store'] as const;

beforeEach(() => {
  uiStore.analysisMode = '3d';
  uiStore.includeSelfWeight = false;
  uiStore.useNative3DPresentation();
  modelStore.clear();
});

function apiFor(adapter: typeof adapters[number]): FixtureLoader {
  const api = modelStore.fixtureApi();
  if (adapter === 'store') return api as unknown as FixtureLoader;
  let nextSupport = 100;
  const add = (nodeId: number, type: string, springs?: Record<string, number>, opts?: Record<string, unknown>) => {
    const id = nextSupport++;
    modelStore.model.supports.set(id, { id, nodeId, type, ...springs, ...opts } as Support);
    return id;
  };
  return {
    ...api,
    addSupport: adapter === 'three arguments'
      ? (nodeId: number, type: string, springs?: Record<string, number>) => add(nodeId, type, springs)
      : add,
  } as unknown as FixtureLoader;
}

function expectAdmitted() {
  expect(modelStore.supports.size).toBeGreaterThan(0);
  for (const support of modelStore.supports.values()) supportDofs3D(support);
}

for (const { name, json } of fixtures) {
  for (const adapter of adapters) {
    it(`#2277 ${name} preserves support metadata through ${adapter}`, () => {
      if (is2DFixture(name)) uiStore.useUpright2DIn3DPresentation();
      loadFixture(json, apiFor(adapter));
      const loaded = [...modelStore.supports.values()];
      expect(loaded).toHaveLength(json.supports.length);
      json.supports.forEach((source, i) => {
        const { id, nodeId, type, ...metadata } = source;
        expect(loaded[i].type).toBe(type);
        for (const [key, value] of Object.entries(metadata)) {
          expect(loaded[i][key as keyof Support]).toEqual(value);
        }
        if (type === 'rollerZ') expect(loaded[i].dofRestraints).toBeDefined();
      });
      expectAdmitted();
    });
  }
  it(`#2277 ${name} loads from the registry without an ambiguous 3D support`, async () => {
    expect(getFixture(name)).toBeDefined();
    await modelStore.loadExample(name);
    expectAdmitted();
  });
}

for (const id of Object.keys(CODE_EXAMPLES) as CodeExampleId[]) {
  it(`#2277 code example ${id} loads without an ambiguous 3D support`, async () => {
    await loadCodeExample(id);
    expectAdmitted();
  });
}
for (const id of Object.keys(VALIDATION_MODELS) as ValidationModelId[]) {
  it(`#2277 validation template ${id} loads without an ambiguous 3D support`, async () => {
    await loadValidationModel(id);
    expectAdmitted();
  });
}

it('#2277 a loader cannot silently discard a support with metadata', () => {
  const json = fixtures.find(f => f.name === 'rc-beam-flexure')!.json;
  const api = apiFor('four arguments');
  api.addSupport = () => 999;
  expect(() => loadFixture(json, api)).toThrow(/support.*999.*not.*stored/i);
});

it('#2277 a raw ambiguous support is still refused and an explicit mask is admitted', () => {
  const source = fixtures.find(f => f.name === 'rc-beam-flexure')!.json.supports.find(s => s.type === 'rollerZ')!;
  expect(() => supportDofs3D({ ...source, dofRestraints: undefined } as Support)).toThrow(/ambiguous/);
  expect(() => supportDofs3D(source as Support)).not.toThrow();
});

for (const mode of modes) {
  for (const nonlinear of [false, true]) {
    for (const entry of ['input', 'sync', 'async', 'combinations', 'parallel'] as const) {
      it(`#2277 rc-beam-flexure three-argument loader ${mode} ${entry} nonlinear=${nonlinear}`, async () => {
        uiStore.analysisMode = mode;
        const json = fixtures.find(f => f.name === 'rc-beam-flexure')!.json;
        loadFixture(json, apiFor('three arguments'));
        if (nonlinear) {
          const s = [...modelStore.supports.values()].find(s => s.nodeId === 1)!;
          modelStore.model.supports.set(s.id, { ...s, uplift: true });
        }
        const m = modelStore.model;
        if (entry === 'input') {
          expect(buildSolverInput3D(m)!.supports.get(3)).toMatchObject({ rx: false, ry: true, rz: true, rrx: true, rry: false, rrz: false });
          return;
        }
        const result = entry === 'sync' ? validateAndSolve3D(m)
          : entry === 'async' ? await validateAndSolve3DAsync(m)
          : entry === 'combinations' ? solveCombinations3D(m, m.loadCases, m.combinations)
          : await solveCombinations3DParallel(m, m.loadCases, m.combinations);
        expect(result).toBeTruthy();
        if (!result || typeof result === 'string') throw new Error(String(result));
        if ('elementForces' in result) {
          const length = m.nodes.get(3)!.x - m.nodes.get(1)!.x;
          const w = -m.loads.filter(l => l.type === 'distributed3d' && l.data.elementId === 1)
            .reduce((sum, l) => sum + (l.data as { qZI: number }).qZI, 0);
          expect(result.elementForces.find(f => f.elementId === 1)!.myStart).toBeCloseTo(0, 9);
          expect(result.elementForces.find(f => f.elementId === 2)!.myEnd).toBeCloseTo(0, 9);
          for (const nodeId of [1, 3]) expect(result.reactions.find(r => r.nodeId === nodeId)!.fz).toBeCloseTo(w * length / 2, 9);
        } else {
          expect(result.perCase.size).toBe(m.loadCases.length);
          expect(result.perCombo.size).toBe(m.combinations.length);
          for (const answer of [...result.perCase.values(), ...result.perCombo.values()]) {
            expect(answer.elementForces.find(f => f.elementId === 1)!.myStart).toBeCloseTo(0, 9);
            expect(answer.elementForces.find(f => f.elementId === 2)!.myEnd).toBeCloseTo(0, 9);
          }
        }
      });
    }
  }
}

it('#2277 the braced portal retains its plane answer through the fixture loader', async () => {
  uiStore.analysisMode = '2d';
  await modelStore.loadExample('portal-frame-braced');
  const result = validateAndSolve2D(modelStore.model);
  expect(result).toBeTruthy();
  if (!result || typeof result === 'string') throw new Error(String(result));
  const roller = [...modelStore.supports.values()].find(s => s.nodeId === 3)!;
  expect(result.reactions.find(r => r.nodeId === roller.nodeId)!.rz).toBeCloseTo(0, 9);
  uiStore.analysisMode = '3d';
  uiStore.useUpright2DIn3DPresentation();
  const embedded = validateAndSolve3D(modelStore.model);
  if (!embedded || typeof embedded === 'string') throw new Error(String(embedded));
  for (const r of result.reactions) {
    const r3 = embedded.reactions.find(s => s.nodeId === r.nodeId)!;
    expect(r3.fx).toBeCloseTo(r.rx, 9);
    expect(r3.fz).toBeCloseTo(r.rz, 9);
    expect(r3.my).toBeCloseTo(-r.my, 9);
  }
});

it('#2277 loaded masks are independent of fixture objects', () => {
  const json = structuredClone(fixtures.find(f => f.name === 'rc-beam-flexure')!.json);
  loadFixture(json, apiFor('four arguments'));
  const source = json.supports.find(s => s.type === 'rollerZ')!;
  const loaded = [...modelStore.supports.values()].find(s => s.type === 'rollerZ')!;
  expect(loaded.dofRestraints).toEqual(source.dofRestraints);
  (source.dofRestraints as { tx: boolean }).tx = true;
  expect(loaded.dofRestraints!.tx).toBe(false);
});
