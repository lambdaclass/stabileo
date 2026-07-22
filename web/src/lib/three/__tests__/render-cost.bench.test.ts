// Headless measurement of 3D render cost (no GL needed — we build the real
// Three.js scene-graph and count renderable leaf objects ≈ draw calls, distinct
// materials, geometries, and the CPU time to build them). Answers the
// CPU-vs-GPU question with numbers on this machine: high draw-calls/materials =
// GPU-bound; high per-object build ms = the CPU cost paid on every teardown/rebuild.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createElementGroup } from '../create-element-mesh';
import { createPlateMesh, createQuadMesh } from '../create-shell-mesh';
import { createSupportGizmo } from '../create-support-gizmo';
import { createLoadArrowsBatched } from '../load-arrows-batched';
import type { Section } from '../../store/model.svelte';

// createTextSpriteCached draws to a 2D canvas — stubbed headless.
const canvasStub = {
  width: 0, height: 0,
  getContext: () => ({ fillStyle: '', font: '', textAlign: 'center', textBaseline: 'middle', fillText: () => {} }),
};
Object.defineProperty(globalThis, 'document', { value: { createElement: () => canvasStub }, configurable: true });

const N = 1000; // elements / shells / supports per scenario

const rectSection: Section = {
  id: 1, name: 'IPE300', a: 0.0053, iz: 6.04e-7, iy: 8.36e-6,
  j: 2.07e-7, b: 0.15, h: 0.30, shape: 'I', tw: 0.0071, tf: 0.0107,
} as unknown as Section;
const axes = { ex: [1, 0, 0] as [number, number, number], ey: [0, 1, 0] as [number, number, number], ez: [0, 0, 1] as [number, number, number] };

type Stat = { drawCalls: number; pickingHelpers: number; materials: number; geometries: number; buildMs: number };

function measure(buildOne: (i: number) => THREE.Object3D, n: number): Stat {
  const mats = new Set<string>(), geos = new Set<string>();
  let drawCalls = 0, pickingHelpers = 0;
  const t0 = performance.now();
  const groups: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) groups.push(buildOne(i));
  const buildMs = performance.now() - t0;
  for (const g of groups) {
    g.traverse((o: any) => {
      if (o.isMesh || o.isLine || o.isLineSegments || o.isPoints || o.isLineSegments2 || o.isLine2) {
        if (o.userData?.pickingHelper) pickingHelpers++; else drawCalls++;
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => mats.add(m.uuid));
        if (o.geometry) geos.add(o.geometry.uuid);
      }
    });
  }
  return { drawCalls, pickingHelpers, materials: mats.size, geometries: geos.size, buildMs: +buildMs.toFixed(1) };
}

function row(label: string, s: Stat, n: number) {
  const per = (x: number) => (x / n).toFixed(2);
  return `${label.padEnd(26)} drawCalls=${String(s.drawCalls).padStart(5)} (${per(s.drawCalls)}/ea)  pick=${String(s.pickingHelpers).padStart(5)}  mats=${String(s.materials).padStart(5)} (${per(s.materials)}/ea)  geos=${String(s.geometries).padStart(5)}  build=${String(s.buildMs).padStart(6)}ms (${(s.buildMs / n).toFixed(3)}ms/ea)`;
}

describe('3D render cost — real builders, N=' + N, () => {
  it('reports draw calls / materials / geometries / build time per scenario', () => {
    const nI = (i: number) => ({ x: i % 50, y: Math.floor(i / 50), z: 0 });
    const nJ = (i: number) => ({ x: (i % 50) + 1, y: Math.floor(i / 50), z: 0 });

    const wire = measure((i) => createElementGroup(nI(i), nJ(i), { elementId: i, elementType: 'frame', renderMode: 'wireframe' }), N);
    const solid = measure((i) => createElementGroup(nI(i), nJ(i), { elementId: i, elementType: 'frame', renderMode: 'solid', section: rectSection, localAxes: axes }), N);
    const sections = measure((i) => createElementGroup(nI(i), nJ(i), { elementId: i, elementType: 'frame', renderMode: 'sections', section: rectSection, localAxes: axes }), N);

    const v = (i: number, k: number): [number, number, number] => [(i % 50) + (k & 1), Math.floor(i / 50) + (k >> 1), 0];
    const shellWire = measure((i) => createQuadMesh(v(i, 0), v(i, 1), v(i, 3), v(i, 2), i, { renderMode: 'wireframe', thickness: 0.2 }), N);
    const shellSec = measure((i) => createQuadMesh(v(i, 0), v(i, 1), v(i, 3), v(i, 2), i, { renderMode: 'sections', thickness: 0.2 }), N);

    const supports = measure((i) => createSupportGizmo({ x: i, y: 0, z: 0 }, { supportId: i, supportType: 'fixed3d' } as any), N);

    // Loads (batched): the whole N-load scene builds ONE group whose leaf
    // objects total ~5 + 1 sprite per label — the pre-batching cost was
    // ~18 draw calls per distributed load and ~35 per surface load.
    const loadBatch = (add: (b: ReturnType<typeof createLoadArrowsBatched>, i: number) => void): Stat => {
      const t0 = performance.now();
      const b = createLoadArrowsBatched();
      for (let i = 0; i < N; i++) add(b, i);
      const g = b.build();
      const buildMs = performance.now() - t0;
      const mats = new Set<string>(), geos = new Set<string>();
      let drawCalls = 0;
      g.traverse((o: any) => {
        if (o.isMesh || o.isLine || o.isSprite) {
          drawCalls++;
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => mats.add(m.uuid));
          if (o.geometry) geos.add(o.geometry.uuid);
        }
      });
      return { drawCalls, pickingHelpers: 0, materials: mats.size, geometries: geos.size, buildMs: +buildMs.toFixed(1) };
    };
    const distLoads = loadBatch((b, i) => b.addDistributedLoad({ x: i % 50, y: Math.floor(i / 50), z: 0 }, { x: (i % 50) + 1, y: Math.floor(i / 50), z: 0 }, -5, -5, 10, 'Z'));
    const surfLoads = loadBatch((b, i) => b.addSurfaceLoad([{ x: i % 50, y: Math.floor(i / 50), z: 3 }, { x: (i % 50) + 1, y: Math.floor(i / 50), z: 3 }, { x: (i % 50) + 1, y: Math.floor(i / 50) + 1, z: 3 }, { x: i % 50, y: Math.floor(i / 50) + 1, z: 3 }], 5, 10));
    const nodalLoads = loadBatch((b, i) => b.addNodalLoadArrow({ x: i % 50, y: Math.floor(i / 50), z: 0 }, 3, 0, -10, 0, 5, 0, 10, 'curved'));

    /* eslint-disable no-console */
    console.log('\n──────── 3D RENDER COST (N=' + N + ' each) ────────');
    console.log(row('elements wireframe', wire, N));
    console.log(row('elements solid', solid, N));
    console.log(row('elements SECTIONS', sections, N));
    console.log(row('shells (quad) wireframe', shellWire, N));
    console.log(row('shells (quad) SECTIONS', shellSec, N));
    console.log(row('supports (fixed3d)', supports, N));
    console.log(row('loads distributed (batched)', distLoads, N));
    console.log(row('loads surface3d (batched)', surfLoads, N));
    console.log(row('loads nodal curved (batched)', nodalLoads, N));
    console.log('──────────────────────────────────────────────────\n');
    /* eslint-enable no-console */

    expect(wire.drawCalls + sections.drawCalls + shellWire.drawCalls).toBeGreaterThan(0);
  });
});
