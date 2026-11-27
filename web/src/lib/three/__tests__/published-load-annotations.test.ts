import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createLoadArrowsBatched } from '../load-arrows-batched';

const sheet = { width: 0, height: 0, getContext: () => ({ fillStyle: '', font: '', textAlign: 'center', textBaseline: 'middle', fillText() {}, measureText: () => ({ width: 10 }) }) };
const threshold = 250;

it.skip('keeps every published load value on both sides of the enhanced label budget (known wrong result: #1928)', () => {
  vi.stubGlobal('document', { createElement: () => sheet });
  try {
    for (const count of [1, threshold - 1, threshold, threshold + 1]) {
      const batch = createLoadArrowsBatched();
      for (let x = 0; x < count; x++) batch.addDistributedLoad({ x, y: 0, z: 0 }, { x: x + 1, y: 0, z: 0 }, -5, -5, 10, 'Z', undefined, 0xff4444);
      const labels = batch.build().children.filter(o => o instanceof THREE.Sprite);
      if (__PUBLIC_FEATURES__.proPlatesUnified && count > threshold) expect(labels.length).toBeLessThanOrEqual(threshold);
      else expect(labels).toHaveLength(count);
    }
  } finally { vi.unstubAllGlobals(); }
});

it.skip('draws published surface and member loads as overlays of their structure (known wrong result: #1928)', () => {
  vi.stubGlobal('document', { createElement: () => sheet });
  try {
    const batch = createLoadArrowsBatched();
    const nodes = [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 4, z: 0 }, { x: 0, y: 4, z: 0 }];
    batch.addDistributedLoad(nodes[0]!, nodes[1]!, -5, -5, 10, 'Z', undefined, 0xff4444);
    batch.addSurfaceLoad(nodes, -3, 3, 0x44ff44);
    batch.addNodalLoadArrow(nodes[0]!, 0, 0, -10, 0, 0, 5, 10, 'curved', 0x4444ff);
    const materials = batch.build().children.map(o => (o as THREE.Mesh).material as THREE.Material);
    expect(materials.length).toBeGreaterThan(4);
    expect(materials.some(m => m instanceof THREE.SpriteMaterial)).toBe(true);
    for (const material of materials) expect(material.depthTest).toBe(Boolean(__PUBLIC_FEATURES__.proPlatesUnified));
  } finally { vi.unstubAllGlobals(); }
});
