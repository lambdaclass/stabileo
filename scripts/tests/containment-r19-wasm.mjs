import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
let count = 0;
for (const dim of [2, 3]) {
  const cases = JSON.parse(readFileSync(`${process.argv[2]}-${dim}.json`));
  for (const { model, expected } of cases) {
    for (const entry of ['solve_pdelta', 'certify_pdelta']) {
      const out = JSON.parse(engine[`${entry}_${dim}d`](JSON.stringify(model), 100, 1e-12));
      const solved = entry === 'certify_pdelta' ? out.results : out;
      assert.equal(solved.converged, true);
      assert.equal(solved.results.equilibrium.residualOk, true);
      assert.ok(!solved.results.structuredDiagnostics?.some(d => d.code === 'result_quantity_unavailable'));
      const tip = solved.results.displacements.find(d => d.nodeId === 2);
      const scale = Math.max(...Object.entries(expected).filter(([k]) => k !== 'nodeId').map(([,v]) => Math.abs(v)));
      for (const [key, value] of Object.entries(expected)) {
        if (key !== 'nodeId') assert.ok(Math.abs(tip[key] - value) <= 1e-10 * scale, `${entry} ${dim}D ${key}: ${tip[key]} != ${value}`);
      }
      assert.throws(() => engine[`${entry}_${dim}d`](JSON.stringify(model), 0, 1e-12), error => {
        if (typeof error !== 'string') return false;
        if (error.startsWith('non-finite number in the results')) return true;
        const refusal = JSON.parse(error);
        return refusal.structuredDiagnostics?.some(d => d.code === 'non_finite_result' && d.severity === 'error');
      });
      count++;
    }
  }
  const soilCases = JSON.parse(readFileSync(`${process.argv[3]}-${dim}.json`));
  for (const input of soilCases) {
    const out = JSON.parse(engine[`solve_ssi_${dim}d`](JSON.stringify(input)));
    assert.equal(out.converged, true);
    const applied = input.solver.loads.reduce((sum,l) => sum + l.data.fz, 0);
    const support = out.results.reactions.reduce((sum,r) => sum + r[dim === 2 ? 'rz' : 'fz'], 0);
    const soil = out.springResults.reduce((sum,r) => sum + r.reaction, 0);
    assert.ok(Math.abs(applied + support - soil) < 1e-7, `${dim}D: ${applied} + ${support} - ${soil}`);
    if (applied !== 0) { assert.ok(Math.abs(soil) > 1e-6); assert.ok(Math.abs(support) > 1e-6); }
    count++;
  }
}
console.log(`PASS ${count} native/WASM physical-residual and independent SSI balance checks`);
