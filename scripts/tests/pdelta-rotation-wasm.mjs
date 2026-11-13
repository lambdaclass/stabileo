import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.ok(cases.length > 0);
function check(result, expected) {
  assert.equal(result.converged, expected.converged);
  const spatial = 'uy' in expected.results.displacements[0];
  for (const [field, groups] of [
    ['displacements', [['ux', 'uy', 'uz'], ['rx', 'ry', 'rz']]],
    ['reactions', spatial ? [['fx', 'fy', 'fz'], ['mx', 'my', 'mz']] : [['rx', 'rz'], ['my']]],
  ]) {
    const references = expected.results[field];
    assert.equal(result.results[field].length, references.length);
    for (const keysForKind of groups) {
      const scale = Math.max(0, ...references.flatMap(d => keysForKind.map(k => Math.abs(d[k] ?? 0))));
      for (const reference of references) {
        const actual = result.results[field].find(d => d.nodeId === reference.nodeId);
        assert.ok(actual);
        for (const k of keysForKind) {
          if (k in reference) assert.ok(Number.isFinite(actual[k]) && Math.abs(actual[k] - reference[k]) <= 1e-10 * scale, `${field} ${reference.nodeId} ${k}: ${actual[k]} != ${reference[k]}`);
        }
      }
    }
  }
}
let checked = 0;
for (const fixture of cases) {
  if (fixture.expected.refused) {
    assert.throws(() => engine[fixture.api](JSON.stringify(fixture.input), fixture.maxIter, 1e-12), fixture.api.startsWith('certify_') ? /non-finite/ : /non_finite_result/);
    checked++;
    continue;
  }
  let result;
  if (/^solve_[23]d$/.test(fixture.api)) {
    result = { converged: true, results: engine[fixture.api](fixture.input) };
  } else {
    result = JSON.parse(engine[fixture.api](JSON.stringify(fixture.input), fixture.maxIter, 1e-12));
    if (fixture.api.startsWith('certify_')) result = result.results;
  }
  check(result, fixture.expected);
  if (fixture.expected.converged && fixture.maxIter === 100) {
    const wrong = structuredClone(result);
    for (const d of wrong.results.displacements) for (const k of ['ux', 'uy', 'uz', 'rx', 'ry', 'rz']) if (k in d) d[k] = 0;
    assert.throws(() => check(wrong, fixture.expected));
  }
  checked++;
}
console.log(`P-Delta rotation: ${checked} WASM API/limit/control cases passed`);
