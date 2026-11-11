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
  const expected = kind ? (kind === 'solid shell strip' ? null : 39.99999999568) : 47.57901233095258;
  if (expected !== null) assert.ok(Math.abs(raw.modes[0].loadFactor / expected - 1) < 1e-12);
}
console.log('buckling #818: WASM brackets, containment, constrained frames, inclined frame and shell passed');
