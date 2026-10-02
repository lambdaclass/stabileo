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

describe('which link a model gets', () => {
  it('a plain frame shares compact; one with a cable, a section of its own or an analysis rule does not', async () => {
    const { compactLoses } = await import('../url-sharing');
    const base = snap({});
    expect(compactLoses(base)).toBe(false);
    const withEl = { ...base, elements: [[1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, behaviour: 'cable' }]] } as never;
    expect(compactLoses(withEl)).toBe(true);
    expect(compactLoses({ ...base, sections: [[1, { id: 1, name: 'W', a: 0.01, iz: 1e-5, declared: true }]] } as never)).toBe(true);
    expect(compactLoses({ ...base, analysis: { perCombination: 'pdelta' } } as never)).toBe(true);
  });
});

describe('what the compact link keeps', () => {
  it('keeps a steel section to its figures: six decimals made Iy 1e-6 and J 0', () => {
    const s = { ...snap({}), sections: [[1, { id: 1, name: 'IPE 200', a: 0.00285, iz: 1.943e-5, iy: 1.42e-6, j: 6.98e-8 }]] } as unknown as ModelSnapshot;
    const back = decompressSnapshot(compressSnapshot(s))!;
    const sec = back.sections[0]![1] as { iz: number; iy: number; j: number };
    expect(sec.iy).toBeCloseTo(1.42e-6, 15);
    expect(sec.j).toBeCloseTo(6.98e-8, 17);
    expect(sec.iz).toBeCloseTo(1.943e-5, 14);
  });

  it('sends a model to the code link for anything the compact format drops, named or not', async () => {
    const { compactLoses } = await import('../url-sharing');
    const base = snap({});
    expect(compactLoses(base)).toBe(false);
    // A custom support, a curved shell and a saved view were not on the old list of dropped fields.
    const custom = { ...base, supports: [[1, { id: 1, nodeId: 1, type: 'custom3d', dofRestraints: { tx: true, ty: true, tz: true, rx: false, ry: false, rz: false } }]] } as never;
    expect(compactLoses(custom)).toBe(true);
    expect(compactLoses(snap({ curved: { radius: 3 } }))).toBe(true);
    expect(compactLoses({ ...base, views: [{ id: 1, name: 'v', position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 } }] } as never)).toBe(true);
    // A steel grade and its fu travel in the compact link, so they no longer force the code link.
    const graded = { ...base, materials: [[1, { id: 1, name: 'A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400, gradeId: 'astm-a36', standard: 'ASTM A36', region: 'US' }]] } as never;
    expect(compactLoses(graded)).toBe(false);
    expect(decompressSnapshot(compressSnapshot(graded))!.materials[0]![1]).toMatchObject({ fu: 400, gradeId: 'astm-a36', standard: 'ASTM A36', region: 'US', fy: 250 });
  });
});

describe('the Basic examples', () => {
  it('stay on the compact link, which is shorter', async () => {
    const { compactLoses } = await import('../url-sharing');
    const { modelStore } = await import('../../store/model.svelte');
    for (const name of ['simply-supported', 'portal-frame', 'spring-support', 'thermal', 'settlement', '3d-portal-frame', '3d-grid-slab', 'pipe-rack', '3d-nave-industrial']) {
      await modelStore.loadExample(name);
      expect(compactLoses(modelStore.snapshot()), name).toBe(false);
    }
  });
});
