import { solveAll, type Inputs } from './solve-all';
import type { loadSprings } from './springs';
export type { Inputs } from './solve-all';

export class Simulation {
  result = $state.raw<ReturnType<typeof solveAll> | null>(null);
  error = $state<string | null>(null);
  ms = $state(0);

  busy = $state(false);
  source = $state<'live' | 'replay'>('live');
  private worker: Worker | null = null;
  stop() {
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }
  replay(result: ReturnType<typeof solveAll>) {
    this.stop();
    this.result = result;
    this.error = null;
    this.source = 'replay';
  }
  runLive(input: Inputs) {
    this.stop();
    this.busy = true;
    this.error = null;
    const start = performance.now();
    const worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    worker.onmessage = ({ data }) => {
      if (this.worker !== worker) return;
      this.result = data.result ?? null;
      this.error = data.error ?? null;
      this.ms = performance.now() - start;
      this.source = 'live';
      this.stop();
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      this.result = null;
      this.error = event.message;
      this.stop();
    };
    worker.postMessage(structuredClone(input));
  }
  run(glue: Awaited<ReturnType<typeof loadSprings>>, input: Inputs) {
    const start = performance.now();
    try {
      this.result = solveAll(glue, structuredClone(input));
      this.error = null;
    } catch (e) {
      this.result = null;
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.ms = performance.now() - start;
  }
}
