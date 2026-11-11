import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let checked = 0;
for (const test of cases) {
  const dimension = test.dimension;
  const maxIter = test.converged ? 100 : 1;
  const solver = test.solver;
  const text = JSON.stringify(solver);
  const fiberSections = {};
  for (const section of Object.values(solver.sections)) {
    const h = Math.sqrt(12 * section.iz / section.a);
    const b = dimension === 2 ? section.a / h : Math.sqrt(12 * section.iy / section.a);
    const fibers = [];
    if (dimension === 2) {
      for (let i = 0; i < 40; i++) {
        fibers.push({ y: -h / 2 + (i + 0.5) * h / 40, z: 0, area: b * h / 40, materialIdx: 0 });
      }
    } else {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          fibers.push({ y: y * Math.sqrt(section.iz / section.a), z: z * Math.sqrt(section.iy / section.a), area: section.a / 4, materialIdx: 0 });
        }
      }
    }
    fiberSections[section.id] = { fibers, materials: [{ type: 'elastic', e: solver.materials['1'].e }] };
  }
  const fiberInput = { solver, fiberSections, nIntegrationPoints: 5, maxIter, tolerance: 1e-10, nIncrements: 1, modifiedNr: false };
  const certificate = JSON.parse(engine[`certify_pdelta_${dimension}d`](text, maxIter, 1e-12));
  assert.equal(certificate.results.converged, test.converged, `${test.name}, certified ${dimension}D`);
  checked++;
  const results = [
    engine[`solve_pdelta_${dimension}d`](text, maxIter, 1e-12),
    engine[`solve_corotational_${dimension}d`](text, maxIter, 1e-10, 1),
    engine[`solve_fiber_nonlinear_${dimension}d`](JSON.stringify(fiberInput)),
    engine[`solve_nonlinear_material_${dimension}d`](JSON.stringify({ solver, materialModels: {}, sectionCapacities: {}, maxIter, tolerance: 1e-10, nIncrements: 1 })),
  ].map(JSON.parse);
  if (test.name === 'rotated resolved axial beside support load' && dimension === 2) {
    const expected = test.expectedAxialDisplacement;
    const length = Math.hypot(solver.nodes['2'].x, solver.nodes['2'].z);
    const force = expected * 1000 * solver.materials['1'].e * solver.sections['1'].a / length;
    const ds = Math.hypot(force, expected) / 10;
    const arc = JSON.parse(engine.solve_arc_length(JSON.stringify({ solver, maxSteps: 1, maxIter: 100, tolerance: 1e-10, initialDs: ds, minDs: ds, maxDs: ds, targetIter: 4 })));
    assert.equal(arc.converged, true);
    assert.ok(Math.abs(arc.finalLoadFactor / 0.1 - 1) < 1e-10);
    const tip = arc.results.displacements.find(d => d.nodeId === 2);
    assert.ok(Math.abs(Math.hypot(tip.ux, tip.uz) / (expected * 0.1) - 1) < 1e-10);
    assert.throws(() => engine.solve_displacement_control(JSON.stringify({ solver, controlNode: 2, controlDof: 0, targetDisplacement: expected, nSteps: 2, maxIter: 100, tolerance: 1e-10 })), /inclined/i);
    checked += 2;
  }
  if (test.expectedAxialDisplacement !== undefined) {
    const result = engine[`solve_${dimension}d`](solver);
    results.push({ converged: true, results: result });
  }
  for (const result of results) {
    assert.equal(result.converged, test.converged, `${test.name}, ${dimension}D`);
    if (test.expectedAxialDisplacement !== undefined) {
      const tip = result.results.displacements.find((d) => d.nodeId === 2);
      const displacement = Math.hypot(tip.ux, tip.uy ?? 0, tip.uz);
      assert.ok(Math.abs(displacement / test.expectedAxialDisplacement - 1) < 1e-10, `${test.name}, ${dimension}D resolved axial response`);
    }
    if (test.name === 'loaded cantilever' && test.converged) {
      const tip = result.results.displacements.find((d) => d.nodeId === 2);
      const node = solver.nodes['2'];
      const load = solver.loads[0].data;
      const distance = dimension === 2 ? Math.hypot(node.x, node.z) : Math.hypot(node.x, node.y, node.z);
      const force = dimension === 2 ? Math.hypot(load.fx, load.fz) : Math.hypot(load.fx, load.fy, load.fz);
      const expected = force * distance / (1000 * solver.materials['1'].e * solver.sections['1'].a);
      const displacement = dimension === 2 ? Math.hypot(tip.ux, tip.uz) : Math.hypot(tip.ux, tip.uy, tip.uz);
      assert.ok(Math.abs(displacement / expected - 1) < 1e-10, `${test.name}, ${dimension}D axial response: got ${displacement}, expected ${expected}, tip ${JSON.stringify(tip)}, load ${JSON.stringify(load)}`);
    }
    checked++;
  }
}
console.log(`${checked} nonlinear WASM convergence and refusal checks passed`);
