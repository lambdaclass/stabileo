import { afterEach, expect, it, vi } from 'vitest';
import { CollisionWorkerPool } from '../../../../scripts/collision-worker/pool';
import { CollisionJobCache } from '../../../../scripts/collision-worker/cache';
import { unpackCollisionBatch } from '../../../../scripts/collision-worker/packed';
import { runCollisionBatch, type CollisionJob, type CollisionRequest, type CollisionResponse } from '../../../../scripts/collision-worker/protocol';
import { straightSegment } from '../../codes/cirsoc201/bar-geometry';

function job(id = 'a'): CollisionJob {
  return { bars: [0, 0.03].map((y, i) => ({
    id: `${id}:${i}`, diameterMm: 20, role: 'longitudinal', ownerElementIds: [1],
    segments: [straightSegment({ x: 0, y, z: 0 }, { x: 2, y, z: 0 })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 2, source: 'generated', locked: false, refs: [],
  })), classification: { edition: '2025', maxAggregateSizeMm: 19, memberKinds: [[1, 'column']] } };
}

afterEach(() => vi.useRealTimers());

it('reuses only identical complete inputs, independently for each assembly', () => {
  const cache = new CollisionJobCache();
  const a = job();
  expect(cache.run('a', a).hit).toBe(false);
  expect(cache.run('b', job('b')).hit).toBe(false);
  expect(cache.run('a', structuredClone(a))).toEqual({ hit: true, result: runCollisionBatch([a])[0] });
  const edits: Array<(j: CollisionJob) => void> = [
    j => { j.bars[0].segments[0].end.z = 0.1; },
    j => { j.bars[0].diameterMm = 25; },
    j => { j.bars[0].ownerElementIds = [2]; },
    j => { j.bars[0].role = 'transverse'; },
    j => { j.bars[0].layerId = 'other'; },
    j => { j.bars[0].enclosesBarIds = [j.bars[1].id]; },
    j => { j.bars[0].restrainsBarIds = [j.bars[1].id]; },
    j => { j.bars[0].hookContactsBarIds = [j.bars[1].id]; },
    j => { j.bars[0].locked = true; },
    j => { j.classification!.maxAggregateSizeMm = 32; },
    j => { j.classification!.memberKinds = [[1, 'beam']]; },
    j => { j.tolerances = { placement: 0.01, requiredClear: 0.025, marginalBand: 0.005 }; },
    j => { j.bars.pop(); },
  ];
  for (const edit of edits) {
    cache.run('a', a);
    const changed = structuredClone(a);
    edit(changed);
    expect(cache.run('a', changed)).toEqual({ hit: false, result: runCollisionBatch([changed])[0] });
    expect(cache.run('b', job('b')).hit).toBe(true);
  }
});

it('owns snapshots and results, with no NaN/null or signed-zero key aliasing', () => {
  const cache = new CollisionJobCache();
  const original = job();
  const first = cache.run('a', original);
  first.result.conflicts.length = 0;
  expect(cache.run('a', original).result).toEqual(runCollisionBatch([original])[0]);
  original.bars[0].segments[0].start.z = -0;
  expect(cache.run('a', original).hit).toBe(false);
  original.bars[0].cuttingLength = NaN;
  expect(cache.run('a', original).hit).toBe(false);
  expect(cache.run('a', structuredClone(original)).hit).toBe(true);
  original.bars[0].cuttingLength = null as unknown as number;
  expect(cache.run('a', original).hit).toBe(false);
});

it('evicts least-recently-used entries and bypasses oversized inputs', () => {
  const cache = new CollisionJobCache(2, 4, 4);
  cache.run('a', job('a')); cache.run('b', job('b'));
  expect(cache.run('a', job('a')).hit).toBe(true);
  cache.run('c', job('c'));
  expect(cache.run('a', job('a')).hit).toBe(true);
  expect(cache.run('b', job('b')).hit).toBe(false);
  const oversized = job(); oversized.bars.push(...job('x').bars, ...job('y').bars);
  expect(cache.run('large', oversized).hit).toBe(false);
  expect(cache.run('large', oversized).hit).toBe(false);
  const segments = new CollisionJobCache(2, 10, 1);
  expect(segments.run('a', job()).hit).toBe(false);
  expect(segments.run('a', job()).hit).toBe(false);
});

class FakeWorker extends EventTarget {
  requests: CollisionRequest[] = [];
  terminated = false;
  constructor(private auto = true, ready = true) {
    super();
    if (ready) queueMicrotask(() => this.emit({ type: 'ready' }));
  }
  postMessage(request: CollisionRequest, transfer: Transferable[]) {
    const copy = structuredClone(request, { transfer });
    expect(transfer.every(b => (b as ArrayBuffer).byteLength === 0)).toBe(true);
    this.requests.push(copy);
    if (this.auto) queueMicrotask(() => this.reply(this.requests.length - 1));
  }
  emit(data: CollisionResponse) { this.dispatchEvent(new MessageEvent('message', { data })); }
  reply(index = 0) {
    const request = this.requests[index];
    const jobs = 'packed' in request ? unpackCollisionBatch(request.packed) : request.jobs;
    this.emit({ type: 'result', id: request.id, results: runCollisionBatch(jobs), computeMs: 1, decodeMs: 1, cacheHits: 0 });
  }
  terminate() { this.terminated = true; }
}

it('preserves assembly order despite out-of-order worker replies and leaves source buffers intact', async () => {
  const workers: FakeWorker[] = [];
  const pool = await CollisionWorkerPool.create(3, () => {
    const worker = new FakeWorker(false); workers.push(worker); return worker as unknown as Worker;
  });
  const jobs = Array.from({ length: 7 }, (_, i) => job(String(i)));
  const snapshot = structuredClone(jobs);
  const pending = pool.run(jobs, { cache: true });
  workers[2].reply(); workers[1].reply(); workers[0].reply();
  expect((await pending).results).toEqual(runCollisionBatch(jobs));
  expect(jobs).toEqual(snapshot);
  expect(workers.map(w => w.requests[0].cacheKeys)).toEqual([['0', '3', '6'], ['1', '4'], ['2', '5']]);
  expect((await pool.run([])).results).toEqual([]);
  pool.close();
  expect(workers.every(w => w.terminated)).toBe(true);
});

it('rejects overlapping work and aborts every pending request without publishing partial results', async () => {
  const workers: FakeWorker[] = [];
  const pool = await CollisionWorkerPool.create(2, () => {
    const worker = new FakeWorker(false); workers.push(worker); return worker as unknown as Worker;
  });
  const controller = new AbortController();
  const pending = pool.run([job('a'), job('b')], { signal: controller.signal });
  await expect(pool.run([job()])).rejects.toThrow('busy');
  workers[0].reply();
  controller.abort();
  await expect(pending).rejects.toThrow('aborted');
  expect(workers.every(w => w.terminated)).toBe(true);
  workers[1].reply(); // Late replies cannot resolve the aborted run.
  await expect(pool.run([job()])).rejects.toThrow('closed');
});

it('terminates siblings on worker errors and request timeouts', async () => {
  vi.useFakeTimers();
  const workers: FakeWorker[] = [];
  const pool = await CollisionWorkerPool.create(2, () => {
    const worker = new FakeWorker(false); workers.push(worker); return worker as unknown as Worker;
  }, 50);
  const assertion = expect(pool.run([job(), job('b')])).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(51);
  await assertion;
  expect(workers.every(w => w.terminated)).toBe(true);
  const failed = new FakeWorker(false);
  const second = await CollisionWorkerPool.create(1, () => failed as unknown as Worker);
  const pending = second.run([job()]);
  failed.dispatchEvent(Object.assign(new Event('error'), { message: 'worker crashed' }));
  await expect(pending).rejects.toThrow('worker crashed');
  expect(failed.terminated).toBe(true);
});

it('cleans up partial startup failures and rejects invalid pool sizes', async () => {
  const first = new FakeWorker(false, false);
  let created = 0;
  await expect(CollisionWorkerPool.create(2, () => {
    if (created++) throw new Error('startup failed');
    return first as unknown as Worker;
  })).rejects.toThrow('startup failed');
  expect(first.terminated).toBe(true);
  await expect(CollisionWorkerPool.create(0)).rejects.toThrow('1–8');
});

it('rejects malformed replies, handles empty-run aborts, and bounds startup waits', async () => {
  const worker = new FakeWorker(false);
  const pool = await CollisionWorkerPool.create(1, () => worker as unknown as Worker);
  const pending = pool.run([job()]);
  worker.emit({ type: 'result', id: worker.requests[0].id, results: [], computeMs: 0, decodeMs: 0, cacheHits: 0 });
  await expect(pending).rejects.toThrow('result count');
  expect(worker.terminated).toBe(true);

  const idle = new FakeWorker();
  const second = await CollisionWorkerPool.create(1, () => idle as unknown as Worker);
  const abort = new AbortController();
  const empty = second.run([], { signal: abort.signal });
  abort.abort();
  await expect(empty).rejects.toThrow('aborted');
  expect(idle.terminated).toBe(true);

  vi.useFakeTimers();
  const silent = new FakeWorker(false, false);
  const startup = expect(CollisionWorkerPool.create(1, () => silent as unknown as Worker, 50)).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(51);
  await startup;
  expect(silent.terminated).toBe(true);
});
