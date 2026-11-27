import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const prefix = process.argv[2];
const findings = result => (result.structuredDiagnostics ?? []).filter(d => d.phase?.startsWith('LIN-SECOND-ORDER'));
for (const outcome of ['bounded', 'over']) {
  const models = JSON.parse(readFileSync(prefix + '-' + outcome + '.json', 'utf8'));
  for (const [index, model] of models.entries()) {
    const dim = index + 2;
    const single = engine[`solve_${dim}d`](model);
    assert.deepEqual(findings(single).map(d => [d.phase, d.elementIds]), outcome === 'bounded' ? [] : [['LIN-SECOND-ORDER', [1, 2]]]);
    delete model.supports[3];
    const loads = [{ type: 'nodal', data: { nodeId: 3, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } }];
    const multi = engine[`solve_multi_case_${dim}d`]({
      solver: model, loadCases: [{ name: 'A', loads }], combinations: [{ name: 'C', factors: { A: 1 } }],
    });
    assert.equal(multi.caseResults.length, 1);
    assert.equal(multi.combinationResults.length, 1);
    for (const entry of [...multi.caseResults, ...multi.combinationResults]) {
      assert.ok(findings(entry.results).some(d => d.phase === 'LIN-SECOND-ORDER-UNBOUNDED'), dim + 'D ' + entry.name);
    }
  }
}
