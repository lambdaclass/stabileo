import { assertHistoryWithheld } from './staged-history-containment.mjs';
import { assertZeroReactions } from './staged-round7-reactions.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, solve_staged_2d, solve_staged_3d, solve_3d, analyze_kinematics_3d, solve_pdelta_3d, solve_corotational_3d } from '../../web/src/lib/wasm/dedaliano_engine.js';
initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const fixtures = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-review-round3.json', import.meta.url)));
const failures = [];
let checks = 0;
function check(label, run) {
  checks++;
  try { run(); } catch (error) { failures.push(`${label}: ${error}`); }
}
function pad(input, count) {
  for (let i = 0; i < count; i++) {
    const a = 100 + 2 * i;
    const b = a + 1;
    input.nodes[a] = { ...input.nodes[1], id: a };
    input.nodes[b] = { ...input.nodes[1], id: b, x: input.nodes[1].x + 4 };
    input.elements[a] = { ...input.elements[1], id: a, nodeI: a, nodeJ: b };
    if ('y' in input.nodes[1]) Object.assign(input.elements[a], { releaseMyEnd: false, releaseMzEnd: false, releaseTEnd: false });
    else input.elements[a].hingeEnd = false;
    input.supports[a] = { ...input.supports[1], id: a, nodeId: a, type: 'fixed', rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
  }
}
for (const dim of [2, 3]) for (const pads of [0, 22]) for (const connected of [false, true]) {
  for (const [moment, removed, cancel, residual, refused] of [[1,true,false,0,true], [-1,true,false,0,true], [1,false,false,0,false], [0,true,false,0,false], [1,true,true,0,false], [1,true,true,Number.EPSILON,true], [1,true,true,-Number.EPSILON,true]]) {
    const input = {
      nodes: { 1: { id: 1, x: 0, y: 0, z: 0 }, 2: { id: 2, x: 4, y: 0, z: 0 } },
      materials: { 1: { id: 1, e: 10000, nu: 0.3 } },
      sections: { 1: { id: 1, a: 0.01, iy: 0.001, iz: 0.002, j: 0.003 } },
      elements: { 1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } },
      supports: { 1: { id: 1, nodeId: 1, type: 'fixed', rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }, 2: { id: 2, nodeId: 2, type: 'pinned', rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: true } },
      loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 0, my: moment, mz: 0 } }, { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 0, my: -moment + residual, mz: 0 } }],
    };
    if (dim === 2) {
      for (const node of Object.values(input.nodes)) delete node.y;
      for (const load of input.loads) for (const axis of ["fy", "mx", "mz"]) delete load.data[axis];
    }
    pad(input, pads);
    if (connected) input.elements[2] = { ...input.elements[1], id: 2, type: 'truss' };
    input.stages = [
      { name: 'loaded', elementsAdded: Object.values(input.elements).map(e => e.id), supportsAdded: Object.values(input.supports).map(s => s.nodeId), loadIndices: [0] },
      { name: 'removal', elementsRemoved: removed ? [1] : [], loadIndices: cancel ? [1] : [] },
    ];
    const solve = dim === 2 ? solve_staged_2d : solve_staged_3d;
    check(`${dim}D pads=${pads} connected=${connected} moment=${moment} removed=${removed} cancel=${cancel} residual=${residual}`, () => {
      if (removed && moment !== 0) {
        assert.throws(() => solve(JSON.stringify(input)), /#1996/);
        for (const load of input.loads) load.data.my = 0;
      }
      {
        const out = JSON.parse(solve(JSON.stringify(input)));
        if (removed) {
          const unloadedControl = structuredClone(input);
          for (const load of unloadedControl.loads) load.data.my = 0;
          {
          const out = JSON.parse(solve(JSON.stringify(unloadedControl)));
          const forceFields = dim === 2 ? ['nStart', 'nEnd', 'vStart', 'vEnd', 'mStart', 'mEnd'] : ['nStart', 'nEnd', 'vyStart', 'vyEnd', 'vzStart', 'vzEnd', 'mxStart', 'mxEnd', 'myStart', 'myEnd', 'mzStart', 'mzEnd'];
          const reactionFields = dim === 2 ? ['rx', 'rz', 'my'] : ['fx', 'fy', 'fz', 'mx', 'my', 'mz'];
          assert.deepEqual(out.finalResults.elementForces.map(e => e.elementId).sort((a, b) => a - b), Object.values(input.elements).filter(e => e.id !== 1).map(e => e.id).sort((a, b) => a - b));
          if (Object.values(input.elements).every(e => e.id === 1)) {
            assert.deepEqual(out.finalResults.reactions, []);
            assert.ok((out.finalResults.structuredDiagnostics ?? []).some(d => d.code === 'result_quantity_unavailable' && d.phase === 'stageResults'));
          } else {
            assertZeroReactions(out.finalResults.reactions, Object.values(input.supports).map(s => s.nodeId), reactionFields);
          }
          for (const [group, fields] of [['elementForces', forceFields]]) {
            for (const item of out.finalResults[group]) for (const field of fields) assert.ok(Number.isFinite(item[field]) && item[field] === 0, `${group} ${field}: ${item[field]}`);
          }
          }
        } else {
          assert.deepEqual(out.finalResults.displacements, out.stages[0].results.displacements);
          assert.ok(Math.abs(out.finalResults.displacements.find(d => d.nodeId === 2).ry) > 0);
          const activation = structuredClone(input);
          activation.elements[3] = { ...activation.elements[1], id: 3 };
          activation.stages[1].elementsAdded = [3];
          const history = JSON.parse(solve(JSON.stringify(activation)));
          assertHistoryWithheld(history.stages[1].results);
          assertHistoryWithheld(history.finalResults);
        }
      }
    });
  }
}
for (const pads of [0, 22]) for (const [a,b] of [[2,1],[1,2],[0,1],[1,0],[0,0]]) for (const kind of ['rigidLink','eccentricConnection']) for (const held of [false,true]) {
  const input = structuredClone(fixtures.swing3);
  pad(input, pads);
  Object.assign(input.nodes[2], { x: 0, y: a, z: b });
  Object.assign(input.supports[1], { rrx: true, rry: held, rrz: held });
  input.constraints[0] = kind === 'rigidLink' ? { type: kind, masterNode: 1, slaveNode: 2, dofs: [] } : { type: kind, masterNode: 1, slaveNode: 2, offsetX: 0, offsetY: a, offsetZ: b, releases: [] };
  input.loads = [{ type: 'nodal', data: { nodeId: 2, fx: 1e-6, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }];
  const modes = !held && (a !== 0 || b !== 0) ? 1 : 0;
  check(`3D pads=${pads} arm=(${a},${b}) ${kind} held=${held}`, () => {
    const out = JSON.parse(analyze_kinematics_3d(JSON.stringify(input)));
    assert.equal(out.mechanismModes, modes);
    assert.equal(out.isSolvable, modes === 0);
    if (modes) {
      assert.throws(() => solve_3d(input), /mechanism/);
      assert.throws(() => solve_pdelta_3d(JSON.stringify(input), 10, 1e-8), /mechanism/);
      assert.throws(() => solve_corotational_3d(JSON.stringify(input), 10, 1e-8, 1), /mechanism/);
    } else {
      assert.ok(solve_3d(input).displacements.length > 0);
      assert.ok(JSON.parse(solve_corotational_3d(JSON.stringify(input), 10, 1e-8, 1)).results.displacements.length > 0);
      assert.ok(JSON.parse(solve_pdelta_3d(JSON.stringify(input), 10, 1e-8)).results.displacements.length > 0);
    }
  });
}
assert.deepEqual(failures, []);
console.log(`round 5 WASM passed ${checks} cumulative moment and rotation subspace checks`);
