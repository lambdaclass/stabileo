import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { applyWorkbook } from '../../excel-import/apply';
import { globalAxes } from '../../features';
import { assessProject } from '../../provenance/applicability';
import { RESULT_CHANGES } from '../../provenance/full-registry';
import { stampSolve } from '../../provenance/solve-stamp';
import { modelStore, uiStore } from '../../store';
import { NO_RELEASE } from '../../store/model.svelte';
import { displayedLoads3D } from '../../store/displayed-loads-3d';
import { deserializeProject, serializeProject } from '../../store/file';
import { GRAVITY_SELF_WEIGHT } from '../analysis-settings';
import {
  buildSolverInput2D, buildSolverInput3D, caseSolverLoads3D, linearSolveInput3D, solveCombinations2D,
  validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D, validateAndSolve3DAsync, type ModelData,
} from '../solver-service';
import { appliedResultant } from '../statics-check';
import { initSolver, solvePDelta, solvePDelta3D } from '../wasm-solver';

const reproduce = process.env.RUN_KNOWN_WRONG === '2364' ? it : it.skip;
const length = 2;
const density = 20;
const area = 0.025;
const tipForce = 4;
const gravity = density * area * length;
const dead = { id: 1, name: 'Dead', type: 'D' as const };
const caseWeight = { caseId: dead.id, ...GRAVITY_SELF_WEIGHT };

function cantilever(dim: '2D' | '3D', caseWeights = false): ModelData {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: length, y: 0 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: NO_RELEASE, releaseJ: NO_RELEASE }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: dim === '2D' ? 'fixed' : 'fixed3d' }]]),
    materials: new Map([[1, { id: 1, name: 'Test material', e: 30000, nu: 0.2, rho: density }]]),
    sections: new Map([[1, { id: 1, name: 'Test section', a: area, iy: 0.0001, iz: 0.0001, j: 0.0001 }]]),
    loads: dim === '2D'
      ? [{ type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fz: -tipForce, my: 0, caseId: dead.id } }]
      : [{ type: 'nodal3d', data: { id: 1, nodeId: 2, fx: 0, fy: 0, fz: -tipForce, mx: 0, my: 0, mz: 0, caseId: dead.id } }],
    analysis: { standaloneSelfWeight: 'gravity', selfWeight: caseWeights ? [caseWeight] : [] },
  };
}

function solved<T>(result: T | string | null): T {
  if (!result || typeof result === 'string') throw new Error(String(result));
  return result;
}

beforeAll(async () => { await initSolver(); });
beforeEach(() => vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production')));
afterEach(() => {
  modelStore.clear();
  vi.unstubAllGlobals();
});

for (const caseWeights of [false, true]) {
  reproduce.each(['sync', 'async', 'P-Delta'] as const)(
    `known wrong result: #2364 2D %s honors standalone gravity off (case rules: ${caseWeights})`, async (entry) => {
      const model = cantilever('2D', caseWeights);
      const reaction = async (include: boolean) => {
        if (entry === 'P-Delta') {
          const result = solvePDelta(buildSolverInput2D(model, include)!);
          expect(result.converged).toBe(true);
          return result.results.reactions[0].rz;
        }
        const result = entry === 'sync' ? validateAndSolve2D(model, include) : await validateAndSolve2DAsync(model, include);
        return solved(result).reactions[0]!.rz;
      };
      expect(await reaction(true)).toBeCloseTo(tipForce + gravity, 10);
      expect(await reaction(false)).toBeCloseTo(tipForce, 10);
    });

  reproduce.each(['sync', 'async', 'nonlinear sync', 'nonlinear async', 'P-Delta'] as const)(
    `known wrong result: #2364 3D %s honors standalone gravity off (case rules: ${caseWeights})`, async (entry) => {
      const model = cantilever('3D', caseWeights);
      const nonlinear = entry.startsWith('nonlinear');
      if (nonlinear) model.supports.get(1)!.uplift = true;
      const reaction = async (include: boolean) => {
        if (entry === 'P-Delta') {
          const result = solvePDelta3D(buildSolverInput3D(model, include)!);
          expect(result.converged).toBe(true);
          return result.results.reactions[0].fz;
        }
        const result = entry === 'sync' || entry === 'nonlinear sync'
          ? validateAndSolve3D(model, include) : await validateAndSolve3DAsync(model, include);
        const answer = solved(result);
        expect(!!answer.nonlinear).toBe(nonlinear);
        return answer.reactions[0]!.fz;
      };
      expect(await reaction(true)).toBeCloseTo(tipForce + gravity, 10);
      expect(await reaction(false)).toBeCloseTo(tipForce, 10);
    });
}

reproduce('known wrong result: #2364 production reopens an imported model with standalone gravity off', () => {
  uiStore.analysisMode = '3d';
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('test'));
  const workbook = {
    Nodes: [['id', 'x', 'y', 'z'], [1, 0, 0, 0], [2, length, 0, 0], [3, 0, 1, 0]],
    Materials: [['id', 'name', 'E', 'nu', 'rho'], [1, 'Test material', 30000, 0.2, density]],
    Sections: [['id', 'name', 'A', 'Iy', 'Iz', 'J'], [1, 'Test section', area, 0.0001, 0.0001, 0.0001]],
    Members: [['id', 'type', 'nodeI', 'nodeJ', 'material', 'section'], [1, 'frame', 1, 2, 1, 1], [2, 'frame', 1, 3, 1, 1]],
    Supports: [['node', 'type'], [1, 'fixed3d']],
    Loads: [['type', 'case', 'node', 'fz'], ['nodal3d', dead.id, 2, -tipForce]],
    SelfWeight: [['source', 'case', 'direction', 'factor', 'scope'], ['single', '', GRAVITY_SELF_WEIGHT.direction, GRAVITY_SELF_WEIGHT.factor, 'all']],
  };
  const imported = applyWorkbook(workbook);
  expect(imported.problems).toEqual([]);
  expect(imported.loaded.elements).toBe(2);
  expect(uiStore.includeSelfWeight).toBe(true);
  uiStore.includeSelfWeight = false;
  const text = serializeProject();
  modelStore.clear();

  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  expect(globalAxes()).toBe(false);
  expect(applyWorkbook(workbook).loaded.elements).toBe(0);
  expect(deserializeProject(text)).toBe(true);
  expect(modelStore.analysis?.standaloneSelfWeight).toBe('gravity');
  expect(uiStore.includeSelfWeight).toBe(false);

  const off = solved(modelStore.solve3D(uiStore.includeSelfWeight));
  expect(off.reactions[0]!.fz).toBeCloseTo(tipForce, 10);
  expect(displayedLoads3D(off)).toEqual(modelStore.loads);
  uiStore.includeSelfWeight = true;
  const on = solved(modelStore.solve3D(uiStore.includeSelfWeight));
  expect(on.reactions[0]!.fz).toBeCloseTo(tipForce + density * area * (length + 1), 10);
  expect(displayedLoads3D(on).filter(load => load.type === 'distributed3d')).toHaveLength(2);
});

reproduce('known wrong result: #2364 exported linear input honors standalone gravity off', () => {
  const model = cantilever('3D', true);
  const baseline = { ...model, analysis: { selfWeight: [] } };
  expect(solved(linearSolveInput3D(model, false)).wire()).toEqual(solved(linearSolveInput3D(baseline, false)).wire());
});

reproduce('known wrong result: #2364 the statics result uses the standalone toggle', () => {
  const model = cantilever('3D', true);
  for (const includeSelfWeight of [false, true]) {
    const resultant = appliedResultant(model, null, { includeSelfWeight });
    expect(resultant.selfWeightIncluded).toBe(includeSelfWeight);
    expect(resultant.applied.fz).toBeCloseTo(-tipForce - (includeSelfWeight ? gravity : 0), 10);
  }
});

reproduce('known wrong result: #2364 recheck covers saved projects whose marker could override gravity off', () => {
  const change = RESULT_CHANGES.changes.find(entry => entry.id === 'standalone-gravity-toggle');
  expect(change).toBeDefined();
  const stamp = { ...stampSolve('linear', null), resultsVersion: change!.resultsVersion - 1 };
  const saved = {
    analysisMode: '3d',
    analysis: cantilever('3D').analysis,
    elements: [...cantilever('3D').elements],
  };
  for (const includeSelfWeight of [false, undefined]) {
    expect(assessProject({ ...saved, includeSelfWeight }, stamp).changes).toContainEqual(change);
  }
  expect(assessProject({ ...saved, includeSelfWeight: true }, stamp).changes).not.toContainEqual(change);
  expect(assessProject({ ...saved, analysis: { selfWeight: [] } }, stamp).changes).not.toContainEqual(change);
  expect(assessProject({ ...saved, elements: [] }, stamp).changes).not.toContainEqual(change);
  expect(assessProject(saved, { ...stamp, resultsVersion: change!.resultsVersion }).changes).not.toContainEqual(change);
});

it('explicit case rules still count with the standalone toggle off', () => {
  const model = cantilever('2D', true);
  const combo = { id: 1, name: dead.name, factors: [{ caseId: dead.id, factor: 1 }] };
  const planar = solved(solveCombinations2D(model, [dead], [combo], false));
  expect(planar.perCase.get(dead.id)!.reactions[0]!.rz).toBeCloseTo(tipForce + gravity, 10);

  const spatial = cantilever('3D', true);
  const caseLoads = caseSolverLoads3D(spatial, [dead], false, false);
  expect(caseLoads.get(dead.id)).toEqual(buildSolverInput3D(spatial, true)!.loads);
  expect(appliedResultant(spatial, dead.id, { includeSelfWeight: false }).applied.fz).toBeCloseTo(-tipForce - gravity, 10);

  spatial.analysis = { selfWeight: [caseWeight] };
  expect(solved(validateAndSolve3D(spatial, false)).reactions[0]!.fz).toBeCloseTo(tipForce + gravity, 10);
});
