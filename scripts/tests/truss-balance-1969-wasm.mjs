import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const fixtures = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/truss-balance-1969.json', import.meta.url)));
function assertDisplacements(result, input, dimension) {
  assert.equal(result.displacements.length, Object.keys(input.nodes).length);
  const fields = dimension === 2 ? ['nodeId', 'ux', 'uz', 'ry'] : ['nodeId', 'ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  for (const displacement of result.displacements) {
    for (const field of fields) {
      assert.ok(Number.isFinite(displacement[field]), `${dimension}D node ${displacement.nodeId} mandatory ${field} must be finite`);
    }
    assert.ok(Object.values(displacement).every(v => v === null || Number.isFinite(v)));
  }
}

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
    assertDisplacements(result, nodal, dimension);
  });
  test(`${dimension}D truss member actions`, () => {
    const reference = engine[`solve_${dimension}d`](equivalentNodal(dimension));
    const result = engine[`solve_${dimension}d`](input);
    assertDisplacements(reference, input, dimension);
    assertDisplacements(result, input, dimension);
    assert.deepEqual(result.displacements, reference.displacements);
  });
  test(`${dimension}D nonlinear initial truss member actions`, () => {
    const result = JSON.parse(engine[`solve_pdelta_${dimension}d`](JSON.stringify(input), 1, Number.EPSILON));
    assertDisplacements(result.linearResults, input, dimension);
    assertDisplacements(result.results, input, dimension);
  });
}
for (const dimension of [2, 3]) {
  test(`${dimension}D constrained truss member actions`, () => {
    const key = dimension === 2 ? '1969' : '3d-1969';
    const result = JSON.parse(engine[`solve_constrained_${dimension}d`](JSON.stringify({
      solver: fixtures[key],
      constraints: [{ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0] }],
    })));
    assertDisplacements(result, fixtures[key], dimension);
  });
}

for (const dimension of [2, 3]) {
  test(`${dimension}D constrained nodal control and existing rounding refusal`, () => {
    const key = dimension === 2 ? 'nodal-1969' : '3d-nodal-1969';
    const input = slaveNode => JSON.stringify({ solver: fixtures[key], constraints: [{ type: 'equalDOF', masterNode: 1, slaveNode, dofs: [0] }] });
    assertDisplacements(JSON.parse(engine[`solve_constrained_${dimension}d`](input(2))), fixtures[key], dimension);
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
        assertDisplacements(engine[`solve_${dimension}d`](input), input, dimension);
        const nonlinear = JSON.parse(engine[`solve_pdelta_${dimension}d`](JSON.stringify(input), 1, Number.EPSILON));
        assertDisplacements(nonlinear.linearResults, input, dimension);
        assertDisplacements(nonlinear.results, input, dimension);
      });
    }
  }
}

for (const dimension of [2, 3]) {
  const fields = dimension === 2 ? ['nodeId', 'ux', 'uz', 'ry'] : ['nodeId', 'ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  for (const field of fields) {
    for (const absent of [false, true]) {
      test(`${dimension}D mandatory ${field} rejects ${absent ? 'missing' : 'null'}`, () => {
        const input = fixtures[dimension === 2 ? 'nodal-1969' : '3d-nodal-1969'];
        const result = engine[`solve_${dimension}d`](input);
        if (absent) delete result.displacements[0][field];
        else result.displacements[0][field] = null;
        assert.throws(() => assertDisplacements(result, input, dimension));
      });
    }
  }
}

for (const dimension of [2, 3]) {
  const fields = dimension === 2 ? ['nodeId', 'ux', 'uz', 'ry'] : ['nodeId', 'ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
  test(`${dimension}D mandatory fields reject nonfinite and nonnumeric values`, () => {
    const input = fixtures[dimension === 2 ? 'nodal-1969' : '3d-nodal-1969'];
    const baseline = engine[`solve_${dimension}d`](input);
    for (const field of fields) {
      for (const value of [NaN, Infinity, -Infinity, undefined, '0', false]) {
        const result = structuredClone(baseline);
        result.displacements[0][field] = value;
        assert.throws(() => assertDisplacements(result, input, dimension));
      }
    }
  });
  test(`${dimension}D mandatory fields accept finite zero and signed finite limits`, () => {
    const input = fixtures[dimension === 2 ? 'nodal-1969' : '3d-nodal-1969'];
    const baseline = engine[`solve_${dimension}d`](input);
    for (const field of fields.filter(field => field !== 'nodeId')) {
      for (const value of [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE]) {
        const result = structuredClone(baseline);
        result.displacements[0][field] = value;
        assertDisplacements(result, input, dimension);
      }
    }
  });
}
