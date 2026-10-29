import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the WASM checker rejects unconverged, nonfinite or missing step results', () => {
  const dir = mkdtempSync(join(tmpdir(), 'research-wasm-check-'));
  try {
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    writeFileSync(join(dir, 'phasefield_bg.wasm'), '');
    const csv = join(dir, 'steps.csv');
    writeFileSync(csv, 'reaction,staggered_iterations,damage_max\n1,1,0.1\n');
    const fingerprint = (values, integer) => {
      let h = 0xcbf29ce484222325n;
      const bytes = new ArrayBuffer(8), view = new DataView(bytes);
      for (const v of values) {
        if (integer) view.setBigInt64(0, BigInt(v), true); else view.setFloat64(0, v, true);
        for (const b of new Uint8Array(bytes)) h = BigInt.asUintN(64, (h ^ BigInt(b)) * 0x100000001b3n);
      }
      return h.toString(16).padStart(16, '0');
    };
    writeFileSync(join(dir, 'ex2_mesh.json'), JSON.stringify({ nodes: 4, elements: 1, nodes_fnv1a64: fingerprint([0,0,1,0,1,1,0,1], false), elements_fnv1a64: fingerprint([0,1,2,3], true) }));
    for (const k of ['056', '057', '078']) writeFileSync(join(dir, `ex2_damage_step${k}.csv`), 'd\n0\n0\n0\n0\n');
    writeFileSync(join(dir, 'ex2_displacement_step056.csv'), 'ux,uy\n0,0\n0,0\n0,0\n0,0\n');
    const good = { converged: true, step: 0, pseudotime: 1, displacement: 1, reaction: 1,
      iterations: 1, residual: 0, damage_max: 0.1, damage_min: 0, elastic_energy: 1, fracture_energy: 0 };
    const variants = [[{}, 0, ''], [{ converged: false }, 1, ''], [{ residual: null }, 1, ''], [{ residual: undefined }, 1, ''], [{ elastic_energy: Infinity }, 1, '']];
    for (const method of ['damage', 'displacement', 'elementStress']) {
      const length = { damage: 4, displacement: 8, elementStress: 3 }[method];
      variants.push([{}, 1, `${method}() { return new Float64Array(${length}); }`]);
      variants.push([{}, 1, `${method}() { return new Float64Array(${length}).fill(0.03); }`]);
      variants.push([{}, 1, `${method}() { return new Float64Array(${length - 1}); }`]);
    }
    variants.push([{}, 1, 'nodes() { return new Float64Array(8); }']);
    variants.push([{}, 1, 'elements() { return new Uint32Array(4); }']);
    for (const [patch, expected, override] of variants) {
      const result = JSON.stringify({ ...good, ...patch });
      writeFileSync(join(dir, 'phasefield.js'), `export function initSync() {}\nexport class Simulation {
        static referenceConfig() { return '{"material":{"e":30,"nu":0.2,"plane":"stress"}}'; }
        nodes() { return new Float64Array([0,0,1,0,1,1,0,1]); }
        elements() { return new Uint32Array([0,1,2,3]); }
        damage() { return new Float64Array(4).fill(0.1); }
        displacement() { return new Float64Array([0,0,0.001,0,0.001,0.002,0,0.002]); }
        elementStress() { return new Float64Array([0.0354375,0.0556875,0]); } done = false;
        ${override}
        advance() { if (this.done) return; this.done = true; return ${JSON.stringify(result)}; }
      }`);
      const run = spawnSync(process.execPath, [fileURLToPath(new URL('./check.mjs', import.meta.url)), dir, csv], { encoding: 'utf8' });
      assert.equal(run.status, expected, run.stdout + run.stderr);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('field gate rejects finite corrupt exports and verifies all stress components', async () => {
  const { checkFields, expectedStress, maxDifference } = await import('../../../../web/src/components/research/shauer2025/field-check.mjs');
  const nodes = [0, 0, 1, 0, 1, 1, 0, 1], elements = [0, 1, 2, 3];
  const damage = [0.1, 0.1, 0.1, 0.1], displacement = [0, 0, 0.001, 0, 0.001, 0.002, 0, 0.002];
  const material = { e: 30, nu: 0.2, plane: 'stress' };
  const snapshots = { damage: { 56: damage }, displacement: { 56: displacement } };
  const stress = expectedStress(nodes, elements, damage, displacement, material);
  assert.ok(maxDifference(stress, [0.0354375, 0.0556875, 0]) < 1e-15);
  for (const key of ['damage', 'displacement', 'syy']) {
    for (const mode of ['zero', 'perturbed', 'length']) {
      const f = { step: { step: 56, damage_max: 0.1 }, damage: [...damage], displacement: [...displacement], syy: [stress[1]] };
      if (mode === 'zero') f[key].fill(0);
      if (mode === 'perturbed') f[key][0] += 0.01;
      if (mode === 'length') f[key].pop();
      assert.ok(checkFields(f, nodes, elements, snapshots, material).length > 0);
    }
  }
});


test('field gate requires each compared scalar and field', async () => {
  const { checkFields } = await import('../../../../web/src/components/research/shauer2025/field-check.mjs');
  const nodes = [0, 0, 1, 0, 1, 1, 0, 1], elements = [0, 1, 2, 3];
  const material = { e: 30, nu: 0.2, plane: 'stress' };
  const snapshots = { damage: {}, displacement: {} };
  const frame = () => ({ step: { step: 0, damage_max: 0.1 }, damage: [0.1, 0.1, 0.1, 0.1], displacement: Array(8).fill(0), syy: [0] });
  assert.deepEqual(checkFields(frame(), nodes, elements, snapshots, material), []);
  for (const replay of [false, true]) {
    for (const key of ['step', 'damage_max']) {
      for (const value of [undefined, NaN, Infinity, -Infinity]) {
        const f = frame();
        if (value === undefined) delete f.step[key]; else f.step[key] = value;
        assert.ok(checkFields(f, nodes, elements, snapshots, material, replay).length, `${key}: ${value}`);
      }
    }
    for (const key of ['damage', 'displacement', 'syy']) {
      const f = frame();
      delete f[key];
      if (key !== 'syy' || !replay) assert.ok(checkFields(f, nodes, elements, snapshots, material, replay).length, key);
      for (const value of [NaN, Infinity, -Infinity]) {
        const f = frame();
        f[key][0] = value;
        assert.ok(checkFields(f, nodes, elements, snapshots, material, replay).length, key);
      }
    }
  }
});
