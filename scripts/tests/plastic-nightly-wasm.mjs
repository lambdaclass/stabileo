import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, solve_plastic_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';

initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const input = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/plastic-1953-min.json', import.meta.url)));
const output = JSON.parse(solve_plastic_3d(JSON.stringify(input)));
assert.ok(Number.isFinite(output.collapseFactor));
const original = readFileSync(new URL('../../engine/tests/fixtures/plastic-1953-nightly.bin', import.meta.url));
const originalOutput = JSON.parse(solve_plastic_3d(original.subarray(2).toString('utf8')));
assert.ok(Number.isFinite(originalOutput.collapseFactor));
const canonical = structuredClone(input);
canonical.solver.elements = Object.fromEntries(Object.values(canonical.solver.elements).map(element => [String(element.id), element]));
const reference = JSON.parse(solve_plastic_3d(JSON.stringify(canonical)));
assert.equal(output.collapseFactor, reference.collapseFactor);
console.log('plastic nightly artifact and minimum: WASM agrees with canonical member IDs');
