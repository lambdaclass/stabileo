import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { SolveAccountingError } from '../../engine/plate-accounting';
import * as shellOffsets from '../../engine/shell-offsets';
import { modelStore, uiStore } from '..';
import { applyPlateMeshes, createPlate, planPlateMesh, plateEntry } from '../physical-plates';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); uiStore.analysisMode = 'pro'; });
afterEach(() => { vi.restoreAllMocks(); });

function plate(element: 'quad' | 'tri') {
  const outline = [[0, 0], [4, 0], [4, 5], [0, 5]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  for (const id of outline) modelStore.addSupport(id, 'fixed3d');
  const made = createPlate({ name: 'Offset floor', outline, materialId: 1, thickness: 0.2, mesh: { size: 2, element, followMembers: false } });
  if ('problem' in made) throw Error(made.problem);
  expect(applyPlateMeshes([planPlateMesh(made.id)!]).plates).toBe(1);
  const members = plateEntry(made.id)!.group.members;
  const id = element === 'quad' ? members.quads![0]! : members.plates![0]!;
  modelStore.setShellOffset(element === 'quad' ? 'quad' : 'plate', id, { frame: 'local', x: 0, y: 0, z: 0.1 });
  return id;
}

it.skip.each(['quad', 'tri'] as const)('known wrong result: #2461 %s accounting checks the requested offset layout even when the expander drops it', element => {
  const id = plate(element);
  const rows = element === 'quad' ? modelStore.model.quads : modelStore.model.plates;
  const original = rows.get(id)!.nodes;
  const shellNodes = (input: ReturnType<typeof modelStore.buildSolverInput3D>) =>
    (element === 'quad' ? input?.quads : input?.plates)?.get(id)?.nodes;
  expect(shellNodes(modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false }))).toEqual(original);
  expect(shellNodes(modelStore.buildSolverInput3D())).not.toEqual(original);
  vi.spyOn(shellOffsets, 'expandShellOffsets').mockReturnValue(new Set());
  expect(() => modelStore.buildSolverInput3D()).toThrow(SolveAccountingError);
  modelStore.setShellOffset(element === 'quad' ? 'quad' : 'plate', id, undefined);
  expect(shellNodes(modelStore.buildSolverInput3D())).toEqual(original);
});

it.skip.each(['quad', 'tri'] as const)('known wrong result: #2461 %s refuses a measurable offset that the current expander omits', element => {
  const id = plate(element);
  const kind = element === 'quad' ? 'quad' : 'plate';
  for (const z of [5e-10, 1e-9, -1e-9]) {
    modelStore.setShellOffset(kind, id, { frame: 'global', x: 0, y: 0, z });
    expect(() => modelStore.buildSolverInput3D()).toThrow(SolveAccountingError);
  }
  modelStore.setShellOffset(kind, id, { frame: 'global', x: 0, y: 0, z: 2e-9 });
  expect(modelStore.buildSolverInput3D()).not.toBeNull();
});
