import type { PlateConfig, Step, WorkerIn, WorkerOut } from './protocol';

export type Frame = { step: Step; damage: Float32Array; displacement: Float32Array; syy?: Float32Array };

export type RunStatus = 'running' | 'done' | 'stopped' | 'error' | 'unconverged';

export class Run {
  readonly key: string;
  readonly config: PlateConfig;
  nodes = $state.raw<Float64Array | null>(null);
  elements = $state.raw<Uint32Array | null>(null);
  frames = $state.raw<Frame[]>([]);
  status = $state<RunStatus>('running');
  seconds = $state<number | null>(null);
  error = $state<string | null>(null);
  /** 'live' while and after it is computed; 'cached' when shown again from memory. */
  origin = $state<'live' | 'cached'>('live');

  constructor(key: string, config: PlateConfig) {
    this.key = key;
    this.config = config;
  }
}

/** Completed runs kept in memory, so returning to earlier parameters replays without solving. */
const CACHE_RUNS = 4;

export class SimulationController {
  current = $state.raw<Run | null>(null);
  /** null until the first attempt; false when the WASM bundle is not present in this build. */
  available = $state<boolean | null>(null);
  unavailableReason = $state<string | null>(null);
  private worker: Worker | null = null;
  private runs = new Map<string, Run>();
  private nextId = 1;
  private live = new Map<number, Run>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (this.worker === w) this.receive(e.data);
    };
    w.onerror = (e) => {
      if (this.worker !== w) return;
      this.failWorker(e.message || 'the simulation worker failed to start');
    };
    this.worker = w;
    return w;
  }

  private failWorker(message: string) {
    this.worker?.terminate();
    this.worker = null;
    this.available = false;
    this.unavailableReason = message;
    for (const r of this.live.values()) {
      r.status = 'error';
      r.error = message;
      this.runs.delete(r.key);
    }
    this.live.clear();
  }

  private receive(m: WorkerOut) {
    if (m.type === 'unavailable') {
      this.failWorker(m.message);
      return;
    }
    if (m.type === 'reference-config') return;
    const run = this.live.get(m.runId);
    if (!run) return;
    this.available = true;
    if (m.type === 'mesh') {
      run.nodes = m.nodes;
      run.elements = m.elements;
    } else if (m.type === 'step') {
      run.frames = [...run.frames, { step: m.step, damage: m.damage, displacement: m.displacement, syy: m.syy }];
      if (!m.step.converged) {
        run.status = 'unconverged';
        run.error = `Step ${m.step.step} did not converge`;
        this.runs.delete(run.key);
        this.live.delete(m.runId);
        this.worker?.terminate();
        this.worker = null;
      }
    } else if (m.type === 'done') {
      run.status = 'done';
      run.seconds = m.seconds;
      this.live.delete(m.runId);
    } else if (m.type === 'error') {
      run.status = 'error';
      run.error = m.message;
      this.live.delete(m.runId);
      this.runs.delete(run.key);
    }
  }

  /** Show the run for `config`: from memory when it was completed before, unless `force`. */
  run(config: PlateConfig, force = false) {
    const key = JSON.stringify(config);
    const cached = this.runs.get(key);
    this.stop();
    if (!force && cached && cached.status === 'done') {
      this.runs.delete(key);
      this.runs.set(key, cached);
      cached.origin = 'cached';
      this.current = cached;
      return;
    }
    const run = new Run(key, config);
    const id = this.nextId++;
    this.live.set(id, run);
    this.runs.set(key, run);
    while (this.runs.size > CACHE_RUNS) this.runs.delete(this.runs.keys().next().value!);
    this.current = run;
    const msg: WorkerIn = { type: 'run', runId: id, config: key };
    try {
      this.ensureWorker().postMessage(msg);
    } catch (error) {
      this.failWorker(error instanceof Error ? error.message : String(error));
    }
  }

  /** Stopping terminates the worker: a load step cannot be interrupted from outside. */
  stop() {
    if (this.live.size === 0) return;
    this.worker?.terminate();
    this.worker = null;
    for (const r of this.live.values()) {
      r.status = 'stopped';
      this.runs.delete(r.key);
    }
    this.live.clear();
  }

  /** Forget the current run (the page goes back to its replay). */
  clear() {
    this.stop();
    this.current = null;
  }

  dispose() {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
  }
}

export function pendingMeshMessage(run: Run | null, replayError: string | null): string {
  if (run?.status === 'stopped') return 'Stopped. Press Recompute live to restart.';
  if (run?.error) return `The solver failed: ${run.error}. Retry or return to the replay in Parameters.`;
  if (replayError) return 'The precomputed replay couldn’t be loaded. Press Recompute live to compute it in your browser.';
  return run ? 'Loading the solver…' : 'Loading the replay…';
}
