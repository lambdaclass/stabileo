import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const fixture = name => readFileSync(new URL(`../../engine/tests/fixtures/${name}.json`, import.meta.url), 'utf8');

function physicalResidualRefusal(error) {
  const refusal = JSON.parse(String(error));
  const diagnostic = refusal.structuredDiagnostics[0];
  assert.equal(diagnostic.code, 'result_quantity_unavailable');
  assert.equal(diagnostic.severity, 'error');
  assert.equal(diagnostic.phase, 'equilibrium');
  assert.equal(diagnostic.threshold, 1e-8);
  assert.ok(Number.isFinite(diagnostic.value) && diagnostic.value > diagnostic.threshold);
  assert.match(refusal.message, /physical free-DOF residual/);
  return true;
}

test('#2100 the exact nightly model retains its linear WASM result', () => {
  const input = JSON.parse(fixture('issue-2100-pdelta'));
  const result = engine.solve_3d(input);
  assert.equal(result.displacements.length, Object.keys(input.nodes).length);
  assert.equal(result.reactions.length, Object.keys(input.supports).length);
  assert.ok(result.reactions.every(({ fx, fy, fz, mx, my, mz }) =>
    [fx, fy, fz, mx, my, mz].every(Number.isFinite)));
});

for (const entry of [engine.solve_pdelta_3d, engine.certify_pdelta_3d]) {
  test(`#2100 ${entry.name} refuses the exact nightly input at physical equilibrium`, () => {
    assert.throws(() => entry(fixture('issue-2100-pdelta'), 31, 1e-8), physicalResidualRefusal);
  });
}

for (const dim of [2, 3]) {
  const model = JSON.parse(fixture(`reaction-recovery-${dim}d`));
  const solve = engine[`solve_pdelta_${dim}d`];
  const certify = engine[`certify_pdelta_${dim}d`];
  const linear = engine[`solve_${dim}d`];
  const reaction = dim === 2 ? 'rz' : 'fz';
  const load = model.loads[0].data;
  const check = result => {
    assert.equal(result.reactions.length, 1);
    assert.ok(Math.abs(result.reactions[0][reaction] + load.fz) < 1e-12);
    assert.equal(result.equilibrium.residualOk, true);
  };

  test(`#2100 ${dim}D zero-axial control keeps its reaction without a correction`, () => {
    const text = JSON.stringify(model);
    check(linear(model));
    check(JSON.parse(solve(text, 0, 1e-8)).results);
    check(JSON.parse(certify(text, 0, 1e-8)).results.results);
  });

  for (const entry of [solve, certify]) {
    test(`#2100 ${entry.name} refuses an unbalanced iterate`, () => {
      const loaded = structuredClone(model);
      loaded.loads[0].data.fx = -3;
      assert.throws(() => entry(JSON.stringify(loaded), 0, 1e-8), physicalResidualRefusal);
    });
  }
}
