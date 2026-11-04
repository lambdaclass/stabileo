/**
 * The discretization-error map takes over the shells: one that has no indicator (alone in its
 * recovery patches, or not a web element) must not keep a stress contour from before — on the
 * error map's scale it reads as an error value — nor the deformed shape the contour sat on.
 * Against the real engine and the real discretization store.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { modelStore, resultsStore, uiStore } from '../../store';
import { discretizationStore } from '../../store/discretization.svelte';
import { initSolver } from '../../engine/wasm-solver';
import { ElementsBatched } from '../../three/elements-batched';
import { createQuadMesh } from '../../three/create-shell-mesh';
import { applyShellNodalColors, displaceShellFace } from '../../three/stress-heatmap';
import { syncColorMap3D, type ResultsSyncContext } from '../results-sync';

beforeAll(async () => { await initSolver(); });

function context(shellGroups: Map<string, THREE.Group>): ResultsSyncContext {
  return {
    initialized: true,
    resultsParent: new THREE.Group(),
    scene: new THREE.Scene(),
    elementGroups: new Map(),
    elementsBatched: new ElementsBatched(),
    shellGroups,
    deformedGroup: null, diagramGroup: null, overlayDiagramGroup: null,
    reactionGroup: null, constraintForcesGroup: null, nodeLabelsGroup: null,
    elementLabelsGroup: null, lengthLabelsGroup: null, shellLabelsGroup: null, verificationLabelsGroup: null,
    lastDeformedAnimScale: null, lastDespieceSep: null,
    colorMapApplied: false,
  };
}

const face = (g: THREE.Group) => g.children.find((c) => c instanceof THREE.Mesh && c.userData.shellFace) as THREE.Mesh;
const square = (id: number) => createQuadMesh({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, id, { renderMode: 'solid', thickness: 0.1 });

describe('the discretization-error map', () => {
  it('clears a previous contour, and its displacement, from shells it has no value for', async () => {
    uiStore.renderMode3D = 'solid';
    await modelStore.loadExample('rc-qa-diagnostic-shells');
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
    await vi.waitFor(() => expect(discretizationStore.estimate.status).toBe('done'), { timeout: 30_000, interval: 50 });
    const estimated = [...discretizationStore.elementMap().keys()][0]!;
    expect(estimated).toMatch(/^q\d+$/);

    // A shell with no indicator, still showing a stress contour on the deformed shape.
    const stale = square(99_999);
    const mesh = face(stale);
    const before = Float32Array.from(mesh.geometry.getAttribute('position').array as Float32Array);
    applyShellNodalColors(mesh, [1, 2, 3, 4], { min: 0, max: 4 }, true);
    displaceShellFace(mesh, [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]], 0.5, true);
    expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);

    const ctx = context(new Map([[estimated, square(Number(estimated.slice(1)))], ['q99999', stale]]));
    discretizationStore.showMap = true;
    expect(discretizationStore.mapActive()).toBe(true);
    syncColorMap3D(ctx);

    expect((face(ctx.shellGroups.get(estimated)!).material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.vertexColors).toBe(false);
    expect(mesh.geometry.hasAttribute('color')).toBe(false);
    expect(Array.from(mesh.geometry.getAttribute('position').array as Float32Array)).toEqual(Array.from(before));
    expect(mat.color.getHex()).toBe(stale.userData.baseFaceColor);
    discretizationStore.showMap = false;
  });
});
