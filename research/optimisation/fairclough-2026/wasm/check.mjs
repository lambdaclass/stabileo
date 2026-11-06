import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root=path.resolve(process.argv[2] ?? 'web/public/research-wasm/fairclough-2026');
const module=await import(pathToFileURL(path.join(root,'gridshell_fairclough_2026.js')));
await module.default({module_or_path:fs.readFileSync(path.join(root,'gridshell_fairclough_2026_bg.wasm'))});
const result=JSON.parse(module.recompute());
const evidenceRoot = new URL('../', import.meta.url);
const recorded = JSON.parse(fs.readFileSync(new URL('results/stabileo_results.json', evidenceRoot))).layout;
const published = JSON.parse(fs.readFileSync(new URL('reference-results/published_comparison.json', evidenceRoot))).checks[0];
assert.ok(Math.abs(result.volume-published.reference)<published.tolerance);
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
