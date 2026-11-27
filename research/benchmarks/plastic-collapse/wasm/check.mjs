import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from '../../../../web/node_modules/vite/dist/node/index.js';
import assert from 'node:assert/strict';

const write = process.argv.includes('--write');
const here = new URL('../', import.meta.url);
const COMMAND = 'node research/benchmarks/plastic-collapse/wasm/check.mjs [--write]';
const replay = JSON.parse(readFileSync(new URL('results/stabileo_results.json', here), 'utf8')).result;
const server = await createServer({ root: new URL('../../../../web/', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { PAPER, portal, run, checks: pageChecks, mechanisms, governing, residual, cornerMoment, collapseState, hingeNode, relativeResidual, RELATIVE_EQUILIBRIUM } = await server.ssrLoadModule('/src/components/research/plastic-collapse/case.ts');
  const check = (metric, observed, tolerance) => ({ metric, observed, tolerance, passed: observed <= tolerance });
  const list = [];

  const result = await run(PAPER);
  const lambda = result.collapseFactor;
  const { moments } = collapseState(result);
  const r = residual(result, PAPER);
  list.push(check('our example (L = 4 m, h = 3 m, V/H = 2): |λ − 6Mp/(Hh + VL/2)| = |λ − 600/7|', Math.abs(lambda - mechanisms(PAPER).combined), portal.tolerance));
  list.push(check('our example: solver reports a mechanism; number of warnings', result.isMechanism ? (result.warnings ?? []).length : Infinity, 0));
  assert.equal(result.steps.length, portal.events.length);
  list.push(check('our example: largest |event λ − recorded native event λ| over the four hinge events', Math.max(...result.steps.map((s, i) => Math.abs(s.loadFactor - portal.events[i].loadFactor))), portal.tolerance));
  const formed = result.steps.flatMap(s => s.hingesFormed ?? []);
  assert.deepEqual(formed.map(h => [h.elementId, h.end, Math.sign(h.momentY)]), portal.events.map(e => [e.elementId, e.end, e.momentSign]));
  list.push(check('our example: hinges at the right roof corner, midspan, right base and left base in that order; largest ||My|/Mp − 1| at a hinge', Math.max(...formed.map(h => Math.abs(Math.abs(h.momentY) / portal.mp - 1))), portal.yieldTolerance));
  assert.ok(!formed.some(h => hingeNode(h) === 2), 'left roof corner yielded');
  list.push(check('our example: largest excess of |My|/Mp over 1 at any member end at collapse', Math.max(0, ...[...moments.values()].flatMap(m => [m.myStart, m.myEnd]).map(m => Math.abs(m) / portal.mp - 1)), portal.yieldTolerance));
  list.push(check('our example: largest global equilibrium residual of the summed reactions (ΣFx, ΣFz, ΣMy)', Math.max(Math.abs(r.fx), Math.abs(r.fz), Math.abs(r.my)), portal.equilibriumTolerance));
  list.push(check('our example: |left roof corner moment − (3Mp − λHh)| from statics', Math.abs(moments.get(1).myEnd - cornerMoment(lambda, PAPER)), portal.tolerance));
  function byModelId(records, key, model) {
    const ids = Object.values(model).map(item => item.id).sort((a, b) => a - b);
    assert.deepEqual(records.map(record => record[key]).sort((a, b) => a - b), ids, `portal ${key} identities`);
    return new Map(records.map(record => [record[key], record]));
  }
  function pageVerdicts(output, parameters) {
    const verdicts = pageChecks(output, parameters);
    const ids = ['collapse', 'mechanism', 'hinges', 'yield', 'equilibrium'];
    if (governing(parameters) === 'combined') ids.push('corner');
    assert.deepEqual(verdicts.map(c => c.id).sort(), ids.sort(), 'portal check identities');
    return verdicts;
  }
  assert.equal(replay.steps.length, result.steps.length);
  let du = 0;
  result.steps.forEach((step, index) => {
    const event = portal.events[index];
    for (const measurement of [step, replay.steps[index]]) {
      assert.ok(Number.isFinite(measurement.loadFactor) && Math.abs(measurement.loadFactor - event.loadFactor) <= portal.tolerance, `portal step ${index}: load`);
      for (const hinge of measurement.hingesFormed) {
        assert.ok(Number.isFinite(hinge.momentY) && Math.abs(Math.abs(hinge.momentY) / portal.mp - 1) <= portal.yieldTolerance, `portal step ${index}: yield magnitude`);
      }
      assert.deepEqual(measurement.hingesFormed.map(h => [h.elementId, h.end, Math.sign(h.momentY), h.step]),
        [[event.elementId, event.end, event.momentSign, index]], `portal step ${index}: hinge`);
    }
    const recorded = replay.steps[index].results;
    for (const [field, key, model, components] of [
      ['displacements', 'nodeId', portal.input.solver.nodes, ['ux', 'uz']],
      ['elementForces', 'elementId', portal.input.solver.elements, ['myStart', 'myEnd']],
    ]) {
      const actual = byModelId(step.results[field], key, model);
      const reference = byModelId(recorded[field], key, model);
      for (const [id, value] of actual) {
        for (const component of components) {
          assert.ok(Number.isFinite(value[component]) && Number.isFinite(reference.get(id)[component]), `portal ${field} ${component}: finite measurement`);
          const difference = Math.abs(value[component] - reference.get(id)[component]);
          assert.ok(Number.isFinite(difference), component);
          if (field === 'displacements') du = Math.max(du, difference);
          else assert.ok(difference <= portal.mp * portal.yieldTolerance, component);
        }
      }
    }
  });
  list.push(check('WASM against the committed native replay: largest nodal ux/uz difference over every hinge event (m)', du, 1e-9));
  list.push(check('WASM against the committed native replay: |λ difference|', Math.abs(lambda - replay.collapseFactor), portal.tolerance));
  assert.ok(pageVerdicts(result, PAPER).every(c => c.passed));

  const sweep = [
    { ...PAPER, vertical: 0.5 * PAPER.horizontal }, { ...PAPER, vertical: 1 * PAPER.horizontal }, { ...PAPER, vertical: 4 * PAPER.horizontal },
    { ...PAPER, height: 2.5 }, { ...PAPER, height: 5 },
  ];
  const hand = [{ case: 'our example', ...PAPER, bounds: mechanisms(PAPER), governing: governing(PAPER) }];
  for (const p of sweep) {
    const res = await run(p);
    const mode = governing(p);
    assert.ok(mode, `tie at ${JSON.stringify(p)}`);
    const name = `V/H = ${p.vertical / p.horizontal}, h = ${p.height} m (${mode} governs)`;
    list.push(check(`${name}: |λ − lowest hand bound|`, Math.abs(res.collapseFactor - mechanisms(p)[mode]), portal.tolerance));
    list.push(check(`${name}: largest equilibrium residual relative to λH, λV and λ(Hh + VL/2)`, relativeResidual(residual(res, p), res.collapseFactor, p), RELATIVE_EQUILIBRIUM));
    const failing = pageVerdicts(res, p).filter(c => !c.passed).map(c => c.id);
    list.push(check(`${name}: page checks failing (mechanism, hinge set of the ${mode} mechanism, yield, equilibrium${mode === 'combined' ? ', corner' : ''})`, failing.length, 0));
    hand.push({ case: name, ...p, bounds: mechanisms(p), governing: mode });
  }

  const failing = list.filter(c => !c.passed);
  assert.equal(failing.length, 0, `failing checks: ${JSON.stringify(failing, null, 2)}`);
  const validation = { what: 'Production 3D plastic-collapse solver (WASM) on a fixed-base portal against independent virtual-work mechanism bounds and statics; written by wasm/check.mjs in the Research workflow.', command: COMMAND, checks: list };
  const reference = { what: 'Kinematic upper bounds by virtual work: beam 8Mp/(VL), sway 4Mp/(Hh), combined 6Mp/(Hh + VL/2); our own hand derivations (README), not values from Horne (1979).', cases: hand };
  const text = v => JSON.stringify(v, null, 2) + '\n';
  const files = { validation: new URL('VALIDATION.json', here), reference: new URL('reference-results/hand_calculation.json', here), manifest: new URL('reference-results/MANIFEST.json', here) };
  const manifest = referenceText => ({
    what: 'Hand-calculated mechanism bounds for our example and the parameter sweep; no published values (the book was not available to check).',
    source: 'wasm/check.mjs from engine/tests/benchmarks/plastic_collapse.json',
    command: COMMAND,
    files_sha256: { 'hand_calculation.json': createHash('sha256').update(referenceText).digest('hex') },
  });
  if (write) {
    writeFileSync(files.validation, text(validation));
    writeFileSync(files.reference, text(reference));
    writeFileSync(files.manifest, text(manifest(text(reference))));
  } else {
    const same = (a, b, path) => {
      if (typeof a === 'number' && typeof b === 'number') return assert.ok(Math.abs(a - b) <= Math.max(1e-9 * Math.abs(b), 1e-15), `${path}: ${a} vs committed ${b}`);
      if (a && typeof a === 'object') {
        assert.deepEqual(Object.keys(a), Object.keys(b), path);
        for (const k of Object.keys(a)) same(a[k], b[k], `${path}.${k}`);
        return;
      }
      assert.equal(a, b, path);
    };
    same(validation, JSON.parse(readFileSync(files.validation, 'utf8')), 'VALIDATION.json');
    const committedReference = readFileSync(files.reference, 'utf8');
    same(reference, JSON.parse(committedReference), 'hand_calculation.json');
    assert.deepEqual(JSON.parse(readFileSync(files.manifest, 'utf8')), manifest(committedReference), 'MANIFEST.json is stale: rerun with --write');
  }
  console.log(JSON.stringify(list.map(c => [c.metric, c.observed, c.tolerance]), null, 2));
} finally { await server.close(); }
