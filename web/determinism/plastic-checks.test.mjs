import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as wasm from '../src/lib/wasm/dedaliano_engine.js';
import { loadFixtures, wasmDir } from './node-run.mjs';
import { plain } from './cases.mjs';
import { requirementProblems } from './checks.mjs';

wasm.initSync({ module: readFileSync(resolve(wasmDir, 'dedaliano_engine_bg.wasm')) });
const fixtures = loadFixtures();
const cases = ['plastic-2d-portal', 'plastic-2d-continuous'].map(id => ({
  name: id + '/certify_plastic_2d',
  text: 'OK',
  value: plain(wasm.certify_plastic_2d(JSON.stringify(fixtures[id]))),
}));

for (const row of cases) {
  const other = cases.filter(r => r !== row);
  const problems = rows => requirementProblems(rows).filter(p => p.includes(row.name.split('/')[0]) && p.includes('certify_plastic_2d'));
  test('accepts the released solver result for ' + row.name, () => {
    assert.deepEqual(problems(cases), []);
  });
  for (const mutation of ['missing case', 'missing results', 'outside bounds', 'mismatched solver', 'inverted bounds']) {
    test('known wrong result: #758 ' + row.name + ' ' + mutation, () => {
      const copy = structuredClone(row);
      const { results, certificate } = copy.value;
      if (mutation === 'missing results') delete copy.value.results;
      if (mutation === 'outside bounds') results.collapseFactor = certificate.solverCollapseFactor = certificate.lambdaUpper * 2;
      if (mutation === 'mismatched solver') certificate.solverCollapseFactor = results.collapseFactor / 2;
      if (mutation === 'inverted bounds') certificate.lambdaLower = certificate.lambdaUpper * 2;
      assert.ok(problems(mutation === 'missing case' ? other : [...other, copy]).length);
    });
  }
}
