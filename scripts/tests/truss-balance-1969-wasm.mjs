import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const fixtures = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/truss-balance-1969.json', import.meta.url)));
function equivalentNodal(dimension) {
  const source = fixtures['1969'];
  const member = source.elements['5'];
  const a = source.nodes[member.nodeI];
  const b = source.nodes[member.nodeJ];
  const dx = b.x-a.x;
  const dz = b.z-a.z;
  const length = Math.sqrt(dx*dx + dz*dz);
  const { qI, qJ } = source.loads[0].data;
  const parts = [[qI*length, length/2], [(qJ-qI)*length/2, 2*length/3]];
  let ri = 0;
  let rj = 0;
  for (const [force, x] of parts) {
    ri += force*(length-x)/length;
    rj += force*x/length;
  }
  const input = structuredClone(fixtures[dimension === 2 ? '1969' : '3d-1969']);
  input.loads = [[member.nodeI, ri], [member.nodeJ, rj]].map(([nodeId, force]) => ({ type: 'nodal', data: dimension === 2
    ? { nodeId, fx: -(dz/length)*force, fz: (dx/length)*force, my: 0 }
    : { nodeId, fx: -(dz/length)*force, fy: 0, fz: (dx/length)*force, mx: 0, my: 0, mz: 0 } }));
  return input;
}
for (const dimension of [2, 3]) {
  const key = dimension === 2 ? '1969' : '3d-1969';
  const nodalKey = dimension === 2 ? 'nodal-1969' : '3d-nodal-1969';
  const input = fixtures[key];
  const nodal = fixtures[nodalKey];
  test(`${dimension}D equivalent nodal control`, () => {
    const result = engine[`solve_${dimension}d`](nodal);
    assert.equal(result.displacements.length, Object.keys(nodal.nodes).length);
    assert.ok(result.displacements.every(d => Object.values(d).every(v => v === null || Number.isFinite(v))));
  });
  test(`${dimension}D truss member actions`, () => {
    const reference = engine[`solve_${dimension}d`](equivalentNodal(dimension));
    const result = engine[`solve_${dimension}d`](input);
    assert.deepEqual(result.displacements, reference.displacements);
  });
  test(`${dimension}D nonlinear initial truss member actions`, () => {
    const result = JSON.parse(engine[`solve_pdelta_${dimension}d`](JSON.stringify(input), 1, Number.EPSILON));
    assert.equal(result.linearResults.displacements.length, Object.keys(input.nodes).length);
  });
}
for (const dimension of [2, 3]) {
  test(`${dimension}D constrained truss member actions`, () => {
    const key = dimension === 2 ? '1969' : '3d-1969';
    const result = JSON.parse(engine[`solve_constrained_${dimension}d`](JSON.stringify({
      solver: fixtures[key],
      constraints: [{ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0] }],
    })));
    assert.equal(result.displacements.length, Object.keys(fixtures[key].nodes).length);
  });
}

for (const dimension of [2, 3]) {
  test(`${dimension}D constrained nodal control and existing rounding refusal`, () => {
    const key = dimension === 2 ? 'nodal-1969' : '3d-nodal-1969';
    const input = slaveNode => JSON.stringify({ solver: fixtures[key], constraints: [{ type: 'equalDOF', masterNode: 1, slaveNode, dofs: [0] }] });
    assert.equal(JSON.parse(engine[`solve_constrained_${dimension}d`](input(2))).displacements.length, Object.keys(fixtures[key].nodes).length);
    assert.throws(() => engine[`solve_constrained_${dimension}d`](input(3)));
  });
}
for (const dimension of [2, 3]) {
  for (const kind of ['truss', 'frame']) {
    for (const point of [false, true]) {
      test(`${dimension}D ${kind} ${point ? 'point' : 'distributed'} load class`, () => {
        const input = structuredClone(fixtures[dimension === 2 ? '1969' : '3d-1969']);
        input.elements['5'].type = kind;
        if (point) {
          const element = input.elements['5'];
          const a = input.nodes[element.nodeI];
          const b = input.nodes[element.nodeJ];
          const length = Math.hypot(b.x-a.x, (b.y ?? 0)-(a.y ?? 0), b.z-a.z);
          const load = input.loads[0].data;
          input.loads = [{ type: 'pointOnElement', data: dimension === 2
            ? { elementId: 5, p: load.qI, px: load.qJ, a: length/3 }
            : { elementId: 5, px: fixtures['1969'].loads[0].data.qJ, py: load.qYI, pz: load.qZI, a: length/3 } }];
        }
        assert.equal(engine[`solve_${dimension}d`](input).displacements.length, Object.keys(input.nodes).length);
        const nonlinear = JSON.parse(engine[`solve_pdelta_${dimension}d`](JSON.stringify(input), 1, Number.EPSILON));
        assert.equal(nonlinear.linearResults.displacements.length, Object.keys(input.nodes).length);
      });
    }
  }
}
