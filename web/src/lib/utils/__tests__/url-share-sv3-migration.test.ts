import { describe, it, expect } from 'vitest';
import { compressSnapshot, decompressSnapshot } from '../url-sharing';
import type { ModelSnapshot } from '../../store/history.svelte';

const baseSnapshot: ModelSnapshot = {
  name: 'sv3-test',
  nodes: [
    [1, { id: 1, x: 0, y: 0 }],
    [2, { id: 2, x: 6, y: 0 }],
  ],
  materials: [[1, { id: 1, name: 'Steel', e: 200_000_000, nu: 0.3, rho: 78.5 }]],
  sections: [[1, { id: 1, name: 'IPE 200', a: 0.0028, iz: 1.94e-5 }]],
  elements: [[1, {
    id: 1, type: 'frame', nodeI: 1, nodeJ: 2,
    materialId: 1, sectionId: 1,
    releaseI: { my: false, mz: true,  t: false },
    releaseJ: { my: false, mz: false, t: false },
  }]],
  supports: [
    [1, { id: 1, nodeId: 1, type: 'pinned' }],
    [2, { id: 2, nodeId: 2, type: 'rollerX' }],
  ],
  loads: [],
  loadCases: [{ id: 1, type: 'D', name: 'Dead' }],
  combinations: [],
  plates: [],
  quads: [],
  constraints: [],
  nextId: { node: 3, material: 2, section: 2, element: 2, support: 3, load: 1, loadCase: 2, combination: 1, plate: 1, quad: 1 },
  analysisMode: '2d',
} as unknown as ModelSnapshot;

describe('Share URL sv:3 → sv:4 migration', () => {
  it('compressSnapshot writes sv:4 with releaseI/releaseJ short keys (ri/rj)', () => {
    const compressed = compressSnapshot(baseSnapshot);
    expect(compressed).toBeTruthy();
    expect(compressed!.startsWith('2.')).toBe(true);
    const decoded = decompressSnapshot(compressed!);
    expect(decoded).not.toBeNull();
    const [, elem] = decoded!.elements[0];
    expect(elem.releaseI).toEqual({ my: false, mz: true,  t: false });
    expect(elem.releaseJ).toEqual({ my: false, mz: false, t: false });
    expect((elem as any).hingeStart).toBeUndefined();
    expect((elem as any).hingeEnd).toBeUndefined();
  });

  it('decompressSnapshot accepts a hand-crafted sv:3 payload and migrates hs/he → releaseI.mz/releaseJ.mz', async () => {
    // Build the same compact shape that the legacy encoder produced (sv:3 with hs/he).
    const { deflateSync } = await import('fflate');
    const compact: Record<string, unknown> = {
      m: '2d',
      nm: 'sv3-test',
      n: [[1, 0, 0], [2, 6, 0]],
      mt: [[1, 'Steel', 200_000_000, 0.3, 78.5]],
      sv: 3,
      sc: [[1, 'IPE 200', 0.0028, 1.94e-5]],
      // Element with hs:true on node I; hand-rolled legacy short keys
      e: [[1, 0, 1, 2, 1, 1, { hs: true }]],
      s: [[1, 1, 'pinned'], [2, 2, 'rollerX']],
      l: [],
      lc: [[1, 'D', 'Dead']],
      cb: [],
      pl: [],
      qd: [],
      cs: [],
      ni: [3, 2, 2, 2, 3, 1, 2, 1, 1, 1],
    };
    const json = JSON.stringify(compact);
    const compressed = '2.' + (() => {
      const data = deflateSync(new TextEncoder().encode(json), { level: 9 });
      let bin = '';
      for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    })();

    const decoded = decompressSnapshot(compressed);
    expect(decoded).not.toBeNull();
    const [, elem] = decoded!.elements[0];
    expect(elem.releaseI).toEqual({ my: false, mz: true,  t: false });
    expect(elem.releaseJ).toEqual({ my: false, mz: false, t: false });
    expect((elem as any).hingeStart).toBeUndefined();
    expect((elem as any).hingeEnd).toBeUndefined();
  });
});
