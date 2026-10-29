import { inputFor, type BenchmarkCase, type BenchmarkFrame, type BenchmarkRun, type RunParameters } from './benchmark';

type Status = 'idle' | 'running' | 'done' | 'stopped' | 'error';

export class ArcRunner {
  current = $state<BenchmarkRun | null>(null);
  status = $state<Status>('idle');
  error = $state('');
  origin = $state<'live' | 'cached'>('live');
  private worker: Worker | null = null;
  private runId = 0;
  private cache = new Map<string, BenchmarkRun>();

  run(c: BenchmarkCase, parameters: RunParameters, force = false) {
    this.stopWorker();
    this.error = '';
    const key = JSON.stringify({ caseId: c.id, parameters });
    if (!force && this.cache.has(key)) {
      this.current = this.cache.get(key)!;
      this.origin = 'cached';
      this.status = 'done';
      return;
    }
    const runId = ++this.runId;
    this.origin = 'live';
    this.status = 'running';
    this.current = { caseId: c.id, parameters: { ...parameters }, frames: [], converged: false, totalIterations: 0, finalLoadFactor: 0 };
    this.worker = new Worker(new URL('./arc.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<{ type: string; runId: number; frame?: BenchmarkFrame; converged?: boolean; totalIterations?: number; finalLoadFactor?: number; error?: string }>) => {
      if (event.data.runId !== this.runId || !this.current) return;
      if (event.data.type === 'frame' && event.data.frame) {
        this.current = { ...this.current, frames: [...this.current.frames, event.data.frame] };
      } else if (event.data.type === 'done') {
        this.current = { ...this.current, converged: !!event.data.converged, totalIterations: event.data.totalIterations ?? 0, finalLoadFactor: event.data.finalLoadFactor ?? 0 };
        this.status = 'done';
        this.cache.set(key, this.current);
        this.stopWorker();
      } else if (event.data.type === 'error') {
        this.error = event.data.error ?? 'The production solver failed';
        this.status = 'error';
        this.stopWorker();
      }
    };
    this.worker.onerror = (event) => {
      if (runId !== this.runId) return;
      this.error = event.message || 'The production solver worker failed';
      this.status = 'error';
      this.stopWorker();
    };
    this.worker.postMessage({ type: 'run', runId, input: inputFor(c, parameters), apexNodeId: c.apex.nodeId, direction: parameters.direction, referenceLoad: c.apex.referenceLoad });
  }

  stop() {
    if (this.status === 'running') this.status = 'stopped';
    this.stopWorker();
  }

  clear() {
    this.runId++;
    this.stopWorker();
    this.current = null;
    this.status = 'idle';
    this.error = '';
  }

  dispose() {
    this.runId++;
    this.stopWorker();
    this.cache.clear();
  }

  private stopWorker() {
    this.runId++;
    this.worker?.terminate();
    this.worker = null;
  }
}
