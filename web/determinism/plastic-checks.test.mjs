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
  for (const mutation of ['missing case', 'missing results', 'outside bounds', 'below lower', 'uncertified', 'mismatched solver', 'inverted bounds']) {
    test('known wrong result: #758 ' + row.name + ' ' + mutation, () => {
      const copy = structuredClone(row);
      const { results, certificate } = copy.value;
      if (mutation === 'missing results') delete copy.value.results;
      if (mutation === 'uncertified') certificate.certified = false;
      if (mutation === 'below lower') results.collapseFactor = certificate.solverCollapseFactor = certificate.lambdaLower / 2;
      if (mutation === 'outside bounds') results.collapseFactor = certificate.solverCollapseFactor = certificate.lambdaUpper * 2;
      if (mutation === 'mismatched solver') certificate.solverCollapseFactor = results.collapseFactor / 2;
      if (mutation === 'inverted bounds') certificate.lambdaLower = certificate.lambdaUpper * 2;
      assert.ok(problems(mutation === 'missing case' ? other : [...other, copy]).length);
    });
  }
}

for (const dimension of ['2d', '3d']) {
  for (const strength of ['member', 'loaded override', 'unloaded override']) {
    test('known wrong result: #2658 direct ' + dimension + ' plastic certificate with ' + strength, () => {
      const spatial = dimension === '3d';
      const input = structuredClone(fixtures[spatial ? 'plastic-3d-cantilever' : 'plastic-2d-portal']);
      const s = input.solver;
      s.nodes = Object.fromEntries([0, -4, 4].map((x, i) => [i + 1, { ...s.nodes[1], id: i + 1, x }]));
      s.elements = Object.fromEntries([1, 2].map(id => [id, { ...s.elements[1], id, nodeI: 1, nodeJ: id + 1, materialId: id }]));
      s.supports = { 1: s.supports[1] };
      s.materials[2] = { ...s.materials[1], id: 2 };
      s.loads = [{ type: 'nodal', data: { ...s.loads.at(-1).data, nodeId: 3, fx: 0, ...(spatial ? { fy: 0 } : {}), fz: -10 } }];
      input.materials = { 1: { fy: 355 }, 2: { fy: 235 } };
      const b = 0.25, h = 0.5;
      Object.assign(input.sections[1], { materialId: 1, b, h });
      if (strength !== 'member') {
        s.sections[2] = { ...s.sections[1], id: 2 };
        input.sections[2] = { ...input.sections[1] };
        s.elements[2].sectionId = 2;
      }
      const mp = strength === 'loaded override' ? 100 : 235 * 1000 * b * h ** 2 / 4;
      input.mpOverrides = strength === 'member' ? null : { [strength === 'loaded override' ? 2 : 1]: spatial ? [100, 100] : 100 };
      const wire = JSON.stringify(input);
      const out = plain(wasm['certify_plastic_' + dimension](wire));
      const exact = mp / 40;
      assert.equal(out.certificate.certified, true);
      assert.ok(out.certificate.lambdaLower <= exact && exact <= out.certificate.lambdaUpper);
      assert.ok(Math.abs(out.results.collapseFactor - exact) <= 1e-9 * exact);
      if (spatial) {
        assert.ok(Math.abs(plain(wasm.solve_plastic_3d(wire)).collapseFactor - exact) <= 1e-9 * exact);
        const bundle = plain(wasm.export_plastic_bundle_3d(wire));
        for (const rational of [bundle.static.lambda, bundle.kinematic.lambda]) {
          const [numerator, denominator = 1] = rational.split('/').map(Number);
          assert.equal(numerator / denominator, exact);
        }
      } else {
        for (const entry of ['solve_plastic_2d', 'export_plastic_bundle_2d']) {
          assert.throws(() => wasm[entry](wire), /PL-2D-INVARIANCE/);
        }
      }
    });
  }
}
