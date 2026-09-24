import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LZString from 'lz-string';
import { deflateSync } from 'fflate';
import { decompressSnapshot, loadFromShareLink, loadFromURLHash } from '../url-sharing';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { prepareSharedSnapshot } from '../share-snapshot';

type Payload = Record<string, unknown>;

function legacy(): Payload {
  return {
    name: 'shared', analysisMode: '2d',
    nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]],
    materials: [[1, { id: 1, name: 'steel', e: 210000, nu: 0.3 }]],
    sections: [[1, { id: 1, name: 'section', a: 0.01, iz: 0.001 }]],
    elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }]], loads: [],
    nextId: { node: 3, material: 2, section: 2, element: 2, support: 2, load: 1 },
  };
}

function compact(): Payload {
  return {
    sv: 5, nm: 'shared', m: '2d',
    n: [[1, 0, 0], [2, 4, 0]], mt: [[1, 'steel', 210000, 0.3, 78.5]],
    sc: [[1, 'section', 0.01, 0.001]], e: [[1, 0, 1, 2, 1, 1]],
    s: [[1, 1, 'fixed']], l: [], ni: [3, 2, 2, 2, 2, 1],
  };
}

const formats = [
  { name: 'legacy', fixture: legacy, encode: (p: Payload) => LZString.compressToEncodedURIComponent(JSON.stringify(p)) },
  { name: 'compact', fixture: compact, encode: (p: Payload) => '2.' + Buffer.from(deflateSync(new TextEncoder().encode(JSON.stringify(p)))).toString('base64url') },
];

beforeEach(() => {
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  vi.stubGlobal('history', { replaceState: vi.fn() });
  vi.stubGlobal('location', { hash: '', pathname: '/', search: '' });
  // Run camera notifications synchronously so global cleanup cannot race them.
  vi.stubGlobal('queueMicrotask', (callback: () => void) => callback());
  const initial = decompressSnapshot(formats[0].encode(legacy()))!;
  modelStore.restore(initial);
  uiStore.analysisMode = 'pro';
});
afterEach(() => vi.unstubAllGlobals());

it('repairs every counter while preserving optional collections and larger counters', () => {
  const payload = {
    ...legacy(), nextId: { footing: 100, soilProfile: 100 },
    loads: [{ type: 'nodal', data: { id: 8, nodeId: 1, fx: 1 } }],
    loadCases: [{ id: 9, name: 'Live' }],
    combinations: [{ id: 10, name: 'ULS', factors: [{ caseId: 9, factor: 1.5 }] }],
    plates: [[11, { id: 11, nodes: [1, 2, 3] }]],
    quads: [[12, { id: 12, nodes: [1, 2, 3, 4] }]],
    connectors: [[13, { id: 13, nodeI: 1, nodeJ: 2 }]],
    constraints: [{ type: 'linearMpc', terms: [{ node: 1, dof: 'ux', coefficient: 1 }] }],
    provenance: { assumptions: ['review'], layerMappings: [] },
    footings: [[14, { id: 14, nodeId: 1 }]],
    geotechnical: { profiles: [{ id: 15 }] },
  };
  const snapshot = prepareSharedSnapshot(payload)!;
  expect(snapshot.nextId).toEqual({
    node: 3, material: 2, section: 2, element: 2, support: 2, load: 9,
    loadCase: 10, combination: 11, plate: 12, quad: 13, connector: 14,
    footing: 100, soilProfile: 100,
  });
  expect(snapshot.plates).toEqual(payload.plates);
  expect(snapshot.provenance).toEqual(payload.provenance);
  expect(payload.nextId).toEqual({ footing: 100, soilProfile: 100 });
  expect(() => modelStore.restore(snapshot)).not.toThrow();
  const repaired = prepareSharedSnapshot({ ...payload, nextId: {} })!;
  expect(repaired.nextId).toMatchObject({ footing: 15, soilProfile: 16 });
});

describe.each(formats)('$name share boundary', ({ name, fixture, encode }) => {
  const isLegacy = name === 'legacy';
  const rejected: Array<[string, Payload, Payload]> = [
    ['node tuples', { nodes: [null] }, { n: [null] }],
    ['support records', { supports: [[1, null]] }, { s: [null] }],
    ['element records', { elements: [[1, null]] }, { e: [null] }],
    ['null loads', { loads: [null] }, { l: [null] }],
    ['load data', { loads: [{ type: 'nodal', data: null }] }, { l: [{ type: 'nodal', data: null }] }],
    ['load cases', { loadCases: {} }, { lc: {} }],
    ['load case entries', { loadCases: [null] }, { lc: [null] }],
    ['load case names', { loadCases: [{ id: 1 }] }, { lc: [{ id: 1 }] }],
    ['combination factors', { combinations: [{ id: 1, factors: 5 }] }, { co: [{ id: 1, factors: 5 }] }],
    ['plates', { plates: 5 }, { pl: 5 }],
    ['quads', { quads: {} }, { qu: {} }],
    ['connectors', { connectors: [null] }, { cx: [null] }],
    ['constraints', { constraints: {} }, { cn: {} }],
    ['constraint terms', { constraints: [{ type: 'linearMPC', terms: [null] }] }, { cn: [{ type: 'linearMPC', terms: [null] }] }],
    ['provenance assumptions', { provenance: { assumptions: 5 } }, { pv: { assumptions: 5 } }],
    ['provenance layers', { provenance: { layerMappings: {} } }, { pv: { layerMappings: {} } }],
    ['nextId container', { nextId: [] }, { ni: {} }],
    ['duplicate node IDs', { nodes: [[1, { id: 1 }], [1, { id: 1 }]] }, { n: [[1, 0, 0], [1, 1, 0]] }],
    ['unsafe node IDs', { nodes: [[Number.MAX_SAFE_INTEGER, { id: Number.MAX_SAFE_INTEGER }]] }, { n: [[Number.MAX_SAFE_INTEGER, 0, 0]] }],
  ];
  it.each(rejected)('rejects malformed %s before changing either store', (_label, v1, v2) => {
    const encoded = encode({ ...fixture(), ...(isLegacy ? v1 : v2) });
    const before = modelStore.snapshot();
    expect(decompressSnapshot(encoded)).toBeNull();
    expect(loadFromShareLink('#data=' + encoded)).toBe(false);
    location.hash = '#embed=' + encoded;
    expect(loadFromURLHash()).toBeNull();
    expect(modelStore.snapshot()).toEqual(before);
    expect(uiStore.analysisMode).toBe('pro');
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 'bad', -1, 1.5, 1, 2, 1e100])('repairs unsafe node counter %j without replacing nodes', counter => {
    const payload = { ...fixture(), ...(isLegacy ? { nextId: { node: counter } } : { ni: [counter] }) };
    expect(loadFromShareLink('#data=' + encode(payload))).toBe(true);
    expect(modelStore.addNode(8, 0)).toBe(3);
    expect(modelStore.addNode(12, 0)).toBe(4);
    expect(modelStore.nodes.get(1)!.x).toBe(0);
    expect(modelStore.nodes.get(2)!.x).toBe(4);
    expect(modelStore.nodes.size).toBe(4);
  });

  it('retains larger valid counters', () => {
    const payload = { ...fixture(), ...(isLegacy ? { nextId: { node: 50 } } : { ni: [50] }) };
    expect(loadFromShareLink('#data=' + encode(payload))).toBe(true);
    expect(modelStore.addNode(8, 0)).toBe(50);
  });

  it('derives counters for optional collections without requiring them on old links', () => {
    const snapshot = decompressSnapshot(encode(fixture()))!;
    expect(snapshot.plates).toBeUndefined();
    expect(snapshot.loadCases).toBeUndefined();
    expect(snapshot.nextId).toMatchObject({ node: 3, loadCase: 4, plate: 1, quad: 1, connector: 1 });
    expect(loadFromShareLink('#data=' + encode(fixture()))).toBe(true);
  });

  it.each(['2d', '3d', 'pro', 'edu', 'unknown'])('handles mode %s in both public loaders', mode => {
    const encoded = encode({ ...fixture(), ...(isLegacy ? { analysisMode: mode } : { m: mode }) });
    expect(loadFromShareLink('#data=' + encoded)).toBe(true);
    expect(uiStore.analysisMode).toBe(mode === 'unknown' ? 'pro' : mode);
    uiStore.analysisMode = 'pro';
    location.hash = '#data=' + encoded;
    expect(loadFromURLHash()).toBe('data');
    expect(uiStore.analysisMode).toBe(mode === 'unknown' ? 'pro' : mode);
  });
});
