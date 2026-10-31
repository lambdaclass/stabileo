import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [dir] = process.argv.slice(2);
const glue = await import(pathToFileURL(join(dir, 'form.js')).href);
glue.initSync({ module: readFileSync(join(dir, 'form_bg.wasm')) });
for (const [q, load] of [[1, 4], [.5, 4], [2, 4], [1, 1], [1, 8]]) {
  const form = JSON.parse(glue.form_find(q, load));
  const h = load / (4 * q);
  assert.ok(Math.abs(form.nodes[0][2] + h) < 1e-12);
  assert.ok(form.forces.every(f => Math.abs(f - q * Math.sqrt(8 + h * h)) < 1e-12));
  assert.ok(form.residual < 1e-12);
}
assert.throws(() => glue.form_find(0, 4));
assert.throws(() => glue.form_find(1, NaN));
console.log('Pastrana WASM: five equilibria and invalid-input checks passed');
