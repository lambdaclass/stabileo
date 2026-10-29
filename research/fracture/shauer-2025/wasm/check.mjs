// Runs the built browser bundle in Node on the reference notched-plate configuration and compares
// every load step with the reference outputs: same tolerances as tests/reference.rs.
//   node check.mjs <bundle dir> <reference ex2_steps.csv>
import { readFileSync } from 'node:fs';
import { checkFields, expectedStress, maxDifference } from '../../../../web/src/components/research/shauer2025/field-check.mjs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [dir, csvPath] = process.argv.slice(2);
const glue = await import(pathToFileURL(join(dir, 'phasefield.js')).href);
glue.initSync({ module: readFileSync(join(dir, 'phasefield_bg.wasm')) });
const rows = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
const head = rows.shift().split(',');
const ref = rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [head[i], v])));
const sim = new glue.Simulation(glue.Simulation.referenceConfig());
const base = dirname(csvPath);
const mesh = JSON.parse(readFileSync(join(base, 'ex2_mesh.json'), 'utf8'));
const column = name => readFileSync(join(base, name), 'utf8').trim().split(/\r?\n/).slice(1).flatMap(row => row.split(',').map(Number));
const snapshots = { damage: Object.fromEntries([56, 57, 78].map(k => [k, column(`ex2_damage_step${String(k).padStart(3, '0')}.csv`)])), displacement: { 56: column('ex2_displacement_step056.csv') } };
const nodes = sim.nodes(), elements = sim.elements();
function fingerprint(values, integer) {
  let h = 0xcbf29ce484222325n;
  const bytes = new ArrayBuffer(8), view = new DataView(bytes);
  for (const value of values) {
    if (integer) view.setBigInt64(0, BigInt(value), true); else view.setFloat64(0, value, true);
    for (const b of new Uint8Array(bytes)) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
  }
  return h.toString(16).padStart(16, '0');
}
let fieldsOk = nodes.length === 2 * mesh.nodes && elements.length === 4 * mesh.elements
  && fingerprint(nodes, false) === mesh.nodes_fnv1a64 && fingerprint(elements, true) === mesh.elements_fnv1a64;
const material = JSON.parse(glue.Simulation.referenceConfig()).material;
const steps = [];
const t0 = Date.now();
for (let s; (s = sim.advance()) !== undefined; ) {
  const step = JSON.parse(s);
  steps.push(step);
  const damage = sim.damage(), displacement = sim.displacement(), stress = sim.elementStress();
  const syy = stress.filter((_, i) => i % 3 === 1);
  fieldsOk &&= stress.length === 3 * mesh.elements && checkFields({ step, damage, displacement, syy }, nodes, elements, snapshots, material).length === 0;
  const expected = expectedStress(nodes, elements, damage, displacement, material);
  fieldsOk &&= maxDifference(stress, expected) <= 1e-10 + Math.max(...expected.map(Math.abs)) * 1e-9;
}
const peak = ref.reduce((a, r, i) => (Number(r.reaction) > Number(ref[a].reaction) ? i : a), 0);
let ok = fieldsOk && steps.length === ref.length;
let worstPre = 0, worstAll = 0, iters = true;
steps.forEach((s, i) => {
  const fields = ['step', 'pseudotime', 'displacement', 'reaction', 'iterations', 'residual', 'damage_max', 'damage_min', 'elastic_energy', 'fracture_energy'];
  if (s.converged !== true || !fields.every((key) => typeof s[key] === 'number' && Number.isFinite(s[key])) || !ref[i]) {
    ok = false;
    return;
  }
  if (s.step !== i) ok = false;
  if (i <= peak && Math.abs(s.damage_max - Number(ref[i].damage_max)) > Math.abs(Number(ref[i].damage_max)) * 1e-9) ok = false;
  const r = Number(ref[i].reaction);
  if (i <= peak) worstPre = Math.max(worstPre, Math.abs(s.reaction - r) / Math.abs(r));
  worstAll = Math.max(worstAll, Math.abs(s.reaction - r));
  if (String(s.iterations) !== ref[i].staggered_iterations) iters = false;
});
ok = ok && iters && worstPre <= 1e-9 && worstAll <= 1e-5;
console.log(JSON.stringify({ steps: steps.length, identicalIterations: iters, worstRelForceToPeak: worstPre, worstAbsForce: worstAll, seconds: (Date.now() - t0) / 1000, ok }));
process.exit(ok ? 0 : 1);
