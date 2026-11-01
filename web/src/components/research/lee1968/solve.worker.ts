import { benchmark, frameFrom } from './case';
import { initSolver, solveArcLength } from '../../../lib/engine/wasm-solver';
self.onmessage = async () => {
  try {
    await initSolver();
    for (let step = 1; step <= benchmark.input.maxSteps; step++) {
      const result = solveArcLength({ ...benchmark.input, maxSteps: step });
      self.postMessage({ frame: frameFrom(result, step) });
    }
    self.postMessage({ done: true });
  } catch (error) { self.postMessage({ error: String(error) }); }
};
