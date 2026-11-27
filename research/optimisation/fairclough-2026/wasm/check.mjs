import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root=path.resolve(process.argv[2] ?? 'web/public/research-wasm/fairclough-2026');
const module=await import(pathToFileURL(path.join(root,'gridshell_fairclough_2026.js')));
await module.default({module_or_path:fs.readFileSync(path.join(root,'gridshell_fairclough_2026_bg.wasm'))});
const result=JSON.parse(module.recompute(1.65));
const evidenceRoot = new URL('../', import.meta.url);
const recorded = JSON.parse(fs.readFileSync(new URL('results/stabileo_results.json', evidenceRoot))).layout;
const published = JSON.parse(fs.readFileSync(new URL('reference-results/published_comparison.json', evidenceRoot))).checks;
const weights = ['1.65', '1.68', '1.72', '1.76', '1.80', '1.85', '2.00'];
assert.deepEqual(published.map(row => row.id).sort(), weights.map(weight => 'table1-v5-' + weight));
for (const row of published) {
  const weight = Number(row.id.slice('table1-v5-'.length));
  const volume = JSON.parse(module.recompute(weight)).volume;
  assert.ok(Math.abs(volume-row.computed)<=1e-8*row.computed, row.id);
  assert.ok(Math.abs(volume-row.reference)<=row.tolerance, row.id);
}
for (const weight of [0, -1, NaN, Infinity, -Infinity, 2.5]) assert.throws(() => module.recompute(weight), /outside/);
assert.ok(Number.isFinite(JSON.parse(module.recompute(2.2)).volume));
function close(actual, expected) {
  if (typeof expected === 'number') {
    assert.ok(Number.isFinite(actual));
    assert.ok(Math.abs(actual-expected)<=1e-8*Math.max(1,Math.abs(expected)));
  } else if (Array.isArray(expected)) {
    assert.equal(actual.length,expected.length);
    expected.forEach((value,i)=>close(actual[i],value));
  } else {
    assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort());
    for (const key of Object.keys(expected)) close(actual[key],expected[key]);
  }
}
close(result,recorded);
assert.ok(result.curves.every(c=>c.every(p=>p[3]>0)));
assert.ok(result.primal_residual>=0 && result.dual_residual>=0);
assert.equal(result.curves.length,4);
assert.ok(result.primal_residual<1e-8);
assert.ok(result.dual_residual<1e-8);
console.log('Fairclough WASM:',result.volume,'four curves; conic residuals pass');
