import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { fileOps } from '../file';

const v1FileWithHinges = {
  version: '1.0',
  name: 'legacy-frame',
  timestamp: '2025-01-01T00:00:00.000Z',
  snapshot: {
    nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 6, y: 0 }]],
    elements: [[1, {
      id: 1, type: 'frame', nodeI: 1, nodeJ: 2,
      materialId: 1, sectionId: 1,
      hingeStart: true, hingeEnd: false,
    }]],
    materials: [[1, { id: 1, name: 'Steel', e: 200e6, nu: 0.3, rho: 78.5 }]],
    sections: [[1, { id: 1, name: 'IPE 200', a: 0.0028, iz: 1.94e-5 }]],
    supports: [],
    loads: [],
    nextId: { node: 3, element: 2, material: 2, section: 2, support: 1, load: 1 },
  },
};

describe('DedalFile v1.0 → v2.0 read-migration', () => {
  beforeEach(() => {
    modelStore.clear();
  });

  it('loads a v1.0 file and migrates hingeStart/hingeEnd to releaseI.mz/releaseJ.mz', () => {
    const json = JSON.stringify(v1FileWithHinges);
    const ok = fileOps.deserializeProject(json);
    expect(ok).toBe(true);
    const elem = modelStore.elements.get(1)!;
    expect(elem.releaseI).toEqual({ my: false, mz: true, t: false });
    expect(elem.releaseJ).toEqual({ my: false, mz: false, t: false });
    expect((elem as any).hingeStart).toBeUndefined();
    expect((elem as any).hingeEnd).toBeUndefined();
  });

  it('rejects an unknown version explicitly rather than silently loading', () => {
    const v99 = { ...v1FileWithHinges, version: '99.0' };
    const ok = fileOps.deserializeProject(JSON.stringify(v99));
    expect(ok).toBe(false);
  });

  it('serializeProject writes version 2.0 with releaseI/releaseJ shape', () => {
    modelStore.addNode(0, 0);
    modelStore.addNode(6, 0);
    const elemId = modelStore.addElement(1, 2, 'frame');
    modelStore.toggleRelease(elemId, 'i', 'mz');

    const json = fileOps.serializeProject();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('2.0');
    const [, savedElem] = parsed.snapshot.elements[0];
    expect(savedElem.releaseI).toEqual({ my: false, mz: true, t: false });
    expect(savedElem.releaseJ).toEqual({ my: false, mz: false, t: false });
    expect(savedElem.hingeStart).toBeUndefined();
    expect(savedElem.hingeEnd).toBeUndefined();
  });
});
