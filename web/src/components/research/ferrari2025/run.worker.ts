import { initSolver, solveBuckling, solveArcLength } from '../../../lib/engine/wasm-solver';
import { modelFromWire, readFrame } from './protocol';
self.onmessage = async ({ data }: MessageEvent<Record<string, unknown>>) => {
  try {
    await initSolver();
    const model = modelFromWire(data);
    const perfect = { ...model, loads: [{ type: 'nodal' as const, data: { nodeId: 11, fx: 0, fz: -1, my: 0 } }] };
    const result = solveBuckling(perfect, 1);
    const lambda = result.modes[0]?.loadFactor;
    if (!Number.isFinite(lambda) || lambda <= 0) throw new Error('Invalid buckling result');
    self.postMessage({ kind: 'buckling', lambda });
    for (let maxSteps = 4; maxSteps <= 100; maxSteps += 4) {
      const frame = readFrame(solveArcLength({ solver: data, maxSteps, maxIter: 40, tolerance: 1e-9, initialDs: 0.04, minDs: 1e-7, maxDs: 0.04, targetIter: 5 }));
      self.postMessage({ kind: 'frame', frame });
    }
    self.postMessage({ kind: 'done' });
  } catch {
    self.postMessage({ kind: 'error' });
  }
};
