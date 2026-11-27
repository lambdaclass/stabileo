import { beforeAll, expect, it } from 'vitest';
import { initSolver, solvePDelta, solvePDelta3D } from '../wasm-solver';
import type { AnalysisResults } from '../types';
import type { AnalysisResults3D } from '../types-3d';
import { modelStore, uiStore } from '../../store';
import { buildProjectFile, deserializeProject } from '../../store/file';

beforeAll(initSolver);

async function checkDisplacement(workspace: '2d' | '3d', alpha: number | undefined, worker = false, strain = 0, secondOrder = false) {
  modelStore.clear();
  uiStore.analysisMode = workspace;
  const length = 4;
  const temperature = 20;
  const material = modelStore.addMaterial({ name: 'Thermal specimen', e: alpha === undefined ? 11000 : 30000, nu: 0.2, rho: 25, alpha });
  const fixed = modelStore.addNode(0, 0, 0);
  const free = modelStore.addNode(length, 0, 0);
  const member = modelStore.addElement(fixed, free, 'frame');
  modelStore.updateElementMaterial(member, material);
  modelStore.addSupport(fixed, workspace === '2d' ? 'fixed' : 'fixed3d');
  const load = modelStore.addThermalLoad(member, temperature);
  if (strain) modelStore.updateLoad(load, { strain });
  const project = JSON.stringify(buildProjectFile());
  modelStore.clear();
  expect(deserializeProject(project)).toBe(true);
  expect(modelStore.materials.get(material)?.alpha).toBe(alpha);
  const result: AnalysisResults | AnalysisResults3D | string | null = secondOrder
    ? (workspace === '2d' ? solvePDelta(modelStore.buildSolverInput()!).results : solvePDelta3D(modelStore.buildSolverInput3D()!).results)
    : workspace === '2d'
    ? (worker ? await modelStore.solveAsync() : modelStore.solve())
    : (worker ? await modelStore.solve3DAsync() : modelStore.solve3D());
  if (!result || typeof result === 'string') throw new Error(String(result));
  const diagnostics = {
    assembly: result.diagnostics ?? [],
    solver: result.solverDiagnostics ?? [],
    structured: result.structuredDiagnostics ?? [],
  };
  expect(diagnostics.structured.some(d => d.code === 'thermal_default_assumed' && d.phase === 'alpha')).toBe(alpha === undefined);
  const ux = result.displacements.find(d => d.nodeId === free)!.ux;
  expect(ux, JSON.stringify(diagnostics)).toBeCloseTo(((alpha ?? 12e-6) * temperature + strain) * length, 12);
}

for (const workspace of ['2d', '3d'] as const) {
  for (const alpha of [0, -5e-6]) {
    it(`#2656 uses the project's explicit α=${alpha} for free expansion in ${workspace}`, () => {
      return checkDisplacement(workspace, alpha);
    });
  }

  it(`#2656 reports the missing coefficient in ${workspace}`, () => checkDisplacement(workspace, undefined));

  it(`uses the project's positive coefficient for free expansion in ${workspace}`, () => {
    return checkDisplacement(workspace, 5e-6);
  });
}

for (const workspace of ['2d', '3d'] as const) {
  for (const alpha of [0, -5e-6, 5e-6]) {
    it(`#2656 P-delta ${workspace} expands with α=${alpha}`, () =>
      checkDisplacement(workspace, alpha, false, 0, true));
    it(`#2656 async ${workspace} combines prescribed strain with α=${alpha}`, () =>
      checkDisplacement(workspace, alpha, true, 0.0001));
  }
}
