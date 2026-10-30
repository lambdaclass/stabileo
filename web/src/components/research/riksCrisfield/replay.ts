import nativeResults from '../../../../../research/numerical-methods/riks-crisfield/reference-results/native-results.json';
import { DEFAULT_PARAMETERS, type BenchmarkCase, type BenchmarkRun } from './benchmark';

type NativeDisplacement = { nodeId: number; ux: number; uz: number; ry: number };
type NativeFrame = { step: number; loadFactor: number; iterations: number; converged: boolean; displacements: NativeDisplacement[] };
type NativeCase = { id: string; converged: boolean; finalLoadFactor: number; totalIterations: number; frames: NativeFrame[] };

const nativeCases = (nativeResults as { cases: NativeCase[] }).cases;

export function nativeReplay(c: BenchmarkCase): BenchmarkRun {
  const native = nativeCases.find((item) => item.id === c.id);
  if (!native) throw new Error(`No native replay for ${c.id}`);
  const nodeIds = Object.values(c.input.solver.nodes).sort((a, b) => a.id - b.id).map((node) => node.id);
  return {
    caseId: c.id,
    parameters: DEFAULT_PARAMETERS(c),
    converged: native.converged,
    totalIterations: native.totalIterations,
    finalLoadFactor: native.finalLoadFactor,
    frames: native.frames.map((frame) => {
      const byNode = new Map(frame.displacements.map((d) => [d.nodeId, d]));
      const apex = byNode.get(c.apex.nodeId);
      if (!apex) throw new Error(`Native replay ${c.id} step ${frame.step} has no apex`);
      return {
        step: frame.step,
        loadFactor: frame.loadFactor,
        displacement: -apex.uz,
        load: frame.loadFactor * c.apex.referenceLoad,
        iterations: frame.iterations,
        converged: frame.converged,
        displacements: nodeIds.flatMap((id) => {
          const d = byNode.get(id);
          return [d?.ux ?? 0, d?.uz ?? 0];
        }),
      };
    }),
  };
}
