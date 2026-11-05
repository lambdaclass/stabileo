import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashBundle } from './check-wasm-outputs.mjs';

function bundle(last) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-bundle-'));
  writeFileSync(join(dir, 'glue.js'), `export default async function init() {}
export function initSync() {}
export class Solver { constructor() { this.__wbg_ptr = 1; } run() { return new Float64Array([0.1, ${last}]); } summary() { return JSON.stringify({ last: ${last} }); } }
export function config() { return '{"n":2}'; }`);
  writeFileSync(join(dir, 'check.mjs'), `import { pathToFileURL } from 'node:url';
const glue = await import(pathToFileURL(process.argv[2] + '/glue.js').href);
glue.initSync();
const s = new glue.Solver(glue.config());
if (s.run().length !== 2) process.exit(1);
s.summary();`);
  return { dir, spec: { glue: 'glue.js', check: (d) => [join(dir, 'check.mjs'), d] } };
}

test('one bit of one returned float changes the hash; the same outputs give the same hash', async () => {
  const a = bundle('0.3'), b = bundle('0.3'), c = bundle('0.30000000000000004');
  const ha = await hashBundle(a.dir, a.spec), hb = await hashBundle(b.dir, b.spec), hc = await hashBundle(c.dir, c.spec);
  assert.equal(ha.hash, hb.hash);
  assert.equal(ha.values, 3);
  assert.notEqual(ha.hash, hc.hash);
});

test('a failing check fails instead of producing a hash', async () => {
  const { dir, spec } = bundle('0.3');
  writeFileSync(join(dir, 'check.mjs'), 'process.exit(3);');
  await assert.rejects(hashBundle(dir, spec), /check failed \(exit 3\)/);
});
