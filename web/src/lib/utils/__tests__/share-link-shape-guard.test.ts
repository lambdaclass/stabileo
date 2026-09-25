/**
 * A share link is untrusted input, and the legacy format used to be taken at
 * its word.
 *
 * ── The defect these pin ───────────────────────────────────────────
 *
 * `decompressSnapshot`'s v1 branch guarded truthiness only
 * (`if (!parsed.nodes || !parsed.nextId) return null`), so `{"nodes": 5}`
 * passed and was handed on. `restore()` normalizes what it is given — support
 * types, load signs, section digests — but does not check shapes, despite the
 * comments in url-sharing.ts that delegate exactly that to it. So the snapshot
 * reached `s.nodes.map(...)`, and `TypeError: s.nodes.map is not a function`
 * came out of `loadFromURLHash` — which `App.svelte` calls bare inside
 * `onMount`. A crafted legacy link took the app down before it finished
 * starting.
 *
 * v2 was never affected: `decompressV2` turns a malformed payload into `null`
 * inside its own try/catch.
 *
 * The last test is the one that keeps the guard honest: refusing everything
 * would pass the cases above and break every legacy link still in the wild.
 */

import { describe, it, expect } from 'vitest';
import LZString from 'lz-string';
import { decompressSnapshot } from '../url-sharing';
import { modelStore } from '../../store/model.svelte';

const NEXT_ID = { node: 9, element: 9, material: 9, section: 9, support: 9, load: 9 };

/** Encode a payload the way a v1 (legacy LZ-String) link carries it. */
function v1Link(payload: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

/** A legacy snapshot that is exactly what it claims to be. */
function validLegacySnapshot() {
  return {
    name: 'legacy',
    nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]],
    materials: [[1, { id: 1, name: 'steel', e: 210000, nu: 0.3 }]],
    sections: [[1, { id: 1, name: 'IPE200', a: 0.00285, iy: 1.943e-5, iz: 1.42e-6 }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }]],
    loads: [],
    nextId: NEXT_ID,
  };
}

describe('a legacy share link that lies about its shapes', () => {
  it('is refused when a family is not a list', () => {
    expect(decompressSnapshot(v1Link({ ...validLegacySnapshot(), nodes: 5 }))).toBeNull();
    expect(decompressSnapshot(v1Link({ ...validLegacySnapshot(), loads: {} }))).toBeNull();
    expect(decompressSnapshot(v1Link({ ...validLegacySnapshot(), elements: 'many' }))).toBeNull();
    expect(decompressSnapshot(v1Link({ ...validLegacySnapshot(), supports: null }))).toBeNull();
  });

  it('is refused when nextId is not an object', () => {
    expect(decompressSnapshot(v1Link({ ...validLegacySnapshot(), nextId: 7 }))).toBeNull();
  });

  it('never reaches restore() with a shape it cannot map over', () => {
    const snapshot = decompressSnapshot(v1Link({ ...validLegacySnapshot(), nodes: 5 }));
    expect(snapshot).toBeNull();
    // Nothing to restore: the decoder is the boundary, so the model is never
    // handed a snapshot whose families are not lists.
  });
});

describe('a legacy share link that is what it claims to be', () => {
  it('still decodes, and still restores', () => {
    const snapshot = decompressSnapshot(v1Link(validLegacySnapshot()));

    expect(snapshot).not.toBeNull();
    expect(snapshot!.nodes).toHaveLength(2);
    expect(() => modelStore.restore(snapshot!)).not.toThrow();
    expect(modelStore.nodes.size).toBe(2);
  });

  it('still migrates the legacy hinge booleans it was written with', () => {
    const legacy = validLegacySnapshot();
    legacy.elements = [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: true }],
    ] as never;

    const snapshot = decompressSnapshot(v1Link(legacy));
    expect(snapshot).not.toBeNull();

    // Through `unknown`: the migration deletes `hingeStart`, so the very field
    // this asserts on is absent from the element type by design.
    const [, element] = snapshot!.elements[0] as unknown as [number, Record<string, unknown>];
    expect((element.releaseI as { mz: boolean }).mz).toBe(true);
    expect(element.hingeStart).toBeUndefined();
  });
});
