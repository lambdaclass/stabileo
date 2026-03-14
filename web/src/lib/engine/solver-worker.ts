/**
 * Web Worker for parallel 3D structural solving.
 * Each worker loads its own WASM instance and solves independently.
 *
 * Messages:
 *   { type: 'init', wasmBytes: ArrayBuffer }  → initialize WASM module
 *   { type: 'solve3d', id: number, json: string } → solve and return results
 */

let initSync: ((moduleOrBytes: any) => void) | null = null;
let solve_3d: ((json: string) => string) | null = null;
let ready = false;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      // Dynamic import so the build doesn't fail when WASM files are absent
      const wasm = await import(/* @vite-ignore */ '../wasm/dedaliano_engine.js');
      initSync = wasm.initSync;
      solve_3d = wasm.solve_3d;

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
    if (!ready || !solve_3d) {
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
