// Tests for URL sharing v2 compact format + backward compatibility
import { describe, it, expect } from 'vitest';
import LZString from 'lz-string';
import { deflateSync, inflateSync } from 'fflate';
import type { ModelSnapshot } from '../../store/history.svelte';

// ── Inline the pure functions from url-sharing.ts ──
// (We can't import the full module because it depends on Svelte stores,
//  but we test the core encode/decode logic directly.)

const V2_PREFIX = '2.';

function uint8ToBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToUint8(str: string): Uint8Array {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function r(n: number, decimals = 6): number {
  if (Number.isInteger(n)) return n;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/** Simple portal frame snapshot for testing */
function makeSnapshot(): ModelSnapshot {
  return {
    analysisMode: '2d',
    name: 'Test Portal',
    nodes: [
      [1, { id: 1, x: 0, y: 0 }],
      [2, { id: 2, x: 0, y: 4 }],
      [3, { id: 3, x: 6, y: 4 }],
      [4, { id: 4, x: 6, y: 0 }],
    ],
    materials: [
      [1, { id: 1, name: 'Acero', e: 200000000, nu: 0.3, rho: 7850 }],
    ],
    sections: [
      [1, { id: 1, name: 'IPN 200', a: 0.00334, iz: 0.00002142, b: 0.09, h: 0.2, shape: 'I', tw: 0.0075, tf: 0.0114 }],
    ],
    elements: [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [3, { id: 3, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ],
    supports: [
      [1, { id: 1, nodeId: 1, type: 'fixed' }],
      [2, { id: 2, nodeId: 4, type: 'fixed' }],
    ],
    loads: [
      { type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10, direction: 'y', isGlobal: true, loadCaseId: 1 } },
      { type: 'point', data: { nodeId: 2, fx: 5, fy: 0, mz: 0, loadCaseId: 1 } },
    ],
    loadCases: [
      { id: 1, type: 'D', name: 'Dead Load' },
    ],
    combinations: [],
    nextId: { node: 5, material: 2, section: 2, element: 4, support: 3, load: 3, loadCase: 2, combination: 1 },
  };
}

// ── Compact format (subset of toCompact/fromCompact for testing) ──

function toCompact(snapshot: ModelSnapshot): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (snapshot.analysisMode) c.m = snapshot.analysisMode;
  if (snapshot.name) c.nm = snapshot.name;
  c.n = snapshot.nodes.map(([, v]) => {
    const arr: number[] = [v.id, r(v.x), r(v.y)];
    if (v.z !== undefined && v.z !== 0) arr.push(r(v.z));
    return arr;
  });
  c.mt = snapshot.materials.map(([, v]) => {
    const arr: (string | number)[] = [v.id, v.name, r(v.e), r(v.nu), r(v.rho)];
    if ((v as any).fy != null) arr.push(r((v as any).fy));
    return arr;
  });
  c.sc = snapshot.sections.map(([, v]) => {
    const base: (string | number)[] = [v.id, v.name, r(v.a), r(v.iz)];
    const opt: Record<string, number | string> = {};
    if (v.shape) opt.s = v.shape;
    if (v.b != null) opt.b = r(v.b);
    if (v.h != null) opt.h = r(v.h);
    if (v.tw != null) opt.w = r(v.tw);
    if (v.tf != null) opt.f = r(v.tf);
    if (v.t != null) opt.t = r(v.t);
    if (v.iy != null) opt.iy = r(v.iy);
    if (v.j != null) opt.j = r(v.j);
    if (Object.keys(opt).length > 0) base.push(opt as any);
    return base;
  });
  c.e = snapshot.elements.map(([, v]) => {
    const arr: (number | Record<string, number | boolean>)[] = [
      v.id, v.type === 'truss' ? 1 : 0, v.nodeI, v.nodeJ, v.materialId, v.sectionId,
    ];
    const opt: Record<string, number | boolean> = {};
    if (v.hingeStart) opt.hs = true;
    if (v.hingeEnd) opt.he = true;
    if (Object.keys(opt).length > 0) arr.push(opt);
    return arr;
  });
  c.s = snapshot.supports.map(([, v]) => {
    const arr: (number | string | Record<string, unknown>)[] = [v.id, v.nodeId, v.type];
    const opt: Record<string, unknown> = {};
    if (v.angle) opt.a = r(v.angle);
    if (v.isGlobal) opt.g = true;
    if (v.kx) opt.kx = r(v.kx);
    if (v.ky) opt.ky = r(v.ky);
    if (Object.keys(opt).length > 0) arr.push(opt);
    return arr;
  });
  c.l = snapshot.loads;
  if (snapshot.loadCases?.length) c.lc = snapshot.loadCases;
  if (snapshot.combinations?.length) c.co = snapshot.combinations;
  const nid = snapshot.nextId;
  c.ni = [nid.node, nid.material, nid.section, nid.element, nid.support, nid.load,
    nid.loadCase ?? 3, nid.combination ?? 1];
  return c;
}

function fromCompact(c: Record<string, unknown>): ModelSnapshot {
  return {
    analysisMode: c.m as '2d' | '3d' | undefined,
    name: c.nm as string | undefined,
    nodes: (c.n as number[][]).map(a => [a[0], { id: a[0], x: a[1], y: a[2], ...(a[3] !== undefined ? { z: a[3] } : {}) }]),
    materials: (c.mt as (string | number)[][]).map(a => [
      a[0] as number,
      { id: a[0] as number, name: a[1] as string, e: a[2] as number, nu: a[3] as number, rho: a[4] as number, ...(a[5] != null ? { fy: a[5] as number } : {}) },
    ]),
    sections: (c.sc as any[]).map(a => {
      const opt = typeof a[4] === 'object' ? a[4] : {};
      return [a[0], {
        id: a[0], name: a[1], a: a[2], iz: a[3],
        ...(opt.s ? { shape: opt.s } : {}),
        ...(opt.b != null ? { b: opt.b } : {}),
        ...(opt.h != null ? { h: opt.h } : {}),
        ...(opt.w != null ? { tw: opt.w } : {}),
        ...(opt.f != null ? { tf: opt.f } : {}),
        ...(opt.t != null ? { t: opt.t } : {}),
        ...(opt.iy != null ? { iy: opt.iy } : {}),
        ...(opt.j != null ? { j: opt.j } : {}),
      }];
    }),
    elements: (c.e as any[]).map(a => {
      const opt = typeof a[6] === 'object' ? a[6] : {};
      return [a[0], {
        id: a[0], type: a[1] === 1 ? 'truss' : 'frame', nodeI: a[2], nodeJ: a[3],
        materialId: a[4], sectionId: a[5],
        hingeStart: opt.hs ?? false, hingeEnd: opt.he ?? false,
      }];
    }),
    supports: (c.s as any[]).map(a => {
      const opt = typeof a[3] === 'object' ? a[3] : {};
      return [a[0], {
        id: a[0], nodeId: a[1], type: a[2],
        ...(opt.a ? { angle: opt.a } : {}),
        ...(opt.g ? { isGlobal: true } : {}),
        ...(opt.kx ? { kx: opt.kx } : {}),
        ...(opt.ky ? { ky: opt.ky } : {}),
      }];
    }),
    loads: c.l as ModelSnapshot['loads'],
    loadCases: c.lc as ModelSnapshot['loadCases'],
    combinations: c.co as ModelSnapshot['combinations'],
    nextId: (() => {
      const a = c.ni as number[];
      return { node: a[0], material: a[1], section: a[2], element: a[3], support: a[4], load: a[5], loadCase: a[6], combination: a[7] };
    })(),
  };
}

// ── Tests ──

describe('URL sharing v2', () => {
  it('compact roundtrip preserves model data', () => {
    const original = makeSnapshot();
    const compact = toCompact(original);
    const restored = fromCompact(compact);

    // Nodes
    expect(restored.nodes.length).toBe(4);
    expect(restored.nodes[0][1]).toEqual({ id: 1, x: 0, y: 0 });
    expect(restored.nodes[1][1]).toEqual({ id: 2, x: 0, y: 4 });

    // Materials
    expect(restored.materials.length).toBe(1);
    expect(restored.materials[0][1].name).toBe('Acero');
    expect(restored.materials[0][1].e).toBe(200000000);

    // Sections — with shape details
    expect(restored.sections.length).toBe(1);
    const sec = restored.sections[0][1];
    expect(sec.name).toBe('IPN 200');
    expect(sec.shape).toBe('I');
    expect(sec.b).toBe(0.09);
    expect(sec.h).toBe(0.2);
    expect(sec.tw).toBe(0.0075);
    expect(sec.tf).toBe(0.0114);

    // Elements
    expect(restored.elements.length).toBe(3);
    expect(restored.elements[0][1].type).toBe('frame');
    expect(restored.elements[0][1].nodeI).toBe(1);
    expect(restored.elements[0][1].nodeJ).toBe(2);

    // Supports
    expect(restored.supports.length).toBe(2);
    expect(restored.supports[0][1].type).toBe('fixed');

    // Loads
    expect(restored.loads.length).toBe(2);

    // NextId
    expect(restored.nextId).toEqual({ node: 5, material: 2, section: 2, element: 4, support: 3, load: 3, loadCase: 2, combination: 1 });

    // Mode & name
    expect(restored.analysisMode).toBe('2d');
    expect(restored.name).toBe('Test Portal');
  });

  it('v2 deflate roundtrip produces smaller output than v1 LZ-String', () => {
    const snapshot = makeSnapshot();

    // v1: full JSON + LZ-String
    const v1Json = JSON.stringify(snapshot);
    const v1Compressed = LZString.compressToEncodedURIComponent(v1Json);

    // v2: compact JSON + deflate
    const compact = toCompact(snapshot);
    const v2Json = JSON.stringify(compact);
    const v2Bytes = new TextEncoder().encode(v2Json);
    const v2Deflated = deflateSync(v2Bytes, { level: 9 });
    const v2Compressed = V2_PREFIX + uint8ToBase64url(v2Deflated);

    // v2 should be meaningfully shorter
    expect(v2Compressed.length).toBeLessThan(v1Compressed.length);

    // Log sizes for inspection
    console.log(`v1 JSON: ${v1Json.length} chars → LZ-String: ${v1Compressed.length} chars`);
    console.log(`v2 JSON: ${v2Json.length} chars → deflate+b64: ${v2Compressed.length} chars`);
    console.log(`Reduction: ${((1 - v2Compressed.length / v1Compressed.length) * 100).toFixed(1)}%`);
  });

  it('v2 deflate roundtrip is lossless', () => {
    const snapshot = makeSnapshot();
    const compact = toCompact(snapshot);
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    const deflated = deflateSync(bytes, { level: 9 });
    const b64 = uint8ToBase64url(deflated);

    // Decompress
    const inflated = inflateSync(base64urlToUint8(b64));
    const decoded = new TextDecoder().decode(inflated);
    expect(decoded).toBe(json);

    const restored = fromCompact(JSON.parse(decoded));
    expect(restored.nodes.length).toBe(4);
    expect(restored.elements.length).toBe(3);
  });

  it('base64url roundtrip is lossless', () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 63, 62, 61]);
    const encoded = uint8ToBase64url(original);
    const decoded = base64urlToUint8(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
    // No + or / in URL-safe base64
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('v1 LZ-String links still decode (backward compat)', () => {
    const snapshot = makeSnapshot();
    const v1Json = JSON.stringify(snapshot);
    const v1Compressed = LZString.compressToEncodedURIComponent(v1Json);

    // Simulate decompressSnapshot detection logic
    const isV2 = v1Compressed.startsWith(V2_PREFIX);
    expect(isV2).toBe(false); // v1 never starts with "2."

    // Decode with v1
    const decoded = LZString.decompressFromEncodedURIComponent(v1Compressed);
    expect(decoded).toBe(v1Json);
    const parsed = JSON.parse(decoded!);
    expect(parsed.nodes.length).toBe(4);
    expect(parsed.nextId.node).toBe(5);
  });

  it('3D nodes with z coordinate roundtrip correctly', () => {
    const snapshot = makeSnapshot();
    snapshot.analysisMode = '3d';
    snapshot.nodes = [
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 3, y: 4, z: 5 }],
    ];

    const compact = toCompact(snapshot);
    const restored = fromCompact(compact);

    expect(restored.analysisMode).toBe('3d');
    expect(restored.nodes[1][1].z).toBe(5);
  });

  it('truss elements roundtrip correctly', () => {
    const snapshot = makeSnapshot();
    snapshot.elements = [
      [1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ];

    const compact = toCompact(snapshot);
    const restored = fromCompact(compact);

    expect(restored.elements[0][1].type).toBe('truss');
  });

  it('elements with hinges roundtrip correctly', () => {
    const snapshot = makeSnapshot();
    snapshot.elements = [
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: true, hingeEnd: false }],
    ];

    const compact = toCompact(snapshot);
    const restored = fromCompact(compact);

    expect(restored.elements[0][1].hingeStart).toBe(true);
    expect(restored.elements[0][1].hingeEnd).toBe(false);
  });

  it('supports with spring stiffness roundtrip correctly', () => {
    const snapshot = makeSnapshot();
    snapshot.supports = [
      [1, { id: 1, nodeId: 1, type: 'spring', kx: 0, ky: 5000 }],
    ];

    const compact = toCompact(snapshot);
    const restored = fromCompact(compact);

    expect(restored.supports[0][1].type).toBe('spring');
    expect(restored.supports[0][1].ky).toBe(5000);
  });
});
