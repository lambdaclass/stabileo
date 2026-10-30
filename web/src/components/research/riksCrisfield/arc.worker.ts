import { initSolver, solveArcLength } from '../../../lib/engine/wasm-solver';
import type { ArcInput, BenchmarkFrame } from './benchmark';

type RunMessage = { type: 'run'; runId: number; input: ArcInput; apexNodeId: number; direction: 'downward' | 'upward'; referenceLoad: number };
type RawStep = { step: number; loadFactor: number; converged: boolean; iterations: number };
type RawResult = {
  steps: RawStep[];
  finalLoadFactor: number;
  converged: boolean;
  totalIterations: number;
  results: { displacements: { nodeId: number; ux: number; uz: number }[] };
};

self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const { runId, input, apexNodeId, direction, referenceLoad } = event.data;
  try {
    await initSolver();
    const full = solveArcLength(input) as RawResult;
    const nodeIds = Object.values(input.solver.nodes).sort((a, b) => a.id - b.id).map((node) => node.id);
    for (let k = 1; k <= full.steps.length; k++) {
      const prefix = solveArcLength({ ...input, maxSteps: k }) as RawResult;
      const expected = full.steps[k - 1];
      const actual = prefix.steps.at(-1);
      if (!actual || actual.step !== expected.step || Math.abs(actual.loadFactor - expected.loadFactor) > 1e-9 * Math.max(1, Math.abs(expected.loadFactor))) {
        throw new Error(`Prefix solve disagrees with the full path at step ${k}`);
      }
      const byNode = new Map(prefix.results.displacements.map((d) => [d.nodeId, d]));
      const apex = byNode.get(apexNodeId);
      if (!apex) throw new Error(`Missing apex displacement at step ${k}`);
      const displacement = -apex.uz;
      const frame: BenchmarkFrame = {
        step: expected.step,
        loadFactor: expected.loadFactor,
        displacement,
        load: expected.loadFactor * referenceLoad * (direction === 'downward' ? 1 : -1),
        iterations: expected.iterations,
        converged: expected.converged,
        displacements: nodeIds.flatMap((id) => {
          const d = byNode.get(id);
          return [d?.ux ?? 0, d?.uz ?? 0];
        }),
      };
      self.postMessage({ type: 'frame', runId, frame, total: full.steps.length });
    }
    self.postMessage({ type: 'done', runId, converged: full.converged, totalIterations: full.totalIterations, finalLoadFactor: full.finalLoadFactor });
  } catch (error) {
    self.postMessage({ type: 'error', runId, error: error instanceof Error ? error.message : String(error) });
  }
};
