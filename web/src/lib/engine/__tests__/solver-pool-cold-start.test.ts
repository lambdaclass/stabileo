/**
 * The first job on a fresh worker must not coincide with another's.
 *
 * ── What this guards ────────────────────────────────────────────────
 *
 * Several freshly-instantiated workers beginning a large solve in the same instant takes the
 * browser process down — Chromium aborts with `signal 4, ILL_ILLTRP`, and because the page stops
 * existing, every pending promise in it simply never settles. Measured at 7.5-10 % of first
 * solves on the 633-element shed, in the headless shell AND in real Google Chrome, on this branch
 * and on its base. `COLD_START_STAGGER_MS` in `solver-pool.ts` carries the full table.
 *
 * All seven crashes across 180 solves landed on the FIRST solve of a session; none of the ~113
 * with already-executed workers crashed. So this has two halves, and the second matters as much
 * as the first: a test that only checked "the first jobs are separated" would pass on an
 * implementation that had quietly serialised every solve for ever, which is a performance
 * regression wearing a fix's clothes.
 *
 * ── Why these assert on overlap and not on elapsed time ─────────────
 *
 * The first version measured the wall-clock spread between the three dispatches and asked for
 * more than 2 ms. It failed at 1.9992 ms. The number was never the point: what the pool has to
 * guarantee is that no cold job is handed over while another is still IN FLIGHT, and that is an
 * ordering property, so the workers record how many jobs were outstanding at the moment each
 * dispatch happened. No clock, nothing to tune, and it says what it means.
 *
 * (Fake timers are not an option either: they freeze the pool's own readiness handshake, which
 * is delivered on a microtask, and the pool never comes up.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setWorkerFactoryForTests, destroyPool, solveParallel, type WorkerLike } from '../solver-pool';

/** Records each hand-over and how many jobs were already outstanding at that moment. */
class RecordingWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  static dispatches: Array<{ worker: number; sawInFlight: number }> = [];
  static inFlight = 0;

  constructor(private readonly index: number) {}

  postMessage(msg: { type: string; id?: number }): void {
    if (msg.type === 'init') {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } } as MessageEvent));
      return;
    }
    RecordingWorker.dispatches.push({
      worker: this.index,
      sawInFlight: RecordingWorker.inFlight,
    });
    RecordingWorker.inFlight++;
    const id = msg.id!;
    // Answered on a later turn, so a job is genuinely outstanding while the next one is decided.
    setTimeout(() => {
      RecordingWorker.inFlight--;
      this.onmessage?.({ data: { type: 'result', id, result: { ok: true } } } as MessageEvent);
    }, 5);
  }

  terminate(): void { /* nothing to release */ }
}

let workers: RecordingWorker[] = [];

beforeEach(() => {
  workers = [];
  RecordingWorker.dispatches = [];
  RecordingWorker.inFlight = 0;
  setWorkerFactoryForTests(() => {
    const w = new RecordingWorker(workers.length);
    workers.push(w);
    return w;
  });
});

afterEach(() => {
  setWorkerFactoryForTests(null);
  destroyPool();
});

const CASES = [1, 2, 3].map((id) => ({ id, input: { id } }));

/** The largest number of jobs that were outstanding when any dispatch went out. */
function peakOverlap(): number {
  return Math.max(...RecordingWorker.dispatches.map((d) => d.sawInFlight));
}

describe('cold workers are not started together', () => {
  it('runs the first job on each worker one after another', async () => {
    await solveParallel(CASES);

    expect(RecordingWorker.dispatches).toHaveLength(3);
    // Every cold job went out with nothing else outstanding. Without the guard all three are
    // handed over in the same tick and the second and third see one and two in flight.
    expect(peakOverlap()).toBe(0);
  });

  it('and each of them warms a DIFFERENT worker', async () => {
    await solveParallel(CASES);

    /*
     * The half an earlier version got wrong. It separated the dispatches with a timer and let
     * `runJob` pick the least-busy worker — but each job finished before the next was released,
     * so `pending.size` was 0 again and every one of them went to worker 0. The pool never
     * warmed, every later solve kept paying the delay, and none of them ran in parallel.
     */
    const used = new Set(RecordingWorker.dispatches.map((d) => d.worker));
    expect(used.size).toBe(3);
  });
});

describe('warm workers go back to being dispatched together', () => {
  it('dispatches the second solve with no separation at all', async () => {
    await solveParallel(CASES);
    expect(peakOverlap(), 'the first solve should have been serialised').toBe(0);

    RecordingWorker.dispatches = [];
    await solveParallel(CASES);

    expect(RecordingWorker.dispatches).toHaveLength(3);
    // Every worker has executed once, so the trigger is gone and the pool goes back to being a
    // pool: the later jobs go out while the earlier ones are still running.
    expect(peakOverlap()).toBeGreaterThan(0);
  });

  it('and a third solve is not staggered either', async () => {
    await solveParallel(CASES);
    await solveParallel(CASES);
    RecordingWorker.dispatches = [];
    await solveParallel(CASES);

    expect(peakOverlap()).toBeGreaterThan(0);
  });
});
