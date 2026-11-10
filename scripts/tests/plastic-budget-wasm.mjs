import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, certify_plastic_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';

const wasm = readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url));
initSync({ module: wasm });
const artifact = readFileSync(process.argv[2]);
const expected = process.argv[3];
assert.equal(artifact[0] % 4, 3);
let refusal;
try {
  certify_plastic_3d(artifact.subarray(2).toString('utf8'));
} catch (error) {
  refusal = String(error);
}
assert.ok(refusal, 'the checked WASM entry point must refuse this model');
assert.ok(refusal.includes(expected), refusal);
console.log(`${process.argv[2]}: WASM refused ${expected}`);
