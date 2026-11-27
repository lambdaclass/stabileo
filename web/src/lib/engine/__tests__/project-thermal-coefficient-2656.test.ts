import { t } from '../../i18n';
import { thermalAlphaOf } from '../thermal-alpha';
import { readFileSync } from 'node:fs';
import { clearSolveResultCache } from '../solver-service';
import { setWorkerFactoryForTests, type WorkerLike } from '../solver-pool';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { initSolver, solvePDelta, solvePDelta3D } from '../wasm-solver';
import type { AnalysisResults } from '../types';
import type { AnalysisResults3D } from '../types-3d';
import { modelStore, uiStore } from '../../store';
import { saveCustomMaterial } from '../../material/custom-material';
import { buildProjectFile, deserializeProject } from '../../store/file';

const jobs: string[] = [];
let lastJob = -1;
let dispatch: (msg: unknown) => Promise<void>;

beforeAll(async () => {
  await initSolver();
  const module = await WebAssembly.compile(readFileSync(new URL('../../wasm/dedaliano_engine_bg.wasm', import.meta.url)));
  const scope = { postMessage: (_msg: any) => {}, onmessage: undefined as unknown as (event: { data: unknown }) => Promise<void> };
  vi.stubGlobal('self', scope);
  await import('../solver-worker');
  dispatch = msg => scope.onmessage({ data: msg });
  await dispatch({ type: 'init', wasmModule: module });
  setWorkerFactoryForTests((): WorkerLike => ({
    onmessage: null, onerror: null, terminate() {},
    postMessage(msg) {
      if (msg.type === 'init') {
        this.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
        return;
      }
      jobs.push(msg.type);
      scope.postMessage = reply => {
        lastJob = reply.id;
        if (reply.result) reply.result.workerJob = reply.id;
        this.onmessage?.({ data: structuredClone(reply) } as MessageEvent);
      };
      void dispatch(structuredClone(msg));
    },
  }));
});
afterAll(() => { setWorkerFactoryForTests(null); vi.unstubAllGlobals(); });

async function checkDisplacement(workspace: '2d' | '3d', alpha: number | undefined, worker = false, strain = 0, secondOrder = false, gradient = 0, edit?: 'basic' | 'pro') {
  modelStore.clear();
  uiStore.analysisMode = workspace;
  const length = 4;
  const temperature = gradient ? 0 : 20;
  const material = modelStore.addMaterial({ name: 'Thermal specimen', userDefined: !edit, e: alpha === undefined ? 70000 : 30000, nu: 0.2, rho: 25, alpha });
  if (edit) {
    const before = modelStore.materials.get(material)!;
    for (const declared of [0, undefined]) {
      if (edit === 'basic') saveCustomMaterial({ ...before, kind: 'custom', alpha: declared }, material);
      else modelStore.updateMaterial(material, { alpha: declared });
    }
  }
  const fixed = modelStore.addNode(0, 0, 0);
  const free = modelStore.addNode(length, 0, 0);
  const member = modelStore.addElement(fixed, free, 'frame');
  modelStore.updateElementMaterial(member, material);
  const section = modelStore.addSection({ name: 'Test rectangle', a: 0.1, iy: 0.001, iz: 0.001, j: 0.001, h: 0.4, b: 0.25 });
  modelStore.updateElementSection(member, section);
  modelStore.addSupport(fixed, workspace === '2d' ? 'fixed' : 'fixed3d');
  const load = modelStore.addThermalLoad(member, temperature, gradient);
  if (strain) modelStore.updateLoad(load, { strain });
  const project = JSON.stringify(buildProjectFile());
  modelStore.clear();
  expect(deserializeProject(project)).toBe(true);
  expect(modelStore.materials.get(material)?.alpha).toBe(alpha);
  const start = jobs.length;
  if (worker) clearSolveResultCache();
  const nonlinear = secondOrder
    ? (workspace === '2d' ? solvePDelta(modelStore.buildSolverInput()!) : solvePDelta3D(modelStore.buildSolverInput3D()!))
    : null;
  if (nonlinear) expect(nonlinear.converged).toBe(true);
  const result: AnalysisResults | AnalysisResults3D | string | null = nonlinear
    ? nonlinear.results
    : workspace === '2d'
    ? (worker ? await modelStore.solveAsync() : modelStore.solve())
    : (worker ? await modelStore.solve3DAsync() : modelStore.solve3D());
  if (!result || typeof result === 'string') throw new Error(String(result));
  if (worker) {
    expect(jobs.slice(start)).toContain(workspace === '2d' ? 'solve' : 'solve3d');
    expect(result).toHaveProperty('workerJob', lastJob);
  }
  const diagnostics = {
    assembly: result.diagnostics ?? [],
    solver: result.solverDiagnostics ?? [],
    structured: result.structuredDiagnostics ?? [],
  };
  expect(diagnostics.structured.some(d => d.code === 'thermal_default_assumed' && d.phase === 'alpha')).toBe(alpha === undefined && !edit);
  const ux = result.displacements.find(d => d.nodeId === free)!.ux;
  expect(ux, JSON.stringify(diagnostics)).toBeCloseTo(((alpha ?? (edit ? 23e-6 : 12e-6)) * temperature + strain) * length, 12);
  return result.displacements.find(d => d.nodeId === free)!.ry;
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
  it('reports the assumed coefficient on worker and P-delta solves in ' + workspace, async () => {
    await checkDisplacement(workspace, undefined, true);
    await checkDisplacement(workspace, undefined, false, 0, true);
  });
  for (const alpha of [0, -5e-6, 5e-6]) {
    it(`#2656 P-delta ${workspace} expands with α=${alpha}`, () =>
      checkDisplacement(workspace, alpha, false, 0, true));
    it(`#2656 async ${workspace} combines prescribed strain with α=${alpha}`, () =>
      checkDisplacement(workspace, alpha, true, 0.0001));
  }
}

for (const workspace of ['2d', '3d'] as const) {
  for (const [worker, secondOrder] of [[false, false], [true, false], [false, true]]) {
    it(`reverses thermal rotation in ${workspace}, worker=${worker}, secondOrder=${secondOrder}`, async () => {
      const rotation = (alpha: number) => checkDisplacement(workspace, alpha, worker, 0, secondOrder, 10);
      const positive = await rotation(5e-6);
      expect(positive).toBeCloseTo((workspace === '2d' ? 1 : -1) * 5e-6 * 10 * 4 / 0.4, 12);
      expect(await rotation(-5e-6)).toBeCloseTo(-positive, 12);
      expect(await rotation(0)).toBe(0);
    });
  }
}

for (const workspace of ['2d', '3d'] as const) for (const edit of ['basic', 'pro'] as const) {
  it('restores automatic aluminium expansion across a thermal-only ' + edit + ' edit in ' + workspace, async () => {
    for (const [worker, secondOrder] of [[false, false], [true, false], [false, true]]) {
      await checkDisplacement(workspace, undefined, worker, 0, secondOrder, 0, edit);
    }
  });
}

for (const workspace of ['2d', '3d'] as const) {
  for (const [worker, secondOrder] of [[false, false], [true, false], [false, true]]) {
    it.each([-0.5, -0.001, 0.001, 0.01])('refuses reopened α=%s before ' + workspace + ' solve, worker=' + worker + ', secondOrder=' + secondOrder, async alpha => {
      await expect(checkDisplacement(workspace, alpha, worker, 0, secondOrder)).rejects.toThrow(t('materials.workbookAlphaInvalid'));
    });
    it.each([-0.000999, 0.000999])('solves inside the coefficient limit at %s in ' + workspace + ', worker=' + worker + ', secondOrder=' + secondOrder, async alpha => {
      await checkDisplacement(workspace, alpha, worker, 0, secondOrder);
    });
  }
}
it.each([NaN, Infinity, -Infinity])('refuses an explicit nonfinite coefficient %s', alpha => {
  expect(() => thermalAlphaOf({ alpha, gradeId: 'A36' })).toThrow();
});

it.each(['2d', '3d'] as const)('refuses invalid material coefficients for combinations and for nonfinite live edits in %s', async mode => {
  await checkDisplacement(mode, 5e-6);
  const member = [...modelStore.elements.values()][0]!;
  const caseId = modelStore.loadCases[0]!.id;
  modelStore.addCombination('Thermal case', [{ caseId, factor: 1 }]);
  for (const alpha of [-0.001, 0.001, Infinity, -Infinity, NaN]) {
    modelStore.updateMaterial(member.materialId, { alpha });
    const message = t('materials.workbookAlphaInvalid');
    if (mode === '2d') {
      expect(modelStore.solveCombinations()).toContain(message);
      expect(modelStore.solve()).toContain(message);
      expect(await modelStore.solveAsync()).toContain(message);
    } else {
      expect(modelStore.solveCombinations3D(false, false, true)).toContain(message);
      expect(await modelStore.solveCombinations3DParallel(false, false, true)).toContain(message);
      expect(modelStore.solve3D()).toContain(message);
      expect(await modelStore.solve3DAsync()).toContain(message);
    }
  }
});
