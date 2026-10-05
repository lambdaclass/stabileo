import { afterEach, expect, it, vi } from 'vitest';
import { runCollisionBatch, type CollisionRequest, type CollisionResponse } from '../../../../scripts/collision-worker/protocol';
import { detectCollisions } from '../detailing/collision';
import { classifyPair } from '../detailing/classify';
import { straightSegment, type BarPath } from '../../codes/cirsoc201/bar-geometry';

function bar(id: string, y: number): BarPath {
  return {
    id, diameterMm: 20, role: 'longitudinal', ownerElementIds: [1],
    segments: [straightSegment({ x: 0, y, z: 0 }, { x: 2, y, z: 0 })],
    startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
    cuttingLength: 2, source: 'generated', locked: false, refs: [],
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('recreates the benchmark classifier from cloneable inputs without changing collision results', () => {
  const bars = [bar('a', 0), bar('b', 0.040)];
  const classification = { edition: '2025' as const, maxAggregateSizeMm: 19,
    memberKinds: [[1, 'column']] as Array<[number, 'column']> };
  const reference = detectCollisions(bars, {
    classifyFor: (a, b, d, ta, tb) => classifyPair(a, b, {
      edition: '2025', maxAggregateSizeMm: 19, memberKindOf: () => 'column',
    }, d, ta, tb),
  });
  expect(runCollisionBatch(structuredClone([{ bars, classification }]))).toEqual([reference]);
  expect(runCollisionBatch([{ bars: [] }])[0].conflicts).toEqual([]);
});

it('the worker acknowledges startup, returns results, and reports errors with the request ID', async () => {
  const messages: CollisionResponse[] = [];
  const scope = {
    postMessage: (message: CollisionResponse) => messages.push(structuredClone(message)),
    onmessage: null as ((event: MessageEvent<CollisionRequest>) => void) | null,
  };
  vi.stubGlobal('self', scope);
  await import('../../../../scripts/collision-worker/worker');
  expect(messages).toEqual([{ type: 'ready' }]);
  const jobs = [{ bars: [bar('a', 0), bar('b', 0.040)] }];
  const dispatch = (request: CollisionRequest) => scope.onmessage!({ data: structuredClone(request) } as MessageEvent<CollisionRequest>);
  dispatch({ id: 1, operation: 'collide', jobs });
  expect(messages[1]).toMatchObject({ type: 'result', id: 1, results: runCollisionBatch(jobs) });
  dispatch({ id: 2, operation: 'receiveOnly', jobs });
  expect(messages[2]).toMatchObject({ type: 'result', id: 2, results: [] });
  dispatch({ id: 3, operation: 'collide', jobs: null as unknown as CollisionRequest['jobs'] });
  expect(messages[3]).toMatchObject({ type: 'error', id: 3, error: expect.any(String) });
});
