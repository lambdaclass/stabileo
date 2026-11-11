import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';
engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const fixtures = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/cause-c-replay.json', import.meta.url)));
const failures = [];
let checks = 0;
function check(label, run) {
  checks++;
  try { run(); } catch (error) { failures.push(`${label}: ${error}`); }
}
function spatial(solver) {
  const s = structuredClone(solver);
  for (const node of Object.values(s.nodes)) node.y = 0;
  for (const section of Object.values(s.sections)) Object.assign(section, { iy: section.iz, j: section.iz });
  s.supports = Object.fromEntries(Object.values(s.nodes).map(n => [n.id, { nodeId: n.id, rx: n.id === 1, ry: true, rz: n.id === 1, rrx: true, rry: n.id === 1, rrz: true }]));
  return s;
}
for (const dim of [2, 3]) for (const held of [false, true]) {
  const s = dim === 2 ? structuredClone(fixtures['1095']) : spatial(fixtures['1095']);
  if (held) s.elements[2].type = 'frame';
  const modal = JSON.stringify({ solver: s, densities: fixtures['1095']._nightly_dens });
  for (const name of ['solve_modal', 'certify_modal']) check(`${dim}D ${name} held=${held}`, () => {
    const run = () => engine[`${name}_${dim}d`](modal, 2);
    if (held) assert.ok(JSON.parse(run()));
    else assert.throws(run, error => String(error).startsWith('MODAL-MECHANISM:') && String(error).includes('node 3'));
  });
  const json = JSON.stringify(s);
  for (const name of ['solve_pdelta', 'solve_corotational']) check(`${dim}D ${name} held=${held}`, () => {
    const run = () => engine[`${name}_${dim}d`](json, 30, 1e-8, 2);
    if (held) assert.ok(JSON.parse(run()));
    else assert.throws(run, /mechanism/);
  });
  check(`${dim}D linear held=${held}`, () => {
    const run = () => engine[`solve_${dim}d`](s);
    if (held) assert.ok(run());
    else assert.throws(run, /mechanism/);
  });
  s.stages = [{ name: 'all', elementsAdded: [1, 2], supportsAdded: Object.values(s.supports).map(x => x.nodeId), loadIndices: [] }];
  check(`${dim}D staged held=${held}`, () => {
    const run = () => engine[`solve_staged_${dim}d`](JSON.stringify(s));
    if (held) assert.ok(JSON.parse(run()));
    else assert.throws(run, /mechanism/);
  });
}
assert.deepEqual(failures, []);
console.log(`${checks} translation rank WASM checks passed`);
