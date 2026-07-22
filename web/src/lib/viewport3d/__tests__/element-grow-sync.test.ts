import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { modelStore } from '../../store/model.svelte';
import { NodesInstanced } from '../../three/nodes-instanced';
import { ElementsBatched } from '../../three/elements-batched';
import { ElementsPicking } from '../../three/elements-picking';
import { syncElements, type SceneSyncContext } from '../scene-sync';

function makeCtx(): SceneSyncContext {
  const g = () => new THREE.Group();
  return {
    initialized: true,
    nodesParent: g(), elementsParent: g(), supportsParent: g(), loadsParent: g(),
    resultsParent: g(), shellsParent: g(), scene: new THREE.Scene() as unknown as THREE.Scene,
    nodesInstanced: new NodesInstanced(), elementsBatched: new ElementsBatched(), elementsPicking: new ElementsPicking(),
    elementGroups: new Map(), supportGizmos: new Map(), shellGroups: new Map(),
    loadGroup: null, localAxesGroup: null, offsetVizGroup: null, shellOffsetVizGroup: null,
    localAxesParent: g(), colorMapApplied: false,
  } as unknown as SceneSyncContext;
}

// A chain of `n` frame members along +X (n+1 nodes), ids 1..n.
function chain(n: number) {
  const nodes = new Map<number, unknown>();
  const elements = new Map<number, unknown>();
  for (let i = 0; i <= n; i++) nodes.set(i + 1, { id: i + 1, x: i, y: 0, z: 0 });
  for (let i = 1; i <= n; i++) elements.set(i, { id: i, type: 'frame', nodeI: i, nodeJ: i + 1, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} });
  return { nodes, elements };
}
function load(n: number) {
  const m = chain(n);
  modelStore.replaceModelData(m.nodes as Map<number, never>, m.elements as Map<number, never>, new Map(), []);
}

describe('element render sync grows with the model (3D partial-render regression)', () => {
  beforeEach(() => { modelStore.replaceModelData(new Map(), new Map(), new Map(), []); });

  it('small → large: all larger-model members become renderable', () => {
    const ctx = makeCtx();
    load(1); syncElements(ctx);
    expect(ctx.elementsBatched.count).toBe(1);
    expect(ctx.elementGroups.size).toBe(1);

    load(6); syncElements(ctx);
    expect(ctx.elementsBatched.count).toBe(6);     // no first-model cap
    expect(ctx.elementGroups.size).toBe(6);
  });

  it('large → small → large: no stale count persists', () => {
    const ctx = makeCtx();
    load(5); syncElements(ctx); expect(ctx.elementsBatched.count).toBe(5);
    load(2); syncElements(ctx); expect(ctx.elementsBatched.count).toBe(2);
    load(8); syncElements(ctx);
    expect(ctx.elementsBatched.count).toBe(8);
    expect(ctx.elementGroups.size).toBe(8);
  });

  it('real fixtures: simply-supported (1) → grid-beams (40) renders all members', async () => {
    const ctx = makeCtx();
    await modelStore.loadExample('simply-supported');
    syncElements(ctx);
    expect(ctx.elementsBatched.count).toBe(modelStore.elements.size);

    await modelStore.loadExample('grid-beams');
    syncElements(ctx);
    const n = modelStore.elements.size;
    expect(n).toBeGreaterThan(1);                 // grid is larger
    expect(ctx.elementsBatched.count).toBe(n);    // every member batched (no small-model cap)
    expect(ctx.elementGroups.size).toBe(n);
  });

  it('disjoint element ids (fresh example) fully replace the old set', () => {
    const ctx = makeCtx();
    // model A: ids 1..2
    load(2); syncElements(ctx); expect(ctx.elementsBatched.count).toBe(2);
    // model B: ids 100..104 (no overlap), 5 elements
    const nodes = new Map<number, unknown>(); const elements = new Map<number, unknown>();
    for (let i = 0; i <= 5; i++) nodes.set(200 + i, { id: 200 + i, x: i, y: 0, z: 0 });
    for (let i = 0; i < 5; i++) elements.set(100 + i, { id: 100 + i, type: 'frame', nodeI: 200 + i, nodeJ: 200 + i + 1, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} });
    modelStore.replaceModelData(nodes as Map<number, never>, elements as Map<number, never>, new Map(), []);
    syncElements(ctx);
    expect(ctx.elementsBatched.count).toBe(5);
    expect(ctx.elementGroups.size).toBe(5);
  });
});
