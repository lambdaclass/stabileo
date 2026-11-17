/**
 * A large floor while it is modelled: drawn as one member, not as its 3600 shells.
 *
 * A 60 × 60 m slab meshed at 1 m, offset half its depth down, and one column on it. Each shell
 * as its own group (face and edges) and its offset as its own arm and outline put some 18 000
 * objects in the scene graph, walked and drawn every frame. As a member it is a handful, its
 * outline the slab's border alone; the nodes only its mesh has are not drawn; a click on its face
 * still picks the shell under it; and the mesh comes back with results or when asked.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import { viewState } from '../../store/view-state.svelte';
import '../../store';
import { NodesInstanced } from '../../three/nodes-instanced';
import { ElementsBatched } from '../../three/elements-batched';
import { ElementsPicking } from '../../three/elements-picking';
import { syncNodes, syncShells, syncShellOffsets, type SceneSyncContext } from '../scene-sync';
import { meshHidden, MESH_SHOWN_UP_TO } from '../shell-members';
import { resolveHitUserData } from '../picking';

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

const N = 60;
function floor(): { corner: number } {
  const id: number[][] = [];
  modelStore.batch(() => {
    for (let i = 0; i <= N; i++) { id.push([]); for (let j = 0; j <= N; j++) id[i]!.push(modelStore.addNode(i, j, 3)); }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const q = modelStore.addQuad([id[i]![j]!, id[i + 1]![j]!, id[i + 1]![j + 1]!, id[i]![j + 1]!], 1, 0.2);
      modelStore.setShellOffset('quad', q, { frame: 'global', x: 0, y: 0, z: -0.1 } as never);
    }
    const foot = modelStore.addNode(30, 30, 0);
    modelStore.addElement(foot, id[30]![30]!, 'frame');
    modelStore.addSupport(foot, 'fixed3d' as never);
  });
  return { corner: id[0]![0]! };
}
const objects = (o: THREE.Object3D) => { let n = 0; o.traverse(() => { n++; }); return n; };

describe('a large floor while it is modelled', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; uiStore.renderMode3D = 'wireframe'; viewState.shellMesh = 'auto'; uiStore.clearSelection(); });

  it('is drawn as a member: a handful of objects, its outline its border, its mesh nodes not drawn', () => {
    const { corner } = floor();
    expect(modelStore.quads.size).toBeGreaterThan(MESH_SHOWN_UP_TO);
    expect(meshHidden()).toBe(true);
    const ctx = makeCtx();
    syncShells(ctx); syncShellOffsets(ctx); syncNodes(ctx);
    expect(objects(ctx.shellsParent)).toBeLessThan(10);
    expect(ctx.shellGroups.size).toBe(0);
    // No offset arms or outlines of shells that are not selected.
    expect(ctx.shellOffsetVizGroup).toBeNull();
    const outline = ctx.shellsParent.children[0]!.children[1] as THREE.LineSegments;
    expect(outline.geometry.getAttribute('position').count / 2).toBe(4 * N);
    // The column's ends and the support are drawn; the slab's own nodes are not.
    const foot = [...modelStore.nodes.values()].find((n) => (n.z ?? 0) === 0)!.id;
    const head = [...modelStore.nodes.values()].find((n) => n.x === 30 && n.y === 30 && n.z === 3)!.id;
    expect(ctx.nodesInstanced.has(foot)).toBe(true);
    expect(ctx.nodesInstanced.has(head)).toBe(true);
    expect(ctx.nodesInstanced.has(corner)).toBe(false);
  });

  it('is drawn as its mesh when asked, with results, and in the volume views', () => {
    floor();
    const ctx = makeCtx();
    viewState.shellMesh = 'show';
    syncShells(ctx); syncShellOffsets(ctx);
    expect(ctx.shellGroups.size).toBe(N * N);
    // The offsets in two draw calls however many shells there are.
    expect(ctx.shellOffsetVizGroup!.children).toHaveLength(2);
    viewState.shellMesh = 'auto';
    uiStore.renderMode3D = 'sections';
    expect(meshHidden()).toBe(false);
  });

  it('picks the shell under a click on the member and draws a selected one as a shell', () => {
    floor();
    const ctx = makeCtx();
    syncShells(ctx);
    ctx.shellsParent.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(10.5, 20.5, 10), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObjects(ctx.shellsParent.children, true)[0]!;
    const picked = resolveHitUserData(hit)!;
    expect(picked.type).toBe('quad');
    const q = modelStore.quads.get(picked.id)!;
    const xs = q.nodes.map((n) => modelStore.nodes.get(n)!.x), ys = q.nodes.map((n) => modelStore.nodes.get(n)!.y);
    expect([Math.min(...xs), Math.min(...ys)]).toEqual([10, 20]);
    uiStore.selectShell(`q${picked.id}`, false);
    syncShells(ctx);
    expect([...ctx.shellGroups.keys()]).toEqual([`q${picked.id}`]);
  });
});
