// Benchmark-only wire contract. Production callers with custom clearance/placement
// callbacks need explicit serializable policies before this can replace their sweeps.
import type { BarPath } from '../../src/lib/codes/cirsoc201/bar-geometry';
import { classifyPair, type ClassificationContext } from '../../src/lib/engine/detailing/classify';
import { detectCollisions, type CollisionTolerances } from '../../src/lib/engine/detailing/collision';
import type { PackedCollisionBatch } from './packed';

export interface CollisionJob {
  bars: BarPath[];
  tolerances?: CollisionTolerances;
  classification?: {
    edition: ClassificationContext['edition'];
    maxAggregateSizeMm: number;
    memberKinds: Array<[number, ReturnType<ClassificationContext['memberKindOf']>]>;
  };
}

export function runCollisionBatch(jobs: readonly CollisionJob[]) {
  return jobs.map(job => {
    const policy = job.classification;
    const kinds = new Map(policy?.memberKinds);
    const ctx: ClassificationContext | undefined = policy && {
      edition: policy.edition, maxAggregateSizeMm: policy.maxAggregateSizeMm,
      memberKindOf: id => kinds.get(id),
    };
    return detectCollisions(job.bars, {
      tolerances: job.tolerances,
      classifyFor: ctx ? (a, b, surface, ta, tb) => classifyPair(a, b, ctx, surface, ta, tb) : undefined,
    });
  });
}

export type CollisionRequest = {
  id: number;
  operation: 'collide' | 'receiveOnly';
} & ({ jobs: CollisionJob[] } | { packed: PackedCollisionBatch });

export type CollisionResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; results: ReturnType<typeof runCollisionBatch>; computeMs: number; decodeMs: number }
  | { type: 'error'; id: number; error: string };
