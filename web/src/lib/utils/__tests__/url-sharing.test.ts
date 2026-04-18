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
    if (v.kz) opt.kz = r(v.kz);
    if (v.dx) opt.dx = r(v.dx);
    if (v.dy) opt.dy = r(v.dy);
    if (v.drz) opt.rz = r(v.drz);
    if (v.dz) opt.dz = r(v.dz);
    if (v.drx) opt.rx = r(v.drx);
    if (v.dry) opt.ry = r(v.dry);
    if (v.krx) opt.Rx = r(v.krx);
    if (v.kry) opt.Ry = r(v.kry);
    if (v.krz) opt.Rz = r(v.krz);
    if (Object.keys(opt).length > 0) arr.push(opt);
    return arr;
  });
  c.l = snapshot.loads;
  if (snapshot.loadCases?.length) c.lc = snapshot.loadCases;
  if (snapshot.combinations?.length) c.co = snapshot.combinations;

  // Plates: [[id, [n1,n2,n3], matId, thickness, shellFamily?], ...]
  if (snapshot.plates?.length) {
    c.pl = snapshot.plates.map(([, v]) => {
      const arr: unknown[] = [v.id, v.nodes, v.materialId, r(v.thickness)];
      if ((v as any).shellFamily) arr.push((v as any).shellFamily);
      return arr;
    });
  }

  // Quads: [[id, [n1,n2,n3,n4], matId, thickness, shellFamily?], ...]
  if (snapshot.quads?.length) {
    c.qu = snapshot.quads.map(([, v]) => {
      const arr: unknown[] = [v.id, v.nodes, v.materialId, r(v.thickness)];
      if ((v as any).shellFamily) arr.push((v as any).shellFamily);
      return arr;
    });
  }

  // Constraints: kept as-is (already compact, type+data varies by variant)
  if (snapshot.constraints?.length) {
    c.cn = snapshot.constraints;
  }

  const nid = snapshot.nextId;
  c.ni = [nid.node, nid.material, nid.section, nid.element, nid.support, nid.load,
    nid.loadCase ?? 3, nid.combination ?? 1, nid.plate ?? 1, nid.quad ?? 1];
  return c;
}

function fromCompact(c: Record<string, unknown>): ModelSnapshot {
  return {
    analysisMode: c.m as '2d' | '3d' | 'pro' | 'edu' | undefined,
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
        ...(opt.kz ? { kz: opt.kz } : {}),
        ...(opt.dx ? { dx: opt.dx } : {}),
        ...(opt.dy ? { dy: opt.dy } : {}),
        ...(opt.rz ? { drz: opt.rz } : {}),
        ...(opt.dz ? { dz: opt.dz } : {}),
        ...(opt.rx ? { drx: opt.rx } : {}),
        ...(opt.ry ? { dry: opt.ry } : {}),
        ...(opt.Rx ? { krx: opt.Rx } : {}),
        ...(opt.Ry ? { kry: opt.Ry } : {}),
        ...(opt.Rz ? { krz: opt.Rz } : {}),
      }];
    }),
    loads: c.l as ModelSnapshot['loads'],
    loadCases: c.lc as ModelSnapshot['loadCases'],
    combinations: c.co as ModelSnapshot['combinations'],

    // Plates
    plates: (c.pl as any[] | undefined)?.map((a: any) => [a[0], {
      id: a[0], nodes: a[1], materialId: a[2], thickness: a[3],
      ...(a[4] ? { shellFamily: a[4] } : {}),
    }]) as ModelSnapshot['plates'],

    // Quads
    quads: (c.qu as any[] | undefined)?.map((a: any) => [a[0], {
      id: a[0], nodes: a[1], materialId: a[2], thickness: a[3],
      ...(a[4] ? { shellFamily: a[4] } : {}),
    }]) as ModelSnapshot['quads'],

    // Constraints
    constraints: c.cn as ModelSnapshot['constraints'],

    nextId: (() => {
      const a = c.ni as number[];
      return { node: a[0], material: a[1], section: a[2], element: a[3], support: a[4], load: a[5], loadCase: a[6], combination: a[7], plate: a[8] ?? 1, quad: a[9] ?? 1 };
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

    // NextId (plate/quad default to 1 when the original snapshot doesn't have them)
    expect(restored.nextId).toEqual({ node: 5, material: 2, section: 2, element: 4, support: 3, load: 3, loadCase: 2, combination: 1, plate: 1, quad: 1 });

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

  it('PRO model with plates, quads, constraints, and full 3D supports roundtrips correctly', () => {
    const snapshot: ModelSnapshot = {
      analysisMode: 'pro',
      name: 'PRO Shell Model',
      nodes: [
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 1, y: 0, z: 0 }],
        [3, { id: 3, x: 1, y: 1, z: 0 }],
        [4, { id: 4, x: 0, y: 1, z: 0 }],
        [5, { id: 5, x: 0.5, y: 0.5, z: 1 }],
      ],
      materials: [
        [1, { id: 1, name: 'Concrete', e: 30000, nu: 0.2, rho: 2500 }],
      ],
      sections: [
        [1, { id: 1, name: 'W10x12', a: 0.00226, iz: 0.0000218 }],
      ],
      elements: [
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 5, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ],
      supports: [
        [1, { id: 1, nodeId: 1, type: 'fixed', kz: 5000, dx: 0.01, dy: 0.02, dz: 0.03, drx: 0.1, dry: 0.2, drz: 0.3, krx: 100, kry: 200, krz: 300 }],
      ],
      loads: [
        { type: 'nodal', data: { nodeId: 5, fx: 0, fy: 0, fz: -10, loadCaseId: 1 } },
      ],
      loadCases: [{ id: 1, type: 'D', name: 'Dead' }],
      combinations: [],
      plates: [
        [1, { id: 1, nodes: [1, 2, 5] as [number, number, number], materialId: 1, thickness: 0.15 }],
        [2, { id: 2, nodes: [3, 4, 5] as [number, number, number], materialId: 1, thickness: 0.20 }],
      ],
      quads: [
        [1, { id: 1, nodes: [1, 2, 3, 4] as [number, number, number, number], materialId: 1, thickness: 0.25 }],
      ],
      constraints: [
        { type: 'rigidLink', masterNode: 1, slaveNode: 2, dofs: [0, 1, 2] },
        { type: 'diaphragm', masterNode: 1, slaveNodes: [2, 3, 4], plane: 'XY' },
        { type: 'equalDof', masterNode: 3, slaveNode: 4, dofs: [0, 1] },
        { type: 'linearMpc', terms: [{ nodeId: 1, dof: 0, coefficient: 1.0 }, { nodeId: 2, dof: 0, coefficient: -1.0 }] },
      ],
      nextId: { node: 6, material: 2, section: 2, element: 2, support: 2, load: 2, loadCase: 2, combination: 1, plate: 3, quad: 2 },
    };

    const compact = toCompact(snapshot);
    const restored = fromCompact(compact);

    // analysisMode preserved
    expect(restored.analysisMode).toBe('pro');

    // Plates survived
    expect(restored.plates).toBeDefined();
    expect(restored.plates!.length).toBe(2);
    expect(restored.plates![0][1]).toEqual({ id: 1, nodes: [1, 2, 5], materialId: 1, thickness: 0.15 });
    expect(restored.plates![1][1]).toEqual({ id: 2, nodes: [3, 4, 5], materialId: 1, thickness: 0.20 });

    // Quads survived
    expect(restored.quads).toBeDefined();
    expect(restored.quads!.length).toBe(1);
    expect(restored.quads![0][1]).toEqual({ id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.25 });

    // Constraints survived
    expect(restored.constraints).toBeDefined();
    expect(restored.constraints!.length).toBe(4);
    expect(restored.constraints![0]).toEqual({ type: 'rigidLink', masterNode: 1, slaveNode: 2, dofs: [0, 1, 2] });
    expect(restored.constraints![1]).toEqual({ type: 'diaphragm', masterNode: 1, slaveNodes: [2, 3, 4], plane: 'XY' });
    expect(restored.constraints![2]).toEqual({ type: 'equalDof', masterNode: 3, slaveNode: 4, dofs: [0, 1] });
    expect(restored.constraints![3]).toEqual({ type: 'linearMpc', terms: [{ nodeId: 1, dof: 0, coefficient: 1.0 }, { nodeId: 2, dof: 0, coefficient: -1.0 }] });

    // Full 3D support fields survived
    const sup = restored.supports[0][1];
    expect(sup.kz).toBe(5000);
    expect(sup.dx).toBe(0.01);
    expect(sup.dy).toBe(0.02);
    expect(sup.dz).toBe(0.03);
    expect(sup.drx).toBe(0.1);
    expect(sup.dry).toBe(0.2);
    expect(sup.drz).toBe(0.3);
    expect(sup.krx).toBe(100);
    expect(sup.kry).toBe(200);
    expect(sup.krz).toBe(300);

    // nextId includes plate and quad counters
    expect(restored.nextId.plate).toBe(3);
    expect(restored.nextId.quad).toBe(2);
  });

  it('old v2 links without PRO fields still load (backward compat)', () => {
    // Simulate a compact object from an old version with no plates/quads/constraints/plate+quad nextId
    const oldCompact: Record<string, unknown> = {
      m: '3d',
      n: [[1, 0, 0, 0], [2, 1, 0, 0]],
      mt: [[1, 'Steel', 200000, 0.3, 7850]],
      sc: [[1, 'W10', 0.002, 0.00002]],
      e: [[1, 0, 1, 2, 1, 1]],
      s: [[1, 1, 'fixed']],
      l: [],
      ni: [3, 2, 2, 2, 2, 1, 3, 1], // old format: 8 entries, no plate/quad
    };

    const restored = fromCompact(oldCompact);

    // Basic fields still work
    expect(restored.analysisMode).toBe('3d');
    expect(restored.nodes.length).toBe(2);

    // PRO fields gracefully default to empty
    expect(restored.plates ?? []).toEqual([]);
    expect(restored.quads ?? []).toEqual([]);
    expect(restored.constraints ?? []).toEqual([]);

    // plate/quad nextId default to 1
    expect(restored.nextId.plate ?? 1).toBe(1);
    expect(restored.nextId.quad ?? 1).toBe(1);
  });

  it('full end-to-end v2 compress/decompress preserves PRO model', () => {
    const snapshot: ModelSnapshot = {
      analysisMode: 'pro',
      name: 'E2E PRO',
      nodes: [
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 1, y: 0, z: 0 }],
        [3, { id: 3, x: 1, y: 1, z: 0 }],
      ],
      materials: [[1, { id: 1, name: 'M', e: 30000, nu: 0.2, rho: 2500 }]],
      sections: [[1, { id: 1, name: 'S', a: 0.001, iz: 0.00001 }]],
      elements: [],
      supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }]],
      loads: [],
      loadCases: [{ id: 1, type: 'D', name: 'D' }],
      combinations: [],
      plates: [[1, { id: 1, nodes: [1, 2, 3] as [number, number, number], materialId: 1, thickness: 0.1 }]],
      quads: [],
      constraints: [{ type: 'rigidLink', masterNode: 1, slaveNode: 2 }],
      nextId: { node: 4, material: 2, section: 2, element: 1, support: 2, load: 1, loadCase: 2, combination: 1, plate: 2, quad: 1 },
    };

    // Compress
    const compact = toCompact(snapshot);
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    const deflated = deflateSync(bytes, { level: 9 });
    const compressed = V2_PREFIX + uint8ToBase64url(deflated);

    // Decompress
    const b64 = compressed.slice(V2_PREFIX.length);
    const inflated = inflateSync(base64urlToUint8(b64));
    const decoded = new TextDecoder().decode(inflated);
    const restored = fromCompact(JSON.parse(decoded));

    expect(restored.analysisMode).toBe('pro');
    expect(restored.plates!.length).toBe(1);
    expect(restored.plates![0][1].thickness).toBe(0.1);
    expect(restored.constraints!.length).toBe(1);
    expect(restored.constraints![0]).toEqual({ type: 'rigidLink', masterNode: 1, slaveNode: 2 });
    expect(restored.nextId.plate).toBe(2);
  });
});
