/**
 * Web Worker for structural solving (2D and 3D).
 * Each worker loads its own WASM instance and solves independently.
 *
 * Messages:
 *   { type: 'init', wasmModule: WebAssembly.Module }  → initialize WASM (pre-compiled module, structured-cloned)
 *   { type: 'solve',   id: number, input: object }    → 2D solve (SolverInput wire object)
 *   { type: 'solve3d', id: number, input: object }    → 3D solve (SolverInput3D wire object)
 * Inputs/outputs are plain JS objects — structured-cloned both ways, no JSON text.
 */

import { assertFiniteWire } from './wasm-solver';
import { stripStabilisedReactions } from './orphan-rotations-3d';

let solve_2d: ((input: any) => any) | null = null;
let solve_3d: ((input: any) => any) | null = null;
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
    /* 3D inputs may carry vanishing springs on orphan rotations; their zero reactions stay here. */
    const result = msg.type === 'solve3d' ? stripStabilisedReactions(raw, msg.input) : raw;
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
};
