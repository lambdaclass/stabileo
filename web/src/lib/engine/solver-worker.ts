/**
 * Web Worker for structural solving (2D and 3D).
 * Each worker loads its own WASM instance and solves independently.
 *
 * Messages:
 *   { type: 'init', wasmModule: WebAssembly.Module }  → initialize WASM (pre-compiled module, structured-cloned)
 *   { type: 'solve',   id: number, input: object }    → 2D solve (SolverInput wire object)
 *   { type: 'solve3d', id: number, input: object }    → 3D solve (SolverInput3D wire object)
 *   { type: 'pdelta3d', id, input, maxIter, tol }      → 3D P-Delta, one load set
 * Inputs/outputs are plain JS objects — structured-cloned both ways, no JSON text.
 */

import { assertFiniteWire } from './wasm-solver';
import { finishSolve3D, finishPDelta3D } from './solve-finish';

let solve_2d: ((input: any) => any) | null = null;
let solve_3d: ((input: any) => any) | null = null;
let solve_pdelta_3d: ((json: string, maxIter: number, tol: number) => string) | null = null;
let ready = false;

function handleSolve(msg: any, solveFn: ((input: any) => any) | null): void {
  if (!ready || !solveFn) {
    self.postMessage({ type: 'result', id: msg.id, error: 'Worker not initialized' });
    return;
  }
  try {
    // The finiteness guard preserves the old JSON-boundary semantics (NaN/Inf rejected).
    assertFiniteWire(msg.input);
    const raw = solveFn(msg.input);
    /* Finished as the main thread finishes it (`solve-finish.ts`). */
    const result = msg.type === 'solve3d' ? finishSolve3D(raw, msg.input) : raw;
    self.postMessage({ type: 'result', id: msg.id, result });
  } catch (err: any) {
    // Engine errors cross the boundary as plain strings (JsValue::from_str),
    // which have no .message — fall back to String() so they are not lost.
    self.postMessage({ type: 'result', id: msg.id, error: err?.message ?? String(err) });
  }
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      // Dynamic import so the build doesn't fail when WASM files are absent
      const wasm = await import(/* @vite-ignore */ '../wasm/dedaliano_engine.js');
      solve_2d = wasm.solve_2d;
      solve_3d = wasm.solve_3d;
      solve_pdelta_3d = (wasm as { solve_pdelta_3d?: typeof solve_pdelta_3d }).solve_pdelta_3d ?? null;

      wasm.initSync({ module: msg.wasmModule });
      ready = true;
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', message: `Worker init failed: ${err.message}` });
    }
    return;
  }

  if (msg.type === 'solve') {
    handleSolve(msg, solve_2d);
    return;
  }

  if (msg.type === 'solve3d') {
    handleSolve(msg, solve_3d);
    return;
  }

  if (msg.type === 'pdelta3d') {
    if (!ready || !solve_pdelta_3d) {
      self.postMessage({ type: 'result', id: msg.id, error: 'Worker P-Delta not available' });
      return;
    }
    try {
      assertFiniteWire(msg.input);
      // The P-Delta export takes JSON text, as its main-thread wrapper sends it.
      const result = JSON.parse(solve_pdelta_3d(JSON.stringify(msg.input), msg.maxIter, msg.tol));
      finishPDelta3D(result, msg.input);
      self.postMessage({ type: 'result', id: msg.id, result });
    } catch (err: any) {
      self.postMessage({ type: 'result', id: msg.id, error: err?.message ?? String(err) });
    }
    return;
  }
};
