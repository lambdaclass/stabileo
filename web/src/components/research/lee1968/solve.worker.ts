import { failureCode, frameFrom, refinedInput, splits, type Split } from './case';
import { initSolver, solveArcLength } from '../../../lib/engine/wasm-solver';
self.onmessage = async ({ data }: MessageEvent<{ split?: Split }>) => {
  try {
    await initSolver();
    const split = splits.includes(data?.split as Split) ? data.split! : 1;
    const input = refinedInput(split);
    let peak: number | null = null;
    for (let step = split; step <= input.maxSteps; step += split) {
      const result = solveArcLength({ ...input, maxSteps: step });
      const frame = frameFrom(result, step, input);
      if (peak === null) {
        const loads = result.steps.map(s => s.loadFactor);
        const i = loads.findIndex((load, k) => k > 0 && k + 1 < loads.length && load > loads[k - 1] && load > loads[k + 1]);
        if (i >= 0) peak = loads[i];
      }
      self.postMessage({ frame, peak });
    }
    self.postMessage({ done: true, peak });
  } catch (error) { self.postMessage({ error: failureCode(error) }); }
};
