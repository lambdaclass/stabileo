import { afterEach, expect, it, vi } from 'vitest';
import { runCollisionBatch, type CollisionJob, type CollisionRequest, type CollisionResponse } from '../../../../scripts/collision-worker/protocol';
import { detectCollisions } from '../detailing/collision';
import { classifyPair } from '../detailing/classify';
import { straightSegment, type BarPath } from '../../codes/cirsoc201/bar-geometry';
import { packCollisionBatch, unpackCollisionBatch, collisionTransferList } from '../../../../scripts/collision-worker/packed';

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
  dispatch({ id: 3, operation: 'collide', jobs: null as unknown as CollisionJob[] });
  expect(messages[3]).toMatchObject({ type: 'error', id: 3, error: expect.any(String) });
  dispatch({ id: 4, operation: 'collide', packed: packCollisionBatch(jobs) });
  expect(messages[4]).toMatchObject({ type: 'result', id: 4, results: runCollisionBatch(jobs), decodeMs: expect.any(Number) });
});

it('transfers geometry ownership without detaching or mutating model data', () => {
  const curved = bar('curved:Ø20', -0.02);
  curved.segments.push({ kind: 'arc', start: { x: 2, y: -0.02, z: 0 },
    end: { x: 2.1, y: 0.08, z: 0 }, radius: 0.1, sweepDeg: 90,
    centre: { x: 2, y: 0.08, z: 0 }, length: Math.PI * 0.05 });
  curved.enclosesBarIds = ['a']; curved.restrainsBarIds = ['a']; curved.hookContactsBarIds = ['a'];
  curved.locked = true; curved.layerId = 'layer:1'; curved.cageId = 'cage:2';
  const jobs: CollisionJob[] = [
    { bars: [] }, { bars: [curved, bar('a', 0.04), { ...bar('empty', 0), segments: [] }] },
  ];
  const original = structuredClone(jobs);
  const packet = packCollisionBatch(jobs);
  const transfers = collisionTransferList(packet);
  const received = structuredClone(packet, { transfer: transfers });
  expect(transfers.map(b => b.byteLength)).toEqual([0, 0, 0]);
  const restored = unpackCollisionBatch(received);
  expect(restored).toEqual(original);
  expect(runCollisionBatch(restored)).toEqual(runCollisionBatch(jobs));
  restored[1].bars[0].segments[0].start.x = 100;
  restored[1].bars[0].ownerElementIds.push(100);
  expect(jobs).toEqual(original);
});

it('preserves exact Float64 values and optional arc fields, without numeric sentinels', () => {
  const b = bar('special', 0);
  b.segments = [
    { kind: 'arc', start: { x: -0, y: 1e-15, z: 1e20 }, end: { x: Infinity, y: -Infinity, z: NaN }, length: 0 },
    { kind: 'arc', start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 1, z: 1 },
      radius: NaN, sweepDeg: -0, centre: { x: -0, y: NaN, z: Infinity }, length: Infinity },
  ];
  const restored = unpackCollisionBatch(packCollisionBatch([{ bars: [b] }]))[0].bars[0];
  expect(restored).toEqual(b);
  expect(Object.is(restored.segments[0].start.x, -0)).toBe(true);
  expect(restored.segments[0].radius).toBeUndefined();
  expect(restored.segments[0].centre).toBeUndefined();
  expect(Number.isNaN(restored.segments[1].radius)).toBe(true);
  expect(Object.is(restored.segments[1].sweepDeg, -0)).toBe(true);
});

it('rejects inconsistent packed boundaries and unknown flags', () => {
  const jobs = [{ bars: [bar('a', 0), bar('b', 0)] }];
  const short = packCollisionBatch(jobs); short.geometry = short.geometry.slice(1);
  expect(() => unpackCollisionBatch(short)).toThrow(/lengths/);
  const backwards = packCollisionBatch(jobs); backwards.offsets[1] = 3;
  expect(() => unpackCollisionBatch(backwards)).toThrow(/offsets/);
  const flags = packCollisionBatch(jobs); flags.flags[0] = 128;
  expect(() => unpackCollisionBatch(flags)).toThrow(/flags/);
  expect(unpackCollisionBatch(packCollisionBatch([]))).toEqual([]);
});
