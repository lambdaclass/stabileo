// Benchmark-only async boundary. Production repair orchestration is still synchronous.
import type { CollisionJob, CollisionRequest, CollisionResponse } from './protocol';
import { packCollisionBatch, collisionTransferList } from './packed';

type Reply = Extract<CollisionResponse, { type: 'result' }>;
export interface PoolResult {
  results: Reply['results'];
  /** Worker CPU timings are summed, not elapsed wall time. */
  computeMs: number;
  decodeMs: number;
  packMs: number;
  postMessageMs: number;
  cacheHits: number;
}

export class CollisionWorkerPool {
  private workers: Worker[] = [];
  private cancellations = new Set<(error: Error) => void>();
  private closed = false;
  private busy = false;
  private nextId = 0;
  private readonly fatal = (event: Event) => this.close(new Error(
    'message' in event ? String(event.message) : 'Collision worker communication failed'));

  private constructor(private readonly timeoutMs: number) {}

  static async create(size: number, factory: () => Worker = () =>
    new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), timeoutMs = 30_000) {
    if (!Number.isInteger(size) || size < 1 || size > 8) throw new Error('Pool size must be 1–8');
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid worker timeout');
    const pool = new CollisionWorkerPool(timeoutMs);
    const ready: Promise<CollisionResponse>[] = [];
    try {
      for (let i = 0; i < size; i++) {
        const worker = factory();
        pool.workers.push(worker);
        worker.addEventListener('error', pool.fatal);
        worker.addEventListener('messageerror', pool.fatal);
        ready.push(pool.wait(worker, response => response.type === 'ready'));
      }
      await Promise.all(ready);
      return pool;
    } catch (error) {
      pool.close(error instanceof Error ? error : new Error(String(error)));
      // A factory may fail after earlier workers already have pending startup promises.
      await Promise.allSettled(ready);
      throw error;
    }
  }

  private wait(worker: Worker, accept: (response: CollisionResponse) => boolean,
    send?: () => void): Promise<CollisionResponse> {
    if (this.closed) return Promise.reject(new Error('Collision worker pool is closed'));
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener('message', message);
        this.cancellations.delete(cancel);
      };
      const cancel = (error: Error) => { cleanup(); reject(error); };
      const message = (event: MessageEvent<CollisionResponse>) => {
        if (!accept(event.data)) return;
        cleanup();
        if (event.data.type === 'error') reject(new Error(event.data.error));
        else resolve(event.data);
      };
      const timer = setTimeout(() => cancel(new Error('Collision worker timed out')), this.timeoutMs);
      this.cancellations.add(cancel);
      worker.addEventListener('message', message);
      try { send?.(); } catch (error) { cancel(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  async run(jobs: readonly CollisionJob[], options: { cache?: boolean; signal?: AbortSignal } = {}): Promise<PoolResult> {
    if (this.closed) throw new Error('Collision worker pool is closed');
    if (this.busy) throw new Error('Collision worker pool is busy');
    if (options.signal?.aborted) throw new Error('Collision run aborted');
    this.busy = true;
    const abort = () => this.close(new Error('Collision run aborted'));
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      const chunks = this.workers.map(() => [] as number[]);
      // Stable ownership retains per-assembly cache entries across edits. A heavy assembly
      // is never split: collisions between its bars must stay in the same calculation.
      jobs.forEach((_, i) => chunks[i % chunks.length].push(i));
      const output: PoolResult = { results: new Array(jobs.length), computeMs: 0,
        decodeMs: 0, packMs: 0, postMessageMs: 0, cacheHits: 0 };
      await Promise.all(chunks.map(async (indices, workerIndex) => {
        if (!indices.length) return;
        const id = ++this.nextId;
        const packStart = performance.now();
        const packed = packCollisionBatch(indices.map(i => jobs[i]));
        output.packMs += performance.now() - packStart;
        const payload: CollisionRequest = { id, operation: 'collide', packed,
          cacheKeys: options.cache ? indices.map(String) : undefined };
        const response = await this.wait(this.workers[workerIndex], reply =>
          reply.type !== 'ready' && reply.id === id, () => {
          const start = performance.now();
          this.workers[workerIndex].postMessage(payload, collisionTransferList(packed));
          output.postMessageMs += performance.now() - start;
        });
        if (response.type !== 'result' || response.results.length !== indices.length) {
          throw new Error('Invalid collision worker result count');
        }
        indices.forEach((index, i) => { output.results[index] = response.results[i]; });
        output.computeMs += response.computeMs;
        output.decodeMs += response.decodeMs;
        output.cacheHits += response.cacheHits;
      }));
      if (options.signal?.aborted) throw new Error('Collision run aborted');
      if (this.closed) throw new Error('Collision worker pool is closed');
      return output;
    } catch (error) {
      this.close(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', abort);
      this.busy = false;
    }
  }

  close(reason = new Error('Collision worker pool is closed')): void {
    if (this.closed) return;
    this.closed = true;
    for (const cancel of this.cancellations) cancel(reason);
    for (const worker of this.workers) {
      worker.removeEventListener('error', this.fatal);
      worker.removeEventListener('messageerror', this.fatal);
      worker.terminate();
    }
  }
}
