import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = process.argv.slice(2).flatMap(path => JSON.parse(readFileSync(path, 'utf8')));
assert.ok(cases.length > 0);
function verify(actual, expected, path = 'result') {
  if (typeof expected === 'number') {
    assert.ok(Number.isFinite(actual));
    assert.ok(Object.is(actual, expected), `${path}: ${Object.is(actual, -0) ? "-0" : actual} != ${Object.is(expected, -0) ? "-0" : expected}`);
  } else if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length);
    expected.forEach((value, index) => verify(actual[index], value, `${path}[${index}]`));
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const key of Object.keys(expected)) verify(actual[key], expected[key], `${path}.${key}`);
  } else {
    assert.equal(actual, expected);
  }
}
for (const c of cases) {
  if (c.error) {
    assert.throws(() => engine[c.api](c.inputText ?? JSON.stringify(c.input)), error => String(error).includes(c.error));
    continue;
  }
  const result = JSON.parse(engine[c.api](c.inputText ?? JSON.stringify(c.input)));
  assert.equal(result.converged, c.requiredConvergence ?? c.expected.converged);
  verify(result, c.expected);
  if (c.expected.converged) {
    const wrong = structuredClone(result);
    wrong.converged = false;
    assert.throws(() => verify(wrong, c.expected));
    const nonzero = wrong.results.displacements.find(d => Math.abs(d.ux) + Math.abs(d.uz) > 0);
    assert.ok(nonzero);
    wrong.converged = true;
    nonzero.ux = (nonzero.ux || nonzero.uz) * 2;
    assert.throws(() => verify(wrong, c.expected));
  }
}
console.log(`SSI elastic refinement: ${cases.length} public WASM cases passed`);
