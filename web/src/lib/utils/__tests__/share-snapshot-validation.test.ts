import { afterEach, describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import { decompressSnapshot } from '../url-sharing';
import { prepareSharedSnapshot } from '../share-snapshot';
import { modelStore } from '../../store/model.svelte';

type Payload = Record<string, any>;

function compact(): Payload {
  return {
    sv: 5, nm: 'shared', m: '2d',
    n: [[1, 0, 0], [2, 4, 0]], mt: [[1, 'steel', 210000, 0.3, 78.5]],
    sc: [[1, 'section', 0.01, 0.001]], e: [[1, 0, 1, 2, 1, 1]],
    s: [[1, 1, 'fixed']],
    l: [
      { type: 'nodal', data: { id: 1, caseId: 1, nodeId: 2, fx: 0, fz: -10, my: 0 } },
      { type: 'distributed', data: { id: 2, caseId: 1, elementId: 1, qI: -5, qJ: -5 } },
    ],
    ni: [3, 2, 2, 2, 2, 3],
  };
}

function legacy(): Payload {
  return {
    name: 'shared', analysisMode: '2d',
    nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]],
    materials: [[1, { id: 1, name: 'steel', e: 210000, nu: 0.3 }]],
    sections: [[1, { id: 1, name: 'section', a: 0.01, iz: 0.001 }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }]],
    loads: [{ type: 'distributed', data: { id: 1, caseId: 1, elementId: 1, qI: -5, qJ: -5 } }],
    nextId: { node: 3, material: 2, section: 2, element: 2, support: 2, load: 2 },
  };
}

const encodeText = (payload: string) => `2.${Buffer.from(deflateSync(new TextEncoder().encode(payload))).toString('base64url')}`;
const encode = (payload: Payload) => encodeText(JSON.stringify(payload));

afterEach(() => modelStore.clear());

describe('shared-link importer', () => {
  it('opens a valid model with its nodes, members, supports and loads', () => {
    const snapshot = decompressSnapshot(encode(compact()));
    expect(snapshot).not.toBeNull();
    modelStore.restore(snapshot!);
    expect([...modelStore.nodes.values()].map(n => [n.id, n.x, n.y])).toEqual([[1, 0, 0], [2, 4, 0]]);
    expect([...modelStore.elements.values()].map(e => [e.nodeI, e.nodeJ])).toEqual([[1, 2]]);
    expect([...modelStore.supports.values()].map(s => [s.nodeId, s.type])).toEqual([[1, 'fixed']]);
    expect(modelStore.loads.map(l => l.type)).toEqual(['nodal', 'distributed']);
  });

  it('rejects malformed, oversized, non-finite and dangling links', () => {
    const base = compact();
    const valid = encode(base);
    const rejected: Record<string, string> = {
      version: `9.${valid.slice(2)}`,
      base64: '2.%%%***',
      deflate: `2.${Buffer.from('not a deflate stream').toString('base64url')}`,
      json: encodeText('{"n":[[1,0,'),
      oversized: encode({ ...base, pad: ' '.repeat(60_000_000) }),
      nonfinite: encodeText(JSON.stringify(base).replace('[2,4,0]', '[2,1e999,0]')),
      nonfiniteLoad: encodeText(JSON.stringify(base).replace('"fz":-10', '"fz":-1e999')),
      nonnumeric: encode({ ...base, n: [[1, 'x', 0], base.n[1]] }),
      danglingMember: encode({ ...base, e: [...base.e, [2, 0, 1, 99, 1, 1]] }),
      danglingSupport: encode({ ...base, s: [...base.s, [2, 77, 'pinned']] }),
      danglingNodalLoad: encode({ ...base, l: [...base.l, { type: 'nodal', data: { id: 3, caseId: 1, nodeId: 55, fx: 0, fz: -1, my: 0 } }] }),
      danglingMemberLoad: encode({ ...base, l: [...base.l, { type: 'distributed', data: { id: 3, caseId: 1, elementId: 42, qI: -1, qJ: -1 } }] }),
    };
    for (const [name, data] of Object.entries(rejected)) expect(decompressSnapshot(data), name).toBeNull();
  });

  it('rejects the same faults in a full snapshot', () => {
    expect(prepareSharedSnapshot(legacy())).not.toBeNull();
    const faults: Record<string, (p: Payload) => void> = {
      nonfinite: p => { p.nodes[1][1].x = Infinity; },
      nanMaterial: p => { p.materials[0][1].e = NaN; },
      nonnumeric: p => { p.nodes[0][1].y = '0'; },
      nonnumericZ: p => { p.nodes[0][1].z = null; },
      danglingMember: p => { p.elements[0][1].nodeJ = 9; },
      danglingSupport: p => { p.supports[0][1].nodeId = 9; },
      danglingMemberLoad: p => { p.loads[0].data.elementId = 9; },
    };
    for (const [name, fault] of Object.entries(faults)) {
      const payload = legacy();
      fault(payload);
      expect(prepareSharedSnapshot(payload), name).toBeNull();
    }
  });

  it('keeps a hostile model name as inert text', () => {
    const name = '<img src=x onerror="alert(1)">';
    const snapshot = decompressSnapshot(encode({ ...compact(), nm: name }));
    expect(snapshot!.name).toBe(name);
    modelStore.restore(snapshot!);
    expect(modelStore.model.name).toBe(name);
  });
});
