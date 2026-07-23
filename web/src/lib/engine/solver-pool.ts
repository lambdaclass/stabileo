/**
 * solver-pool.ts — Worker pool for parallel 3D solving.
 *
 * Pre-initializes a pool of Web Workers, each with its own WASM instance.
 * Distributes solve_3d calls across workers for parallel execution.
 */

import { getWasmBytes } from './wasm-solver';

interface PendingSolve {
  resolve: (json: string) => void;
  reject: (err: Error) => void;
}

interface PoolWorker {
  worker: Worker;
  ready: boolean;
  pending: Map<number, PendingSolve>;
}

let pool: PoolWorker[] = [];
let initPromise: Promise<void> | null = null;
let nextId = 0;

/** Maximum number of workers to create */
const DEFAULT_WORKER_COUNT = 4;
const MAX_WORKERS = Math.min(
  typeof navigator !== 'undefined'
    ? (navigator.hardwareConcurrency ?? DEFAULT_WORKER_COUNT)
    : DEFAULT_WORKER_COUNT,
  8,
);

/** Create a single worker and wait for it to become ready. */
function createWorker(wasmModule: WebAssembly.Module): Promise<PoolWorker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./solver-worker.ts', import.meta.url),
      { type: 'module' },
    );

    const pw: PoolWorker = { worker, ready: false, pending: new Map() };

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        pw.ready = true;
        resolve(pw);
        return;
      }
      if (msg.type === 'error') {
        reject(new Error(msg.message));
        return;
      }
      if (msg.type === 'result') {
        const p = pw.pending.get(msg.id);
        if (p) {
          pw.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error));
          else p.resolve(msg.resultJson);
        }
      }
    };

    worker.onerror = (err) => {
      reject(new Error(`Worker error: ${err.message}`));
    };

    // Compiled module is structured-cloneable: no byte copy, no per-worker compile
    worker.postMessage({ type: 'init', wasmModule });
  });
}

/** Initialize the worker pool. Idempotent — safe to call multiple times. */
export async function initPool(numWorkers?: number): Promise<void> {
  if (pool.length > 0) return;
  if (initPromise) return initPromise;

  const count = numWorkers ?? MAX_WORKERS;

  initPromise = (async () => {
    // Compile once on the main thread (bytes shared with wasm-solver's init,
    // so a single fetch); workers instantiate clones of the compiled module.
    const wasmModule = await WebAssembly.compile(await getWasmBytes());
    const workers = await Promise.all(
      Array.from({ length: count }, () => createWorker(wasmModule)),
    );
    pool = workers;
  })();

  return initPromise;
}

/** Check if the pool is initialized and ready. */
export function isPoolReady(): boolean {
  return pool.length > 0 && pool.every(w => w.ready);
}

/**
 * Solve multiple 3D cases in parallel across the worker pool.
 *
 * @param cases Array of { id, json } where json is the serialized SolverInput3D
 * @returns Map from id to parsed result JSON string
 */
export async function solveParallel(
  cases: Array<{ id: number; json: string }>,
): Promise<Map<number, string>> {
  if (pool.length === 0) {
    throw new Error('Worker pool not initialized. Call initPool() first.');
  }

  const results = new Map<number, string>();

  // Distribute cases round-robin across workers
  const promises: Promise<void>[] = [];

  for (let i = 0; i < cases.length; i++) {
    const workerIdx = i % pool.length;
    const pw = pool[workerIdx];
    const { id, json } = cases[i];
    const msgId = nextId++;

    const promise = new Promise<void>((resolve, reject) => {
      pw.pending.set(msgId, {
        resolve: (resultJson: string) => {
          results.set(id, resultJson);
          resolve();
        },
        reject: (err: Error) => reject(err),
      });
      pw.worker.postMessage({ type: 'solve3d', id: msgId, json });
    });

    promises.push(promise);
  }

  await Promise.all(promises);
  return results;
}

/** Terminate all workers and clean up the pool. */
export function destroyPool(): void {
  for (const pw of pool) {
    pw.worker.terminate();
  }
  pool = [];
  initPromise = null;
}
