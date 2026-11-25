export type RawStep = { step: number; loadFactor: number; converged: boolean; iterations: number; controlDisplacement: number };
export type RawResult = {
  steps: RawStep[];
  finalLoadFactor: number;
  converged: boolean;
  totalIterations: number;
  rejectedIterations?: number;
  results: { displacements: { nodeId: number; ux: number; uz: number; ry: number }[] };
};

function summaryMatchesSteps(result: RawResult, requestedSteps: number): boolean {
  if (!result || !Array.isArray(result.steps) || !Number.isSafeInteger(requestedSteps) ||
      requestedSteps <= 0 || result.steps.length > requestedSteps ||
      result.converged !== (result.steps.length === requestedSteps)) return false;

  const rejected = result.rejectedIterations === undefined ? 0 : result.rejectedIterations;
  if (!Number.isSafeInteger(rejected) || rejected < 0 || !Number.isSafeInteger(result.totalIterations)) return false;

  let iterations = rejected;
  for (const [index, step] of result.steps.entries()) {
    if (!step || step.step !== index + 1 || step.converged !== true ||
        !Number.isSafeInteger(step.iterations) || step.iterations <= 0 ||
        !Number.isFinite(step.loadFactor) || !Number.isFinite(step.controlDisplacement)) return false;
    iterations += step.iterations;
  }
  return result.totalIterations === iterations &&
    result.finalLoadFactor === (result.steps.at(-1)?.loadFactor ?? 0);
}

export function validateFullResult(full: RawResult, requestedSteps: number): void {
  if (!summaryMatchesSteps(full, requestedSteps)) throw new Error('Invalid full result');
}

export function validatePrefix(full: RawResult, prefix: RawResult, k: number, nodeIds: number[], requestedSteps: number) {
  validateFullResult(full, requestedSteps);
  if (!summaryMatchesSteps(prefix, k) || !prefix.converged ||
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
