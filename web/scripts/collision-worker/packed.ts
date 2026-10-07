import type { BarPath, BarSegment } from '../../src/lib/codes/cirsoc201/bar-geometry';
import type { CollisionJob } from './protocol';

// Keep all bar metadata. Only segment geometry changes representation; Float64
// preserves JS numbers, and flags distinguish absent optional fields from NaN/zero.
const STRIDE = 12; // start[3], end[3], radius, sweep, centre[3], length
const ARC = 1, RADIUS = 2, SWEEP = 4, CENTRE = 8;
export interface PackedCollisionBatch {
  jobs: Array<Omit<CollisionJob, 'bars'> & { bars: Array<Omit<BarPath, 'segments'>> }>;
  offsets: Uint32Array;
  flags: Uint8Array;
  geometry: Float64Array;
}

/** Allocates fresh buffers so transferring a batch cannot detach model-owned data. */
export function packCollisionBatch(jobs: readonly CollisionJob[]): PackedCollisionBatch {
  let barCount = 0, segmentCount = 0;
  for (const job of jobs) for (const bar of job.bars) { barCount++; segmentCount += bar.segments.length; }
  if (segmentCount > 0xffffffff) throw new RangeError('Too many collision segments');
  const offsets = new Uint32Array(barCount + 1);
  const flags = new Uint8Array(segmentCount);
  const geometry = new Float64Array(segmentCount * STRIDE);
  let barIndex = 0, segmentIndex = 0;
  const packedJobs = jobs.map(job => ({ ...job, bars: job.bars.map(bar => {
    const { segments, ...metadata } = bar;
    offsets[barIndex++] = segmentIndex;
    for (const s of segments) {
      const i = segmentIndex * STRIDE;
      flags[segmentIndex++] = (s.kind === 'arc' ? ARC : 0)
        | (s.radius !== undefined ? RADIUS : 0) | (s.sweepDeg !== undefined ? SWEEP : 0)
        | (s.centre !== undefined ? CENTRE : 0);
      geometry[i] = s.start.x; geometry[i + 1] = s.start.y; geometry[i + 2] = s.start.z;
      geometry[i + 3] = s.end.x; geometry[i + 4] = s.end.y; geometry[i + 5] = s.end.z;
      geometry[i + 6] = s.radius ?? 0; geometry[i + 7] = s.sweepDeg ?? 0;
      geometry[i + 8] = s.centre?.x ?? 0; geometry[i + 9] = s.centre?.y ?? 0; geometry[i + 10] = s.centre?.z ?? 0;
      geometry[i + 11] = s.length;
    }
    return metadata;
  }) }));
  offsets[barCount] = segmentIndex;
  return { jobs: packedJobs, offsets, flags, geometry };
}

export function collisionTransferList(batch: PackedCollisionBatch): ArrayBuffer[] {
  // packCollisionBatch always allocates ordinary, dedicated ArrayBuffers.
  return [batch.offsets.buffer, batch.flags.buffer, batch.geometry.buffer] as ArrayBuffer[];
}

export function unpackCollisionBatch(batch: PackedCollisionBatch): CollisionJob[] {
  const { offsets, flags, geometry } = batch;
  const barCount = batch.jobs.reduce((n, job) => n + job.bars.length, 0);
  if (offsets.length !== barCount + 1 || offsets[0] !== 0
    || offsets[barCount] !== flags.length || geometry.length !== flags.length * STRIDE) {
    throw new Error('Invalid packed collision buffer lengths');
  }
  let barIndex = 0;
  return batch.jobs.map(job => ({ ...job, bars: job.bars.map(metadata => {
    const from = offsets[barIndex], to = offsets[++barIndex];
    if (from > to || to > flags.length) throw new Error('Invalid packed collision offsets');
    const segments: BarSegment[] = [];
    for (let j = from; j < to; j++) {
      const bits = flags[j], i = j * STRIDE;
      if (bits & ~15) throw new Error('Invalid packed collision flags');
      const s: BarSegment = {
        kind: bits & ARC ? 'arc' : 'straight',
        start: { x: geometry[i], y: geometry[i + 1], z: geometry[i + 2] },
        end: { x: geometry[i + 3], y: geometry[i + 4], z: geometry[i + 5] },
        length: geometry[i + 11],
      };
      if (bits & RADIUS) s.radius = geometry[i + 6];
      if (bits & SWEEP) s.sweepDeg = geometry[i + 7];
      if (bits & CENTRE) s.centre = { x: geometry[i + 8], y: geometry[i + 9], z: geometry[i + 10] };
      segments.push(s);
    }
    return { ...metadata, segments };
  }) }));
}
