import { describe, it, expect } from 'vitest';
import { deflateSync, inflateSync } from 'fflate';
import { compressSnapshot, decompressSnapshot, compactLoses } from '../url-sharing';
import { modelStore } from '../../store';
import type { ModelSnapshot } from '../../store/history.svelte';

const massSource = {
  kind: 'custom' as const,
  factors: [{ caseId: 1, factor: 0.25 }],
  points: [
    { nodeId: 2, m: 12.5 },
    { nodeId: 3, m: 8, horizontalOnly: true, izz: 41.75 },
  ],
};

function snap(withMass: boolean): ModelSnapshot {
  return {
    analysisMode: '2d',
    name: 'shear building',
    nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 3, z: 0 }], [3, { id: 3, x: 0, y: 6, z: 0 }]],
    materials: [[1, { id: 1, name: 'C', e: 30000000, nu: 0.2, rho: 2.4 }]],
    sections: [[1, { id: 1, name: 'C30', a: 0.09, iz: 0.000675 }]],
    elements: [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false } }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false } }],
    ],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }]],
    loads: [],
    loadCases: [{ id: 1, type: 'D', name: 'Dead' }],
    combinations: [],
    ...(withMass ? { massSource } : {}),
    nextId: { node: 4, material: 2, section: 2, element: 3, support: 2, load: 1, loadCase: 2, combination: 1 },
  } as unknown as ModelSnapshot;
}

function compactOf(link: string): Record<string, unknown> {
  const b64 = link.slice(2).replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(inflateSync(bytes)));
}

function linkOf(compact: Record<string, unknown>): string {
  const bytes = deflateSync(new TextEncoder().encode(JSON.stringify(compact)), { level: 9 });
  return '2.' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('the share link carries the mass source', () => {
  it('every point mass and case factor survives the compact link', () => {
    const out = decompressSnapshot(compressSnapshot(snap(true)));
    expect(out).not.toBeNull();
    expect(out!.massSource).toEqual(massSource);
  });

  it('a model whose only addition is its masses still shares compact', () => {
    expect(compactLoses(snap(true))).toBe(false);
  });

  it('the masses reach the store when the shared model is opened', () => {
    modelStore.restore(decompressSnapshot(compressSnapshot(snap(true)))!);
    expect(modelStore.model.massSource?.points).toEqual(massSource.points);
    expect(modelStore.model.massSource).toMatchObject({ kind: 'custom', factors: [{ caseId: 1, factor: 0.25 }] });
  });

  it('a link written before the masses travelled opens with none', () => {
    const out = decompressSnapshot(compressSnapshot(snap(false)));
    expect(out).not.toBeNull();
    expect(out!.massSource).toBeUndefined();
  });

  it('a link whose mass source is not an object is refused', () => {
    const ok = compactOf(compressSnapshot(snap(true)));
    expect(ok.ms).toBeDefined();
    expect(decompressSnapshot(linkOf({ ...ok, ms: 7 }))).toBeNull();
  });

  it('a stored point mass that does not read is dropped on opening, the rest kept', () => {
    const out = decompressSnapshot(compressSnapshot({ ...snap(true), massSource: { ...massSource, points: [...massSource.points, { nodeId: 3, m: -4 }] } } as never))!;
    modelStore.restore(out);
    expect(modelStore.model.massSource?.points).toEqual(massSource.points);
  });
});
