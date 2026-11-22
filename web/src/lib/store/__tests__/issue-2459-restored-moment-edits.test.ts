import { beforeEach, expect, it, vi } from 'vitest';
import { computeDiagramValueAt } from '../../engine/diagrams';
import { evaluateDiagramAt } from '../../engine/diagrams-3d';
import { runDirectAnalysis } from '../../engine/direct-analysis';
import { hasNonlinearBehaviour } from '../../engine/member-behaviour';
import {
  buildSolverInput2D, solveCombinations2D, solveCombinations3D, solveCombinations3DParallel,
  validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D, validateAndSolve3DAsync,
} from '../../engine/solver-service';
import type { AnalysisResults } from '../../engine/types';
import type { AnalysisResults3D } from '../../engine/types-3d';
import { solvePDelta } from '../../engine/wasm-solver';
import { t } from '../../i18n';
import { modelFeatures } from '../../provenance/model-features';
import { historyStore, modelStore, uiStore } from '..';
import { deserializeProject, loadFile, loadProject, serializeProject } from '../file';
import { recheckStore } from '../recheck.svelte';

const loadCase = { id: 1, name: 'Couple', type: 'D' as const };
const combination = { id: 1, name: 'Couple', factors: [{ caseId: loadCase.id, factor: 1 }] };
const cases = [loadCase];
const combinations = [combination];
const legacyMoment = 5;
const position = 1;
const length = 2;
const before = (position - 1e-6) / length;
const after = (position + 1e-6) / length;
const loadId = 1;

beforeEach(() => {
  uiStore.analysisMode = '3d';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  modelStore.clear();
  historyStore.clear();
});

function cantilever(mode: '2d' | '3d' | 'pro' | 'pdelta') {
  uiStore.analysisMode = mode === 'pdelta' ? '3d' : mode;
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(length, 0, 0);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupportEntry({
    nodeId: root, type: mode === '2d' ? 'fixed' : 'fixed3d',
    ...(mode === 'pro' ? { uplift: true } : {}),
  });
  if (mode === 'pdelta') modelStore.model.analysis = { ...modelStore.model.analysis, perCombination: 'pdelta' };
  return member;
}

function restorePointCouple(member: number, moments: { my?: number; mz?: number }) {
  const snapshot = modelStore.snapshot();
  modelStore.restore({
    ...snapshot,
    nextId: { ...snapshot.nextId, load: loadId + 1 },
    loads: [{ type: 'pointOnElement', data: { id: loadId, elementId: member, a: position, p: 0, ...moments } }],
  });
}

function momentJump(mode: '2d' | '3d', member: number) {
  if (mode === '2d') {
    const result = modelStore.solve();
    if (!result || typeof result === 'string') throw new Error(String(result));
    const forces = result.elementForces.find(f => f.elementId === member)!;
    return Math.abs(computeDiagramValueAt('moment', after, forces) - computeDiagramValueAt('moment', before, forces));
  }
  const result = validateAndSolve3D(modelStore.model);
  if (!result || typeof result === 'string') throw new Error(String(result));
  const forces = result.elementForces.find(f => f.elementId === member)!;
  return Math.abs(evaluateDiagramAt(forces, 'momentZ', after) - evaluateDiagramAt(forces, 'momentZ', before));
}

for (const mode of ['2d', '3d'] as const) {
  it(`#2459 clears a restored legacy planar point couple (${mode})`, () => {
    const member = cantilever(mode);
    restorePointCouple(member, { mz: legacyMoment });
    expect(modelStore.updateLoad(loadId, { my: 0 })).toBe(true);
    expect(momentJump(mode, member)).toBeCloseTo(0, 4);
  });

  it(`#2459 replaces a restored legacy planar point couple (${mode})`, () => {
    const member = cantilever(mode);
    restorePointCouple(member, { mz: legacyMoment });
    expect(modelStore.updateLoad(loadId, { my: 3 })).toBe(true);
    expect(momentJump(mode, member)).toBeCloseTo(3, 4);
  });

  it(`#2459 edits a restored canonical planar point couple (${mode})`, () => {
    const member = cantilever(mode);
    restorePointCouple(member, { my: legacyMoment });
    expect(modelStore.updateLoad(loadId, { my: 3 })).toBe(true);
    expect(momentJump(mode, member)).toBeCloseTo(3, 4);
    expect(modelStore.updateLoad(loadId, { my: 0 })).toBe(true);
    expect(momentJump(mode, member)).toBeCloseTo(0, 4);
  });
}

function planeMoment(result: AnalysisResults | string | null | undefined, member: number, at: number) {
  if (!result || typeof result === 'string') return result;
  return Math.abs(computeDiagramValueAt('moment', at, result.elementForces.find(f => f.elementId === member)!));
}

function spaceMoment(result: AnalysisResults3D | string | null | undefined, member: number, at: number) {
  if (!result || typeof result === 'string') return result;
  return Math.abs(evaluateDiagramAt(result.elementForces.find(f => f.elementId === member)!, 'momentZ', at));
}

function comboResult<R>(result: { perCombo: Map<number, R> } | string | null) {
  return result && typeof result !== 'string' ? result.perCombo.get(combination.id) : result;
}

async function planeSolves() {
  const model = modelStore.model;
  const solves = {
    sync: validateAndSolve2D(model),
    async: await validateAndSolve2DAsync(model),
    combination: comboResult(solveCombinations2D(model, cases, combinations)),
  };
  const input = typeof solves.sync === 'string' ? null : buildSolverInput2D(model);
  return input ? { ...solves, pdelta: solvePDelta(input).results as AnalysisResults } : solves;
}

async function spaceSolves() {
  const model = modelStore.model;
  return {
    sync: validateAndSolve3D(model),
    async: await validateAndSolve3DAsync(model),
    combination: comboResult(solveCombinations3D(model, cases, combinations)),
    parallel: comboResult(await solveCombinations3DParallel(model, cases, combinations)),
    direct: comboResult(await runDirectAnalysis(model, cases, combinations, { includeSelfWeight: false })),
  };
}

for (const mode of ['2d', '3d', 'pro', 'pdelta'] as const) {
  for (const edited of [0, 3]) {
    it(`#2459 solves the edited member moment ${edited} through ${mode} analysis`, async () => {
      const member = cantilever(mode);
      restorePointCouple(member, { mz: legacyMoment });
      const root = modelStore.model.elements.get(member)!.nodeI;
      modelStore.addNodalLoad(root, 1, 0, 0, loadCase.id);
      expect(modelStore.updateLoad(loadId, { my: edited })).toBe(true);
      expect(hasNonlinearBehaviour(modelStore.model)).toBe(mode === 'pro');
      const readings = mode === '2d'
        ? Object.entries(await planeSolves()).map(([path, result]) => [path, planeMoment(result, member, before), planeMoment(result, member, after)] as const)
        : Object.entries(await spaceSolves()).map(([path, result]) => [path, spaceMoment(result, member, before), spaceMoment(result, member, after)] as const);
      for (const [path, upstream, downstream] of readings) {
        expect.soft(upstream, path).toBeCloseTo(edited, 4);
        expect.soft(downstream, path).toBeCloseTo(0, 4);
      }
    });
  }
}

function openLegacyFile(type: 'pointOnElement' | 'nodal', fields: Record<string, unknown>) {
  const file = JSON.parse(serializeProject());
  file.version = '1.0';
  file.snapshot.loads = [{ type, data: { id: loadId, ...fields } }];
  expect(deserializeProject(JSON.stringify(file))).toBe(true);
}

function expectCanonicalMoment(value: number) {
  const load = modelStore.loads[0];
  if (load?.type !== 'nodal' && load?.type !== 'pointOnElement') throw new Error('Expected a planar moment load');
  expect.soft(load.data).not.toHaveProperty('mz');
  expect.soft(modelStore.snapshot().loads[0]?.data).not.toHaveProperty('mz');
  expect.soft(load.data.my ?? 0).toBe(value);
}

for (const mode of ['2d', '3d'] as const) {
  for (const type of ['pointOnElement', 'nodal'] as const) {
    it(`#2459 keeps ${type} edits through history and save/open (${mode})`, () => {
      const member = cantilever(mode);
      const fields = type === 'pointOnElement'
        ? { elementId: member, a: position, p: 0, mz: legacyMoment }
        : { nodeId: modelStore.model.elements.get(member)!.nodeJ, fx: 0, fz: 0, mz: legacyMoment };
      openLegacyFile(type, fields);
      const readMoment = () => mode === '2d'
        ? planeMoment(validateAndSolve2D(modelStore.model), member, before)
        : spaceMoment(validateAndSolve3D(modelStore.model), member, before);
      const checkMoment = (value: number) => {
        expect.soft(readMoment()).toBeCloseTo(value, 4);
        expectCanonicalMoment(value);
      };
      checkMoment(legacyMoment);

      expect(modelStore.updateLoad(loadId, { my: 0 })).toBe(true);
      checkMoment(0);
      historyStore.undo();
      checkMoment(legacyMoment);
      historyStore.redo();
      checkMoment(0);
      expect(deserializeProject(serializeProject())).toBe(true);
      checkMoment(0);

      expect(modelStore.updateLoad(loadId, { my: 3 })).toBe(true);
      checkMoment(3);
      historyStore.undo();
      checkMoment(0);
      historyStore.redo();
      checkMoment(3);
      expect(deserializeProject(serializeProject())).toBe(true);
      checkMoment(3);
    });
  }

  for (const aliases of [{ my: legacyMoment, mz: legacyMoment }, { my: legacyMoment, mz: 0 }, { my: 0, mz: legacyMoment }]) {
    it(`#2459 collapses compatible aliases ${JSON.stringify(aliases)} (${mode})`, () => {
      const member = cantilever(mode);
      restorePointCouple(member, aliases);
      expect(momentJump(mode, member)).toBeCloseTo(legacyMoment, 4);
      expectCanonicalMoment(legacyMoment);
    });
  }

  it(`#2459 treats an explicit zero nodal moment as zero (${mode})`, () => {
    const member = cantilever(mode);
    const nodeId = modelStore.model.elements.get(member)!.nodeJ;
    openLegacyFile('nodal', { nodeId, fx: 0, fz: 0, my: 0, mz: legacyMoment });
    const moment = mode === '2d'
      ? planeMoment(validateAndSolve2D(modelStore.model), member, before)
      : spaceMoment(validateAndSolve3D(modelStore.model), member, before);
    expect(moment).toBeCloseTo(0, 4);
    expectCanonicalMoment(0);
  });

  for (const type of ['pointOnElement', 'nodal'] as const) {
    it(`#2459 preserves a genuine ${type} conflict and refuses the solve (${mode})`, async () => {
      const member = cantilever(mode);
      const nodeId = modelStore.model.elements.get(member)!.nodeJ;
      const aliases = { my: legacyMoment, mz: -legacyMoment };
      const fields = type === 'pointOnElement' ? { elementId: member, a: position, p: 0 } : { nodeId, fx: 0, fz: 0 };
      openLegacyFile(type, { ...fields, ...aliases });
      expect(modelStore.updateLoad(loadId, { caseId: 1 })).toBe(true);
      expect(deserializeProject(serializeProject())).toBe(true);
      expect(modelStore.loads[0]?.data).toMatchObject(aliases);
      const solve = () => mode === '2d' ? validateAndSolve2D(modelStore.model) : validateAndSolve3D(modelStore.model);
      const key = type === 'pointOnElement' ? 'svc.planarPointLoadMomentAliases' : 'svc.planarNodalLoadMomentAliases';
      const refusal = t(key).replace('{load}', String(loadId))
        .replace('{n}', String(type === 'pointOnElement' ? member : nodeId));
      const solves = mode === '2d' ? await planeSolves() : await spaceSolves();
      if (mode === '2d') {
        expect.soft(modelStore.solve()).toContain(refusal);
        expect.soft(await modelStore.solveAsync()).toContain(refusal);
      }
      for (const [path, result] of Object.entries(solves)) {
        expect.soft(typeof result === 'string' ? result : 'solve did not refuse', path).toContain(refusal);
      }
      expect(modelStore.updateLoad(loadId, { my: 0 })).toBe(true);
      expectCanonicalMoment(0);
      const result = solve();
      expect.soft(result).toMatchObject({ elementForces: expect.any(Array) });
    });
  }
}

function openLegacyMoment(member: number, type: 'pointOnElement' | 'nodal', conflict: boolean) {
  const nodeId = modelStore.model.elements.get(member)!.nodeJ;
  const fields = type === 'pointOnElement' ? { elementId: member, a: position, p: 0 } : { nodeId, fx: 0, fz: 0 };
  const moments = conflict ? { my: legacyMoment, mz: -legacyMoment } : { mz: legacyMoment };
  openLegacyFile(type, { ...fields, ...moments, caseId: loadCase.id });
  historyStore.clear();
  const key = type === 'pointOnElement' ? 'svc.planarPointLoadMomentAliases' : 'svc.planarNodalLoadMomentAliases';
  return t(key).replace('{load}', String(loadId)).replace('{n}', String(type === 'pointOnElement' ? member : nodeId));
}

for (const mode of ['2d', '3d', 'pro', 'pdelta'] as const) {
  for (const type of ['pointOnElement', 'nodal'] as const) {
    for (const conflict of [true, false]) {
      it(`#2459 an empty ${type} moment edit preserves the restored load (${mode}, conflict=${conflict})`, async () => {
        const member = cantilever(mode);
        const refusal = openLegacyMoment(member, type, conflict);
        const root = modelStore.model.elements.get(member)!.nodeI;
        modelStore.addNodalLoad(root, 1, 0, 0, loadCase.id);
        historyStore.clear();
        const original = { ...modelStore.loads[0]!.data };
        const read = async () => mode === '2d'
          ? Object.entries({ ...await planeSolves(), store: modelStore.solve(), storeAsync: await modelStore.solveAsync() })
            .map(([path, result]) => [path, planeMoment(result, member, before)] as const)
          : Object.entries(await spaceSolves()).map(([path, result]) => [path, spaceMoment(result, member, before)] as const);

        expect.soft(modelStore.updateLoad(loadId, { my: null })).toBe(false);
        expect.soft(modelStore.loads[0]?.data).toStrictEqual(original);
        expect.soft(historyStore.canUndo).toBe(false);
        for (const [path, result] of await read()) {
          if (conflict) expect.soft(result, path).toEqual(expect.stringContaining(refusal));
          else expect.soft(result, path).toBeCloseTo(legacyMoment, 4);
        }
        if (conflict && mode === '2d') expect.soft(() => buildSolverInput2D(modelStore.model)).toThrow(refusal);

        expect(modelStore.updateLoad(loadId, { my: 3 })).toBe(true);
        expectCanonicalMoment(3);
        for (const [path, result] of await read()) expect.soft(result, path).toBeCloseTo(3, 4);
      });
    }
  }
}

for (const mode of ['2d', '3d'] as const) {
  for (const type of ['pointOnElement', 'nodal'] as const) {
    it(`#2459 invalid ${type} moment values reject the entire patch (${mode})`, () => {
      const member = cantilever(mode);
      for (const conflict of [true, false]) {
        for (const value of [undefined, NaN, '', Infinity, -Infinity]) {
          openLegacyMoment(member, type, conflict);
          const original = { ...modelStore.loads[0]!.data };
          const input = `my=${JSON.stringify(String(value))}, conflict=${conflict}`;
          expect.soft(modelStore.updateLoad(loadId, { my: value, caseId: loadCase.id + 1 }), input).toBe(false);
          expect.soft(modelStore.loads[0]?.data, input).toStrictEqual(original);
          expect.soft(historyStore.canUndo, input).toBe(false);
        }
      }
    });
  }
}

for (const mode of ['2d', '3d', 'pro', 'pdelta'] as const) {
  for (const type of ['pointOnElement', 'nodal'] as const) {
    for (const [field, input] of [
      ['my', '1e400'], ['mz', '-1e400'], ['my', 'null'], ['mz', 'null'], ['my', NaN], ['mz', NaN],
    ] as const) {
      it(`#2459 keeps invalid ${type} ${field}=${input} refusing after save and reopen (${mode})`, async () => {
        const member = cantilever(mode);
        const nodeId = modelStore.model.elements.get(member)!.nodeJ;
        const fields = type === 'pointOnElement' ? { elementId: member, a: position, p: 0 } : { nodeId, fx: 0, fz: 0 };
        const project = JSON.parse(serializeProject());
        if (field === 'mz') project.version = '1.0';
        const otherAlias = field === 'my' ? 'mz' : 'my';
        const data = { id: loadId, caseId: loadCase.id, ...fields };
        project.snapshot.loads = [{ type, data: {
          ...data, ...(input === 'null' ? { [otherAlias]: legacyMoment } : {}), [field]: input,
        } }];
        if (typeof input === 'number') {
          modelStore.restore(project.snapshot);
        } else {
          const file = new File([JSON.stringify(project).replace(JSON.stringify(input), input)], 'invalid-moment.ded');
          if (input === 'null') await loadFile(file);
          else await loadProject(file);
        }

        const key = type === 'pointOnElement' ? 'svc.planarPointLoadMomentAliases' : 'svc.planarNodalLoadMomentAliases';
        const refusal = t(key).replace('{load}', String(loadId))
          .replace('{n}', String(type === 'pointOnElement' ? member : nodeId));
        async function expectRefusal(stage: string) {
          const readings = mode === '2d'
            ? Object.entries({ ...await planeSolves(), store: modelStore.solve(), storeAsync: await modelStore.solveAsync() })
              .map(([path, result]) => [path, planeMoment(result, member, before)] as const)
            : Object.entries(await spaceSolves()).map(([path, result]) => [path, spaceMoment(result, member, before)] as const);
          for (const [path, moment] of readings) {
            expect.soft(moment, `${stage}, ${path}`).toEqual(expect.stringContaining(refusal));
          }
          if (mode === '2d') expect.soft(() => buildSolverInput2D(modelStore.model), stage).toThrow(refusal);
        }

        expect(hasNonlinearBehaviour(modelStore.model)).toBe(mode === 'pro');
        await expectRefusal('opened');
        expect.soft(modelFeatures(modelStore.snapshot(), { storedLoads: project.snapshot.loads })).toContain(
          type === 'pointOnElement' ? 'legacyPlanarPointCoupleAliases' : 'invalidPlanarNodalMomentAliases',
        );
        const saved = serializeProject();
        expect.soft(JSON.parse(saved).snapshot.loads[0].data).toStrictEqual(modelStore.snapshot().loads[0]?.data);
        expect(deserializeProject(saved)).toBe(true);
        await expectRefusal('reopened');

        const readMoment = () => mode === '2d'
          ? planeMoment(validateAndSolve2D(modelStore.model), member, before)
          : spaceMoment(validateAndSolve3D(modelStore.model), member, before);
        expect(modelStore.updateLoad(loadId, { my: legacyMoment })).toBe(true);
        expect.soft(readMoment()).toBeCloseTo(legacyMoment, 4);

        project.snapshot.loads = [{ type, data }];
        expect(deserializeProject(JSON.stringify(project))).toBe(true);
        expect.soft(readMoment()).toBe(0);
      });
    }
  }
}

it('#2459 preserves result-change applicability when opening and resaving a legacy couple', async () => {
  const member = cantilever('3d');
  const file = JSON.parse(serializeProject());
  delete file.snapshot.solvedWith;
  file.snapshot.loads = [{
    type: 'pointOnElement', data: { id: loadId, elementId: member, a: position, p: 0, my: 0, mz: legacyMoment },
  }];
  expect(deserializeProject(JSON.stringify(file))).toBe(true);
  expectCanonicalMoment(legacyMoment);
  await vi.waitFor(() => expect(recheckStore.assessment?.changes.map(c => c.id)).toEqual(expect.arrayContaining([
    'planar-point-couple-aliases', 'restored-planar-moment-edits',
  ])));
  expect(deserializeProject(serializeProject())).toBe(true);
  await vi.waitFor(() => expect(recheckStore.assessment?.changes.map(c => c.id)).toContain('restored-planar-moment-edits'));
});
