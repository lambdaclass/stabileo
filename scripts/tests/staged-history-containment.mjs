import assert from 'node:assert/strict';

export function assertHistoryWithheld(result) {
  for (const group of ['reactions', 'elementForces', 'constraintForces', 'plateStresses', 'quadStresses', 'quadNodalStresses']) {
    if (result[group]) assert.deepEqual(result[group], [], group);
  }
  for (const phase of ['stageResults', 'reactions', 'elementForces', 'constraintForces']) {
    assert.ok(result.structuredDiagnostics.some(d => d.code === 'result_quantity_unavailable' && d.severity === 'warning' && d.phase === phase && d.message.includes('active stiffness changed')), phase);
  }
  assert.ok(result.structuredDiagnostics.some(d => d.phase === 'stageResults' && d.message.includes('not a certified equilibrium solution')));
}
