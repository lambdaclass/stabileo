import { afterEach, beforeEach, expect, it } from 'vitest';
import { ensureLocale, setLocale } from '../../i18n';
import { modelStore, uiStore } from '../../store';
import { assessProject } from '../../provenance/applicability';
import { stampSolve } from '../../provenance/solve-stamp';
import { GRAVITY_SELF_WEIGHT } from '../analysis-settings';
import { runDirectAnalysis } from '../direct-analysis';
import { selfWeightMemberLoads } from '../self-weight';
import { appliedResultant } from '../statics-check';
import {
  buildSolverInput2D, buildSolverInput3D, solveCombinations2D, solveCombinations3D,
  solveCombinations3DParallel, validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D,
  validateAndSolve3DAsync,
} from '../solver-service';

const dead = { id: 1, name: 'Gravity', type: 'D' as const };
const combo = { id: 1, name: dead.name, factors: [{ caseId: dead.id, factor: 1 }] };
const groupId = 7;
const refusal = 'Self-weight references group 7, whose membership is missing. Restore the group membership or change the self-weight target.';
const invalidGroupRefusal = 'Self-weight group 7 is missing or has invalid membership. Restore the group and its membership or change the self-weight target.';
const regression = process.env.RUN_KNOWN_WRONG === '2472' ? it : it.skip;
const malformedMembership = {
  text: 'bad',
  array: [],
  stringList: { elements: '1' },
  stringId: { elements: ['1'] },
  fractionalId: { elements: [1.5] },
  nullList: { plates: null },
  objectList: { quads: {} },
  invalidNodeList: { nodes: [null] },
  misspelledList: { element: [1] },
};
const invalidMemberships = ['dangling', ...Object.keys(malformedMembership)] as ('dangling' | keyof typeof malformedMembership)[];
const tipLoad = 2;
const length = 2;
const density = 3;
const area = 1 / 4;

beforeEach(async () => {
  await ensureLocale('en');
  setLocale('en');
  uiStore.analysisMode = '2d';
});

afterEach(() => modelStore.clear());

type Membership = 'missing' | 'null' | 'empty' | 'emptyLists' | 'member' | 'dangling' | keyof typeof malformedMembership;

function cantilever(membership: Membership, activeSet = false) {
  modelStore.clear();
  const base = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(length, 0, 0);
  const member = modelStore.addElement(base, tip);
  modelStore.addSupportEntry({ nodeId: base, type: 'fixed', ...(activeSet ? { uplift: true } : {}) });
  modelStore.addNodalLoad(tip, 0, -tipLoad, 0, dead.id);
  const id = modelStore.addGroup('Gravity group', 'user', { elements: [member] });
  const snapshot = modelStore.snapshot();
  const material = snapshot.materials.find(([id]) => id === modelStore.elements.get(member)!.materialId)![1];
  const section = snapshot.sections.find(([id]) => id === modelStore.elements.get(member)!.sectionId)![1];
  material.rho = density;
  section.a = area;
  const group = snapshot.groups!.find(([key]) => key === id)![1];
  const stored = { ...group, id: groupId };
  if (membership === 'missing') Reflect.deleteProperty(stored, 'members');
  if (membership === 'null') Object.assign(stored, { members: null });
  if (membership === 'empty') stored.members = {};
  if (membership === 'emptyLists') stored.members = { nodes: [], elements: [], plates: [], quads: [] };
  if (Object.hasOwn(malformedMembership, membership)) {
    Object.assign(stored, { members: malformedMembership[membership as keyof typeof malformedMembership] });
  }
  snapshot.groups = membership === 'dangling' ? [] : [[groupId, stored]];
  snapshot.analysis = { selfWeight: [{ caseId: dead.id, ...GRAVITY_SELF_WEIGHT, groupId }] };
  snapshot.loadCases = [dead];
  modelStore.restore(snapshot);
  return modelStore.model;
}

type Model = ReturnType<typeof cantilever>;
const paths2D = {
  single: (model: Model) => validateAndSolve2D(model),
  asyncSingle: (model: Model) => validateAndSolve2DAsync(model),
  batch: (model: Model) => solveCombinations2D(model, [dead], [combo]),
  perCase: (model: Model) => solveCombinations2D(model, [dead, { ...dead, id: 2 }], [combo]),
};

const paths3D = {
  single: (model: Model) => validateAndSolve3D(model),
  asyncSingle: (model: Model) => validateAndSolve3DAsync(model),
  linear: (model: Model) => solveCombinations3D(model, [dead], [combo]),
  asyncLinear: (model: Model) => solveCombinations3DParallel(model, [dead], [combo]),
  pdelta: (model: Model) => solveCombinations3D({ ...model, analysis: { ...model.analysis, perCombination: 'pdelta' } }, [dead], [combo]),
  asyncPdelta: (model: Model) => solveCombinations3DParallel({ ...model, analysis: { ...model.analysis, perCombination: 'pdelta' } }, [dead], [combo]),
};

const reaction2D = (answer: Awaited<ReturnType<(typeof paths2D)[keyof typeof paths2D]>>) => {
  if (!answer || typeof answer === 'string') return answer;
  const result = 'perCombo' in answer ? answer.perCombo.get(combo.id) : answer;
  return result?.reactions.reduce((total, r) => total + r.rz, 0);
};
const reaction3D = (answer: Awaited<ReturnType<(typeof paths3D)[keyof typeof paths3D]>>) => {
  if (!answer || typeof answer === 'string') return answer;
  const result = 'perCombo' in answer ? answer.perCombo.get(combo.id) : answer;
  return result?.reactions.reduce((total, r) => total + r.fz, 0);
};

it.each(['missing', 'null'] as const)('known wrong result: #2472 refuses %s self-weight membership in planar inputs and solves', async membership => {
  const model = cantilever(membership);
  for (const [name, solve] of Object.entries(paths2D)) {
    expect.soft(String(reaction2D(await solve(model))), name).toContain(refusal);
  }
  expect(() => buildSolverInput2D(model)).toThrow(refusal);
});

it.each([
  { membership: 'missing', activeSet: false }, { membership: 'null', activeSet: false },
  { membership: 'missing', activeSet: true },
] as const)('known wrong result: #2472 refuses $membership self-weight membership in spatial inputs and solves (active set $activeSet)', async ({ membership, activeSet }) => {
  const model = cantilever(membership, activeSet);
  for (const [name, solve] of Object.entries(paths3D)) {
    expect.soft(String(reaction3D(await solve(model))), name).toContain(refusal);
  }
  expect.soft(await runDirectAnalysis(model, [dead], [combo], { includeSelfWeight: false })).toBe(refusal);
  expect(() => buildSolverInput3D(model, false, false)).toThrow(refusal);
});

it('known wrong result: #2472 flags saved results from a self-weight group with missing membership', () => {
  cantilever('missing');
  const stamp = { ...stampSolve('linear', null), resultsVersion: 120 };
  expect(assessProject(modelStore.snapshot(), stamp).changes.map(change => change.id)).toContain('missing-self-weight-group-membership');
});

regression('known wrong result: #2472 refuses a dangling self-weight group and non-object membership in all solve paths', async () => {
  for (const membership of ['dangling', 'text'] as const) {
    const model = cantilever(membership);
    for (const [name, solve] of Object.entries(paths2D)) {
      expect.soft(String(reaction2D(await solve(model))), membership + ' 2D ' + name).toContain(invalidGroupRefusal);
    }
    expect.soft(() => buildSolverInput2D(model), membership).toThrow(invalidGroupRefusal);

    for (const activeSet of [false, true]) {
      const spatial = cantilever(membership, activeSet);
      for (const [name, solve] of Object.entries(paths3D)) {
        expect.soft(String(reaction3D(await solve(spatial))), membership + ' 3D ' + name + ' active set ' + activeSet).toContain(invalidGroupRefusal);
      }
      expect.soft(await runDirectAnalysis(spatial, [dead], [combo], { includeSelfWeight: false }), membership).toBe(invalidGroupRefusal);
      expect.soft(() => buildSolverInput3D(spatial, false, false), membership).toThrow(invalidGroupRefusal);
    }
  }
});

regression('known wrong result: #2472 refuses malformed membership in input, statics and drawing load assembly', () => {
  for (const membership of invalidMemberships) {
    const model = cantilever(membership);
    expect.soft(() => buildSolverInput2D(model), membership).toThrow(invalidGroupRefusal);
    expect.soft(() => buildSolverInput3D(model, false, false), membership).toThrow(invalidGroupRefusal);
    expect.soft(() => appliedResultant(model, dead.id, { includeSelfWeight: false }), membership).toThrow(invalidGroupRefusal);
    for (const plane of [true, false]) {
      expect.soft(() => selfWeightMemberLoads(model, model.analysis!.selfWeight!, { plane, firstId: 1 }), membership).toThrow(invalidGroupRefusal);
    }
  }
});

regression('known wrong result: #2472 flags saved results for dangling groups and malformed self-weight membership', () => {
  const stamp = { ...stampSolve('linear', null), resultsVersion: 120 };
  for (const membership of invalidMemberships) {
    cantilever(membership);
    for (const analysisMode of ['2d', '3d'] as const) {
      const snapshot = { ...modelStore.snapshot(), analysisMode };
      expect.soft(() => {
        expect(assessProject(snapshot, stamp).changes.map(change => change.id)).toContain('missing-self-weight-group-membership');
      }, membership + ' ' + analysisMode).not.toThrow();
    }
  }
});

it.each(['empty', 'emptyLists', 'member'] as const)('#2472 solves with explicitly %s group membership', async membership => {
  const model = cantilever(membership);
  const expected = tipLoad + (membership === 'member' ? length * area * density : 0);
  for (const [name, solve] of Object.entries(paths2D)) {
    expect.soft(reaction2D(await solve(model)), name).toBeCloseTo(expected, 10);
  }
  for (const [name, solve] of Object.entries(paths3D)) {
    expect.soft(reaction3D(await solve(model)), name).toBeCloseTo(expected, 10);
  }
  const stamp = { ...stampSolve('linear', null), resultsVersion: 120 };
  expect(assessProject(modelStore.snapshot(), stamp).changes.map(change => change.id)).not.toContain('missing-self-weight-group-membership');
});
