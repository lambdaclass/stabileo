/**
 * CP5 — shell offset survives a share-link round-trip through the REAL
 * compress/decompress (not the test-local subset), and a shell without an
 * offset stays offset-free (no accidental slot bleed).
 */
import { describe, it, expect } from 'vitest';
import { deflateSync, inflateSync } from 'fflate';
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

  it('an older link with a shell family in slot 4 keeps its offset, and the family is dropped', () => {
    // Links written before the family was removed carry it as a string ahead of the offset:
    // write one by putting the string back into a current link's payload.
    const link = compressSnapshot(snap({ offset: { frame: 'global', x: 0.05, y: 0, z: 0 } }));
    const compact = JSON.parse(new TextDecoder().decode(inflateSync(Buffer.from(link.slice(2), 'base64url'))));
    expect(compact.qu[0][4]).toBe(0);
    compact.qu[0][4] = 'MITC4';
    const old = '2.' + Buffer.from(deflateSync(new TextEncoder().encode(JSON.stringify(compact)))).toString('base64url');
    const q = decompressSnapshot(old)!.quads!.find(([id]) => id === 7)![1] as any;
    expect(q.offset).toEqual({ frame: 'global', x: 0.05, y: 0, z: 0 });
    expect(q.shellFamily).toBeUndefined();
  });

  it('a quad without an offset decodes without one, and with no family', () => {
    const out = decompressSnapshot(compressSnapshot(snap({ shellFamily: 'MITC4' })));
    const q = out!.quads!.find(([id]) => id === 7)![1] as any;
    expect(q.offset).toBeUndefined();
    expect(q.shellFamily).toBeUndefined();
  });
});
