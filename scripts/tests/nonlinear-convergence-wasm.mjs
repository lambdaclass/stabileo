import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as engine from '../../web/src/lib/wasm/dedaliano_engine.js';

engine.initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
function checkAxial(tip, solver, expected, suppliedAxis) {
  const node = solver.nodes['2'];
  const chord = [node.x, node.y ?? 0, node.z];
  const axis = suppliedAxis ?? chord.map(v => v / Math.hypot(...chord));
  const u = [tip.ux, tip.uy ?? 0, tip.uz];
  const axial = u.reduce((sum, v, i) => sum + v * axis[i], 0);
  assert.ok(Math.abs(axial / expected - 1) < 1e-10, 'signed axial response');
  assert.ok(Math.hypot(...u.map((v, i) => v - axial * axis[i])) <= 1e-10 * Math.abs(expected), 'transverse response');
}
function checkComponents(actual, expected, all) {
  for (const keys of [['ux', 'uy', 'uz'], ['rx', 'ry', 'rz']]) {
    const scale = Math.max(0, ...all.flatMap(d => keys.map(k => Math.abs(d[k] ?? 0))));
    for (const key of keys) {
      if (expected[key] !== undefined) {
        const value = expected[key];
        assert.ok(Number.isFinite(actual[key]) && Math.abs(actual[key] - value) <= 1e-10 * (value === 0 ? scale : Math.abs(value)), key);
      }
    }
  }
}
function checkLoadedCantilever(tip, solver, dimension) {
  const node = solver.nodes['2'];
  const load = solver.loads[0].data;
  const length = Math.hypot(node.x, node.y ?? 0, node.z);
  const compliance = length / (1000 * solver.materials['1'].e * solver.sections['1'].a);
  const components = [['ux', 'fx'], ['uz', 'fz']];
  if (dimension === 3) components.push(['uy', 'fy']);
  const scale = Math.max(...components.map(([, force]) => Math.abs(load[force] * compliance)));
  for (const [displacement, force] of components) {
    const expected = load[force] * compliance;
    const actual = tip[displacement];
    assert.ok(Number.isFinite(actual) && (expected === 0 ? Math.abs(actual) <= 1e-10 * scale : Math.abs(actual / expected - 1) < 1e-10), `${dimension}D ${displacement} response`);
  }
}
for (const dimension of [2, 3]) {
  for (const sign of [-1, 1]) {
    for (const response of ['reversed', 'transverse']) {
      test(`loaded cantilever rejects ${response} response, ${dimension}D, sign ${sign}`, () => {
        const solver = {
          nodes: { 2: { x: 2, y: 0, z: 0 } },
          loads: [{ data: { fx: sign, fy: 0, fz: 0 } }],
          materials: { 1: { e: 200000 } },
          sections: { 1: { a: 0.01 } },
        };
        const expected = sign * solver.nodes[2].x / (1000 * solver.materials[1].e * solver.sections[1].a);
        checkLoadedCantilever({ ux: expected, uy: 0, uz: 0 }, solver, dimension);
        const tip = response === 'reversed' ? { ux: -expected, uy: 0, uz: 0 } : { ux: 0, uy: 0, uz: expected };
        assert.throws(() => checkLoadedCantilever(tip, solver, dimension), /response|ux/);
      });
    }
  }
}
for (const tip of [{ ux: -1e-20, uz: 0 }, { ux: 0, uz: 1e-20 }]) {
  assert.throws(() => checkAxial(tip, { nodes: { 2: { x: 1, z: 0 } } }, 1e-20));
}
assert.throws(() => checkComponents({ ux: 1e-25, uz: 0 }, { ux: 0, uz: 0 }, [{ ux: 1e-20, uz: 0 }]));
function invokeCase(test) {
  const input = JSON.stringify(test.input);
  if (/^solve_[23]d$/.test(test.api)) return JSON.stringify({ converged: true, results: engine[test.api](test.input) });
  if (test.api.startsWith('solve_constrained')) return JSON.stringify({ converged: true, results: JSON.parse(engine[test.api](input)) });
  if (test.api.startsWith('certify_pdelta')) return JSON.stringify(JSON.parse(engine[test.api](input, test.maxIter ?? 1, 1e-10)).results);
  if (test.api.startsWith('solve_corotational')) return engine[test.api](input, test.maxIter ?? 2, 1e-10, 1);
  if (test.api.startsWith('solve_pdelta')) return engine[test.api](input, test.maxIter ?? 1, 1e-10);
  return engine[test.api](input);
}

function settlementOnlyCase(test, factor) {
  const baseline = structuredClone(test);
  if (baseline.api === 'solve_arc_length') {
    baseline.api = 'solve_corotational_2d';
    baseline.input = baseline.input.solver;
  }
  const solver = baseline.input.solver ?? baseline.input;
  solver.loads = [];
  for (const support of Object.values(solver.supports)) {
    for (const key of ['dx', 'dy', 'dz', 'drx', 'dry', 'drz']) {
      if (typeof support[key] === 'number') support[key] *= factor;
    }
  }
  return baseline;
}
function settlementOnlyResult(fixture, result) {
  const factor = result.finalLoadFactor ?? 1;
  if (fixture.settlementDisplacement) {
    const solver = fixture.input.solver;
    const support = solver.supports['1'];
    const { x: dx, z: dz } = solver.nodes['2'];
    const angle = factor * support.dry;
    const cosm1 = -2 * Math.sin(angle / 2) ** 2;
    return { converged: true, results: { displacements: [{ nodeId: 2,
      ux: factor * support.dx + cosm1 * dx - Math.sin(angle) * dz,
      uz: factor * support.dz + Math.sin(angle) * dx + cosm1 * dz, ry: angle }] } };
  }
  return JSON.parse(invokeCase(settlementOnlyCase(fixture, factor)));
}
function checkSettlementResponse(result, baseline, fixture) {
  const tip = result.results.displacements.find(d => d.nodeId === 2);
  assert.ok(Math.hypot(tip.ux, tip.uy ?? 0, tip.uz) > 0);
  if (fixture.settlementControl || fixture.settlementDisplacement) {
    const factor = result.finalLoadFactor;
    assert.ok(Number.isFinite(factor) && factor > 0);
    const baseTip = baseline.results.displacements.find(d => d.nodeId === 2);
    const expectedValues = fixture.settlementControl ?? fixture.settlementDisplacement;
    const scale = Math.max(...Object.values(expectedValues).map(Math.abs)) * factor;
    for (const [key, value] of Object.entries(expectedValues)) {
      const actual = tip[key] - (fixture.settlementDisplacement ? baseTip[key] : 0);
      const expected = factor * value;
      assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-10 * (expected === 0 ? scale : Math.abs(expected)), `signed settlement load response ${key}`);
    }
    return;
  }
  const reaction = (r, key) => r.results.reactions.filter(r => r.nodeId === 2).reduce((sum, r) => sum + r[key], 0);
  const factor = result.finalLoadFactor ?? 1;
  assert.ok(Number.isFinite(factor) && factor > 0);
  const scale = Math.max(...Object.values(fixture.settlementReaction).map(Math.abs)) * factor;
  for (const [key, value] of Object.entries(fixture.settlementReaction)) {
    const expected = value * factor;
    const actual = reaction(result, key) - reaction(baseline, key);
    assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-10 * (expected === 0 ? scale : Math.abs(expected)), `signed settlement load response ${key}`);
  }
}
for (const fixture of cases.filter(c => c.settlementResponse && !c.settlementControl)) {
  test(`settlement response rejects dropping fz: ${fixture.api} ${JSON.stringify(fixture.settlementReaction)}`, () => {
    const loaded = JSON.parse(invokeCase(fixture));
    const factor = loaded.finalLoadFactor ?? 1;
    const baseline = settlementOnlyResult(fixture, loaded);
    assert.equal(baseline.converged, true);
    checkSettlementResponse(loaded, baseline, fixture);
    const dropped = { ...baseline, finalLoadFactor: factor };
    assert.throws(() => checkSettlementResponse(dropped, baseline, fixture));
  });
}
let checked = 0;
for (const test of cases) {
  if (test.api) {
    const invoke = () => invokeCase(test);
    if (test.error) { assert.throws(invoke, new RegExp(test.error, 'i')); checked++; continue; }
    let result;
    try { result = JSON.parse(invoke()); } catch (error) { if (test.unconvergedOrError || test.allowRefusal) { checked++; continue; } throw error; }
    if (test.allowRefusal) {
      if (result.converged) {
        const w = test.arcWitness;
        const base = result.results.displacements.find(d => d.nodeId === 1);
        const tip = result.results.displacements.find(d => d.nodeId === 2);
        const ux = tip.ux - base.ux, uz = tip.uz - base.uz;
        const l0 = Math.hypot(w.dx, w.dz), ln = Math.hypot(w.dx + ux, w.dz + uz);
        const axial = 1000 * w.e * w.a * (2 * w.dx * ux + 2 * w.dz * uz + ux * ux + uz * uz) / (l0 * (ln + l0));
        const projected = axial * ((w.dx + ux) * w.tx + (w.dz + uz) * w.tz) / ln;
        assert.ok(Number.isFinite(result.finalLoadFactor));
        assert.ok(Math.abs(projected / (result.finalLoadFactor * w.force) - 1) < 1e-10);
      }
      checked++; continue;
    }
    assert.equal(result.converged, test.unconvergedOrError ? false : test.converged, test.api);
    if (test.nonzeroTip) {
      const tip = result.results.displacements.find(d => d.nodeId === 2);
      assert.ok(Math.hypot(tip.ux, tip.uy ?? 0, tip.uz) > 0);
    }
    if (test.zeroBending) {
      for (const force of result.results.elementForces) {
        for (const key of ['vStart', 'vEnd', 'mStart', 'mEnd']) assert.ok(force[key] === 0, key);
      }
    }
    if (test.settlementResponse) {
      const baseline = settlementOnlyResult(test, result);
      assert.equal(baseline.converged, true);
      checkSettlementResponse(result, baseline, test);
    }
    for (const expected of test.expectedDisplacements ?? []) {
      const actual = result.results.displacements.find(d => d.nodeId === expected.nodeId);
      checkComponents(actual, expected, test.expectedDisplacements);
    }
    if (test.expectedControl !== undefined) {
      const tip = result.results.displacements.find(d => d.nodeId === 2);
      assert.ok(Math.abs(tip.ux / test.expectedControl - 1) < 1e-10, 'signed controlled displacement');
    }
    for (const [i, expected] of (test.expectedAppliedSum ?? []).entries()) {
      if (expected !== null) assert.equal(result.results.equilibrium.appliedForceSum[i], expected);
    }
    if (test.soilBalance !== undefined) {
      const key = test.api === 'solve_ssi_2d' ? 'rz' : ['fx', 'fy', 'fz'][test.balanceDirection];
      const reaction = result.results.reactions.reduce((sum, r) => sum + r[key], 0);
      const soil = result.springResults.reduce((sum, r) => sum + r.reaction, 0);
      assert.ok(Math.abs((reaction - soil) / -test.soilBalance - 1) < 1e-10, `${test.api} soil reaction balance`);
    }
    checked++; continue;
  }
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
    checkAxial(tip, solver, expected * 0.1);
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
      checkAxial(tip, solver, test.expectedAxialDisplacement, test.expectedAxis);
    }
    for (const expected of test.expectedDisplacements ?? []) {
      const actual = result.results.displacements.find(d => d.nodeId === expected.nodeId);
      checkComponents(actual, expected, test.expectedDisplacements);
    }
    if (test.name === 'loaded cantilever' && test.converged) {
      const tip = result.results.displacements.find((d) => d.nodeId === 2);
      checkLoadedCantilever(tip, solver, dimension);
    }
    checked++;
  }
}
console.log(`${checked} nonlinear WASM convergence and refusal checks passed`);
