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
