import type { CollisionJob } from './protocol';
import { runCollisionBatch } from './protocol';

type Result = ReturnType<typeof runCollisionBatch>[number];

// Compare the complete wire input, including policies and bar relationships. Object.is
// preserves signed zero and NaN; absent and explicitly undefined fields remain distinct.
function equal(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (depth > 32 || !a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (!Array.isArray(a) && (Object.getPrototypeOf(a) !== Object.prototype
    || Object.getPrototypeOf(b) !== Object.prototype)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length || (Array.isArray(a) && a.length !== (b as unknown[]).length)) return false;
  return ak.every(k => Object.hasOwn(b, k)
    && equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth + 1));
}

/** Worker-local LRU, bounded by jobs, bars and segments; no persisted certificates. */
export class CollisionJobCache {
  private entries = new Map<string, { job: CollisionJob; result: Result; bars: number; segments: number }>();
  private bars = 0;
  private segments = 0;

  constructor(private readonly maxJobs = 16, private readonly maxBars = 10_000,
    private readonly maxSegments = 50_000) {}

  run(key: string, job: CollisionJob): { result: Result; hit: boolean } {
    const previous = this.entries.get(key);
    if (previous && equal(previous.job, job)) {
      this.entries.delete(key);
      this.entries.set(key, previous);
      return { result: structuredClone(previous.result), hit: true };
    }
    // Compute before changing cache state: a failing calculation cannot publish a result.
    const result = runCollisionBatch([job])[0];
    if (previous) this.remove(key);
    const bars = job.bars.length;
    const segments = job.bars.reduce((n, bar) => n + bar.segments.length, 0);
    if (this.maxJobs > 0 && bars <= this.maxBars && segments <= this.maxSegments) {
      while (this.entries.size >= this.maxJobs || this.bars + bars > this.maxBars
        || this.segments + segments > this.maxSegments) {
        this.remove(this.entries.keys().next().value!);
      }
      // Own both snapshots: neither callers nor returned results can mutate cached state.
      this.entries.set(key, { job: structuredClone(job), result: structuredClone(result), bars, segments });
      this.bars += bars;
      this.segments += segments;
    }
    return { result, hit: false };
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bars -= entry.bars;
    this.segments -= entry.segments;
    this.entries.delete(key);
  }
}
