import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';
engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/prescribed-master-2008.json', import.meta.url)));
const fields = dim => dim === 2 ? ['dx','dz','dry'] : ['dx','dy','dz','drx','dry','drz'];
const wrapper = (solver, method) => ({solver,densities:{1:7850},timeStep:0.001,nSteps:2,method,alpha:method === 'hht' ? -0.1 : null});
let refusals = 0;
for (const dim of [2,3]) {
  const model = structuredClone(cases.find(c => c.dim === dim && c.fillers === 1 && !c.rotation).model);
  for (const support of Object.values(model.supports)) for (const field of fields(dim)) delete support[field];
  for (const method of ['newmark','hht']) {
    const absent = JSON.parse(engine[`solve_time_history_${dim}d`](JSON.stringify(wrapper(model,method))));
    assert.ok(absent.nodeHistories.some(h => h.ux.some(u => u !== 0)));
    for (const entry of ['solve_time_history','certify_time_history']) {
      for (const zero of [-0,0]) {
        const solver = structuredClone(model);
        for (const support of Object.values(solver.supports)) for (const field of fields(dim)) support[field] = zero;
        const result = JSON.parse(engine[`${entry}_${dim}d`](JSON.stringify(wrapper(solver,method))));
        assert.deepEqual(result.results ?? result,absent);
      }
      for (const field of fields(dim)) for (const motion of [-0.0013,-1e-16,-Number.MIN_VALUE,Number.MIN_VALUE,1e-16,0.0013]) {
        const solver = structuredClone(model);
        solver.supports[2][field] = motion;
        assert.throws(() => engine[`${entry}_${dim}d`](JSON.stringify(wrapper(solver,method))), error => {
          const refusal = JSON.parse(String(error));
          assert.match(refusal.message,/prescribed support displacements/);
          assert.equal(refusal.structuredDiagnostics.length,1);
          const diagnostic = refusal.structuredDiagnostics[0];
          assert.equal(diagnostic.code,'unsupported_feature');
          assert.equal(diagnostic.severity,'error');
          assert.equal(diagnostic.phase,'input');
          return true;
        });
        refusals++;
      }
    }
  }
}
const spring = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/cause-c-replay.json', import.meta.url)))['1463'];
for (const entry of ['solve_time_history','certify_time_history']) {
  assert.throws(() => engine[`${entry}_3d`](JSON.stringify(wrapper(spring,'newmark'))), error => {
    const diagnostic = JSON.parse(String(error)).structuredDiagnostics[0];
    assert.equal(diagnostic.code,'conflicting_support_spring');
    assert.deepEqual(diagnostic.nodeIds,[11]);
    assert.deepEqual(diagnostic.dofIndices,[0]);
    return true;
  });
}
console.log(`Time history: ${refusals} structured motion refusals, loaded zero controls and original spring refusals checked`);
