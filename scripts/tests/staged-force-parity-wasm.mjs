import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({
  module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)),
});

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
