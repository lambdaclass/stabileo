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
      self.postMessage({ frame: frameFrom(result, step, input) });
      if (step + split > input.maxSteps) {
        const loads = (result.steps as { loadFactor: number }[]).map(s => s.loadFactor);
        const i = loads.findIndex((l, k) => k > 0 && k < loads.length - 1 && l > loads[k - 1] && l > loads[k + 1]);
        peak = i < 0 ? null : loads[i];
      }
    }
    self.postMessage({ done: true, peak });
  } catch (error) { self.postMessage({ error: failureCode(error) }); }
};
