import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, solve_staged_2d, solve_staged_3d, solve_2d, solve_3d, solve_corotational_2d, solve_nonlinear_material_3d, analyze_kinematics_2d, analyze_kinematics_3d, certify_linear_2d, solve_plastic_3d, solve_plastic_2d } from '../../web/src/lib/wasm/dedaliano_engine.js';

initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const fixtures = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-orphan-1846.json', import.meta.url)));
const cases = [];
for (const [key, source] of Object.entries(fixtures)) {
  for (const pads of [0, 11]) {
    const input = structuredClone(source);
    for (let i = 0; i < pads; i++) {
      const a = 100 + 2 * i;
      const b = a + 1;
      input.nodes[a] = { ...input.nodes[1], id: a };
      input.nodes[b] = { ...input.nodes[1], id: b, x: input.nodes[1].x + 1 };
      input.elements[a] = { ...input.elements[1], id: a, nodeI: a, nodeJ: b, releaseMyEnd: false };
      input.supports[a] = { ...input.supports[1], nodeId: a };
    }
    cases.push([`${key}:${pads}`, input, solve_3d, solve_staged_3d]);
  }
}
for (const scale of [1, 1e-3, 1e3]) {
  for (let axis = 0; axis < 4; axis++) {
    for (let release = 0; release < 5; release++) {
      for (const pads of [0, 10, 11]) {
        const input = structuredClone(fixtures['staged:1846:original']);
        const end = axis === 3 ? [scale, 2 * scale, 3 * scale] : [0, 0, 0];
        if (axis < 3) end[axis] = 4 * scale;
        input.nodes = { 1: { id: 1, x: 0, y: 0, z: 0 }, 2: { id: 2, x: end[0], y: end[1], z: end[2] } };
        input.materials = { 1: { id: 1, e: 10000 / scale ** 2, nu: 0.3 } };
        input.sections = { 2: { id: 2, a: 0.01 * scale ** 2, iy: 1e-9 * scale ** 4, iz: 2e-9 * scale ** 4, j: 3e-9 * scale ** 4 } };
        Object.assign(input.elements[1], { releaseMyEnd: release === 1 || release >= 3, releaseMzEnd: release === 2 || release >= 3, releaseTEnd: release === 4 });
        Object.assign(input.supports[2], { rrx: false, rry: false, rrz: false });
        input.loads = [{ type: 'pointOnElement', data: { elementId: 1, a: scale, px: 0, py: 1e-3, pz: 2e-3 } }];
        for (let i = 0; i < pads; i++) {
          const a = 100 + 2 * i;
          const b = a + 1;
          input.nodes[a] = { id: a, x: 0, y: 0, z: 0 };
          input.nodes[b] = { id: b, x: 1, y: 0, z: 0 };
          input.elements[a] = { ...input.elements[1], id: a, nodeI: a, nodeJ: b, releaseMyEnd: false, releaseMzEnd: false, releaseTEnd: false };
          input.supports[a] = { ...input.supports[1], nodeId: a };
        }
        cases.push([`3d:${scale}:${axis}:${release}:${pads}`, input, solve_3d, solve_staged_3d]);
      }
    }
  }
}
for (const scale of [1, 1e-3, 1e3]) {
  for (const angle of [0, 0.7]) {
    for (const hingeEnd of [false, true]) {
      for (const spring of [0, 1e-8, 1]) {
        for (const pads of [0, 20, 21]) {
          const input = {
            nodes: { 1: { id: 1, x: 0, z: 0 }, 2: { id: 2, x: 4 * scale * Math.cos(angle), z: 4 * scale * Math.sin(angle) } },
            materials: { 1: { id: 1, e: 10000 / scale ** 2, nu: 0.3 } },
            sections: { 1: { id: 1, a: 0.01 * scale ** 2, iz: 1e-9 * scale ** 4 } },
            elements: { 1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd } },
            supports: { 1: { id: 1, nodeId: 1, type: 'fixed' }, 2: { id: 2, nodeId: 2, type: 'spring', kz: spring * scale } },
            loads: [{ type: 'pointOnElement', data: { elementId: 1, a: scale, p: 1e-3 } }],
          };
          if (spring > 0) input.loads.push({ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: 1e-10 * scale } });
          for (let i = 0; i < pads; i++) {
            const a = 100 + 2 * i;
            const b = a + 1;
            input.nodes[a] = { id: a, x: 0, z: 0 };
            input.nodes[b] = { id: b, x: scale, z: 0 };
            input.elements[a] = { ...input.elements[1], id: a, nodeI: a, nodeJ: b, hingeEnd: false };
            input.supports[a] = { id: a, nodeId: a, type: 'fixed' };
          }
          cases.push([`2d:${scale}:${angle}:${hingeEnd}:${spring}:${pads}`, input, solve_2d, solve_staged_2d]);
        }
      }
    }
  }
}
for (const dimension of [2, 3]) {
  for (const constrained of [false, true]) {
    for (const pads of [0, dimension === 2 ? 21 : 11]) {
      const label = dimension === 2 ? `2d:1:0:false:0:${pads}` : `3d:1:0:0:${pads}`;
      const input = structuredClone(cases.find(([name]) => name === label)[1]);
      input.nodes[3] = { ...input.nodes[2], id: 3 };
      if (constrained) {
        input.constraints = [{ type: 'equalDOF', masterNode: 2, slaveNode: 3, dofs: dimension === 2 ? [0, 1, 2] : [0, 1, 2, 3, 4, 5] }];
      } else if (dimension === 2) {
        input.supports[3] = { id: 3, nodeId: 3, type: 'spring', kx: 1e-8, ky: 1e-8, kz: 1e-8 };
        input.loads = [{ type: 'nodal', data: { nodeId: 3, fx: 1e-8, fz: 0, my: 1e-8 } }];
      } else {
        input.supports[3] = { nodeId: 3, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false, kx: 1e-8, ky: 1e-8, kz: 1e-8, krx: 1e-8, kry: 1e-8, krz: 1e-8 };
        input.loads = [{ type: 'nodal', data: { nodeId: 3, fx: 1e-8, fy: 0, fz: 0, mx: 1e-8, my: 0, mz: 0 } }];
      }
      cases.push([`inactive:${dimension}:${constrained}:${pads}`, input, dimension === 2 ? solve_2d : solve_3d, dimension === 2 ? solve_staged_2d : solve_staged_3d]);
    }
  }
}
let failures = 0;
for (const [label, input, linearSolve, stagedSolve] of cases) {
  const stages = [{ name: 'all', elementsAdded: Object.values(input.elements).map(e => e.id), supportsAdded: Object.values(input.supports).map(s => s.nodeId), loadIndices: input.loads.map((_, i) => i) }];
  const linear = linearSolve(input);
  const staged = JSON.parse(stagedSolve(JSON.stringify({ ...input, stages }))).finalResults;
  const expectedNodes = Object.keys(input.nodes).map(Number).sort((a, b) => a - b);
  for (const [side, result] of [['linear', linear], ['staged', staged]]) {
    assert.deepEqual(Array.from(result.displacements, d => d.nodeId).sort((a, b) => a - b), expectedNodes, `${label}: ${side} node set`);
  }
  for (const a of linear.displacements) {
    const b = staged.displacements.find(b => b.nodeId === a.nodeId);
    assert.ok(b, `${label}: missing staged node ${a.nodeId}`);
    const fields = linearSolve === solve_2d ? ['ux', 'uz', 'ry'] : ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];
    for (const field of fields) {
      assert.ok(Number.isFinite(a[field]), `${label}, node ${a.nodeId}, ${field}: linear component must be finite`);
      assert.ok(Number.isFinite(b[field]), `${label}, node ${a.nodeId}, ${field}: staged component must be finite`);
      if (Math.abs(a[field] - b[field]) > 1e-9 * Math.max(Math.abs(a[field]), 1e-10)) {
        failures++;
        console.error(`${label}, node ${a.nodeId}, ${field}: linear=${a[field]}, staged=${b[field]}`);
      }
    }
  }
}
assert.equal(failures, 0);
console.log(`${cases.length} staged WASM cases agree with regular linear`);

for (const scale of [1, 1e-3, 1e3]) {
  for (const spring of [0, 1e-8, 1]) {
    const source = cases.find(([label]) => label === `2d:${scale}:0:true:${spring}:0`)[1];
    const input = structuredClone(source);
    input.loads = [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: spring === 0 ? 0 : 1e-6 * scale } }];
    const linear = solve_2d(input).displacements.find(d => d.nodeId === 2).ry;
    const nonlinear = JSON.parse(solve_corotational_2d(JSON.stringify(input), 20, 1e-12, 1));
    assert.equal(nonlinear.converged, true);
    const actual = nonlinear.results.displacements.find(d => d.nodeId === 2).ry;
    assert.ok(Number.isFinite(linear));
    assert.ok(Number.isFinite(actual));
    assert.ok(Math.abs(linear - actual) <= 1e-9 * Math.max(Math.abs(linear), 1e-10));
  }
  for (let release = 0; release < 5; release++) {
    const input = structuredClone(cases.find(([label]) => label === `3d:${scale}:0:${release}:0`)[1]);
    input.loads = [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: release === 4 ? 0 : 1e-6 * scale, my: 0, mz: 0 } }];
    const linear = solve_3d(input).displacements.find(d => d.nodeId === 2).rx;
    const nonlinear = JSON.parse(solve_nonlinear_material_3d(JSON.stringify({ solver: input, materialModels: {}, sectionCapacities: {}, maxIter: 20, tolerance: 1e-12, nIncrements: 1 })));
    assert.equal(nonlinear.converged, true);
    const actual = nonlinear.results.displacements.find(d => d.nodeId === 2).rx;
    assert.ok(Number.isFinite(linear));
    assert.ok(Number.isFinite(actual));
    assert.ok(Math.abs(linear - actual) <= 1e-9 * Math.max(Math.abs(linear), 1e-10));
  }
}
console.log('24 nonlinear WASM controls agree with regular linear');

for (const dimension of [2, 3]) {
  for (const pads of dimension === 2 ? [0, 20, 21] : [0, 10, 11]) {
    const source = cases.find(([label]) => dimension === 2 ? label === `2d:1:0:false:0:${pads}` : label === `3d:1:0:0:${pads}`)[1];
    const input = structuredClone(source);
    const stages = [{
      name: 'prestress with inclined support', elementsAdded: Object.values(input.elements).map(e => e.id),
      supportsAdded: Object.values(input.supports).map(s => s.nodeId), loadIndices: input.loads.map((_, i) => i),
      prestressLoads: [{ elementId: 1, force: 1, eccentricityI: 0, eccentricityJ: 0, profile: 'straight' }],
    }];
    const support = input.supports[1];
    if (dimension === 2) {
      support.type = 'inclinedRoller';
      support.angle = 30;
    } else {
      support.isInclined = true;
      support.normalX = 1;
      support.normalY = 2;
      support.normalZ = 3;
    }
    const stagedSolve = dimension === 2 ? solve_staged_2d : solve_staged_3d;
    assert.throws(() => stagedSolve(JSON.stringify({ ...input, stages })), /Inclined supports are not yet supported/);
  }
}
console.log('2D and 3D staged prestress retain inclined-support refusals');


for (const dimension of [2, 3]) {
  for (const pads of dimension === 2 ? [0, 21] : [0, 11]) {
    const input = structuredClone(cases.find(([label]) => label === (dimension === 2 ? `2d:1:0:false:0:${pads}` : `3d:1:0:0:${pads}`))[1]);
    input.loads = [];
    input.nodes[3] = { ...input.nodes[2], id: 3, x: 8 };
    input.nodes[4] = { ...input.nodes[2], id: 4, x: 12 };
    input.elements[2] = { ...input.elements[1], id: 2, nodeI: 2, nodeJ: 3 };
    input.elements[3] = { ...input.elements[1], id: 3, nodeI: 3, nodeJ: 4 };
    const stagedSolve = dimension === 2 ? solve_staged_2d : solve_staged_3d;
    const initial = Object.values(input.elements).filter(e => e.id !== 2 && e.id !== 3).map(e => e.id);
    const stages = [
      { name: 'first', elementsAdded: initial, supportsAdded: Object.values(input.supports).map(s => s.nodeId), loadIndices: [] },
      { name: 'second', elementsAdded: [2, 3], loadIndices: [] },
    ];
    for (const dofs of [[0], dimension === 2 ? [0, 1, 2] : [0, 1, 2, 3, 4, 5]]) {
      input.constraints = [{ type: 'equalDOF', masterNode: 3, slaveNode: 4, dofs }];
      const result = JSON.parse(stagedSolve(JSON.stringify({ ...input, stages })));
      assert.equal(result.stages[0].results.displacements.find(d => d.nodeId === 3).ux, 0);
    }
    input.constraints = [];
    const springSupport = dimension === 2 ? { id: 3, nodeId: 3, type: 'spring', kx: 1000 } : { nodeId: 3, rx: false, ry: false, rz: false, rrx: false, rry: false, rrz: false, kx: 1000 };
    input.supports[3] = springSupport;
    stages[0].supportsAdded.push(3);
    stages[0].loadIndices = [0];
    const data = dimension === 2 ? { nodeId: 3, fx: 1, fz: 0, my: 0 } : { nodeId: 3, fx: 1, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
    input.loads = [{ type: 'nodal', data }];
    const springResult = JSON.parse(stagedSolve(JSON.stringify({ ...input, stages })));
    assert.ok(Math.abs(springResult.stages[0].results.displacements.find(d => d.nodeId === 3).ux - 0.001) <= 1e-12);
    data.fx = 0;
    data.fz = 1;
    assert.throws(() => stagedSolve(JSON.stringify({ ...input, stages })), /mechanism/);
    input.supports[3] = dimension === 2 ? { id: 3, nodeId: 3, type: 'fixed', dx: 0.125 } : { nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true, dx: 0.125 };
    input.loads = [];
    stages[0].loadIndices = [];
    const settlementResult = JSON.parse(stagedSolve(JSON.stringify({ ...input, stages })));
    assert.equal(settlementResult.stages[0].results.reactions.find(r => r.nodeId === 3)[dimension === 2 ? 'rx' : 'fx'], 0);
    delete input.supports[3];
    stages[0].supportsAdded.pop();
    for (const field of dimension === 2 ? ['fx', 'fz', 'my'] : ['fx', 'fy', 'fz', 'mx', 'my', 'mz']) {
      const data = dimension === 2 ? { nodeId: 3, fx: 0, fz: 0, my: 0 } : { nodeId: 3, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
      data[field] = 1e-6;
      input.loads = [{ type: 'nodal', data }];
      stages[0].loadIndices = [0];
      stages[1].loadIndices = [];
      assert.throws(() => stagedSolve(JSON.stringify({ ...input, stages })), /mechanism|free rotation|not supported/);
      stages[0].loadIndices = [];
      stages[1].loadIndices = [0];
      stagedSolve(JSON.stringify({ ...input, stages }));
    }
    const hinged = structuredClone(input);
    hinged.loads = [{ type: 'nodal', data: dimension === 2 ? { nodeId: 4, fx: 0, fz: 0, my: 1 } : { nodeId: 4, fx: 0, fy: 0, fz: 0, mx: 0, my: 1, mz: 0 } }];
    if (dimension === 2) hinged.elements[3].hingeEnd = true;
    else hinged.elements[3].releaseMyEnd = true;
    stages[0].elementsAdded = Object.values(hinged.elements).map(e => e.id);
    stages[0].loadIndices = [0];
    stages[1].loadIndices = [];
    assert.throws(() => stagedSolve(JSON.stringify({ ...hinged, stages })), /free rotation|not supported/);
    const kinematic = dimension === 2 ? analyze_kinematics_2d : analyze_kinematics_3d;
    const kin = JSON.parse(kinematic(JSON.stringify(input)));
    assert.equal(kin.isSolvable, true);
    const mechanism = structuredClone(input);
    mechanism.supports = {};
    mechanism.loads = [];
    const unstable = JSON.parse(kinematic(JSON.stringify(mechanism)));
    assert.equal(unstable.isSolvable, false);
    assert.ok(unstable.mechanismModes > 0);
    assert.match(unstable.diagnosis, /mecanismo/);
  }
}

for (const support of ['pinned', 'rollerX', 'rollerY']) {
  const input = structuredClone(cases.find(([label]) => label === '2d:1:0:true:1:0')[1]);
  input.supports[2] = { id: 2, nodeId: 2, type: support, kz: 2 };
  input.loads = [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: 1 } }];
  assert.ok(Math.abs(solve_2d(input).displacements.find(d => d.nodeId === 2).ry - 0.5) <= 1e-12);
  certify_linear_2d(input);
  const nonlinear = JSON.parse(solve_corotational_2d(JSON.stringify(input), 20, 1e-12, 1));
  assert.equal(nonlinear.converged, true);
  assert.ok(Math.abs(nonlinear.results.displacements.find(d => d.nodeId === 2).ry - 0.5) <= 1e-12);
}
console.log('Multi-stage, partial constraints, unsupported loads, kinematics and support moment WASM regressions pass');


for (const dimension of [2, 3]) {
  for (const target of [63, 64]) {
   for (const scale of [1, 1000]) {
    for (const spring of [0, 1e-30, 0.5e-4, 1e-4, 0.1, 1e20]) {
      const input = {
        nodes: { 1: { id: 1, x: 0, z: 0 }, 2: { id: 2, x: 1, z: 1 } },
        materials: { 1: { id: 1, e: 1e7, nu: 0.3 } },
        sections: { 1: { id: 1, a: 0.01, iy: 0.001, iz: 0.002, j: 0.003 } },
        elements: { 1: { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } },
        supports: dimension === 2 ? { 1: { id: 1, nodeId: 1, type: 'fixed' }, 2: { id: 2, nodeId: 2, type: 'spring', kx: spring } } : {
          1: { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
          2: { nodeId: 2, rx: false, ry: true, rz: false, rrx: false, rry: false, rrz: false, kx: spring },
        },
        loads: [],
      };
      for (let i = 2; i < target; i++) {
        const id = 100 + i;
        input.nodes[id] = { id, x: 0, z: 2 };
        input.supports[id] = dimension === 2 ? { id, nodeId: id, type: 'guidedY', ky: 1 } : { nodeId: id, rx: true, ry: true, rz: false, rrx: false, rry: false, rrz: false, kz: 1 };
      }
      if (dimension === 3) for (const node of Object.values(input.nodes)) node.y = 0;
      for (const node of Object.values(input.nodes)) for (const axis of ['x','y','z']) if (axis in node) node[axis] *= scale;
      input.materials[1].e /= scale ** 2;
      for (const [key, power] of [['a',2],['iy',4],['iz',4],['j',4]]) input.sections[1][key] *= scale ** power;
      for (const sup of Object.values(input.supports)) for (const key of ['kx','ky','kz']) if (key in sup) sup[key] /= scale;
      const linear = dimension === 2 ? solve_2d : solve_3d;
      if (spring === 0.1) {
        const loaded = structuredClone(input);
        loaded.loads = [{ type: 'nodal', data: { nodeId: 2, fx: 1e-7, fz: 0, my: 0 } }];
        if (dimension === 3) Object.assign(loaded.loads[0].data, { fy: 0, mx: 0, mz: 0 });
        const d = linear(loaded).displacements.find(d => d.nodeId === 2);
        assert.ok(Math.abs(d.ux / scale - 1e-6) <= 1e-12);
        assert.ok(Math.abs(d.uz / scale + 1e-6) <= 1e-12);
      } else if (spring === 0.5e-4 || spring === 1e-4) assert.throws(() => linear(input), /conditioning limit/);
      else assert.throws(() => linear(input));
      const result = JSON.parse((dimension === 2 ? analyze_kinematics_2d : analyze_kinematics_3d)(JSON.stringify(input)));
      assert.equal(result.isSolvable, spring > 0, `${dimension}D nf=${target} spring=${spring}`);
      if (spring === 0) {
        assert.equal(result.mechanismModes, 1);
        assert.ok(result.mechanismNodes.includes(2));
        assert.match(result.diagnosis, /mecanismo/);
      } else {
        assert.equal(result.mechanismModes, 0);
      }
    }
  }
}
}
console.log('2D and 3D kinematic positive springs stabilize the truss and agree at nf=63 and nf=64');

const round3Fixtures = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/staged-review-round3.json', import.meta.url)));
function round3Model(name, pads) {
  const input = structuredClone(round3Fixtures[name]);
  const dimension = name.endsWith('2') ? 2 : 3;
  const padding = cases.find(([label]) => label === (dimension === 2 ? '2d:1:0:false:0:21' : '3d:1:0:0:11'))[1];
  for (const field of ['nodes', 'elements', 'supports']) {
    for (const [key, value] of Object.entries(padding[field])) {
      if (Number(key) >= 100 && Number(key) < 100 + pads * 2) {
        input[field][key] = structuredClone(value);
        if (field === 'elements') input[field][key].sectionId = 1;
      }
    }
  }
  return input;
}
for (const dimension of [2, 3]) {
  const kinematics = dimension === 2 ? analyze_kinematics_2d : analyze_kinematics_3d;
  const linear = dimension === 2 ? solve_2d : solve_3d;
  for (const pads of [0, dimension === 2 ? 21 : 11]) {
    for (const kind of dimension === 2 ? ['rigidLink', 'eccentricConnection'] : ['rigidLink', 'eccentricConnection', 'diaphragm']) {
      for (const held of [false, true]) {
        const input = round3Model(`swing${dimension}`, pads);
        input.constraints = [kind === 'diaphragm'
          ? { type: kind, masterNode: 1, slaveNodes: [2], plane: 'XZ' }
          : { type: kind, masterNode: 1, slaveNode: 2, dofs: [], releases: [], offsetX: 2, offsetY: 0, offsetZ: 1 }];
        if (kind === 'diaphragm') input.supports[2] = { nodeId: 2, rx: false, ry: true, rz: false, rrx: false, rry: false, rrz: false };
        if (held) Object.assign(input.supports[1], { type: 'fixed', rrx: true, rry: true, rrz: true });
        const result = JSON.parse(kinematics(JSON.stringify(input)));
        assert.equal(result.isSolvable, held);
        if (held) {
          assert.equal(result.mechanismModes, 0);
          linear(input);
        } else {
          assert.ok(result.mechanismModes > 0, JSON.stringify(result));
          assert.ok(result.mechanismNodes.includes(1));
          assert.ok(result.unconstrainedDofs.length > 0);
          assert.throws(() => linear(input), /mechanism/);
        }
      }
    }
    for (const soft of [false, true]) {
      const input = round3Model(`soft${dimension}`, pads);
      if (!soft) input.sections[1][dimension === 2 ? 'iz' : 'iy'] = 0.001;
      const result = JSON.parse(kinematics(JSON.stringify(input)));
      assert.equal(result.isSolvable, true, JSON.stringify(result));
      assert.equal(result.mechanismModes, 0);
      if (soft) assert.throws(() => linear(input), dimension === 2 ? /constraint reduction/ : /coupled/);
      else linear(input);
    }
  }
}
console.log('round 3 kinematic WASM mechanisms and elastic refusals pass');

for (const soft of [false, true]) {
  const input = round3Model('soft3', 1);
  input.loads = [{ type: 'nodal', data: { nodeId: 101, fx: 0, fy: 1, fz: 0, mx: 0, my: 0, mz: 0 } }];
  if (!soft) input.sections[1].iy = 0.001;
  const plastic = {
    solver: input,
    sections: { 1: { a: 0.01, iy: 0.001, iz: 0.002, materialId: 1 }, 2: { a: 0.01, iy: 0.001, iz: 0.002, materialId: 1 } },
    materials: { 1: { fy: 1 } }, maxHinges: 1,
  };
  if (soft) assert.throws(() => solve_plastic_3d(JSON.stringify(plastic)), /coupled/);
  else assert.ok(JSON.parse(solve_plastic_3d(JSON.stringify(plastic))).collapseFactor > 0);
}
console.log('round 3 plastic WASM preserves the elastic refusal');

for (const dimension of [2, 3]) {
  for (const pads of [0, dimension === 2 ? 21 : 11]) {
    for (const scale of [1e-12, 1, 1e12]) {
      const input = round3Model(`soft${dimension}`, pads);
      delete input.constraints;
      delete input.elements[2];
      delete input.nodes[3];
      input.sections[1].iy = 0.001;
      input.sections[1].iz = 0.002;
      input.materials[1].e *= scale;
      input.nodes[4] = { ...input.nodes[1], id: 4, x: 8 };
      input.nodes[5] = { ...input.nodes[2], id: 5, x: 12 };
      input.elements[2] = { ...input.elements[1], id: 2, nodeI: 4, nodeJ: 5 };
      input.supports[4] = { ...input.supports[1], id: 4, nodeId: 4 };
      input.loads = [];
      const stages = [
        { name: 'before', elementsAdded: Object.values(input.elements).filter(e => e.id !== 2).map(e => e.id), supportsAdded: Object.values(input.supports).map(s => s.nodeId), loadIndices: [] },
        { name: 'after', elementsAdded: [2], loadIndices: [] },
      ];
      const solve = dimension === 2 ? solve_staged_2d : solve_staged_3d;
      const result = JSON.parse(solve(JSON.stringify({ ...input, stages })));
      for (const stage of result.stages) {
        assert.ok(!(stage.results.structuredDiagnostics ?? []).some(d => d.phase === 'NUM-INVARIANCE'), JSON.stringify(stage));
        assert.ok(stage.results.displacements.every(d => Number.isFinite(d.ux)));
      }
    }
  }
}
console.log('round 3 dormant WASM pins keep conditioning independent of stiffness scale');

for (const soft of [false, true]) {
  const input = round3Model('soft2', 0);
  if (!soft) input.sections[1].iz = 0.001;
  const plastic = {
    solver: input, sections: { 1: { a: 0.01, iz: 0.002, materialId: 1 } },
    materials: { 1: { fy: 1 } }, maxHinges: 1,
  };
  assert.throws(() => solve_plastic_2d(JSON.stringify(plastic)), /PL-2D-INVARIANCE/);
}
console.log('round 3 plastic 2D WASM retains its existing refusal');

for (const dimension of [2, 3]) {
  for (const arm of [0, 1e-6]) {
    const input = round3Model(`swing${dimension}`, 0);
    input.nodes[2].x = 2 * arm;
    input.nodes[2].z = arm;
    const result = JSON.parse((dimension === 2 ? analyze_kinematics_2d : analyze_kinematics_3d)(JSON.stringify(input)));
    assert.equal(result.isSolvable, arm === 0);
    assert.equal(result.mechanismModes === 0, arm === 0);
    const solve = dimension === 2 ? solve_2d : solve_3d;
    if (arm === 0) solve(input);
    else assert.throws(() => solve(input), /mechanism/);
  }
  const input = round3Model(`soft${dimension}`, 0);
  delete input.constraints;
  delete input.elements[2];
  delete input.nodes[3];
  input.sections[1].iy = 0.001;
  input.sections[1].iz = 0.002;
  input.loads = [];
  const stages = [
    { name: 'empty', elementsAdded: [], supportsAdded: [1], loadIndices: [] },
    { name: 'erect', elementsAdded: [1], loadIndices: [] },
  ];
  const result = JSON.parse((dimension === 2 ? solve_staged_2d : solve_staged_3d)(JSON.stringify({ ...input, stages })));
  for (const stage of result.stages) {
    assert.ok(!(stage.results.structuredDiagnostics ?? []).some(d => d.phase === 'NUM-INVARIANCE'));
    assert.ok(stage.results.displacements.every(d => d.ux === 0));
  }
}
console.log('zero-arm and entirely inactive-stage WASM boundaries pass');
