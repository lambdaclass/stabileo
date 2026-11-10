import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, certify_plastic_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';

const wasm = readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url));
initSync({ module: wasm });
const artifact = readFileSync(process.argv[2]);
const expected = process.argv[3];
assert.equal(artifact[0] % 4, 3);
let output;
let refusal;
try {
  output = JSON.parse(certify_plastic_3d(artifact.subarray(2).toString('utf8')));
} catch (error) {
  refusal = String(error);
}
if (expected === 'certified-lower' || expected === 'certified-lower-above') {
  assert.equal(refusal, undefined);
  assert.equal(output.certificate.certified, true);
  assert.equal(output.results.collapseFactor, output.certificate.lambdaLower);
  assert.equal(output.certificate.solverWithinBounds, false);
  if (expected === 'certified-lower-above') {
    assert.ok(output.certificate.solverCollapseFactor > output.certificate.lambdaUpper);
  } else {
    assert.ok(output.certificate.solverCollapseFactor < output.certificate.lambdaLower);
  }
  assert.ok(output.results.warnings.some((warning) => warning.includes('certified lower bound')));
  assert.ok(output.results.warnings.some((warning) => warning.includes('PL-3D-CERTIFICATE-MISMATCH')
    && warning.includes(String(output.certificate.solverCollapseFactor))
    && warning.includes(`[${output.certificate.lambdaLower}, ${output.certificate.lambdaUpper}]`)));
  assert.ok(output.results.structuredDiagnostics.some((diagnostic) =>
    diagnostic.phase === 'PL-3D-CERTIFICATE-MISMATCH' && diagnostic.severity === 'warning'
    && diagnostic.message.includes('outside the certified interval')
    && diagnostic.message.includes(String(output.certificate.solverCollapseFactor))
    && diagnostic.message.includes(`[${output.certificate.lambdaLower}, ${output.certificate.lambdaUpper}]`)));
  assert.ok(Array.isArray(output.results.steps) && Array.isArray(output.results.hinges));
  assert.equal(typeof output.results.isMechanism, 'boolean');
  console.log(`${process.argv[2]}: WASM returned certified lower bound and raw mismatch warning`);
} else {
  assert.ok(refusal, 'the checked WASM entry point must refuse this model');
  assert.ok(refusal.includes(expected), refusal);
  console.log(`${process.argv[2]}: WASM refused ${expected}`);
}
