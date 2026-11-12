import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const read = path => JSON.parse(readFileSync(path, 'utf8'));
let checked = 0;
function close(actual, expected, scale) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-10 * scale, `${actual} != ${expected}, scale ${scale}`);
}
function checkTip(result, fixture) {
  assert.equal(result.converged, true);
  const s = fixture.input;
  const a = s.nodes['1'], b = s.nodes['2'];
  const length = Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z);
  const expected = fixture.expected3d ?? { ux: fixture.expected[0], uz: fixture.expected[1], ry: fixture.expected[2] };
  const tip = result.results.displacements.find(d => d.nodeId === 2);
  assert.ok(tip);
  const scale = Math.max(Math.hypot(expected.ux, expected.uy ?? 0, expected.uz), length * Math.hypot(expected.rx ?? 0, expected.ry, expected.rz ?? 0));
  assert.ok(scale > 0);
  for (const key of ['ux', 'uy', 'uz', 'rx', 'ry', 'rz']) {
    if (expected[key] !== undefined) close(tip[key] * (key.startsWith('r') ? length : 1), expected[key] * (key.startsWith('r') ? length : 1), scale);
  }
}
for (const fixture of read(process.argv[2])) {
  const linear = /^solve_[23]d$/.test(fixture.api);
  const invoke = iter => {
    if (linear) return { converged: true, results: engine[fixture.api](fixture.input) };
    const text = JSON.stringify(fixture.input);
    if (fixture.api.startsWith('certify_pdelta')) return JSON.parse(engine[fixture.api](text, iter, 1e-12)).results;
    return JSON.parse(fixture.api.includes('corotational') ? engine[fixture.api](text, iter, 1e-10, 4) : engine[fixture.api](text, iter, 1e-12));
  };
  const result = invoke(100);
  checkTip(result, fixture);
  for (const multiplier of [0, -1]) {
    const wrong = structuredClone(result);
    for (const d of wrong.results.displacements) for (const k of ['ux', 'uy', 'uz', 'rx', 'ry', 'rz']) if (k in d) d[k] *= multiplier;
    assert.throws(() => checkTip(wrong, fixture));
  }
  if (!linear) assert.equal(invoke(1).converged, false);
  checked++;
}
function checkSupportedResult(result, solver, dimension) {
  const load = solver.loads[0].data;
  const force = Math.hypot(load.fx, load.fy ?? 0, load.fz);
  const a = solver.nodes['1'], b = solver.nodes['2'];
  const length = Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z);
  const ei = 1000 * solver.materials['1'].e * solver.sections['1'].iz;
  assert.equal(result.converged, true);
  assert.equal(result.results.displacements.length, Object.keys(solver.nodes).length);
  for (const d of result.results.displacements) {
    for (const key of ['ux', 'uy', 'uz']) if (key in d) close(d[key], 0, force * length ** 3 / ei);
    for (const key of ['rx', 'ry', 'rz']) if (key in d) close(d[key], 0, force * length / ei);
  }
  const r = result.results.reactions.find(r => r.nodeId === load.nodeId);
  assert.ok(r);
  for (const [reaction, forceKey] of dimension === 2 ? [['rx', 'fx'], ['rz', 'fz']] : [['fx', 'fx'], ['fy', 'fy'], ['fz', 'fz']]) close(r[reaction], -load[forceKey], force);
}
for (const fixture of read(process.argv[3])) {
  const { input: solver, dimension, fiberInput } = fixture;
  const text = JSON.stringify(solver);
  const results = [
    { converged: true, results: engine[`solve_${dimension}d`](solver) },
    JSON.parse(engine[`solve_pdelta_${dimension}d`](text, 100, 1e-12)),
    JSON.parse(engine[`solve_corotational_${dimension}d`](text, 100, 1e-10, 4)),
    JSON.parse(engine[`solve_fiber_nonlinear_${dimension}d`](JSON.stringify(fiberInput))),
  ];
  for (const [index, result] of results.entries()) {
    checkSupportedResult(result, solver, dimension);
    const label = `${dimension}D ${['linear', 'P-Delta', 'corotational', 'fiber nonlinear'][index]} fixture ${checked}`;
    test(`r9 supported displacement node coverage ${label}`, { skip: process.env.RUN_KNOWN_WRONG_1940 !== '1' && 'known wrong result: #1940' }, () => {
      checkSupportedResult(result, solver, dimension);
      const reordered = structuredClone(result);
      reordered.results.displacements.reverse();
      checkSupportedResult(reordered, solver, dimension);
      const accepted = [];
      for (const mutation of ['empty', 'missing', 'duplicate/missing', 'unexpected']) {
        const wrong = structuredClone(result);
        const ds = wrong.results.displacements;
        if (mutation === 'empty') ds.length = 0;
        else if (mutation === 'missing') ds.pop();
        else if (mutation === 'duplicate/missing') ds[1] = structuredClone(ds[0]);
        else ds[0].nodeId = Number.MAX_SAFE_INTEGER;
        try { checkSupportedResult(wrong, solver, dimension); accepted.push(mutation); } catch (error) { if (!(error instanceof assert.AssertionError)) throw error; }
      }
      assert.deepEqual(accepted, [], 'accepted wrong displacement nodes');
    });
    test(`r9 dimensionless supported rotation tolerance ${label}`, { skip: process.env.RUN_KNOWN_WRONG_1940 !== '1' && 'known wrong result: #1940' }, () => {
      checkSupportedResult(result, solver, dimension);
      const load = solver.loads[0].data;
      const force = Math.hypot(load.fx, load.fy ?? 0, load.fz);
      const a = solver.nodes['1'], b = solver.nodes['2'];
      const length = Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z);
      const ei = 1000 * solver.materials['1'].e * solver.sections['1'].iz;
      const angleLimit = 1e-10 * (force * length ** 2 / ei);
      assert.ok(Number.isFinite(angleLimit) && angleLimit > 0);
      const wrongDecisions = [];
      for (const key of dimension === 2 ? ['ry'] : ['rx', 'ry', 'rz']) {
        for (const sign of [-1, 1]) {
          for (const ratio of [0, 0.5, 1, 2]) {
            const candidate = structuredClone(result);
            for (const d of candidate.results.displacements) for (const k of ['ux', 'uy', 'uz', 'rx', 'ry', 'rz']) if (k in d) d[k] = 0;
            candidate.results.displacements[0][key] = sign * ratio * angleLimit;
            let accepted = true;
            try { checkSupportedResult(candidate, solver, dimension); } catch (error) { if (!(error instanceof assert.AssertionError)) throw error; accepted = false; }
            if (accepted !== (ratio <= 1)) wrongDecisions.push({ key, sign, ratio, accepted });
          }
        }
      }
      assert.deepEqual(wrongDecisions, [], 'rotation tolerance boundary decisions');
    });
    checked++;
  }
}

for (const fixture of read(process.argv[4])) {
  const text = JSON.stringify(fixture.input);
  const result = JSON.parse(engine.solve_pdelta_2d(text, 100, 1e-12));
  assert.equal(result.converged, true);
  assert.equal(JSON.parse(engine.solve_pdelta_2d(text, 1, 1e-12)).converged, false);
  assert.equal(JSON.parse(engine.certify_pdelta_2d(text, 100, 1e-12)).results.converged, true);
  assert.ok(result.iterations > 1);
  assert.equal(JSON.parse(engine.solve_pdelta_2d(text, result.iterations - 1, 1e-12)).converged, false);
  assert.equal(JSON.parse(engine.solve_pdelta_2d(text, result.iterations, 1e-12)).converged, true);
  checked++;
}
for (const fixture of read(process.argv[5])) {
  const result = JSON.parse(engine.solve_corotational_3d(JSON.stringify(fixture.input), 100, 1e-10, 4));
  assert.equal(result.converged, true);
  assert.equal(result.results.displacements.length, fixture.reference.displacements.length);
  for (const keys of [['ux', 'uy', 'uz'], ['rx', 'ry', 'rz']]) {
    const scale = Math.max(...fixture.reference.displacements.flatMap(d => keys.map(k => Math.abs(d[k]))));
    assert.ok(scale > 0);
    for (const expected of fixture.reference.displacements) {
      const actual = result.results.displacements.find(d => d.nodeId === expected.nodeId);
      assert.ok(actual);
      for (const key of keys) close(actual[key], expected[key], scale);
    }
  }
  checked++;
}
console.log(`${checked} WASM convergence/reference cases passed, including zero/reversed-answer rejection and iteration-limit controls`);
