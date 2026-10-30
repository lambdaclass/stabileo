import { initSolver, solveArcLength } from '../../../lib/engine/wasm-solver';
import { benchmark, frameFor, sampleSteps, type Run } from './case';

self.onmessage = async ({ data }: MessageEvent<{ maxSteps: number }>) => {
  try {
    await initSolver();
    const maxSteps = data.maxSteps === 20 ? 20 : benchmark.input.maxSteps;
    for (const step of sampleSteps.filter(step => step <= maxSteps)) {
      const run = solveArcLength({ ...benchmark.input, maxSteps: step }) as Run;
      self.postMessage({ frame: frameFor(run, step), steps: run.steps });
    }
    self.postMessage({ done: true });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
