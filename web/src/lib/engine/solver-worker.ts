/**
 * Web Worker for parallel 3D structural solving.
 * Each worker loads its own WASM instance and solves independently.
 *
 * Messages:
 *   { type: 'init', wasmBytes: ArrayBuffer }  → initialize WASM module
 *   { type: 'solve3d', id: number, json: string } → solve and return results
 */

import { initSync, solve_3d } from '../wasm/dedaliano_engine.js';

let ready = false;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      // Compile WASM module from bytes and initialize synchronously
      const module = new WebAssembly.Module(msg.wasmBytes);
      initSync(module);
      ready = true;
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', message: `Worker init failed: ${err.message}` });
    }
    return;
  }

  if (msg.type === 'solve3d') {
    if (!ready) {
      self.postMessage({ type: 'result', id: msg.id, error: 'Worker not initialized' });
      return;
    }
    try {
      const resultJson = solve_3d(msg.json);
      self.postMessage({ type: 'result', id: msg.id, resultJson });
    } catch (err: any) {
      self.postMessage({ type: 'result', id: msg.id, error: err.message });
    }
    return;
  }
};
