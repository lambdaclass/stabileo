import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { initSync, solve_plastic_3d, certify_plastic_3d, solve_plastic_2d, certify_plastic_2d } from '../../web/src/lib/wasm/dedaliano_engine.js';

initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const root = resolve(process.argv[2] ?? '.1040-wasm-cases');
const cases = readdirSync(root).filter(name => name.endsWith('.json'));
assert.ok(cases.length >= 6);
const failures = [];
const run = (name, check) => {
  try { check(); console.log(`${name}: passed`); }
  catch (error) { failures.push(`${name}: ${error}`); }
};
for (const name of cases) {
  const { input, lower, upper } = JSON.parse(readFileSync(resolve(root, name), 'utf8'));
  for (const [entry, solve] of [['solve_plastic_3d', solve_plastic_3d], ['certify_plastic_3d', certify_plastic_3d]]) {
    run(`${name}/${entry}`, () => {
      const output = JSON.parse(solve(JSON.stringify(input)));
      const result = output.results ?? output;
      console.log(JSON.stringify({ name, entry, factor: result.collapseFactor, lower, upper }));
      assert.ok(result.collapseFactor >= lower && result.collapseFactor <= upper);
    });
  }
}
const binary = name => readFileSync(new URL(`../../engine/fuzz/corpus-regressions/plastic-lp-budget/${name}.bin`, import.meta.url)).subarray(2).toString('utf8');
for (const solve of [solve_plastic_3d, certify_plastic_3d]) {
  run(`${solve.name}/control`, () => {
    const text = binary('good-cantilever');
    const checked = JSON.parse(certify_plastic_3d(text));
    const output = JSON.parse(solve(text));
    assert.equal((output.results ?? output).collapseFactor, checked.certificate.lambdaLower);
  });
  run(`${solve.name}/wide-interval`, () => {
    assert.throws(() => solve(binary('issue-1459')), /plastic collapse interval/);
  });
}
const planar = readFileSync(new URL('../../verify/samples/plastic-2d-portal.input.json', import.meta.url), 'utf8');
for (const solve of [solve_plastic_2d, certify_plastic_2d]) {
  run(`${solve.name}/2d-refusal`, () => assert.throws(() => solve(planar), /PL-2D-INVARIANCE/));
}
assert.deepEqual(failures, []);
