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
import { resultsStore } from '../../store';
import { applyShellNodalColors } from '../../three/stress-heatmap';
import { COLORS } from '../../three/selection-helpers';
import { cellPlane } from '../explicit-shell-batches';
import { NodesInstanced } from '../../three/nodes-instanced';
import { ElementsBatched } from '../../three/elements-batched';
import { ElementsPicking } from '../../three/elements-picking';
import { applyShellSelection, syncNodes, syncShells, syncShellOffsets, type SceneSyncContext } from '../scene-sync';
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
  beforeEach(() => { resultsStore.clear(); uiStore.platesShowMesh = true; modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; uiStore.renderMode3D = 'wireframe'; viewState.shellMesh = 'auto'; uiStore.clearSelection(); });

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

  it('draws every visible mesh edge once and preserves shell offsets', () => {
    floor();
    const ctx = makeCtx();
    viewState.shellMesh = 'show';
    syncShells(ctx); syncShellOffsets(ctx);
    expect(ctx.shellGroups.size).toBe(0);
    expect(ctx.shellsParent.children).toHaveLength(1);
    const edges = ctx.shellsParent.children[0]!.children[1] as THREE.LineSegments;
    expect(edges.geometry.getAttribute('position').count / 2).toBe(2 * N * (N + 1));
    // The offsets in two draw calls however many shells there are.
    expect(ctx.shellOffsetVizGroup!.children).toHaveLength(2);
    viewState.shellMesh = 'auto';
    uiStore.renderMode3D = 'sections';
    expect(meshHidden()).toBe(false);
  });

  it('picks, highlights and restores individual cells around an opening and across floors', () => {
    viewState.shellMesh = 'show';
    uiStore.renderMode3D = 'solid';
    const ids: number[] = [];
    let triangle = 0;
    modelStore.batch(() => {
      for (const z of [1, 4]) {
        const grid = Array.from({ length: 9 }, (_, x) =>
          Array.from({ length: 9 }, (_, y) => modelStore.addNode(x, y, z)));
        for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
          if (x === 3 && y === 3) continue;
          const nodes: [number, number, number, number] = [grid[x]![y]!, grid[x + 1]![y]!, grid[x + 1]![y + 1]!, grid[x]![y + 1]!];
          if (x === 1 && y === 0 && z === 4) {
            triangle = modelStore.addPlate([nodes[0], nodes[1], nodes[3]], 1, 0.2);
          } else {
            const id = modelStore.addQuad(nodes, 1, 0.2);
            if (x === 0 && y === 0) ids.push(id);
          }
        }
      }
    });
    const ctx = makeCtx();
    syncShells(ctx);
    expect(ctx.shellsParent.children).toHaveLength(2);
    const pick = (x: number, y: number, z: number) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObjects(ctx.shellsParent.children, true)[0];
      return hit ? resolveHitUserData(hit) : null;
    };
    expect(pick(3.5, 3.5, 10)).toBeNull();
    expect(pick(1.1, 0.1, 10)).toMatchObject({ type: 'plate', id: triangle });
    expect(pick(0.1, 0.6, 10)).toMatchObject({ type: 'quad', id: ids[1] });
    expect(pick(0.1, 0.6, 2)).toMatchObject({ type: 'quad', id: ids[0] });

    const triKey = 'p' + triangle, quadKey = 'q' + ids[1];
    const upper = ctx.shellsParent.children.find(g => g.children[0]!.userData.faceKeys.includes(triKey))!;
    const face = upper.children[0] as THREE.Mesh;
    const lines = upper.children[1] as THREE.LineSegments;
    const colors = face.geometry.getAttribute('color');
    const lineColors = lines.geometry.getAttribute('color');
    const faceIndex = (key: string) => face.userData.faceKeys.indexOf(key) * 3;
    const colorAt = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
      new THREE.Color(attr.getX(i), attr.getY(i), attr.getZ(i)).getHex();
    const base = colorAt(colors, faceIndex(triKey));
    const positions = lines.geometry.getAttribute('position');
    let shared = -1;
    for (let i = 0; i < positions.count; i += 2) {
      if (positions.getX(i) === 1 && positions.getX(i + 1) === 1 &&
          Math.min(positions.getY(i), positions.getY(i + 1)) === 0) shared = i;
    }
    expect(shared).toBeGreaterThanOrEqual(0);
    uiStore.selectShell(quadKey, false);
    applyShellSelection(ctx);
    ctx.explicitShells!.hover(triKey);
    expect(colorAt(colors, faceIndex(quadKey))).toBe(COLORS.elementSelected);
    expect(colorAt(colors, faceIndex(triKey))).toBe(COLORS.elementHovered);
    expect(colorAt(lineColors, shared)).toBe(COLORS.elementHovered);
    ctx.explicitShells!.hover();
    expect(colorAt(lineColors, shared)).toBe(COLORS.elementSelected);
    expect(colorAt(colors, faceIndex(triKey))).toBe(base);
    syncShells(ctx);
    expect(ctx.shellsParent.children).toContain(upper);

    resultsStore.setResults3D({ displacements: [], reactions: [], elementForces: [] });
    syncShells(ctx);
    expect(ctx.explicitShells!.has(quadKey)).toBe(false);
    const contour = ctx.shellGroups.get(quadKey)!.children[0] as THREE.Mesh;
    expect(contour.geometry.userData.vertexNodeWeights.length).toBeGreaterThan(6);
    applyShellNodalColors(contour, [0, 1, 2, 3], { min: 0, max: 3 }, true);
    expect(contour.geometry.hasAttribute('color')).toBe(true);
    resultsStore.clear();
    syncShells(ctx);
    expect(ctx.shellGroups.size).toBe(0);
    expect(pick(1.1, 0.1, 10)).toMatchObject({ type: 'plate', id: triangle });

    const corner = modelStore.quads.get(ids[1]!)!.nodes[0];
    modelStore.updateNode(corner, 0, 0, 4.25);
    syncShells(ctx);
    expect(ctx.explicitShells!.has(quadKey)).toBe(false);
    expect(ctx.shellGroups.has(quadKey)).toBe(true);
    expect(ctx.explicitShells!.has(triKey)).toBe(true);
    expect(pick(0.1, 0.6, 10)).toMatchObject({ type: 'quad', id: ids[1] });
  });

  it('counts cells that can share a batch and recovers it after the scene is cleared', () => {
    viewState.shellMesh = 'show';
    let lastCorner = 0, isolated = 0;
    modelStore.batch(() => {
      // 63 cells share a plane, one has a raised corner, one is on a different floor.
      for (let i = 0; i < 65; i++) {
        const z = i === 64 ? 4 : 1;
        const x = 2 * i;
        const d = modelStore.addNode(x, 1, i === 63 ? 2 : z);
        const id = modelStore.addQuad([modelStore.addNode(x, 0, z), modelStore.addNode(x + 1, 0, z),
          modelStore.addNode(x + 1, 1, z), d], 1, 0.2);
        if (i === 63) lastCorner = d;
        if (i === 64) isolated = id;
      }
    });
    const ctx = makeCtx();
    syncShells(ctx);
    expect(ctx.shellGroups.size).toBe(65);

    modelStore.updateNode(lastCorner, 126, 1, 1);
    syncShells(ctx);
    expect([...ctx.shellGroups.keys()]).toEqual(['q' + isolated]);
    const ray = new THREE.Raycaster(new THREE.Vector3(0.2, 0.3, 10), new THREE.Vector3(0, 0, -1));
    const hit = () => ray.intersectObjects(ctx.shellsParent.children, true)[0]!;
    const original = hit();
    const picked = resolveHitUserData(original);
    original.object.parent!.removeFromParent();
    syncShells(ctx);
    expect(hit().object).not.toBe(original.object);
    expect(resolveHitUserData(hit())).toEqual(picked);
    // The bucket and cell IDs are unchanged when a corner moves within the floor.
    const recovered = hit().object;
    modelStore.updateNode(lastCorner, 126, 1.5, 1);
    syncShells(ctx);
    expect(hit().object).toBe(recovered);
    ray.ray.origin.set(126.1, 1.3, 10);
    expect(resolveHitUserData(hit())?.type).toBe('quad');
  });

  it('keeps warped, concave and degenerate faces on the tessellated path', () => {
    const p = (x: number, y: number, z = 0) => ({ x, y, z });
    expect(cellPlane([p(0, 0), p(2, 0), p(2, 1), p(0, 1, 0.01)])).toBeNull();
    expect(cellPlane([p(0, 0), p(2, 0), p(0.5, 0.1), p(0, 1)])).toBeNull();
    expect(cellPlane([p(0, 0), p(0, 0), p(2, 0)])).toBeNull();
    expect(cellPlane([p(0, 0, Infinity), p(2, 0, Infinity), p(0, 2, Infinity)])).toBeNull();
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
