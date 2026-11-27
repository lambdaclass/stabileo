import { beforeAll, expect, it } from 'vitest';
import { initSolver } from '../wasm-solver';
import { modelStore, uiStore } from '../../store';
import { buildProjectFile, deserializeProject } from '../../store/file';

beforeAll(initSolver);

function checkDisplacement(workspace: '2d' | '3d', alpha: number) {
  modelStore.clear();
  uiStore.analysisMode = workspace;
  const length = 4;
  const temperature = 20;
  const material = modelStore.addMaterial({ name: 'Thermal specimen', e: 30000, nu: 0.2, rho: 25, alpha });
  const fixed = modelStore.addNode(0, 0, 0);
  const free = modelStore.addNode(length, 0, 0);
  const member = modelStore.addElement(fixed, free, 'frame');
  modelStore.updateElementMaterial(member, material);
  modelStore.addSupport(fixed, workspace === '2d' ? 'fixed' : 'fixed3d');
  modelStore.addThermalLoad(member, temperature);
  const project = JSON.stringify(buildProjectFile());
  modelStore.clear();
  expect(deserializeProject(project)).toBe(true);
  expect(modelStore.materials.get(material)?.alpha).toBe(alpha);
  const result = workspace === '2d' ? modelStore.solve() : modelStore.solve3D();
  if (!result || typeof result === 'string') throw new Error(String(result));
  const diagnostics = {
    assembly: result.diagnostics ?? [],
    solver: result.solverDiagnostics ?? [],
    structured: result.structuredDiagnostics ?? [],
  };
  const ux = result.displacements.find(d => d.nodeId === free)!.ux;
  expect(ux, JSON.stringify(diagnostics)).toBeCloseTo(alpha * temperature * length, 12);
}

const issue2491 = process.env.RUN_KNOWN_WRONG === '2491' ? it : it.skip;

for (const workspace of ['2d', '3d'] as const) {
  for (const alpha of [0, -5e-6]) {
    issue2491(`known wrong result: #2491 uses the project's explicit α=${alpha} for free expansion in ${workspace}`, () => {
      checkDisplacement(workspace, alpha);
    });
  }

  it(`uses the project's positive coefficient for free expansion in ${workspace}`, () => {
    checkDisplacement(workspace, 5e-6);
  });
}
