// Deliberately outside the application import graph. Run via bench:collision-worker.
import { modelStore, resultsStore, uiStore } from '../../src/lib/store';
import { designRunStore } from '../../src/lib/store/design-run.svelte';
import { verificationStore } from '../../src/lib/store/verification.svelte';
import { initSolver } from '../../src/lib/engine/wasm-solver';
import '../../src/lib/engine/design/adapters/cirsoc201-adapter';
import '../../src/lib/engine/design/adapters/unsupported-adapter';
import { runCollisionBatch, type CollisionJob, type CollisionRequest, type CollisionResponse } from './protocol';

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function measure<T>(operation: () => T | Promise<T>) {
  let last = performance.now(), maxTimerGapMs = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    maxTimerGapMs = Math.max(maxTimerGapMs, now - last);
    last = now;
  }, 10);
  try {
    await pause(30);
    const start = performance.now();
    const value = await operation();
    const elapsedMs = performance.now() - start;
    await pause(30); // Let the delayed heartbeat record a synchronous stall too.
    return { value, elapsedMs, maxTimerGapMs };
  } finally { clearInterval(timer); }
}

export async function benchmark() {
  await initSolver();
  uiStore.analysisMode = 'pro';
  await modelStore.loadExample('pro-edificio-7p');
  const solved = await modelStore.solveCombinations3DParallel(true, false, true);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  resultsStore.setCombinationResults3D(solved.perCase, solved.perCombo, solved.envelope);
  const report = designRunStore.designFamilies(['column', 'beam', 'slab', 'wall']);
  if (!report.ok) throw new Error('Design failed');

  // Materialize plain data once, outside measurements. Request timing below includes
  // the browser's structured clone of these objects, not conversion from Svelte proxies.
  const memberKinds = [...verificationStore.contexts].map(([id, ctx]) => [id, ctx.elementType]);
  const jobs: CollisionJob[] = JSON.parse(JSON.stringify(
    (modelStore.model.detailing?.assemblies ?? []).filter(a => a.bars.length > 0).map(a => ({
      bars: a.bars,
      classification: { edition: '2025', maxAggregateSizeMm: 19, memberKinds },
    })),
  ));
  const workerStart = performance.now();
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('Worker startup timed out')); }, 30_000);
      const cleanup = () => {
        clearTimeout(timer); worker.removeEventListener('message', message); worker.removeEventListener('error', error);
      };
      const error = (event: ErrorEvent) => { cleanup(); reject(new Error(event.message)); };
      const message = (event: MessageEvent<CollisionResponse>) => {
        if (event.data.type === 'ready') { cleanup(); resolve(); }
      };
      worker.addEventListener('message', message); worker.addEventListener('error', error);
    });
    const startupMs = performance.now() - workerStart;
    let id = 0;
    const request = (operation: CollisionRequest['operation']) => new Promise<{
      results: ReturnType<typeof runCollisionBatch>; computeMs: number; postMessageMs: number;
    }>((resolve, reject) => {
      const requestId = ++id;
      let postMessageMs = 0;
      const cleanup = () => {
        clearTimeout(timer); worker.removeEventListener('message', message); worker.removeEventListener('error', error);
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Worker request timed out')); }, 30_000);
      const error = (event: ErrorEvent) => { cleanup(); reject(new Error(event.message)); };
      const message = (event: MessageEvent<CollisionResponse>) => {
        const response = event.data;
        if (response.type === 'ready' || response.id !== requestId) return;
        cleanup();
        if (response.type === 'error') reject(new Error(response.error));
        else resolve({ results: response.results, computeMs: response.computeMs, postMessageMs });
      };
      worker.addEventListener('message', message); worker.addEventListener('error', error);
      const start = performance.now();
      try {
        worker.postMessage({ id: requestId, operation, jobs } satisfies CollisionRequest);
        postMessageMs = performance.now() - start;
      } catch (error) { cleanup(); reject(error); }
    });

    // Warm both execution contexts; correctness includes every collision-result field.
    const expected = JSON.stringify(runCollisionBatch(jobs));
    const first = await request('collide');
    if (JSON.stringify(first.results) !== expected) throw new Error('Worker output differs from main thread');
    const receive = await measure(() => request('receiveOnly'));
    const runs = [];
    for (let run = 0; run < 3; run++) {
      const main = () => measure(() => runCollisionBatch(jobs));
      const remote = () => measure(() => request('collide'));
      let local: Awaited<ReturnType<typeof main>>;
      let offThread: Awaited<ReturnType<typeof remote>>;
      if (run % 2 === 0) { local = await main(); offThread = await remote(); }
      else { offThread = await remote(); local = await main(); }
      if (JSON.stringify(local.value) !== expected || JSON.stringify(offThread.value.results) !== expected) {
        throw new Error(`Output mismatch on run ${run + 1}`);
      }
      runs.push({
        run: run + 1, mainMs: local.elapsedMs, mainMaxTimerGapMs: local.maxTimerGapMs,
        workerRoundTripMs: offThread.elapsedMs, workerComputeMs: offThread.value.computeMs,
        postMessageMs: offThread.value.postMessageMs, workerMaxTimerGapMs: offThread.maxTimerGapMs,
      });
    }
    return {
      jobs: jobs.length, bars: jobs.reduce((n, job) => n + job.bars.length, 0),
      startupMs, receiveOnlyMs: receive.elapsedMs, receiveOnlyPostMs: receive.value.postMessageMs,
      equivalent: true, runs,
    };
  } finally { worker.terminate(); }
}
