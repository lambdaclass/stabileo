import { initSolver, solveArcLength } from '../../../lib/engine/wasm-solver';
import { benchmark, frameFor, limitPoint, peakBracket, sampleSteps, type Frame, type Run, type Step } from './case';

export type WorkerError = 'solve' | 'invalid';

const solve = (step: number) => solveArcLength({ ...benchmark.input, maxSteps: step }) as Run;

self.onmessage = async ({ data }: MessageEvent<{ maxSteps: number }>) => {
  let stage: WorkerError = 'solve';
  try {
    await initSolver();
    const maxSteps = data.maxSteps === 20 ? 20 : benchmark.input.maxSteps;
    let steps: Step[] = [];
    for (const step of sampleSteps.filter(step => step <= maxSteps)) {
      stage = 'solve';
      const run = solve(step);
      stage = 'invalid';
      self.postMessage({ frame: frameFor(run, step), steps: run.steps });
      steps = run.steps;
    }
    if (maxSteps === benchmark.input.maxSteps) {
      const prefixes = peakBracket(steps).prefixes;
      stage = 'solve';
      const runs = prefixes.map(step => [solve(step), step] as const);
      stage = 'invalid';
      self.postMessage({ limit: limitPoint(steps, runs.map(([run, step]) => frameFor(run, step)) as [Frame, Frame, Frame]) });
    }
    self.postMessage({ done: true });
  } catch {
    self.postMessage({ error: stage });
  }
};
