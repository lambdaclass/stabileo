import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { applyPlateMeshes, createPlate, planPlateMesh } from '../../store/physical-plates';
import { syncLoads, type SceneSyncContext } from '../scene-sync';

it.each(['3d', 'pro'] as const)('known wrong result: #1928 each published shell load can be picked in %s piece and mesh views', mode => {
  modelStore.clear();
  historyStore.clear();
  uiStore.analysisMode = mode;
  uiStore.showLoads3D = true;
  const outline = [[0, 0], [4, 0], [4, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const result = createPlate({ outline, materialId: 1, thickness: 0.15 });
  if (!('id' in result)) throw Error(result.problem);
  const plan = planPlateMesh(result.id, { element: 'quad', size: 1, followMembers: false })!;
  expect(plan.mesh).toBeTruthy();
  applyPlateMeshes([plan]);
  const cells = [...modelStore.quads.keys()];
  expect(cells.length).toBeGreaterThan(1);
  const ids = cells.map(cell => modelStore.addSurfaceLoad3D(cell, -3, 1));
  const sheet = { width: 0, height: 0, getContext: () => ({ fillText() {}, measureText: () => ({ width: 10 }) }) };
  vi.stubGlobal('document', { createElement: () => sheet });
  vi.stubGlobal('window', {});
  try {
    const ctx = { initialized: true, loadsParent: new THREE.Group() } as SceneSyncContext;
    for (const mesh of [true, false, true]) {
      uiStore.platesShowMesh = mesh;
      syncLoads(ctx);
      const expected = __PUBLIC_FEATURES__.proPlatesUnified && !mesh ? ids.slice(0, 1) : ids;
      expect([...ctx.loadFootprints!.keys()]).toEqual(expected);
    }
  } finally {
    vi.unstubAllGlobals();
    modelStore.clear();
  }
});
