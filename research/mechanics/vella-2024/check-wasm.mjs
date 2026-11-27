import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '../../..');
const directory = path.join(root, 'web/public/research-wasm/vella-2024');
const bundle = process.argv[2] ?? path.join(directory, JSON.parse(fs.readFileSync(path.join(directory, 'build.json'))).build_id);
const { default: init, simulation_run } = await import(pathToFileURL(path.join(bundle, 'snap.js')));
await init({ module_or_path: fs.readFileSync(path.join(bundle, 'snap_bg.wasm')) });
const replay = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'reference-results/replay.json')));

// Bands: README, "WASM parity".
const PRE = { coordinate: 1.5e-7, value: 1e-9 };
const POST = { coordinate: 1e-6, value: 1e-6 };
const near = (a, b, abs, rel = 0) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= abs + rel * Math.max(Math.abs(a), Math.abs(b));
const TRACE = ['t', 'mu', 'height', 'thetaMin', 'thetaMax'];
const JUMP = ['amplification', 'amplificationFromMuA', 'tSnap', 'muSnap', 'tEnd', 'thetaDuring'];

function hasJumpValue(outcome, key) {
  if (key === 'amplification') return outcome.snapped && outcome.thetaBefore > 0;
  if (key === 'amplificationFromMuA') return outcome.snapped && outcome.thetaBeforeMuA > 0;
  return outcome.snapped;
}

export function compare(run, reference) {
  const problems = [];
  const check = (ok, what) => { if (!ok) problems.push(what); };
  for (const key of ['muA', 'muStar', 'heightA', 'heightStar']) check(near(run.critical[key], reference.critical[key], 1e-9), `critical.${key}`);
  check(run.outcome.snapped === reference.outcome.snapped, 'outcome.snapped');
  for (const key of ['thetaBefore', 'thetaBeforeMuA']) check(near(run.outcome[key], reference.outcome[key], 1e-8, 1e-6), `outcome.${key}`);
  for (const key of JUMP) {
    const actualDefined = hasJumpValue(run.outcome, key);
    const expectedDefined = hasJumpValue(reference.outcome, key);
    const same = actualDefined === expectedDefined && (actualDefined
      ? near(run.outcome[key], reference.outcome[key], 1e-8, 1e-6)
      : run.outcome[key] === null && reference.outcome[key] === null);
    check(same, `outcome.${key}`);
  }
  check(run.frames.length === reference.frames.length, 'frame count');
  const bandAt = t => reference.outcome.snapped && t >= reference.outcome.tSnap ? POST : PRE;
  const tolerance = (key, t) => key === 't' || key === 'mu' ? PRE.value : bandAt(t).value;
  const count = reference.trace?.t?.length;
  for (const trace of [run.trace, reference.trace]) {
    check(trace && Object.keys(trace).every(key => TRACE.includes(key)), 'trace series');
  }
  for (const key of TRACE) {
    const actual = run.trace?.[key];
    const expected = reference.trace?.[key];
    if (!Array.isArray(actual) || !Array.isArray(expected) || !count || actual.length !== count || expected.length !== count) {
      problems.push(`trace.${key} length`);
      continue;
    }
    for (let i = 0; i < count; i++) {
      check(near(actual[i], expected[i], tolerance(key, reference.trace.t[i])), `trace.${key}[${i}]`);
    }
  }
  run.frames.forEach((f, i) => {
    const r = reference.frames[i];
    if (!r) return;
    for (const key of ['t', 'mu', 'theta', 'height']) check(near(f[key], r[key], tolerance(key, r.t)), `frame ${i} ${key}`);
    for (const key of ['x', 'z']) {
      check(f[key].length === r[key].length, `frame ${i} ${key} length`);
      f[key].forEach((v, j) => check(near(v, r[key][j], bandAt(r.t).coordinate), `frame ${i} ${key}[${j}]`));
    }
  });
  return problems;
}

const run = JSON.parse(simulation_run(JSON.stringify(replay.settings)));
assert.deepEqual(compare(run, replay), []);
const shifted = structuredClone(replay);
shifted.frames[3].x[10] += 1e-5;
assert.deepEqual(compare(run, shifted), ['frame 3 x[10]']);
const tilted = structuredClone(replay);
tilted.frames[2].theta += 1e-6;
assert.deepEqual(compare(run, tilted), ['frame 2 theta']);
const clamp = replay.frames[1].z.indexOf(0);
assert.ok(clamp >= 0 && run.frames[1].z[clamp] === 0);
const unset = structuredClone(run);
unset.frames[1].z[clamp] = null;
assert.deepEqual(compare(unset, replay), [`frame 1 z[${clamp}]`]);
const missing = structuredClone(run);
missing.outcome.tSnap = null;
assert.deepEqual(compare(missing, replay), ['outcome.tSnap']);
const unsnapped = structuredClone(replay);
unsnapped.outcome = { ...unsnapped.outcome, snapped: false, ...Object.fromEntries(JUMP.map(k => [k, null])) };
assert.deepEqual(compare(run, unsnapped), ['outcome.snapped', ...JUMP.map(k => `outcome.${k}`)]);
assert.throws(() => simulation_run(JSON.stringify({ ...replay.settings, rate: -1 })));
assert.throws(() => simulation_run('{}'));

{
  const inverted = structuredClone(unsnapped);
  inverted.frames = inverted.frames.slice(0, inverted.frames.findIndex(f => f.height > 0));
  const firstPositive = inverted.trace.height.findIndex(h => h > 0);
  inverted.trace = Object.fromEntries(Object.entries(inverted.trace).map(([key, values]) => [key, values.slice(0, firstPositive)]));
  assert.deepEqual(compare(inverted, inverted), []);
  const perturbed = structuredClone(inverted);
  perturbed.frames[1].theta += 1e-7;
  assert.deepEqual(compare(perturbed, inverted), ['frame 1 theta']);
  inverted.trace.thetaMax[0] = 0;
  const atLimit = structuredClone(inverted);
  atLimit.trace.thetaMax[0] = PRE.value;
  assert.deepEqual(compare(atLimit, inverted), []);
  atLimit.trace.thetaMax[0] += Number.EPSILON * PRE.value;
  assert.deepEqual(compare(atLimit, inverted), ['trace.thetaMax[0]']);
}

for (const oneEnd of [true, false]) {
  const trial = JSON.parse(simulation_run(JSON.stringify({ ...replay.settings, n: 24, rate: 0.7, dt: 0.1, ramp: 0, oneEnd })));
  assert.ok(trial.outcome.snapped);
  for (const f of trial.frames) {
    const shortening = 1 - (f.x.at(-1) - f.x[0]);
    assert.ok(near(shortening, f.mu * trial.settings.alpha ** 2, PRE.coordinate));
  }
  assert.ok(Math.abs(trial.trace.mu.at(-1) - 0.02) < 1e-12);
  assert.equal(trial.frames.at(-1).t, trial.trace.t.at(-1));
  const k = trial.trace.height.findIndex(h => h > 0);
  assert.ok(trial.trace.t[k - 1] <= trial.outcome.tSnap && trial.outcome.tSnap < trial.trace.t[k]);
}

const earlyFold = JSON.parse(simulation_run(JSON.stringify({
  ...replay.settings, start: 0.27, n: 24, rate: 0.7, ramp: 0, dt: 0.1, oneEnd: true, imperfection: 0,
})));
assert.ok(earlyFold.outcome.snapped && earlyFold.outcome.thetaBefore > 0 && earlyFold.outcome.thetaBeforeMuA > 0);
assert.ok(Number.isFinite(earlyFold.outcome.amplification) && Number.isFinite(earlyFold.outcome.amplificationFromMuA));

{
  const crossing = replay.trace.height.findIndex(h => h > 0);
  assert.ok(crossing > 0);
  for (const key of Object.keys(replay.trace)) {
    for (const side of ['run', 'reference']) {
      const compareMutation = mutate => {
        const copy = structuredClone(replay);
        mutate(copy);
        return side === 'run' ? compare(copy, replay) : compare(replay, copy);
      };
      for (const mutate of [
        r => { delete r.trace; },
        r => { delete r.trace[key]; },
        r => { r.trace[key].pop(); },
        r => { r.trace[key].push(0); },
        r => { r.trace[key][0] = NaN; },
        r => { r.trace[key][crossing] = null; },
      ]) assert.ok(compareMutation(mutate).length > 0, `${side} invalid trace.${key}`);
    }
    for (const index of [crossing - 1, crossing]) {
      const tolerance = ['t', 'mu'].includes(key) || index < crossing ? PRE.value : POST.value;
      for (const factor of [0.5, 2]) {
        const changed = structuredClone(replay);
        changed.trace[key][index] += tolerance * factor;
        assert.equal(compare(changed, replay).length, factor < 1 ? 0 : 1, `trace.${key}[${index}]`);
      }
    }
  }
}


{
  const zero = structuredClone(replay);
  Object.assign(zero.outcome, { thetaBefore: 0, thetaBeforeMuA: 0, amplification: null, amplificationFromMuA: null });
  assert.ok(zero.outcome.snapped);
  assert.deepEqual(compare(zero, zero), []);
  for (const [angle, ratio] of [['thetaBefore', 'amplification'], ['thetaBeforeMuA', 'amplificationFromMuA']]) {
    const finite = structuredClone(zero);
    finite.outcome[ratio] = 0;
    assert.deepEqual(compare(finite, finite), [`outcome.${ratio}`]);
    assert.deepEqual(compare(finite, zero), [`outcome.${ratio}`]);
    assert.deepEqual(compare(zero, finite), [`outcome.${ratio}`]);
    const tiny = structuredClone(zero);
    tiny.outcome[angle] = Number.EPSILON;
    assert.deepEqual(compare(tiny, zero), [`outcome.${ratio}`]);
    assert.deepEqual(compare(zero, tiny), [`outcome.${ratio}`]);
    tiny.outcome[ratio] = tiny.outcome.thetaDuring / tiny.outcome[angle];
    assert.deepEqual(compare(tiny, tiny), []);
    assert.deepEqual(compare(finite, tiny), [`outcome.${ratio}`]);
  }
}

{
  const { dynamics } = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'reference-results/study.json')));
  const sweep = dynamics.one_end.at(-1);
  const control = dynamics.one_end_unseeded.at(-1);
  assert.equal(control.rate, sweep.rate);
  const settings = { ...dynamics.base, oneEnd: true, rate: sweep.rate, start: dynamics.one_end_start };
  const index = 3;
  const phase = 2 * Math.PI * index / sweep.phase_amplifications.length;
  for (const [seed, angle, expected] of [
    [settings.imperfection, phase, sweep.phase_amplifications[index]],
    [0, 0, control.amplification],
  ]) {
    const trial = JSON.parse(simulation_run(JSON.stringify({ ...settings, imperfection: seed, phase: angle })));
    assert.ok(trial.outcome.snapped && near(trial.outcome.amplification, expected, 1e-8, 1e-6));
  }
}

console.log('production-mode WASM: replay agrees in critical points, outcome, every frame and every plotted trace series; null and missing values and bad settings are refused');
