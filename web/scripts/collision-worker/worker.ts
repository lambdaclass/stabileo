import { runCollisionBatch, type CollisionRequest, type CollisionResponse } from './protocol';
import { unpackCollisionBatch } from './packed';

const reply = (message: CollisionResponse) => self.postMessage(message);
self.onmessage = (event: MessageEvent<CollisionRequest>) => {
  const { id, operation } = event.data;
  try {
    const decodeStart = performance.now();
    const jobs = operation === 'receiveOnly' ? []
      : 'packed' in event.data ? unpackCollisionBatch(event.data.packed) : event.data.jobs;
    const decodeMs = performance.now() - decodeStart;
    const start = performance.now();
    const results = operation === 'collide' ? runCollisionBatch(jobs) : [];
    reply({ type: 'result', id, results, computeMs: performance.now() - start, decodeMs });
  } catch (error) {
    reply({ type: 'error', id, error: String(error) });
  }
};
reply({ type: 'ready' });
