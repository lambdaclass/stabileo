// Deliberately outside the application import graph. Run via bench:collision-worker.
import { modelStore, resultsStore, uiStore } from '../../src/lib/store';
import { designRunStore } from '../../src/lib/store/design-run.svelte';
import { verificationStore } from '../../src/lib/store/verification.svelte';
import { initSolver } from '../../src/lib/engine/wasm-solver';
import '../../src/lib/engine/design/adapters/cirsoc201-adapter';
import '../../src/lib/engine/design/adapters/unsupported-adapter';
import { runCollisionBatch, type CollisionJob, type CollisionRequest, type CollisionResponse } from './protocol';
import { packCollisionBatch, collisionTransferList } from './packed';
import { CollisionWorkerPool, type PoolResult } from './pool';

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
  let pool: CollisionWorkerPool | undefined;
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
    const request = (operation: CollisionRequest['operation'], transport: 'objects' | 'packed' = 'objects') => new Promise<{
      results: ReturnType<typeof runCollisionBatch>; computeMs: number; postMessageMs: number; packMs: number; decodeMs: number;
    }>((resolve, reject) => {
      const requestId = ++id;
      let postMessageMs = 0, packMs = 0;
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
        else resolve({ results: response.results, computeMs: response.computeMs, postMessageMs, packMs, decodeMs: response.decodeMs });
      };
      worker.addEventListener('message', message); worker.addEventListener('error', error);
      try {
        let payload: CollisionRequest;
        let transfer: ArrayBuffer[] = [];
        if (transport === 'packed') {
          const start = performance.now();
          const packed = packCollisionBatch(jobs);
          transfer = collisionTransferList(packed);
          payload = { id: requestId, operation, packed };
          packMs = performance.now() - start;
        } else payload = { id: requestId, operation, jobs };
        const start = performance.now();
        worker.postMessage(payload, transfer);
        postMessageMs = performance.now() - start;
      } catch (error) { cleanup(); reject(error); }
    });

    // Warm both execution contexts; correctness includes every collision-result field.
    const expected = JSON.stringify(runCollisionBatch(jobs));
    const first = await request('collide');
    if (JSON.stringify(first.results) !== expected) throw new Error('Worker output differs from main thread');
    const firstPacked = await request('collide', 'packed');
    if (JSON.stringify(firstPacked.results) !== expected) throw new Error('Packed worker output differs from main thread');
    const receive = await measure(() => request('receiveOnly'));
    const receivePacked = await measure(() => request('receiveOnly', 'packed'));
    const poolStart = performance.now();
    pool = await CollisionWorkerPool.create(4);
    const poolStartupMs = performance.now() - poolStart;
    const firstPool = await pool.run(jobs, { cache: true });
    if (JSON.stringify(firstPool.results) !== expected || firstPool.cacheHits !== 0) {
      throw new Error('Pool warmup differs from main thread');
    }
    const runs = [];
    for (let run = 0; run < 5; run++) {
      type Measured = Awaited<ReturnType<typeof measure<PoolResult>>>;
      const measured: Record<string, Measured> = {};
      const modes = [
        { name: 'main', operation: () => ({ results: runCollisionBatch(jobs), computeMs: 0,
          decodeMs: 0, packMs: 0, postMessageMs: 0, cacheHits: 0 }) },
        { name: 'objects', operation: async () => ({ ...await request('collide'), cacheHits: 0 }) },
        { name: 'packed', operation: async () => ({ ...await request('collide', 'packed'), cacheHits: 0 }) },
        { name: 'pool', operation: () => pool!.run(jobs) },
        { name: 'cached', operation: () => pool!.run(jobs, { cache: true }) },
      ];
      // Each mode occupies every ordering position once; packing stays inside measure.
      for (let i = 0; i < modes.length; i++) {
        const mode = modes[(i + run) % modes.length];
        measured[mode.name] = await measure(mode.operation);
        if (JSON.stringify(measured[mode.name].value.results) !== expected) {
          throw new Error(`${mode.name} output mismatch on run ${run + 1}`);
        }
      }
      const { main: local, objects: offThread, packed, pool: parallel, cached } = measured;
      if (cached.value.cacheHits !== jobs.length) throw new Error('Expected unchanged assemblies to hit cache');
      runs.push({
        run: run + 1, mainMs: local.elapsedMs, mainMaxTimerGapMs: local.maxTimerGapMs,
        workerRoundTripMs: offThread.elapsedMs, workerComputeMs: offThread.value.computeMs,
        postMessageMs: offThread.value.postMessageMs, workerMaxTimerGapMs: offThread.maxTimerGapMs,
        packedRoundTripMs: packed.elapsedMs, packedComputeMs: packed.value.computeMs,
        packedPackMs: packed.value.packMs, packedDecodeMs: packed.value.decodeMs,
        packedPostMessageMs: packed.value.postMessageMs, packedMaxTimerGapMs: packed.maxTimerGapMs,
        poolRoundTripMs: parallel.elapsedMs, poolComputeSumMs: parallel.value.computeMs,
        poolPackMs: parallel.value.packMs, poolPostMessageMs: parallel.value.postMessageMs,
        poolMaxTimerGapMs: parallel.maxTimerGapMs,
        cachedRoundTripMs: cached.elapsedMs, cacheHits: cached.value.cacheHits,
        cachedMaxTimerGapMs: cached.maxTimerGapMs,
      });
    }
    // A geometry edit must recompute that assembly while reusing the others.
    const changed = structuredClone(jobs);
    changed[0].bars[0].segments[0].start.z += 0.01;
    const expectedChanged = JSON.stringify(runCollisionBatch(changed));
    const changedRun = await measure(() => pool!.run(changed, { cache: true }));
    if (JSON.stringify(changedRun.value.results) !== expectedChanged
      || changedRun.value.cacheHits !== jobs.length - 1) throw new Error('Edited assembly cache mismatch');

    return {
      jobs: jobs.length, bars: jobs.reduce((n, job) => n + job.bars.length, 0),
      poolSize: 4, poolStartupMs,
      editedRoundTripMs: changedRun.elapsedMs, editedCacheHits: changedRun.value.cacheHits,
      editedMaxTimerGapMs: changedRun.maxTimerGapMs,
      startupMs, receiveOnlyMs: receive.elapsedMs, receiveOnlyPostMs: receive.value.postMessageMs,
      packedReceiveOnlyMs: receivePacked.elapsedMs, packedReceiveOnlyPackMs: receivePacked.value.packMs,
      packedReceiveOnlyPostMs: receivePacked.value.postMessageMs,
      packedBufferBytes: collisionTransferList(packCollisionBatch(jobs)).reduce((n, buffer) => n + buffer.byteLength, 0),
      equivalent: true, runs,
    };
  } finally { pool?.close(); worker.terminate(); }
}
