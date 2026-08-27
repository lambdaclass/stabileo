/**
 * solver-pool.ts — Worker pool for off-main-thread structural solving.
 *
 * Pre-initializes a pool of Web Workers, each with its own WASM instance.
 * Serves both single solves (2D and 3D) and parallel 3D case-solving.
 * Inputs/outputs travel as plain objects (structured clone), never JSON text.
 *
 * When Workers are unavailable (e.g. Node/vitest), `solve2DInWorker` /
 * `solve3DInWorker` throw `PoolUnavailableError` so callers can fall back to
 * the synchronous main-thread solver.
 */

import { getWasmBytes } from './wasm-solver';
import { findUncloneablePath } from '../utils/plain-deep-copy';

/** Thrown when the pool cannot be used (no Worker support, init failure). */
export class PoolUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PoolUnavailableError';
  }
}

/** Minimal structural type so tests can inject an in-process fake worker. */
export interface WorkerLike {
  postMessage(msg: any): void;
  terminate(): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: any) => void) | null;
}

interface PendingSolve {
  resolve: (result: any) => void;
  reject: (err: Error) => void;
}

interface PoolWorker {
  worker: WorkerLike;
  ready: boolean;
  pending: Map<number, PendingSolve>;
  /**
   * Whether this worker has completed at least one job.
   *
   * The difference between a worker that has been INSTANTIATED and one that has EXECUTED, which
   * is the distinction the crash below turns on.
   */
  warmed: boolean;
}

let pool: PoolWorker[] = [];
let initPromise: Promise<void> | null = null;
let nextId = 0;

/** Test seam: inject a factory producing in-process fake workers (null = real Workers). */
let workerFactory: (() => WorkerLike) | null = null;
export function setWorkerFactoryForTests(factory: (() => WorkerLike) | null): void {
  workerFactory = factory;
  destroyPool();
}

/** Maximum number of workers to create */
/*
 * ── Why the first job on each worker is run on its own ──────────────
 *
 * Several freshly-instantiated workers beginning a large solve **in the same instant** takes the
 * browser process down. Not an exception and not a rejected promise: the page dies. Chromium
 * aborts with `signal 4, ILL_ILLTRP` — the illegal instruction a failed internal CHECK emits —
 * and because the page has stopped existing, every promise pending in it never settles. The
 * symptom is a solve that "hangs" forever while the solve itself takes 60 ms.
 *
 * ── What was measured ───────────────────────────────────────────────
 *
 * Sessions of load-the-shed-and-solve (633 elements, 3 load cases, 3 workers), counting
 * `page.on('crash')`. One variable at a time, 40 sessions per arm unless noted:
 *
 *   · baseline, simultaneous dispatch ......................... 7.5-10 %
 *   · worker pool disabled entirely (main thread) ............. 0 / 40
 *   · one worker (the three cases run one after another) ...... 0 / 40
 *   · small model, three workers, same dispatch ............... 0 / 40
 *   · the shed loaded but never solved ........................ 0 / 40
 *   · workers created one at a time, then dispatched together .. 7.5 %
 *   · one compiled module per worker instead of a shared one .. 12.5 %
 *   · `--js-flags=--no-wasm-tier-up` .......................... 15 %
 *   · full Chromium channel instead of the headless shell ..... 7.5 %
 *   · Chromium 151 instead of 148 ............................. 22.5 %
 *   · **real Google Chrome** .................................. 17.5 %
 *
 * So it is not the GL backend, not memory (peak RSS differs by 63 MB between one worker and
 * three), not module sharing, not the WASM tier-up, and not the browser build — the newer one is
 * worse. It reproduces in the browser users actually run, which is why this is mitigated in the
 * product and not in the test harness.
 *
 * ── Why only the FIRST job on each worker ───────────────────────────
 *
 * 60 sessions solving three times each — 180 solves — produced 7 crashes, and **all seven were on
 * the first solve**. None of the ~113 solves with already-executed workers crashed. The trigger
 * is one worker's first execution coinciding with another's, so once a worker has completed a job
 * it is `warmed` and the pool goes back to dispatching everything at once.
 *
 * The cost is bounded and paid once per session: the first solve runs up to `workers` cases one
 * after another. On the shed that is about 60 ms against 58 ms for the parallel version.
 *
 * ── What this is, and what it is not ────────────────────────────────
 *
 * It removes the condition that was measured to trigger the crash. It does not fix the crash: the
 * fault is below this file, in the WASM execution path or in V8, and this branch may not touch
 * the solver, Rust, Cargo or the WASM sources. Treat it as a mitigation with a residual risk, not
 * as a repair.
 */
const DEFAULT_WORKER_COUNT = 4;
const MAX_WORKERS = Math.min(
  typeof navigator !== 'undefined'
    ? (navigator.hardwareConcurrency ?? DEFAULT_WORKER_COUNT)
    : DEFAULT_WORKER_COUNT,
  8,
);

/** Create a single worker and wait for it to become ready. */
function createWorker(wasmModule: WebAssembly.Module | null): Promise<PoolWorker> {
  return new Promise((resolve, reject) => {
    const worker: WorkerLike = workerFactory
      ? workerFactory()
      : new Worker(
        new URL('./solver-worker.ts', import.meta.url),
        { type: 'module' },
      );

    const pw: PoolWorker = { worker, ready: false, warmed: false, pending: new Map() };

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
          // It has now executed, not merely been instantiated. See COLD_START_STAGGER_MS.
          pw.warmed = true;
          if (msg.error) p.reject(new Error(msg.error));
          else p.resolve(msg.result);
        }
      }
    };

    worker.onerror = (err) => {
      reject(new Error(`Worker error: ${err.message}`));
    };

    // Compiled module is structured-cloneable: no byte copy, no per-worker compile.
    // (Fake test workers ignore it and share the test's in-process WASM instance.)
    worker.postMessage({ type: 'init', wasmModule });
  });
}

/** Initialize the worker pool. Idempotent — safe to call multiple times. */
export async function initPool(numWorkers?: number): Promise<void> {
  if (pool.length > 0) return;
  if (initPromise) return initPromise;

  const count = numWorkers ?? MAX_WORKERS;

  initPromise = (async () => {
    try {
      // Compile once on the main thread (bytes shared with wasm-solver's init,
      // so a single fetch); workers instantiate clones of the compiled module.
      // (Fake test workers skip the compile — they share the test's WASM instance.)
      const wasmModule = workerFactory ? null : await WebAssembly.compile(await getWasmBytes());
      const settled = await Promise.allSettled(
        Array.from({ length: count }, () => createWorker(wasmModule)),
      );
      const failed = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
      if (failed) {
        // Terminate the workers that DID start (Promise.all would leak them),
        // then rethrow into the reset path below.
        for (const s of settled) {
          if (s.status === 'fulfilled') s.value.worker.terminate();
        }
        throw failed.reason;
      }
      pool = settled.map(s => (s as PromiseFulfilledResult<PoolWorker>).value);
    } catch (err) {
      // Don't poison the pool: a rejected initPromise would make every later
      // call re-await the same failure until reload. Reset so the next call
      // retries.
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

/** Check if the pool is initialized and ready. */
export function isPoolReady(): boolean {
  return pool.length > 0 && pool.every(w => w.ready);
}

function workersAvailable(): boolean {
  return workerFactory !== null || (typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined');
}

/** Initialize the pool or throw PoolUnavailableError. */
async function ensurePool(): Promise<void> {
  if (!workersAvailable()) {
    throw new PoolUnavailableError('Web Workers are not available in this environment');
  }
  try {
    await initPool();
  } catch (err: any) {
    throw new PoolUnavailableError(err?.message ?? 'Worker pool initialization failed');
  }
}

/**
 * Route one solve job to the least-busy worker.
 *
 * A `DataCloneError` here is a defect in the payload, not a runtime condition, and the
 * browser's own message names only the offending VALUE ("[object Array] could not be
 * cloned") on a payload with hundreds of arrays in it. It is re-thrown naming the FIELD,
 * because that is the difference between a five-minute fix and a five-hour bisect — and
 * because the caller's fallback swallows the throw, so this string may be the only trace
 * the failure ever leaves.
 */
function runJob(type: 'solve' | 'solve3d', input: any, target?: PoolWorker): Promise<any> {
  const pw = target ?? pool.reduce((a, b) => (a.pending.size <= b.pending.size ? a : b));
  const msgId = nextId++;
  return new Promise((resolve, reject) => {
    pw.pending.set(msgId, { resolve, reject });
    try {
      pw.worker.postMessage({ type, id: msgId, input });
    } catch (err: any) {
      pw.pending.delete(msgId);
      if (err?.name === 'DataCloneError') {
        const path = findUncloneablePath(input) ?? 'input';
        reject(new Error(
          `Solver payload is not structured-cloneable at ${path} — ${err.message}`,
        ));
        return;
      }
      reject(err);
    }
  });
}

/**
 * Solve a single 2D case in a worker.
 * @param input Plain-object wire form of SolverInput (see input2DToWireObject)
 * @throws PoolUnavailableError when Workers are unavailable — caller should fall back to the sync solver
 */
export async function solve2DInWorker(input: any): Promise<any> {
  await ensurePool();
  return runJob('solve', input);
}

/**
 * Solve a single 3D case in a worker.
 * @param input Plain-object wire form of SolverInput3D (see input3DToWireObject)
 * @throws PoolUnavailableError when Workers are unavailable — caller should fall back to the sync solver
 */
export async function solve3DInWorker(input: any): Promise<any> {
  await ensurePool();
  return runJob('solve3d', input);
}

/**
 * Solve multiple 3D cases in parallel across the worker pool.
 *
 * @param cases Array of { id, input } where input is the plain-object wire form of SolverInput3D
 * @returns Map from id to the solved result object (structured-cloned from the worker)
 */
export async function solveParallel(
  cases: Array<{ id: number; input: any }>,
): Promise<Map<number, any>> {
  await ensurePool();

  const results = new Map<number, any>();
  const queue = [...cases];

  /*
   * The cold pass: one job at a time, each on a DIFFERENT worker that has not executed yet.
   *
   * Both halves are load-bearing. Awaiting is what guarantees no two first executions overlap;
   * naming the target worker is what makes each pass actually warm a new one. An earlier version
   * separated the dispatches with a timer and let `runJob` choose, and because a job finished
   * before the next was released, every one of them went to worker 0 — the pool never warmed, so
   * every solve for the rest of the session paid the delay and none of them ran in parallel. The
   * regression test in `solver-pool-cold-start.test.ts` is what caught that.
   */
  /*
   * Only the workers this dispatch can actually reach.
   *
   * The pool may be larger than the number of cases — `solve2DInWorker`'s `ensurePool()` sizes it
   * from `hardwareConcurrency` — and `Promise.all` over N cases never touches more than N of
   * them. Looking at the whole pool meant a pool of eight with three cases never finished
   * warming, so every solve for the rest of the session paid the serial pass and none of them
   * ran in parallel. The regression test caught that too.
   */
  const reachable = pool.slice(0, cases.length);
  while (queue.length > 0) {
    const target = reachable.find((pw) => !pw.warmed);
    if (!target) break;
    const { id, input } = queue.shift()!;
    results.set(id, await runJob('solve3d', input, target));
  }

  // Everything left runs the way the pool exists to run it.
  await Promise.all(
    queue.map(({ id, input }) =>
      runJob('solve3d', input).then(result => { results.set(id, result); }),
    ),
  );
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
