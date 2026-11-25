import { afterEach, beforeEach, expect, it } from 'vitest';
import { ensureLocale, setLocale, tp } from '../../i18n';
import { subdivideForAnalysis } from '../../model/edit/analysis-subdivision';
import { renumber } from '../../model/edit/renumber';
import { loadFixture, type JSONModel } from '../../templates/load-fixture';
import { modelStore, uiStore } from '../../store';
import { assessProject } from '../../provenance/applicability';
import { stampSolve } from '../../provenance/solve-stamp';
import { GRAVITY_SELF_WEIGHT } from '../analysis-settings';
import { runDirectAnalysis } from '../direct-analysis';
import { selfWeightMemberLoads, selfWeightScope } from '../self-weight';
import { expandVariableMembers } from '../variable-members';
import { solvePDelta, solvePDelta3D } from '../wasm-solver';
import { appliedResultant } from '../statics-check';
import {
  buildSolverInput2D, buildSolverInput3D, solveCombinations2D, solveCombinations3D,
  solveCombinations3DParallel, validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D,
  validateAndSolve3DAsync,
} from '../solver-service';

const dead = { id: 1, name: 'Gravity', type: 'D' as const };
const combo = { id: 1, name: dead.name, factors: [{ caseId: dead.id, factor: 1 }] };
const groupId = 7;
const refusal = 'Self-weight group 7 is missing or has invalid membership. Restore the group and its membership or change the self-weight target.';
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

it('#2472 refuses a dangling self-weight group and non-object membership in all solve paths', async () => {
  for (const membership of ['dangling', 'text'] as const) {
    const model = cantilever(membership);
    for (const [name, solve] of Object.entries(paths2D)) {
      expect.soft(String(reaction2D(await solve(model))), membership + ' 2D ' + name).toContain(refusal);
    }
    expect.soft(() => buildSolverInput2D(model), membership).toThrow(refusal);

    for (const activeSet of [false, true]) {
      const spatial = cantilever(membership, activeSet);
      for (const [name, solve] of Object.entries(paths3D)) {
        expect.soft(String(reaction3D(await solve(spatial))), membership + ' 3D ' + name + ' active set ' + activeSet).toContain(refusal);
      }
      expect.soft(await runDirectAnalysis(spatial, [dead], [combo], { includeSelfWeight: false }), membership).toBe(refusal);
      expect.soft(() => buildSolverInput3D(spatial, false, false), membership).toThrow(refusal);
    }
  }
});

it('#2472 refuses malformed membership in input, statics and drawing load assembly', () => {
  for (const membership of invalidMemberships) {
    const model = cantilever(membership);
    expect.soft(() => buildSolverInput2D(model), membership).toThrow(refusal);
    expect.soft(() => buildSolverInput3D(model, false, false), membership).toThrow(refusal);
    expect.soft(() => appliedResultant(model, dead.id, { includeSelfWeight: false }), membership).toThrow(refusal);
    for (const plane of [true, false]) {
      expect.soft(() => selfWeightMemberLoads(model, model.analysis!.selfWeight!, { plane, firstId: 1 }), membership).toThrow(refusal);
    }
  }
});

it('#2472 flags saved results for dangling groups and malformed self-weight membership', () => {
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

it('#2565 refuses a stored group that still names a deleted quad', async () => {
  const model = cantilever('member');
  const mat = model.materials.values().next().value!;
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(1, 0, 0);
  const c = modelStore.addNode(1, 1, 0);
  const d = modelStore.addNode(0, 1, 0);
  const deleted = modelStore.addQuad([a, b, c, d], mat.id, 1 / 8);
  modelStore.removeQuad(deleted);
  const snapshot = modelStore.snapshot();
  snapshot.groups![0]![1].members.quads = [deleted];
  modelStore.restore(snapshot);

  const saved = modelStore.model;
  const diagnostic = new RegExp(`self-weight.*quad.*\\b${deleted}\\b`, 'i');
  for (const [name, solve] of Object.entries(paths3D)) {
    expect.soft(String(reaction3D(await solve(saved))), name).toMatch(diagnostic);
  }
  expect.soft(String(await runDirectAnalysis(saved, [dead], [combo], { includeSelfWeight: false }))).toMatch(diagnostic);
  expect.soft(() => buildSolverInput3D(saved)).toThrow(diagnostic);
  expect(() => appliedResultant(saved, dead.id, { includeSelfWeight: false })).toThrow(diagnostic);
  expect(() => selfWeightMemberLoads(saved, snapshot.analysis!.selfWeight!, { plane: false, firstId: 1 })).toThrow(diagnostic);
  expect(assessProject({ ...snapshot, analysisMode: 'pro' }, { ...stampSolve('linear', null), resultsVersion: 120 })
    .changes.map(change => change.id)).toContain('invalid-self-weight-target');
});

it('#2565 refuses a fractional ID in a stored explicit self-weight list', async () => {
  cantilever('member', true);
  const snapshot = modelStore.snapshot();
  snapshot.analysis = { selfWeight: [{ caseId: dead.id, ...GRAVITY_SELF_WEIGHT, elements: [1.5] }] };
  modelStore.restore(snapshot);

  const saved = modelStore.model;
  const diagnostic = /self-weight.*member.*1\.5/i;
  for (const [name, solve] of Object.entries(paths2D)) {
    expect.soft(String(reaction2D(await solve(saved))), `2D ${name}`).toMatch(diagnostic);
  }
  for (const [name, solve] of Object.entries(paths3D)) {
    expect.soft(String(reaction3D(await solve(saved))), `3D ${name} with uplift`).toMatch(diagnostic);
  }
  expect.soft(String(await runDirectAnalysis(saved, [dead], [combo], { includeSelfWeight: false }))).toMatch(diagnostic);
  expect.soft(() => buildSolverInput2D(saved)).toThrow(diagnostic);
  expect.soft(() => buildSolverInput3D(saved)).toThrow(diagnostic);
  expect.soft(() => appliedResultant(saved, dead.id, { includeSelfWeight: false })).toThrow(diagnostic);
  for (const plane of [true, false]) {
    expect.soft(() => selfWeightMemberLoads(saved, snapshot.analysis!.selfWeight!, { plane, firstId: 1 })).toThrow(diagnostic);
  }
});

const gravity = { caseId: dead.id, ...GRAVITY_SELF_WEIGHT };
const memberAndTip = tipLoad + length * area * density;

it('#2565 accepts empty and live explicit selectors across both dimensions', async () => {
  const model = cantilever('member');
  const id = model.elements.keys().next().value!;
  for (const elements of [[], [id], [id, id]]) {
    model.analysis = { selfWeight: [{ ...gravity, elements }] };
    const expected = elements.length ? memberAndTip : tipLoad;
    for (const [name, solve] of Object.entries(paths2D)) {
      expect.soft(reaction2D(await solve(model)), name).toBeCloseTo(expected, 10);
    }
    for (const [name, solve] of Object.entries(paths3D)) {
      expect.soft(reaction3D(await solve(model)), name).toBeCloseTo(expected, 10);
    }
    const stamp = { ...stampSolve('linear', null), resultsVersion: 120 };
    expect(assessProject(modelStore.snapshot(), stamp).changes.map(change => change.id)).not.toContain('invalid-self-weight-target');
  }
});

it('#2565 refuses the entire rule when one member or shell reference is unavailable', () => {
  const model = cantilever('member');
  const id = model.elements.keys().next().value!;
  for (const family of ['elements', 'plates', 'quads'] as const) {
    const missing = family === 'elements' ? id + 1 : id;
    modelStore.setGroupMembers(groupId, { elements: [id], [family]: family === 'elements' ? [id, missing] : [missing] });
    expect.soft(() => buildSolverInput3D(model), family).toThrow(/self-weight.*missing/i);
  }
  model.analysis = { selfWeight: [{ ...gravity, factor: 0, elements: [id, id + 1] }] };
  expect.soft(validateAndSolve2D(model)).toMatch(/self-weight.*member.*missing/i);
  expect.soft(validateAndSolve3D(model)).toMatch(/self-weight.*member.*missing/i);
});

it('#2565 validates the integer range even when a malformed model carries the same ID', () => {
  const model = cantilever('member');
  const member = model.elements.values().next().value!;
  for (const id of [0, Number.MAX_SAFE_INTEGER, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const elements = new Map([[id, { ...member, id }]]);
    const check = () => selfWeightScope({ elements }, { ...gravity, elements: [id] });
    if (id === 0 || id === Number.MAX_SAFE_INTEGER) expect.soft(check().members).toEqual(new Set([id]));
    else expect.soft(check, String(id)).toThrow(/nonnegative safe integer/);
  }

  const stamp = { ...stampSolve('linear', null), resultsVersion: 120 };
  model.analysis = { selfWeight: [{ ...gravity, elements: [1.5] }] };
  expect(assessProject(modelStore.snapshot(), stamp).changes.map(change => change.id)).toContain('invalid-self-weight-target');
});

it('#2565 retains live quad and plate weight in a group', async () => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  const mat = modelStore.model.materials.values().next().value!;
  mat.rho = density;
  const thickness = 1 / 8;
  const [a, b, c, d, e] = [[0, 0], [1, 0], [1, 1], [0, 1], [2, 0]].map(([x, y]) => {
    const node = modelStore.addNode(x!, y!, 0);
    modelStore.addSupport(node, 'fixed3d');
    return node;
  });
  const quad = modelStore.addQuad([a!, b!, c!, d!], mat.id, thickness);
  const plate = modelStore.addPlate([b!, e!, c!], mat.id, thickness);
  const id = modelStore.addGroup('Gravity group', 'user', { plates: [plate], quads: [quad] });
  const model = modelStore.model;
  model.analysis = { selfWeight: [{ ...gravity, groupId: id }] };
  expect(reaction3D(await paths3D.asyncSingle(model))).toBeCloseTo((1 + 1 / 2) * thickness * density, 10);
});

it('#2565 preserves authored targets through spatial member cuts and planar subdivision', async () => {
  const model = cantilever('member');
  const id = model.elements.keys().next().value!;
  const planar = subdivideForAnalysis(model, 2).model;
  const point = { type: 'pointOnElement' as const, data: {
    id: 2, caseId: dead.id, elementId: id, a: length / 2, p: 1, angle: 90,
  } };
  const unsplit = { ...model, loads: [...model.loads, point] };
  const spatial = expandVariableMembers(unsplit);
  expect(spatial.elements.has(id + 1)).toBe(true);
  expect(planar.elements.has(id + 1)).toBe(true);

  for (const scope of [{ elements: [id] }, { groupId }]) {
    const analysis = { selfWeight: [{ ...gravity, ...scope }] };
    const planeInput = buildSolverInput2D({ ...planar, analysis })!;
    const spaceInput = buildSolverInput3D({ ...spatial, analysis })!;
    expect(reaction2D(solvePDelta(planeInput).linearResults)).toBeCloseTo(memberAndTip, 10);
    expect(reaction3D(solvePDelta3D(spaceInput).linearResults)).toBeCloseTo(memberAndTip, 10);
  }
  const analysis = { selfWeight: [{ ...gravity, elements: [id + 1] }] };
  expect.soft(() => buildSolverInput2D({ ...planar, analysis })).toThrow(/self-weight.*member.*missing/i);
  expect.soft(() => buildSolverInput3D({ ...spatial, analysis })).toThrow(/self-weight.*member.*missing/i);
  expect.soft(() => buildSolverInput3D(unsplit, analysis.selfWeight)).toThrow(/self-weight.*member.*missing/i);
  expect(reaction3D(await paths3D.asyncPdelta({ ...spatial, analysis }))).toMatch(/self-weight.*member.*missing/i);
});

it('#2565 keeps intentionally inactive members out of scoped gravity', async () => {
  const model = cantilever('member');
  const member = model.elements.keys().next().value!;
  const extra = modelStore.addNode(2 * length, 0, 0);
  const inactive = modelStore.addElement(model.elements.get(member)!.nodeJ, extra);
  modelStore.updateElement(inactive, { behaviour: 'inactive' });
  modelStore.setGroupMembers(groupId, { elements: [member, inactive] });
  expect(reaction3D(await paths3D.asyncSingle(model))).toBeCloseTo(memberAndTip, 10);
  model.analysis = { selfWeight: [{ ...gravity, elements: [member, inactive] }] };
  expect(reaction3D(await paths3D.asyncPdelta(model))).toBeCloseTo(memberAndTip, 10);
  expect(appliedResultant({ ...model, loads: [] }, dead.id, { includeSelfWeight: false }).applied.fz).toBeCloseTo(-length * area * density, 10);
});

it('#2565 identifiers use the current locale on refusal', async () => {
  const model = cantilever('member');
  model.analysis = { selfWeight: [{ ...gravity, elements: [1.5] }] };
  await ensureLocale('es');
  setLocale('es');
  const diagnostic = tp('svc.engine.invalidSelfWeightMemberId', { id: '1.5' });
  expect(diagnostic).toContain('peso propio');
  expect(await validateAndSolve2DAsync(model)).toBe(diagnostic);
  expect(await validateAndSolve3DAsync(model)).toBe(diagnostic);
});

it('#2565 refuses fixture and renumber remaps that could give a stale selector a live ID', async () => {
  const model = cantilever('member');
  const before = modelStore.snapshot();
  const fixture: JSONModel = {
    name: 'Selected member', materials: [], sections: [], loads: [], constraints: [],
    nodes: [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: length, y: 0, z: 0 }],
    elements: [{ id: 9, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
    supports: [{ id: 1, nodeId: 1, type: 'fixed' }], plates: [], quads: [],
    loadCases: [dead], combinations: [combo], analysis: { selfWeight: [{ ...gravity, elements: [1] }] },
  };
  await expect(modelStore.loadExample(fixture.name, async () => fixture)).rejects.toThrow(/self-weight.*member.*1.*missing/i);
  expect(modelStore.snapshot()).toEqual(before);

  const next = model.elements.keys().next().value! + 1;
  model.analysis = { selfWeight: [{ ...gravity, elements: [next] }] };
  const stale = modelStore.snapshot();
  expect(renumber({ nodes: false, members: true, order: 'xyz', start: next }))
    .toEqual({ refused: 'selfWeight', message: expect.stringMatching(/member.*missing/i) });
  expect(modelStore.snapshot()).toEqual(stale);

  modelStore.clear();
  fixture.analysis!.selfWeight![0]!.elements = [9];
  loadFixture(fixture, modelStore.fixtureApi() as never, { keepCombinations: true });
  expect(modelStore.analysis?.selfWeight?.[0]?.elements).toEqual([...modelStore.elements.keys()]);
  expect(reaction2D(validateAndSolve2D(modelStore.model))).toBeGreaterThan(0);
});
