/**
 * Scene-graph cost on a real model (la-bombonera: 1005 nodes, 2476 elements).
 *
 * Three.js walks the whole graph every frame for `updateMatrixWorld` and
 * frustum culling, whether or not an object draws anything. In wireframe mode
 * the elements are drawn by the shared batched LineSegments2, so a per-element
 * Group is only needed when it actually carries something — a hinge marker or
 * an internal-joint glyph. La Bombonera has neither on any of its 2476
 * elements, so every one of those groups is pure traversal cost.
 *
 * These are budgets, not exact counts: they exist to catch a regression that
 * puts thousands of empty objects back into the graph.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { NodesInstanced } from '../../three/nodes-instanced';
import { ElementsBatched } from '../../three/elements-batched';
import { ElementsPicking } from '../../three/elements-picking';
import { syncElements, type SceneSyncContext } from '../scene-sync';
import bombonera from '../../templates/fixtures/la-bombonera.json';

function makeCtx(): SceneSyncContext {
  const g = () => new THREE.Group();
  return {
    initialized: true,
    nodesParent: g(), elementsParent: g(), supportsParent: g(), loadsParent: g(),
    resultsParent: g(), shellsParent: g(), scene: new THREE.Scene(),
    nodesInstanced: new NodesInstanced(),
    elementsBatched: new ElementsBatched(),
    elementsPicking: new ElementsPicking(),
    elementGroups: new Map(), supportGizmos: new Map(), shellGroups: new Map(),
    loadGroup: null, localAxesGroup: null, offsetVizGroup: null, shellOffsetVizGroup: null,
    localAxesParent: g(), colorMapApplied: false,
  } as unknown as SceneSyncContext;
}

type Raw = typeof bombonera;

function loadBombonera() {
  const raw = bombonera as Raw;
  const nodes = new Map<number, unknown>();
  for (const n of raw.nodes as Array<{ id: number; x: number; y: number; z?: number }>) {
    nodes.set(n.id, { id: n.id, x: n.x, y: n.y, z: n.z ?? 0 });
  }
  const elements = new Map<number, unknown>();
  for (const e of raw.elements as Array<Record<string, unknown>>) {
    elements.set(e.id as number, e);
  }
  const sections = new Map<number, unknown>();
  for (const s of raw.sections as Array<{ id: number }>) sections.set(s.id, s);

  modelStore.replaceModelData(
    nodes as Map<number, never>,
    elements as Map<number, never>,
    sections as Map<number, never>,
    [],
  );
  return { nodeCount: nodes.size, elementCount: elements.size };
}

/** Every Object3D under `root`, including `root`. */
function countObjects(root: THREE.Object3D): number {
  let n = 0;
  root.traverse(() => { n++; });
  return n;
}

describe('la-bombonera scene-graph cost', () => {
  beforeEach(() => {
    modelStore.replaceModelData(new Map(), new Map(), new Map(), []);
  });

  it('loads the fixture at the expected scale', () => {
    const { nodeCount, elementCount } = loadBombonera();
    expect(nodeCount).toBe(1005);
    expect(elementCount).toBe(2476);
  });

  it('wireframe keeps no per-element group for plain members', () => {
    uiStore.renderMode3D = 'wireframe';
    loadBombonera();
    const ctx = makeCtx();
    syncElements(ctx);

    // Every element still reaches the batched wireframe and the picking mesh.
    expect(ctx.elementsBatched.count).toBe(2476);
    expect(ctx.elementsPicking.count).toBe(2476);

    // None of the 2476 carries a hinge or an internal joint, so none needs a
    // group. Before this budget existed the scene held 2476 empty ones.
    expect(ctx.elementGroups.size).toBe(0);
  });

  it('wireframe scene graph stays small', () => {
    uiStore.renderMode3D = 'wireframe';
    loadBombonera();
    const ctx = makeCtx();
    syncElements(ctx);

    const objects = countObjects(ctx.elementsParent);
    // elementsParent + the batched wireframe is the floor; allow a little head
    // room, but nothing close to one object per element.
    expect(objects).toBeLessThan(50);
  });

  it('still builds a group for an element that has something to show', () => {
    uiStore.renderMode3D = 'wireframe';
    const nodes = new Map<number, unknown>([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 1, y: 0, z: 0 }],
      [3, { id: 3, x: 2, y: 0, z: 0 }],
    ]);
    const elements = new Map<number, unknown>([
      // plain member — no group needed
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }],
      // hinged member — needs a group to carry the hinge marker
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, releaseI: { mz: true }, releaseJ: {} }],
    ]);
    modelStore.replaceModelData(nodes as Map<number, never>, elements as Map<number, never>, new Map(), []);

    const ctx = makeCtx();
    syncElements(ctx);

    expect(ctx.elementsBatched.count).toBe(2);
    expect(ctx.elementGroups.has(1)).toBe(false);
    expect(ctx.elementGroups.has(2)).toBe(true);
    expect(ctx.elementGroups.get(2)!.children.length).toBeGreaterThan(0);
  });

  it('solid mode still builds a group per element', () => {
    uiStore.renderMode3D = 'solid';
    loadBombonera();
    const ctx = makeCtx();
    syncElements(ctx);

    // Solid draws real geometry per member, so the groups are load-bearing.
    expect(ctx.elementGroups.size).toBe(2476);

    uiStore.renderMode3D = 'wireframe';
  });

  it('a group dropped on mode change does not leak', () => {
    loadBombonera();
    const ctx = makeCtx();

    uiStore.renderMode3D = 'solid';
    syncElements(ctx);
    expect(ctx.elementGroups.size).toBe(2476);

    uiStore.renderMode3D = 'wireframe';
    syncElements(ctx);
    expect(ctx.elementGroups.size).toBe(0);
    expect(countObjects(ctx.elementsParent)).toBeLessThan(50);
  });
});
