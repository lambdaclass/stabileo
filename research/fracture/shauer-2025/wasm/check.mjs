// Runs the built browser bundle in Node on the reference notched-plate configuration and compares
// every load step with the reference outputs: same tolerances as tests/reference.rs.
//   node check.mjs <bundle dir> <reference ex2_steps.csv>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [dir, csvPath] = process.argv.slice(2);
const glue = await import(pathToFileURL(join(dir, 'phasefield.js')).href);
glue.initSync({ module: readFileSync(join(dir, 'phasefield_bg.wasm')) });
const rows = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const head = rows.shift().split(',');
const ref = rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [head[i], v])));
const sim = new glue.Simulation(glue.Simulation.referenceConfig());
const steps = [];
const t0 = Date.now();
const nodeCount = sim.nodes().length / 2;
const elementCount = sim.elements().length / 4;
let validFields = Number.isInteger(nodeCount) && nodeCount > 0;
for (let s; (s = sim.advance()) !== undefined; ) {
  steps.push(JSON.parse(s));
  for (const [values, length] of [[sim.damage(), nodeCount], [sim.displacement(), nodeCount * 2], [sim.elementStress(), elementCount * 3]]) {
    validFields &&= values.length === length && values.every(Number.isFinite);
  }
}
sim.free();
const peak = ref.reduce((a, r, i) => (Number(r.reaction) > Number(ref[a].reaction) ? i : a), 0);
let ok = validFields && steps.length === ref.length;
let worstPre = 0, worstAll = 0, iters = true;
steps.forEach((s, i) => {
  const fields = ['step', 'pseudotime', 'displacement', 'reaction', 'iterations', 'residual', 'damage_max', 'damage_min', 'elastic_energy', 'fracture_energy'];
  if (s.converged !== true || !fields.every((key) => typeof s[key] === 'number' && Number.isFinite(s[key])) || !ref[i]) {
    ok = false;
    return;
  }
  const r = Number(ref[i].reaction);
  if (i <= peak) worstPre = Math.max(worstPre, Math.abs(s.reaction - r) / Math.abs(r));
  worstAll = Math.max(worstAll, Math.abs(s.reaction - r));
  if (String(s.iterations) !== ref[i].staggered_iterations) iters = false;
});
ok = ok && iters && worstPre <= 1e-9 && worstAll <= 1e-5;
console.log(JSON.stringify({ comparisonScope: 'force history and iteration counts; nodal fields checked for shape and finiteness only', validFields, steps: steps.length, identicalIterations: iters, worstRelForceToPeak: worstPre, worstAbsForce: worstAll, seconds: (Date.now() - t0) / 1000, ok }));
process.exit(ok ? 0 : 1);
