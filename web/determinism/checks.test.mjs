/**
 * Negative tests of the determinism gate: each requirement of checks.mjs, and the run
 * comparison, fails when the thing it guards breaks. Built on the real Node run (needs the
 * WASM build), each mutation flips one field of one result. `node --test
 * determinism/checks.test.mjs` from web/ (run by the CI determinism job).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { runInNode } from './node-run.mjs';
import { requirementProblems, runDifferences, MUST_CERTIFY, MUST_SUCCEED } from './checks.mjs';
import { canonical } from './cases.mjs';

let reference;
before(async () => {
  reference = await runInNode({ values: true });
});

const clone = (x) => structuredClone(x);

/** The reference with `mutate(value)` applied to the case named `name`. */
function mutated(name, mutate) {
  const run = clone(reference);
  const r = run.find((x) => x.name === name);
  assert.ok(r, `no case ${name}`);
  mutate(r.value, r);
  return run;
}

/** The mutation must make the checks report a problem on that case. */
function mustFail(name, mutate, what) {
  const problems = requirementProblems(mutated(name, mutate));
  assert.ok(problems.some((p) => p.startsWith(`${name}:`)), `${what}: not detected (${JSON.stringify(problems)})`);
}

test('the real run passes', () => {
  assert.deepEqual(requirementProblems(reference), []);
});

test('every certificate kind is checked on some case', () => {
  for (const [re] of MUST_CERTIFY) assert.ok(reference.some((r) => re.test(r.name)), String(re));
});

test('a refused required case fails', () => {
  for (const name of ['portal-2d/solve_2d', 'portal-3d/certify_harmonic_3d', 'continuous-2d/solve_harmonic_2d', 'plastic-3d-portal/export_plastic_bundle_3d']) {
    mustFail(name, (_v, r) => { r.text = 'ERR: refused'; delete r.value; }, `${name} refused`);
  }
});

test('dropping any required kind fails', () => {
  for (const re of [...MUST_SUCCEED, ...MUST_CERTIFY.map(([r]) => r)]) {
    const run = reference.filter((r) => !re.test(r.name));
    assert.ok(requirementProblems(run).includes(`no case matches ${re}`), `dropping ${re} not detected`);
  }
});

test('status certificates: linear, P-Delta, modal, spectral, harmonic, buckling', () => {
  for (const name of [
    'portal-2d/certify_linear_2d', 'portal-3d/certify_linear_3d', 'tower-3d/certify_pdelta_3d', 'two-story-2d/certify_modal_2d',
    'random-3d/certify_spectral_3d', 'continuous-2d/certify_harmonic_2d', 'portal-2d/certify_buckling_2d', 'space-truss-3d/certify_buckling_3d',
  ]) {
    mustFail(name, (v) => { v.certificate.status = 'uncertified'; }, `${name} uncertified`);
    mustFail(name, (v) => { delete v.certificate; }, `${name} without a certificate`);
  }
});

test('time history: stability and residual separately', () => {
  const name = 'portal-3d/certify_time_history_3d';
  mustFail(name, (v) => { v.certificate.stabilityCertified = false; }, 'stability');
  mustFail(name, (v) => { v.certificate.residualReason = 'residual too large'; }, 'residual reason');
  mustFail(name, (v) => { v.certificate.residual = null; }, 'no residual');
});

test('plastic samples', () => {
  for (const name of ['plastic-3d-cantilever/certify_plastic_3d']) {
    mustFail(name, (v) => { v.certificate.certified = false; }, name);
  }
});

test('multi-case: each case, each combination and the envelope individually', () => {
  for (const name of ['combo-2d/certify_multi_case_2d', 'tower-3d/certify_multi_case_3d']) {
    const v = reference.find((r) => r.name === name).value;
    v.cases.forEach((_c, i) => mustFail(name, (w) => { w.cases[i].certificate.status = 'uncertified'; }, `${name} case ${i}`));
    v.combinations.forEach((_c, i) => mustFail(name, (w) => { w.combinations[i].certified = false; }, `${name} combination ${i}`));
    mustFail(name, (w) => { w.envelope.certified = false; }, `${name} envelope`);
    // The review's scenario: every case certified, every combination and the envelope not.
    mustFail(name, (w) => { w.combinations.forEach((c) => { c.certified = false; }); w.envelope.certified = false; }, `${name} combinations and envelope`);
    mustFail(name, (w) => { w.combinations = []; }, `${name} no combinations`);
    mustFail(name, (w) => { w.cases = []; }, `${name} no cases`);
  }
});

test('steel: each member and the analysis under it', () => {
  const name = 'two-story-2d/certify_steel_multi_case_2d';
  const v = reference.find((r) => r.name === name).value;
  assert.ok(v.steel.length > 1);
  v.steel.forEach((_m, i) => mustFail(name, (w) => { w.steel[i].certified = false; }, `member ${i}`));
  mustFail(name, (w) => { w.steel = []; }, 'no members');
  mustFail(name, (w) => { w.analysis.envelope.certified = false; }, 'analysis envelope');
  mustFail(name, (w) => { w.analysis.combinations[0].certified = false; }, 'analysis combination');
});

test('run comparison: identical runs agree', () => {
  assert.deepEqual(runDifferences(reference, clone(reference)), []);
});

test('run comparison: one bit of one float differs', () => {
  for (const name of ['portal-2d/certify_linear_2d', 'tower-3d/certify_modal_3d']) {
    const run = clone(reference);
    const r = run.find((x) => x.name === name);
    // canonical text (JsValue outputs) carries hex bits; serde text carries shortest decimals.
    const m = /d([0-9a-f]{16})/.exec(r.text);
    if (m) {
      const flipped = (BigInt(`0x${m[1]}`) ^ 1n).toString(16).padStart(16, '0');
      r.text = r.text.replace(m[0], `d${flipped}`);
    } else {
      const n = /\d\.(\d+)e?/.exec(r.text);
      assert.ok(n, name);
      const x = Number(r.text.slice(n.index).match(/^[0-9.e+-]+/)[0]);
      const v = new DataView(new ArrayBuffer(8));
      v.setFloat64(0, x);
      v.setBigUint64(0, v.getBigUint64(0) ^ 1n);
      r.text = r.text.replace(r.text.slice(n.index).match(/^[0-9.e+-]+/)[0], String(v.getFloat64(0)));
    }
    const d = runDifferences(reference, run);
    assert.equal(d.length, 1, name);
    assert.ok(d[0].startsWith(name));
  }
});

test('run comparison: a missing, extra or reordered case', () => {
  assert.ok(runDifferences(reference, reference.slice(1))[0].startsWith('case lists differ'));
  assert.ok(runDifferences(reference, [...reference, reference[0]])[0].startsWith('case lists differ'));
  const swapped = clone(reference);
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.ok(runDifferences(reference, swapped)[0].startsWith('case lists differ'));
});

test('canonical text tells apart what the bits tell apart', () => {
  assert.notEqual(canonical(0), canonical(-0));
  assert.notEqual(canonical(0.1 + 0.2), canonical(0.3));
  assert.equal(canonical(Number.NaN), canonical(-Number.NaN));
  assert.notEqual(canonical(new Map([['a', 1]])), canonical({ a: 1 }));
  assert.notEqual(canonical([1, 2]), canonical([2, 1]));
  assert.notEqual(canonical({ a: 1, b: 2 }), canonical({ a: 1, b: 3 }));
});

test('2D plastic requires the specific refusal, never arbitrary errors or success', () => {
  const refused = reference.filter(r => /^plastic-2d-.*\/((solve|certify)_plastic_2d|export_plastic_bundle_2d)$/.test(r.name));
  assert.equal(refused.length, 6);
  for (const r of refused) {
    for (const text of ['ERR: unrelated', '{}', r.text.replaceAll('758', '759'), r.text.replaceAll('PL-2D-INVARIANCE', 'OTHER')]) {
      mustFail(r.name, (_v, r) => { r.text = text; }, text);
    }
  }
});
