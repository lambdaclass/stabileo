// Alternating browser benchmark for the two Rust query paths on identical real cages.
// Includes geometry packing, index construction, classification, and result decoding.
import { benchmark as designBenchmark } from './design-benchmark';
import { modelStore } from '../src/lib/store';
import { verificationStore } from '../src/lib/store/verification.svelte';
import { CollisionGeometry } from '../src/lib/wasm/dedaliano_engine.js';
import { registerCollisionKernel } from '../src/lib/engine/detailing/collision-kernel';
import { runCollisionBatch, type CollisionJob } from './collision-worker/protocol';

export async function benchmark(examples: string[]) {
  const rows = [];
  try {
    for (const example of examples) {
      await designBenchmark([example], false);
      const memberKinds = [...verificationStore.contexts].map(([id, ctx]) => [id, ctx.elementType]);
      const jobs: CollisionJob[] = JSON.parse(JSON.stringify(
        (modelStore.model.detailing?.assemblies ?? []).filter(a => a.bars.length).map(a => ({
          bars: a.bars, classification: { edition: '2025', maxAggregateSizeMm: 19, memberKinds },
        })),
      ));
      const times = { separate: [] as number[], fused: [] as number[] };
      let reference: string | undefined;
      for (let round = 0; round < 8; round++) {
        const order = round % 2 ? ['fused', 'separate'] as const : ['separate', 'fused'] as const;
        for (const mode of order) {
          registerCollisionKernel(CollisionGeometry, true, mode === 'fused');
          const start = performance.now();
          const result = runCollisionBatch(jobs);
          const ms = performance.now() - start;
          const serialized = JSON.stringify(result);
          reference ??= serialized;
          if (serialized !== reference) throw new Error(`${example}: ${mode} changes collision output or diagnostics`);
          if (round >= 2) times[mode].push(ms);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      const median = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return (sorted[2] + sorted[3]) / 2;
      };
      const separateMs = median(times.separate), fusedMs = median(times.fused);
      rows.push({ example, bars: jobs.reduce((n, job) => n + job.bars.length, 0),
        separateMs, fusedMs, speedup: separateMs / fusedMs, times, equivalent: true });
    }
    return rows;
  } finally { registerCollisionKernel(CollisionGeometry); }
}
