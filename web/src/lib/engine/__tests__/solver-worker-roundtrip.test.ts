/**
 * solver-worker message round-trip — smoke test for the structured-clone
 * boundary introduced by the JsValue migration.
 *
 * The worker now receives plain objects (no JSON text), runs the finiteness
 * guard, and returns plain objects. This wires the real worker module to a
 * stubbed `self`, initializes it with the real WASM build, and checks the
 * init → solve3d → result flow plus the NaN rejection path.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

interface PostedMessage {
  type: string;
  id?: number;
  result?: any;
  error?: string;
  message?: string;
}

function cantileverWire(): Record<string, any> {
  return {
    nodes: { '1': { id: 1, x: 0, y: 0, z: 0 }, '2': { id: 2, x: 5, y: 0, z: 0 } },
    materials: { '1': { id: 1, e: 200e6, nu: 0.3 } },
    sections: { '1': { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4 } },
    elements: { '1': { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } },
    supports: { '1': { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true } },
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }],
    plates: {}, quads: {}, curvedShells: {}, constraints: [], connectors: {}, leftHand: false,
  };
}

describe('solver-worker message round-trip', () => {
  let posted: PostedMessage[];
  let dispatch: (msg: any) => Promise<void>;

  beforeAll(async () => {
    posted = [];
    const fakeSelf: Record<string, any> = {
      postMessage: (msg: PostedMessage) => { posted.push(msg); },
    };
    vi.stubGlobal('self', fakeSelf);
    // Importing the module assigns fakeSelf.onmessage.
    await import('../solver-worker');
    dispatch = (msg) => fakeSelf.onmessage({ data: msg });

    const wasmPath = fileURLToPath(new URL('../../wasm/dedaliano_engine_bg.wasm', import.meta.url));
    const wasmModule = await WebAssembly.compile(readFileSync(wasmPath));
    await dispatch({ type: 'init', wasmModule });

    const err = posted.find(m => m.type === 'error');
    if (err) throw new Error(`Worker init failed: ${err.message}`);
    expect(posted.some(m => m.type === 'ready')).toBe(true);
  }, 30000);

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('solves a plain-object input and returns a plain-object result', async () => {
    await dispatch({ type: 'solve3d', id: 1, input: cantileverWire() });

    const res = posted.find(m => m.type === 'result' && m.id === 1);
    expect(res).toBeDefined();
    expect(res!.error).toBeUndefined();

    const result = res!.result;
    expect(result.displacements.length).toBe(2);
    const tip = result.displacements.find((d: any) => d.nodeId === 2);
    expect(tip).toBeDefined();
    expect(typeof tip.uz).toBe('number');
    expect(Number.isFinite(tip.uz)).toBe(true);
    expect(tip.uz).toBeLessThan(0); // downward load → negative uz
  });

  it('rejects non-finite input on the worker side (assertFiniteWire)', async () => {
    const bad = cantileverWire();
    bad.nodes['2'] = { id: 2, x: NaN, y: 0, z: 0 };

    await dispatch({ type: 'solve3d', id: 2, input: bad });

    const res = posted.find(m => m.type === 'result' && m.id === 2);
    expect(res).toBeDefined();
    expect(res!.result).toBeUndefined();
    expect(res!.error).toMatch(/Non-finite number \(NaN\) at input\.nodes\.2\.x/);
  });

  it('refuses an oversized P-Delta input before entering the dense solver', async () => {
    const input = cantileverWire();
    for (let id = 3; id <= 1149; id++) input.nodes[id] = { id, x: id, y: 0, z: 0 };
    await dispatch({ type: 'pdelta3d', id: 4, input, maxIter: 20, tol: 1e-4 });
    const res = posted.find(m => m.type === 'result' && m.id === 4);
    expect(res?.result).toBeUndefined();
    expect(res?.error).toContain('P-Delta is not available for a model this large');
  });

  it('reports an error for structurally invalid input instead of hanging', async () => {
    // Element references node 99, which does not exist.
    const bad = cantileverWire();
    bad.elements['1'] = { ...bad.elements['1'], nodeJ: 99 };

    await dispatch({ type: 'solve3d', id: 3, input: bad });

    const res = posted.find(m => m.type === 'result' && m.id === 3);
    expect(res).toBeDefined();
    expect(res!.result).toBeUndefined();
    expect(res!.error).toBeTruthy();
  });
});
