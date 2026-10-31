import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as wasm from '../src/lib/wasm/dedaliano_engine.js';
wasm.initSync({ module: readFileSync(new URL('../src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });

function shell(direction = 'fy') {
  const solver = JSON.parse(readFileSync(new URL('../../verify/samples/plastic-3d-portal.input.json', import.meta.url))).solver;
  Object.assign(solver, { nodes: {}, elements: {}, supports: {}, loads: [], quads: {} });
  solver.materials['1'].e = 10000;
  for (let i = 0; i <= 6; i++) for (let j = 0; j < 2; j++) {
    const shift = i === 0 || i === 6 ? 0 : (i % 2 ? 0.1 : -0.1) * (j === 0 ? -1 : 1);
    const id = 1 + 2 * i + j;
    solver.nodes[id] = { id, x: i + shift, y: 0.2 * j, z: 0 };
  }
  for (let i = 0; i < 6; i++) solver.quads[i + 1] = { id: i + 1, nodes: [2*i+1, 2*i+3, 2*i+4, 2*i+2], materialId: 1, thickness: 0.1 };
  for (const nodeId of [1, 2]) solver.supports[nodeId] = { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
  for (const nodeId of [13, 14]) solver.loads.push({ type: 'nodal', data: { nodeId, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0, [direction]: 0.5 } });
  return solver;
}
const tie = { type: 'equalDOF', masterNode: 13, slaveNode: 14, dofs: [2] };
const stringify = JSON.stringify;
const entries = {
  solve_cable_3d: s => wasm.solve_cable_3d(stringify({ solver: { ...s, elements: { 1: { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'cable' } } }, densities: {} }), 20, 1e-6),
  solve_plastic_3d: s => wasm.solve_plastic_3d(stringify({ solver: s, sections: {}, materials: {} })),
  export_plastic_bundle_3d: s => wasm.export_plastic_bundle_3d(stringify({ solver: s, sections: {}, materials: {} })),
  certify_plastic_3d: s => wasm.certify_plastic_3d(stringify({ solver: s, sections: {}, materials: {} })),
  solve_3d: s => wasm.solve_3d(s),
  constrained_dispatch: s => wasm.solve_3d({ ...s, constraints: [tie] }),
  solve_constrained_3d: s => wasm.solve_constrained_3d(stringify({ solver: s, constraints: [tie] })),
  solve_staged_3d: s => wasm.solve_staged_3d(stringify({ ...s, stages: [{ name: 'all', quadsAdded: [1,2,3,4,5,6], supportsAdded: [1,2], loadIndices: [0,1] }] })),
  solve_pdelta_3d: s => wasm.solve_pdelta_3d(stringify(s), 10, 1e-6),
  solve_winkler_3d: s => wasm.solve_winkler_3d(stringify({ solver: s, foundationSprings: [] })),
  solve_ssi_3d: s => wasm.solve_ssi_3d(stringify({ solver: s, soilSprings: [] })),
  solve_contact_3d: s => wasm.solve_contact_3d(stringify({ solver: s })),
  certify_linear_3d: s => wasm.certify_linear_3d(s),
  export_linear_bundle_3d: s => wasm.export_linear_bundle_3d(stringify(s)),
  estimate_discretization_3d: s => wasm.estimate_discretization_3d(s),
};
for (const [name, solve] of Object.entries(entries)) {
  test(`${name} refuses MITC4 membrane bending with its structured identity`, () => {
    assert.throws(() => solve(shell()), error => {
      const data = JSON.parse(String(error));
      assert.ok(data.structuredDiagnostics.some(d => d.code === 'known_issue' && d.severity === 'error' && d.phase === 'SH-MITC4-DISTORTION' && d.value === 798));
      return true;
    });
  });
}
test('WASM static and constrained static retain the distortion warning for transverse loads', () => {
  for (const name of ['solve_3d', 'constrained_dispatch', 'solve_constrained_3d']) {
    let r = entries[name](shell('fz'));
    if (typeof r === 'string') r = JSON.parse(r);
    assert.ok(r.structuredDiagnostics.some(d => d.code === 'known_issue' && d.severity === 'warning' && d.phase === 'SH-MITC4-DISTORTION' && d.value === 798), name);
  }
});

test('multi-case checks cancellation for both prepared and constrained solves', () => {
  for (const constraints of [[], [tie]]) {
    const solver = { ...shell(), constraints };
    const loadCases = [10000, -10000].map((fx, i) => ({ name: String(i), loads: solver.loads.map(l => ({ ...l, data: { ...l.data, fx } })) }));
    for (const c of loadCases) assert.throws(() => wasm.solve_3d({ ...solver, loads: c.loads }), /SH-MITC4-DISTORTION/);
    assert.throws(() => wasm.solve_multi_case_3d({ solver, loadCases, combinations: [{ name: 'cancel', factors: { 0: 1, 1: 1 } }] }), error => {
      const d = JSON.parse(String(error)).structuredDiagnostics;
      return d.some(d => d.code === 'known_issue' && d.severity === 'error' && d.phase === 'SH-MITC4-DISTORTION' && d.value === 798);
    });
  }
});
test('model-less combination refuses distorted MITC4 cases', () => {
  const results = wasm.solve_3d(shell('fz'));
  assert.throws(() => wasm.combine_results_3d({ factors: [{ caseId: 1, factor: 1 }], cases: [{ caseId: 1, results }] }), error => {
    const d = JSON.parse(String(error)).structuredDiagnostics;
    return d.some(d => d.code === 'known_issue' && d.severity === 'error' && d.phase === 'SH-MITC4-DISTORTION' && d.value === 798);
  });
});

for (const [name, solve] of Object.entries(entries).filter(([name]) => name !== 'solve_staged_3d')) {
  test(`${name} no longer contains non-XY solid-shell recovery (#757 fixed)`, () => {
    const s = shell();
    s.quads = {};
    const coords = [[0,0,0], [1,0,0], [1,1,0.2], [0,1,0.2], [0,0,0.1], [1,0,0.1], [1,1,0.3], [0,1,0.3]];
    coords.forEach(([x,y,z], i) => { s.nodes[i+10] = { id: i+10, x, y, z }; });
    s.solidShells = { 7: { id: 7, nodes: [10,11,12,13,14,15,16,17], materialId: 1 } };
    let outcome;
    try { outcome = solve(s); } catch (error) { outcome = String(error); }
    const text = typeof outcome === 'string' ? outcome : JSON.stringify(outcome);
    assert.ok(!text.includes('SH-GLOBAL-STRESS') && !text.includes('#757'), text.slice(0, 500));
  });
}

test('model-less envelope refuses warning-only distorted MITC4 results', () => {
  const result = wasm.solve_3d(shell('fz'));
  assert.throws(() => wasm.compute_envelope_3d([result]), /SH-MITC4-DISTORTION/);
});
