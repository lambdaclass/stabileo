import { runCollisionBatch, type CollisionRequest, type CollisionResponse } from './protocol';

const reply = (message: CollisionResponse) => self.postMessage(message);
self.onmessage = (event: MessageEvent<CollisionRequest>) => {
  const { id, jobs, operation } = event.data;
  try {
    const start = performance.now();
    const results = operation === 'collide' ? runCollisionBatch(jobs) : [];
    reply({ type: 'result', id, results, computeMs: performance.now() - start });
  } catch (error) {
    reply({ type: 'error', id, error: String(error) });
  }
};
reply({ type: 'ready' });
