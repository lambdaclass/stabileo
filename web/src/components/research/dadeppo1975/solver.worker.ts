import { initSolver, solveArcLength } from '../../../lib/engine/wasm-solver';
import { archInput, frameFor, limitPoint, meshes, peakBracket, sampleStepsFor, type Frame, type Mesh, type Run, type Step } from './case';

export type WorkerError = 'solve' | 'invalid';

self.onmessage = async ({ data }: MessageEvent<{ maxSteps: number; elements?: Mesh }>) => {
  let stage: WorkerError = 'solve';
  try {
    await initSolver();
    const elements = meshes.includes(data.elements as Mesh) ? data.elements! : 40;
    const input = archInput(elements);
    const solve = (step: number) => solveArcLength({ ...input, maxSteps: step }) as Run;
    const maxSteps = data.maxSteps === 20 ? 20 : input.maxSteps;
    let steps: Step[] = [];
    for (const step of sampleStepsFor(input).filter(step => step <= maxSteps)) {
      stage = 'solve';
      const run = solve(step);
      stage = 'invalid';
      self.postMessage({ frame: frameFor(run, step, input), steps: run.steps });
      steps = run.steps;
    }
    if (maxSteps === input.maxSteps) {
      const prefixes = peakBracket(steps).prefixes;
      stage = 'solve';
      const runs = prefixes.map(step => [solve(step), step] as const);
      stage = 'invalid';
      self.postMessage({ limit: limitPoint(steps, runs.map(([run, step]) => frameFor(run, step, input)) as [Frame, Frame, Frame], elements / 2) });
    }
    self.postMessage({ done: true });
  } catch {
    self.postMessage({ error: stage });
  }
};
