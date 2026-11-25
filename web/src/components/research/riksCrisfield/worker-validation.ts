export type RawStep = { step: number; loadFactor: number; converged: boolean; iterations: number; controlDisplacement: number };
export type RawResult = {
  steps: RawStep[];
  finalLoadFactor: number;
  converged: boolean;
  totalIterations: number;
  rejectedIterations?: number;
  results: { displacements: { nodeId: number; ux: number; uz: number; ry: number }[] };
};

function summaryMatchesSteps(r: RawResult, requestedSteps: number): boolean {
  const rejected = r.rejectedIterations === undefined ? 0 : r.rejectedIterations;
  const accepted = r.steps.reduce((sum, step) => sum + step.iterations, 0);
  return Number.isSafeInteger(rejected) && rejected >= 0 &&
    Number.isFinite(r.finalLoadFactor) && Number.isSafeInteger(r.totalIterations) &&
    r.steps.length > 0 && r.steps.length <= requestedSteps &&
    r.finalLoadFactor === r.steps[r.steps.length - 1].loadFactor &&
    r.steps.every(step => step.converged && Number.isSafeInteger(step.iterations) && step.iterations > 0) &&
    r.totalIterations === accepted + rejected &&
    r.converged === (r.steps.length === requestedSteps);
}

export function validatePrefix(full: RawResult, prefix: RawResult, k: number, nodeIds: number[], requestedSteps: number) {
  if (!summaryMatchesSteps(full, requestedSteps)) throw new Error('Invalid full result');
  if (prefix.steps.length !== k || !summaryMatchesSteps(prefix, k) ||
      (prefix.rejectedIterations ?? 0) > (full.rejectedIterations ?? 0) ||
      (full.converged && k === requestedSteps && prefix.totalIterations !== full.totalIterations)) {
    throw new Error('Invalid prefix result');
  }
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
