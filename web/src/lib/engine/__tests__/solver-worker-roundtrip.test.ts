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

  it('solves P-Delta through the worker with sparse assembly', async () => {
    const input = cantileverWire();
    input.nodes = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [i + 1, { id: i + 1, x: i, y: 0, z: 0 }]));
    input.elements = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, { ...input.elements['1'], id: i + 1, nodeI: i + 1, nodeJ: i + 2 }]));
    input.loads[0].data.nodeId = 13;
    await dispatch({ type: 'pdelta3d', id: 4, input, maxIter: 20, tol: 1e-8 });
    const res = posted.find(m => m.type === 'result' && m.id === 4);
    expect(res?.error).toBeUndefined();
    expect(res?.result.converged).toBe(true);
    const tip = res?.result.results.displacements.find((d: any) => d.nodeId === 13);
    // Euler-Bernoulli cantilever under a transverse tip force, with no axial load.
    expect(tip.uz / (-10 * 12 ** 3 / (3 * 200e6 * 1000 * 1e-4))).toBeCloseTo(1, 6);
  });

  it.each([
    { job: 'pdelta3d', id: 2100, fixture: 'issue-2100-pdelta', iterations: 31 },
    { job: 'certify_pdelta_3d', id: 2101, fixture: 'issue-2100-pdelta', iterations: 31 },
    { job: 'certify_pdelta_2d', id: 2102, fixture: 'reaction-recovery-2d', iterations: 0 },
  ])('#2100 forwards the P-Delta equilibrium refusal from $job', async ({ job, id, fixture, iterations }) => {
    const path = new URL(`../../../../../engine/tests/fixtures/${fixture}.json`, import.meta.url);
    const input = JSON.parse(readFileSync(path, 'utf8'));
    if (job === 'certify_pdelta_2d') input.loads[0].data.fx = -3;
    const tolerance = 1e-8;
    await dispatch(job === 'pdelta3d'
      ? { type: job, id, input, maxIter: iterations, tol: tolerance }
      : { type: 'certify', id, name: job, input: [JSON.stringify(input), iterations, tolerance] });
    const reply = posted.find(m => m.type === 'result' && m.id === id);
    expect(reply?.result).toBeUndefined();
    expect(reply?.error).toBeDefined();
    const refusal = JSON.parse(reply!.error!);
    expect(refusal.structuredDiagnostics[0]).toMatchObject({
      code: 'result_quantity_unavailable',
      severity: 'error',
      phase: 'equilibrium',
      threshold: tolerance,
    });
    expect(refusal.structuredDiagnostics[0].value).toBeGreaterThan(tolerance);
    expect(refusal.message).toContain('physical free-DOF residual');
  });

  it('#2292 the P-Delta worker refuses non-finite scalar options', async () => {
    for (const [id, tol] of [NaN, Infinity, -Infinity].entries()) {
      await dispatch({ type: 'pdelta3d', id: 2292 + id, input: cantileverWire(), maxIter: 20, tol });
      const reply = posted.find(m => m.id === 2292 + id);
      expect.soft(reply?.result).toBeUndefined();
      expect.soft(reply?.error).toMatch(/Non-finite number .* at .*tolerance/);
    }
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

  /** A 4 × 4 MITC4 plate, simply supported, under pressure. */
  function plateWire(): Record<string, any> {
    const n = 4, nodes: Record<string, any> = {}, quads: Record<string, any> = {}, supports: Record<string, any> = {}, loads: any[] = [];
    const id = (i: number, j: number) => i * (n + 1) + j + 1;
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      nodes[id(i, j)] = { id: id(i, j), x: i / n, y: j / n, z: 0 };
      if (i === 0 || j === 0 || i === n || j === n) {
        const pin = i === 0 && j === 0;
        supports[id(i, j)] = { nodeId: id(i, j), rx: pin, ry: pin || (i === n && j === 0), rz: true, rrx: false, rry: false, rrz: false };
      }
    }
    let q = 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      quads[q] = { id: q, nodes: [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)], materialId: 1, thickness: 0.1 };
      loads.push({ type: 'quadPressure', data: { elementId: q, pressure: -10 } });
      q++;
    }
    return { nodes, materials: { 1: { id: 1, e: 30000, nu: 0.2 } }, sections: {}, elements: {}, supports, loads,
      plates: {}, quads, curvedShells: {}, constraints: [], connectors: {}, leftHand: false };
  }

  it('runs the discretization estimate and the convergence study in the worker', async () => {
    await dispatch({ type: 'certify', id: 50, name: 'estimate_discretization_3d', input: [plateWire()] });
    const est = posted.find(m => m.type === 'result' && m.id === 50)!;
    expect(est.error).toBeUndefined();
    expect(est.result.certified).toBe(false);
    expect(est.result.relativeError).toBeGreaterThan(0);

    await dispatch({ type: 'certify', id: 51, name: 'convergence_study_3d', input: [plateWire(), null] });
    const study = posted.find(m => m.type === 'result' && m.id === 51)!;
    expect(study.error).toBeUndefined();
    expect(study.result.levels).toHaveLength(3);
  }, 60000);

  it('dispatches every export of the main thread registry (none refused as unavailable)', async () => {
    const { CERTIFY_EXPORT_NAMES } = await import('../wasm-solver');
    let id = 100;
    for (const name of CERTIFY_EXPORT_NAMES) {
      // Arguments are deliberately empty: only whether the worker will call the export matters.
      await dispatch({ type: 'certify', id, name, input: [] });
      const r = posted.find(m => m.type === 'result' && m.id === id)!;
      expect(r.error ?? '', name).not.toMatch(/not available/);
      id++;
    }
  });
});
