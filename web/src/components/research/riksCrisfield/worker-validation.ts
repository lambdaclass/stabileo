export type RawStep = { step: number; loadFactor: number; converged: boolean; iterations: number; controlDisplacement: number };
export type RawResult = {
  steps: RawStep[];
  finalLoadFactor: number;
  converged: boolean;
  totalIterations: number;
  results: { displacements: { nodeId: number; ux: number; uz: number; ry: number }[] };
};

export function validatePrefix(full: RawResult, prefix: RawResult, k: number, nodeIds: number[]) {
  if (![full.finalLoadFactor, full.totalIterations].every(Number.isFinite)) throw new Error('Invalid full result');
  if (prefix.steps.length !== k || !Number.isFinite(prefix.finalLoadFactor) || !Number.isFinite(prefix.totalIterations)) throw new Error('Invalid prefix result');
  for (let i = 0; i < k; i++) {
    const a = prefix.steps[i], b = full.steps[i];
    if (!b || !Number.isFinite(a.loadFactor) || !Number.isFinite(a.iterations) || !a.converged ||
      a.step !== b.step || a.loadFactor !== b.loadFactor || a.iterations !== b.iterations || a.converged !== b.converged ||
      a.controlDisplacement !== b.controlDisplacement || !Number.isFinite(a.controlDisplacement)) {
      throw new Error(`Prefix mismatch at step ${i + 1}`);
    }
  }
  const byNode = new Map(prefix.results.displacements.map(d => [d.nodeId, d]));
  if (byNode.size !== nodeIds.length || prefix.results.displacements.length !== nodeIds.length) throw new Error('Invalid displacement node count');
  for (const id of nodeIds) {
    const d = byNode.get(id);
    if (!d || ![d.ux, d.uz, d.ry].every(Number.isFinite)) throw new Error(`Invalid displacement for node ${id}`);
  }
  return byNode;
}
