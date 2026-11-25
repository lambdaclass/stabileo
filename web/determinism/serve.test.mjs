/**
 * The determinism server serves only its page, the listed fixtures and files inside its two
 * roots. `node --test determinism/serve.test.mjs` from web/ (run by the CI determinism job).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { fileFor } from './serve.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));

test('serves the page, the harness and the wasm build', () => {
  assert.equal(fileFor('/'), resolve(here, 'index.html'));
  assert.equal(fileFor('/determinism/cases.mjs'), resolve(here, 'cases.mjs'));
  assert.equal(fileFor('/wasm/dedaliano_engine.js'), resolve(here, '../src/lib/wasm/dedaliano_engine.js'));
  assert.equal(fileFor('/repo/engine/tests/fixtures/certificates/combo-2d-frame.input.json'), resolve(here, '../../engine/tests/fixtures/certificates/combo-2d-frame.input.json'));
});

test('refuses anything outside its roots', () => {
  for (const p of [
    '/wasm//etc/passwd', '/wasm/%2Fetc%2Fpasswd', '/determinism//etc/passwd',
    '/wasm/../../../etc/passwd', '/wasm/%2e%2e/%2e%2e/package.json', '/determinism/..%2F..%2FCargo.toml',
    '/wasm/..\\..\\x', '/wasm/a%00b', '/wasm/%E0%A4%A', '/wasm/', '/etc/passwd', '/__proto__/x', '/constructor/x',
    '/repo/verify/samples/combo-2d-frame.input.json', '/repo/Cargo.toml', '/repo/../etc/passwd', '/repo//etc/passwd',
  ]) {
    assert.equal(fileFor(p), null, p);
  }
});
