import { runCollisionBatch, type CollisionRequest, type CollisionResponse } from './protocol';
import { unpackCollisionBatch } from './packed';
import { CollisionJobCache } from './cache';

const cache = new CollisionJobCache();

const reply = (message: CollisionResponse) => self.postMessage(message);
self.onmessage = (event: MessageEvent<CollisionRequest>) => {
  const { id, operation } = event.data;
  try {
    const decodeStart = performance.now();
    const jobs = operation === 'receiveOnly' ? []
      : 'packed' in event.data ? unpackCollisionBatch(event.data.packed) : event.data.jobs;
    const decodeMs = performance.now() - decodeStart;
    const start = performance.now();
    const keys = event.data.cacheKeys;
    if (keys && (keys.length !== jobs.length || new Set(keys).size !== keys.length)) {
      throw new Error('Invalid collision cache keys');
    }
    let cacheHits = 0;
    const results = operation !== 'collide' ? [] : keys ? jobs.map((job, i) => {
      const cached = cache.run(keys[i], job);
      if (cached.hit) cacheHits++;
      return cached.result;
    }) : runCollisionBatch(jobs);
    reply({ type: 'result', id, results, computeMs: performance.now() - start, decodeMs, cacheHits });
  } catch (error) {
    reply({ type: 'error', id, error: String(error) });
  }
};
reply({ type: 'ready' });
