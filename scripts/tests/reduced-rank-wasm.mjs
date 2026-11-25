import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({
  module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)),
});
const fixtures = JSON.parse(readFileSync(new URL('../../engine/tests/fixtures/reduced-rank.json', import.meta.url)));
const failures = [];
function spatial(solver) {
  const held = nodeId => ({ nodeId, rx: nodeId === 1, ry: true, rz: nodeId === 1, rrx: true, rry: nodeId === 1, rrz: true });
  return {
    ...solver,
    nodes: Object.fromEntries(Object.entries(solver.nodes).map(([id, node]) => [id, { ...node, y: 0 }])),
    sections: Object.fromEntries(Object.entries(solver.sections).map(([id, section]) => [id, {
      ...section, iy: section.iz, j: section.iz,
    }])),
    elements: Object.fromEntries(Object.entries(solver.elements).map(([id, { hingeStart, hingeEnd, ...element }]) => [id, {
      ...element, releaseMyStart: hingeStart, releaseMzStart: hingeStart,
      releaseMyEnd: hingeEnd, releaseMzEnd: hingeEnd,
    }])),
    supports: { '1': held(1), '2': held(2) },
    loads: solver.loads.map(({ type, data }) => ({ type, data: { ...data, fy: 0, mx: 0, my: -data.my, mz: 0 } })),
  };
}

function report(issue, dim, solver) {
  const constrained = JSON.stringify({ solver, constraints: solver.constraints });
  const modal = JSON.stringify({
    solver,
    densities: Object.fromEntries(Object.keys(solver.materials).map(id => [id, 1])),
  });
  for (const [name, run] of [
    ['linear', () => engine[`solve_${dim}`](solver)],
    ['constrained', () => engine[`solve_constrained_${dim}`](constrained)],
    ['modal', () => engine[`solve_modal_${dim}`](modal, 1)],
    ['certified modal', () => engine[`certify_modal_${dim}`](modal, 1)],
    ['P-Delta', () => engine[`solve_pdelta_${dim}`](JSON.stringify(solver), 2, 1e-12)],
  ]) {
    try {
      run();
      failures.push(`#${issue} ${dim} ${name} returned a result`);
    } catch (error) {
      let diagnostic;
      try {
        diagnostic = JSON.parse(String(error)).structuredDiagnostics?.[0];
      } catch {}
      if (diagnostic?.code !== 'reduced_stiffness_rank' || diagnostic?.severity !== 'error') {
        failures.push(`#${issue} ${dim} ${name} returned ${error}`);
      }
    }
  }
}

for (const issue of ['2266', '2380']) {
  const solver = fixtures[issue];
  report(issue, '2d', solver);
  report(issue, '3d', spatial(solver));
  const unhinged = structuredClone(solver);
  unhinged.elements['1'].hingeStart = false;
  unhinged.elements['1'].hingeEnd = false;
  const restrained = structuredClone(solver);
  restrained.constraints.push({ type: 'linearMPC', terms: [{ nodeId: 2, dof: 2, coefficient: 1 }] });
  for (const input of [unhinged, restrained]) {
    const { displacements } = engine.solve_2d(input);
    assert.ok(displacements.length > 0);
    for (const { ux, uz, ry } of displacements) {
      assert.ok(ux === 0 && uz === 0 && ry === 0);
    }
  }
}
assert.deepEqual(failures, []);

const truss = {
  nodes: { 1: { id: 1, x: 0, z: 0 }, 2: { id: 2, x: 1, z: 0 } },
  elements: { 1: { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'truss', hingeStart: false, hingeEnd: false } },
  materials: { 1: { id: 1, e: 0.001, nu: 0.3 } },
  sections: { 1: { id: 1, a: 1, iz: 1 } },
  supports: { 1: { id: 1, nodeId: 1, type: 'fixed' }, 2: { id: 2, nodeId: 2, type: 'spring', ky: 1 } },
  constraints: [],
  loads: [],
};
const codedRankError = error => {
  try {
    const [diagnostic] = JSON.parse(String(error)).structuredDiagnostics;
    return diagnostic.code === 'reduced_stiffness_rank' && diagnostic.severity === 'error';
  } catch { return false; }
};
const nonlinear = (analysis, dim, model) => JSON.parse(engine[`solve_${analysis}_${dim}`](JSON.stringify(model), 8, 1e-12, 1));

for (const dim of ['2d', '3d']) {
  const model = dim === '2d' ? structuredClone(truss) : spatial(truss);
  if (dim === '3d') {
    Object.assign(model.supports[2], { kz: 1, rry: true });
  }
  for (const force of [-0.25, -0.5, -0.75]) {
    const load = { nodeId: 2, fx: force, fz: 0, my: 0 };
    if (dim === '3d') Object.assign(load, { fy: 0, mx: 0, mz: 0 });
    const run = () => nonlinear('corotational', dim, { ...model, loads: [{ type: 'nodal', data: load }] });
    if (force === -0.5) {
      assert.throws(run, codedRankError, `${dim} current rank`);
    } else {
      const result = run();
      assert.equal(result.converged, true);
      assert.equal(result.results.displacements.find(d => d.nodeId === 2).ux, force);
    }
  }

  const angle = 0.4;
  const [x, z] = [Math.sin(angle), Math.cos(angle)];
  const inclined = structuredClone(model);
  Object.assign(inclined.nodes[2], { x, z });
  if (dim === '2d') {
    inclined.supports[2] = { id: 2, nodeId: 2, type: 'inclinedRoller', angle };
  } else {
    inclined.supports[2] = { nodeId: 2, isInclined: true, normalX: x, normalY: 0, normalZ: z, rx: false, ry: false, rz: false, ky: 1, rrx: true, rry: true, rrz: true };
  }
  const kinematics = JSON.parse(engine[`analyze_kinematics_${dim}`](JSON.stringify(inclined)));
  assert.equal(kinematics.isSolvable, false);
  assert.ok(codedRankError(kinematics.diagnosis), `${dim} inclined kinematics: ${kinematics.diagnosis}`);
  for (const [name, run] of [
    ['linear', s => engine[`solve_${dim}`](s)],
    ['constrained', s => engine[`solve_constrained_${dim}`](JSON.stringify({ solver: s, constraints: s.constraints }))],
    ['corotational', s => nonlinear('corotational', dim, s)],
    ['material nonlinear', s => nonlinear('nonlinear_material', dim, {
      solver: s, materialModels: {}, sectionCapacities: {}, maxIter: 8, tolerance: 1e-12, nIncrements: 1,
    })],
  ]) {
    assert.throws(() => run(inclined), codedRankError, `${dim} inclined ${name}`);
    const control = structuredClone(inclined);
    control.nodes[2].x += 0.25;
    const solved = run(control);
    if (typeof solved === 'object' && 'converged' in solved) assert.equal(solved.converged, true);
  }
}

for (const dim of ['2d', '3d']) {
  for (const [stiffness, refused] of [[1e8, false], [(1e12 - 2) / 4, false], [1e12 / 4, true]]) {
    const model = dim === '2d' ? structuredClone(truss) : spatial(truss);
    model.materials[1].e = stiffness / 1000;
    for (const nodeId of [1, 2]) {
      model.supports[nodeId] = dim === '2d'
        ? { id: nodeId, nodeId, type: 'rollerX', kx: 0.5 }
        : { nodeId, rx: false, ry: true, rz: true, rrx: true, rry: true, rrz: true, kx: 0.5 };
    }
    model.constraints = [{ type: 'linearMPC', terms: [
      { nodeId: 2, dof: 0, coefficient: 1 },
      { nodeId: 1, dof: 0, coefficient: -1 },
    ] }];
    const run = () => nonlinear('nonlinear_material', dim, {
      solver: model, materialModels: {}, sectionCapacities: {}, maxIter: 8, tolerance: 1e-12, nIncrements: 1,
    });
    if (refused) {
      assert.throws(run, error => codedRankError(error) && String(error).includes('constraint reduction cancels stiffness contributions'));
    } else {
      const result = run();
      assert.equal(result.converged, true);
      for (const displacement of result.results.displacements) assert.equal(displacement.ux, 0);
    }
  }
}
