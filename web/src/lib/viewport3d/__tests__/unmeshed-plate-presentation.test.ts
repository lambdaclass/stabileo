import * as THREE from 'three';
import { expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { createPlate } from '../../store/physical-plates';
import { syncShells, type SceneSyncContext } from '../scene-sync';

it.each(['3d', 'pro'] as const)('known wrong result: #1928 an unmeshed plate follows its outline through upright and native %s presentations', mode => {
  modelStore.clear();
  uiStore.analysisMode = mode;
  uiStore.renderMode3D = 'solid';
  const outline = [[0, 0], [4, 0], [4, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const result = createPlate({ outline, materialId: 1, thickness: 0.15 });
  if (!('id' in result)) throw Error(result.problem);
  const ctx = { initialized: true, shellsParent: new THREE.Group(), shellGroups: new Map() } as SceneSyncContext;
  for (const presentation of ['native3d', 'upright2dIn3d', 'native3d'] as const) {
    uiStore.viewportPresentation3D = presentation;
    syncShells(ctx);
    const bounds = new THREE.Box3().setFromObject(ctx.shellGroups.get(`P${result.id}`)!);
    expect(bounds.min.toArray()).toEqual([0, 0, 0]);
    expect(bounds.max.toArray()).toEqual(presentation === 'native3d' ? [4, 2, 0] : [4, 0, 2]);
  }
});
