import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const fixture = (name) => JSON.parse(readFileSync(new URL(`../../engine/tests/fixtures/${name}`, import.meta.url)));
const input = fixture('buckling-741-compressed.json');
for (const count of [1, 3]) {
  const raw = JSON.parse(engine.solve_buckling_3d(JSON.stringify(input), count));
  const factor = raw.modes[0].loadFactor;
  assert.ok(1.208795360470504 <= factor && factor <= 1.208795360470958, `${factor} outside exact bracket`);
  const out = JSON.parse(engine.certify_buckling_3d(JSON.stringify(input), count));
  assert.equal(out.results.modes[0].loadFactor, factor);
  assert.equal(out.certificate.status, 'certified');
  assert.ok(out.certificate.lambdaLower <= factor && factor <= out.certificate.lambdaUpper);
}
for (const entry of ['solve_buckling_3d', 'certify_buckling_3d']) {
  assert.throws(() => engine[entry](JSON.stringify(fixture('buckling-741.json')), 1), /Buckling not determinable.*element 3/);
}
for (const { dimension, ratio, expected, input } of fixture('buckling-818-family.json')) {
  const json = JSON.stringify(input);
  const raw = JSON.parse(engine[`solve_buckling_${dimension}d`](json, 2));
  const out = JSON.parse(engine[`certify_buckling_${dimension}d`](json, 2));
  assert.equal(out.certificate.status, 'certified');
  const certifyResult = engine[`certify_buckling_result_${dimension}d`];
  assert.equal(JSON.parse(certifyResult(json, JSON.stringify(raw))).certificate.status, 'certified');
  const perturbed = structuredClone(raw);
  perturbed.modes[0].loadFactor *= 1.000001;
  assert.throws(() => certifyResult(json, JSON.stringify(perturbed)), /BU-BOUND/);
  for (const [i, multiple] of [1, ratio].entries()) {
    const factor = raw.modes[i].loadFactor;
    assert.ok(Math.abs(factor / (expected * multiple) - 1) < 1e-6, `${dimension}D ratio=${ratio}: ${factor}`);
    assert.equal(out.results.modes[i].loadFactor, factor);
  }
}

for (const { dimension, input, kind } of [...fixture('buckling-818-constrained.json'), ...fixture('buckling-818-structures.json')]) {
  const json = JSON.stringify(input);
  const raw = JSON.parse(engine[`solve_buckling_${dimension}d`](json, 1));
  const certified = JSON.parse(engine[`certify_buckling_${dimension}d`](json, 1));
  assert.equal(certified.results.modes[0].loadFactor, raw.modes[0].loadFactor);
  assert.equal(certified.certificate.status, 'certified');
  assert.equal(JSON.parse(engine[`certify_buckling_result_${dimension}d`](json, JSON.stringify(raw))).certificate.status, 'certified');
  const expected = kind ? (kind === 'solid shell strip' ? 0.27449776038400286 : 39.99999999568) : 47.57901233095258;
  assert.ok(Math.abs(raw.modes[0].loadFactor / expected - 1) < 1e-12);
}
console.log('buckling #818: WASM brackets, containment, constrained frames, inclined frame and shell passed');

for (const { dimension, input } of fixture('buckling-818-constrained-sparse.json')) {
  test(`known wrong result: #818: ${dimension}D constrained sparse completeness`, () => {
    const json = JSON.stringify(input);
    const isolated = structuredClone(input);
    isolated.nodes = Object.fromEntries(Object.entries(input.nodes).filter(([id]) => ['5', '6'].includes(id)));
    isolated.elements = { 4: input.elements['4'] };
    isolated.supports = Object.fromEntries(Object.entries(input.supports).filter(([id]) => ['5', '6'].includes(id)));
    isolated.loads = input.loads.filter(l => l.data.nodeId === 6);
    isolated.constraints = input.constraints.filter(c => c.terms?.every(t => t.nodeId === 6));
    const second = JSON.parse(engine[`solve_buckling_${dimension}d`](JSON.stringify(isolated), 1)).modes[0].loadFactor;
    for (const count of [1, 2]) {
      const raw = JSON.parse(engine[`solve_buckling_${dimension}d`](json, count));
      const certified = JSON.parse(engine[`certify_buckling_${dimension}d`](json, count));
      assert.ok(Math.abs(raw.modes[0].loadFactor / 47.57901233095258 - 1) < 1e-12);
      assert.equal(raw.modes.length, count);
      assert.equal(certified.certificate.status, 'certified');
      if (count === 2) assert.ok(Math.abs(raw.modes[1].loadFactor / second - 1) < 1e-12);
      assert.deepEqual(certified.results, raw);
      assert.deepEqual(JSON.parse(engine[`certify_buckling_result_${dimension}d`](json, JSON.stringify(raw))), certified);
    }
  });
}

for (const { dimension, sparse, input } of fixture('buckling-818-coupled.json')) {
  test.skip(`known wrong result: #818: ${dimension}D coupled constrained sparse=${sparse}`, () => {
    const json = JSON.stringify(input);
    for (const count of [1, 2]) {
      const raw = JSON.parse(engine[`solve_buckling_${dimension}d`](json, count));
      const certified = JSON.parse(engine[`certify_buckling_${dimension}d`](json, count));
      assert.equal(certified.certificate.status, 'certified');
      assert.equal(raw.modes.length, count);
      for (let i = 0; i < count; i++) assert.ok(Math.abs(raw.modes[i].loadFactor / [21.52873226079837, 41.80506272171481][i] - 1) < 1e-12);
      assert.deepEqual(certified.results, raw);
      assert.deepEqual(JSON.parse(engine[`certify_buckling_result_${dimension}d`](json, JSON.stringify(raw))), certified);
    }
  });
}

test.skip('known wrong result: #818: curved-beam certification uses expanded constraint coordinates', () => {
  const input = fixture('buckling-818-curved.json');
  const json = JSON.stringify(input);
  const raw = engine.solve_buckling_3d(json, 1);
  const supplied = JSON.parse(engine.certify_buckling_result_3d(json, raw));
  const solved = JSON.parse(engine.certify_buckling_3d(json, 1));
  assert.equal(supplied.certificate.status, 'certified');
  assert.deepEqual(supplied, solved);
});
