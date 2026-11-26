import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({
  module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)),
});

const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(cases.length, 4);
for (const { model, sparse, pcg, accuracy } of cases) {
  const nodes = new Set(Object.values(model.nodes).map(node => node.id));
  const reference = engine.solve_3d(sparse).displacements.filter(d => nodes.has(d.nodeId));
  assert.equal(reference.length, nodes.size);
  const results = [
    engine.solve_3d(model),
    JSON.parse(engine.solve_constrained_3d(JSON.stringify({ solver: model, constraints: model.constraints }))),
    engine.solve_3d(pcg),
  ];
  for (const result of results) {
    for (const fields of [['ux', 'uy', 'uz'], ['rx', 'ry', 'rz']]) {
      const scale = Math.max(...reference.flatMap(d => fields.map(key => Math.abs(d[key]))));
      for (const expected of reference) {
        const actual = result.displacements.find(d => d.nodeId === expected.nodeId);
        for (const key of fields) {
          assert.ok(Math.abs(actual[key] - expected[key]) <= accuracy * scale);
        }
      }
    }
  }
}

const stagedFixtures = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-review-comments.json', import.meta.url)));
const stagedModel = stagedFixtures['1085-6760749658-0'];
const stage = {
  name: 'all',
  elementsAdded: Object.values(stagedModel.elements).map(element => element.id),
  supportsAdded: Object.values(stagedModel.supports).map(support => support.nodeId),
  loadIndices: stagedModel.loads.map((_, index) => index),
};
const linearForces = engine.solve_3d(stagedModel).elementForces;
const staged = JSON.parse(engine.solve_staged_3d(JSON.stringify({ ...stagedModel, stages: [stage] })));
const stagedForces = staged.finalResults.elementForces;
assert.deepEqual(stagedForces.map(force => force.elementId), linearForces.map(force => force.elementId));
for (const expected of linearForces) {
  const actual = stagedForces.find(force => force.elementId === expected.elementId);
  for (const fields of [
    ['nStart', 'nEnd', 'vyStart', 'vyEnd', 'vzStart', 'vzEnd'],
    ['mxStart', 'mxEnd', 'myStart', 'myEnd', 'mzStart', 'mzEnd'],
  ]) {
    const scale = Math.max(1e-10, ...fields.map(key => Math.abs(expected[key])));
    for (const key of fields) {
      assert.ok(Math.abs(actual[key] - expected[key]) <= 1e-9 * scale,
        `element ${expected.elementId} ${key}: ${actual[key]} vs ${expected[key]}`);
    }
  }
}
