import assert from 'node:assert/strict';

export function assertUnloadedStages(result, input, stages, dimension, zero) {
  for (const stage of result.stages) {
    assert.ok(!(stage.results.structuredDiagnostics ?? []).some(d => d.phase === 'NUM-INVARIANCE'), JSON.stringify(stage));
    assert.ok(stage.results.displacements.every(d => zero ? d.ux === 0 : Number.isFinite(d.ux)));
  }
}
