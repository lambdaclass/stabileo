import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.ok(cases.some(item => item.refuses) && cases.some(item => !item.refuses));
for (const [index, { input, refuses }] of cases.entries()) {
  const args = JSON.stringify(input);
  const raw = () => JSON.parse(engine.solve_modal_3d(args, 6));
  const certified = () => JSON.parse(engine.certify_modal_3d(args, 6));
  if (refuses) {
    const expected = error => /mechanism|conditioning/i.test(String(error));
    assert.throws(raw, expected, String(index));
    assert.throws(certified, expected, String(index));
  } else {
    const result = raw();
    assert.equal(result.modes.length, 3, String(index));
    assert.deepEqual(certified().results, result, String(index));
  }
}
