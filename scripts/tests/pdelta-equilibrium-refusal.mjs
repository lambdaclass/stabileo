import assert from 'node:assert/strict';

export function assertPDeltaEquilibriumRefusal(error, tolerance) {
  const refusal = JSON.parse(String(error));
  assert.equal(refusal.structuredDiagnostics.length, 1);
  const [diagnostic] = refusal.structuredDiagnostics;
  assert.equal(diagnostic.code, 'result_quantity_unavailable');
  assert.equal(diagnostic.severity, 'error');
  assert.equal(diagnostic.phase, 'equilibrium');
  assert.equal(diagnostic.threshold, tolerance);
  assert.ok(Number.isFinite(diagnostic.value) && diagnostic.value > tolerance);
  return true;
}
