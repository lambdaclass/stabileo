/**
 * A plate not meshed yet is drawn where its offset puts it, as its mesh will be: a slab hanging
 * half its thickness below the level shows its top on the level, flush with the beams dropped to it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store';
import { NodesInstanced } from '../../three/nodes-instanced';
import { ElementsBatched } from '../../three/elements-batched';
import { ElementsPicking } from '../../three/elements-picking';
import { syncShells, type SceneSyncContext } from '../scene-sync';
import { createPlate, setPlateOffset } from '../../store/physical-plates';

function makeCtx(): SceneSyncContext {
  const g = () => new THREE.Group();
  return {
    initialized: true,
    nodesParent: g(), elementsParent: g(), supportsParent: g(), loadsParent: g(),
    resultsParent: g(), shellsParent: g(), scene: new THREE.Scene(),
    nodesInstanced: new NodesInstanced(), elementsBatched: new ElementsBatched(), elementsPicking: new ElementsPicking(),
    elementGroups: new Map(), supportGizmos: new Map(), shellGroups: new Map(),
    loadGroup: null, localAxesGroup: null, offsetVizGroup: null, shellOffsetVizGroup: null,
    localAxesParent: g(), colorMapApplied: false,
  } as unknown as SceneSyncContext;
}

describe('a plate not meshed yet', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; uiStore.renderMode3D = 'solid'; });

  it('is drawn at its offset, its mid-plane half its thickness below the level when it hangs', () => {
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const ns = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    const { id } = createPlate({ outline: ns, materialId: mat, thickness: 0.2 }) as { id: number };
    const mid = () => {
      const ctx = makeCtx();
      syncShells(ctx);
      const box = new THREE.Box3().setFromObject(ctx.shellGroups.get(`P${id}`)!);
      return (box.max.z + box.min.z) / 2;
    };
    expect(mid()).toBeCloseTo(3, 6);
    setPlateOffset(id, { frame: 'global', x: 0, y: 0, z: -0.1 });
    expect(mid()).toBeCloseTo(2.9, 6);
  });
});
