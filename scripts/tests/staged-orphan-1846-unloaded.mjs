import assert from 'node:assert/strict';

export function assertUnloadedStages(result, input, stages, dimension) {
  assert.equal(result.stages.length, stages.length, 'stage count');
  const expectedNodes = Object.values(input.nodes).map(n => n.id).sort((a, b) => a - b);
  const fields = dimension === 2 ? ['ux', 'uz', 'ry'] : ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  for (const [label, output] of [
    ...result.stages.map((stage, i) => [`stage ${i}`, stage.results]),
    ['finalResults', result.finalResults],
  ]) {
    assert.deepEqual(output.displacements.map(d => d.nodeId).sort((a, b) => a - b), expectedNodes, `${label}: node IDs`);
    assert.ok(!(output.structuredDiagnostics ?? []).some(d => d.phase === 'NUM-INVARIANCE'), `${label}: ${JSON.stringify(output)}`);
    for (const d of output.displacements) {
      for (const field of fields) {
        assert.ok(Number.isFinite(d[field]), `${label}: node ${d.nodeId} ${field} must be finite`);
        assert.ok(d[field] === 0, `${label}: node ${d.nodeId} ${field} must be zero without loads`);
      }
    }
  }
}
