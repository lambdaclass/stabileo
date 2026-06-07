/**
 * CP5 — shell offset survives a share-link round-trip through the REAL
 * compress/decompress (not the test-local subset), and a shell without an
 * offset stays offset-free (no accidental slot bleed).
 */
import { describe, it, expect } from 'vitest';
import { compressSnapshot, decompressSnapshot } from '../url-sharing';
import type { ModelSnapshot } from '../../store/history.svelte';

function snap(quadExtra: Record<string, unknown>): ModelSnapshot {
  return {
    analysisMode: '3d',
    name: 'shell-offset',
    nodes: [
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 1, y: 0, z: 0 }],
      [3, { id: 3, x: 1, y: 1, z: 0 }],
      [4, { id: 4, x: 0, y: 1, z: 0 }],
    ],
    materials: [[1, { id: 1, name: 'C', e: 30000000, nu: 0.2, rho: 2400 }]],
    sections: [],
    elements: [],
    supports: [],
    loads: [],
    loadCases: [],
    combinations: [],
    quads: [[7, { id: 7, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.2, ...quadExtra }]],
    nextId: { node: 5, material: 2, section: 1, element: 1, support: 1, load: 1, loadCase: 1, combination: 1 },
  } as unknown as ModelSnapshot;
}

describe('shell offset URL round-trip', () => {
  it('preserves a local-frame offset on a quad', () => {
    const out = decompressSnapshot(compressSnapshot(snap({ offset: { frame: 'local', x: 0, y: 0, z: -0.1 } })));
    expect(out).not.toBeNull();
    const q = out!.quads!.find(([id]) => id === 7)![1] as any;
    expect(q.offset).toEqual({ frame: 'local', x: 0, y: 0, z: -0.1 });
  });

  it('preserves shellFamily + offset together', () => {
    const out = decompressSnapshot(compressSnapshot(snap({ shellFamily: 'MITC4', offset: { frame: 'global', x: 0.05, y: 0, z: 0 } })));
    const q = out!.quads!.find(([id]) => id === 7)![1] as any;
    expect(q.shellFamily).toBe('MITC4');
    expect(q.offset).toEqual({ frame: 'global', x: 0.05, y: 0, z: 0 });
  });

  it('a quad without an offset decodes without one', () => {
    const out = decompressSnapshot(compressSnapshot(snap({ shellFamily: 'MITC4' })));
    const q = out!.quads!.find(([id]) => id === 7)![1] as any;
    expect(q.offset).toBeUndefined();
    expect(q.shellFamily).toBe('MITC4');
  });
});
