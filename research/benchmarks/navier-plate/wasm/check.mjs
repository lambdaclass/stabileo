import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from '../../../../web/node_modules/vite/dist/node/index.js';
import assert from 'node:assert/strict';

const here = new URL('../', import.meta.url);
const write = process.argv.includes('--write');
const COMMAND = 'node research/benchmarks/navier-plate/wasm/check.mjs';
const SOURCE = 'Terje Haukaas, "Theory of Plates and Shells, Article 28, Navier’s Solution for Uniform Load", University of British Columbia, updated 9 February 2018';
const replay = JSON.parse(readFileSync(new URL('results/stabileo_results.json', here), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('../../../engine/tests/benchmarks/navier_plate.json', here), 'utf8'));

const server = await createServer({ root: new URL('../../../../web/', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/components/research/navier1823/model.ts');
  const engine = await server.ssrLoadModule('/src/lib/engine/wasm-solver.ts');
  await engine.initSolver();
  const p = m.parameters;
  const totalLoad = p.pressure * p.a * p.b;
  let equilibrium = 0;
  const solve = input => {
    const result = engine.solve3D(m.toSolverInput(input));
    const reaction = result.reactions.reduce((sum, r) => sum + r.fz, 0);
    equilibrium = Math.max(equilibrium, Math.abs(reaction - totalLoad));
    return m.downward(input, result.displacements);
  };
  const relative = (w, ref) => Math.abs(w / ref - 1);
  const checks = [];
  const check = (metric, observed, tolerance) => checks.push({ metric, observed, tolerance, passed: observed <= tolerance });

  let builderDifferences = 0;
  for (const c of fixture.cases) {
    const built = m.build(c.family, c.n, false);
    if (built.center !== c.center || JSON.stringify(built.input) !== JSON.stringify(c.input)) builderDifferences++;
  }
  check('plate builder (TypeScript) against the six engine-owned fixture cases: cases that differ', builderDifferences, 0);

  let parity = 0;
  const compareField = (input, values, recorded) => {
    const count = Object.keys(input.nodes).length;
    assert.equal(values.length, count);
    assert.equal(recorded.length, count);
    values.forEach((v, k) => {
      assert.ok(Number.isFinite(v) && Number.isFinite(recorded[k]));
      parity = Math.max(parity, Math.abs(v - recorded[k]));
    });
  };
  const soft = { DKT: [], MITC4: [] };
  fixture.cases.forEach((c, i) => {
    const values = solve(c.input);
    const row = replay.rows[i];
    assert.deepEqual([row.family, row.n], [c.family, c.n]);
    compareField(c.input, values, row.values);
    soft[c.family].push(values[c.center - 1]);
  });
  const hard = [];
  m.hardCases.forEach((index, k) => {
    const c = fixture.cases[index];
    const { input } = m.build('MITC4', c.n, true);
    const values = solve(input);
    assert.deepEqual([replay.hard_rows[k].family, replay.hard_rows[k].n], [c.family, c.n]);
    compareField(input, values, replay.hard_rows[k].values);
    hard.push(values[c.center - 1]);
  });
  check('production WASM against the native replay, every node of the six soft-support and three hard-support meshes: largest difference (mm)', parity, 1e-9);

  const finer = (family, hardSupport, n) => {
    const { input, center } = m.build(family, n, hardSupport);
    return solve(input)[center - 1];
  };
  const dkt = soft.DKT, dkt32 = finer('DKT', false, 32), hard32 = finer('MITC4', true, 32);
  const soft32 = finer('MITC4', false, 32), soft64 = finer('MITC4', false, 64);
  check('vertical equilibrium, reactions against the 150 kN load, every mesh: largest difference (kN)', equilibrium, 1e-6);
  const kirchhoff = m.navierCenter(), mindlin = m.mindlinCenter();
  check('thin-plate series, 100 × 100 odd terms, against the stored reference (mm)', Math.abs(kirchhoff - p.reference_mm), 1e-12);
  check('thin-plate series truncation, 400 × 400 against 100 × 100 odd terms (mm)', Math.abs(m.navierCenter(4 * p.terms) - kirchhoff), 1e-9);
  check('Reissner–Mindlin series, 1000 × 1000 odd terms, against the stored reference (mm)', Math.abs(mindlin - p.mindlin_reference_mm), 1e-11);
  check('Reissner–Mindlin series truncation, 2000 × 2000 against 1000 × 1000 odd terms (mm)', Math.abs(m.mindlinCenter(2 * p.mindlin_terms) - mindlin), 1e-9);
  check('published 1.28375 mm against the thin-plate series (mm)', Math.abs(p.published_mm - kirchhoff), 5e-6);

  const monotone = (w, ref) => w.slice(1).filter((x, i) => !(relative(x, ref) < relative(w[i], ref))).length;
  check('DKT 4, 8, 16: refinements whose thin-plate error does not decrease', monotone(dkt, kirchhoff), 0);
  check('DKT 16 × 16 against the thin-plate series: relative difference', relative(dkt[2], kirchhoff), 0.0025);
  check('DKT increment ratio (4 → 8) / (8 → 16): distance from 4 (second order)', Math.abs((dkt[1] - dkt[0]) / (dkt[2] - dkt[1]) - 4), 0.5);
  check('DKT Richardson extrapolation of 16 × 16 and 32 × 32 against the thin-plate series: relative difference', relative(m.richardson(dkt[2], dkt32), kirchhoff), 1e-4);
  check('MITC4 hard support 4, 8, 16: refinements whose Reissner–Mindlin error does not decrease', monotone(hard, mindlin), 0);
  check('MITC4 hard support 16 × 16 against the Reissner–Mindlin series: relative difference', relative(hard[2], mindlin), 0.0016);
  check('MITC4 hard support increment ratio (8 → 16) / (16 → 32): distance from 4 (second order)', Math.abs((hard[2] - hard[1]) / (hard32 - hard[2]) - 4), 0.5);
  check('MITC4 hard support Richardson extrapolation of 16 × 16 and 32 × 32 against the Reissner–Mindlin series: relative difference', relative(m.richardson(hard[2], hard32), mindlin), 1e-4);
  check('MITC4 soft support 32 × 32 against the documented 1.305399383 mm: relative difference', relative(soft32, 1.305399383), 1e-6);
  check('MITC4 soft support 64 × 64 against the documented 1.310611471 mm: relative difference', relative(soft64, 1.310611471), 1e-6);
  const mitc4 = soft.MITC4;
  check('MITC4 soft support 8, 16, 32, 64 keeps rising and ends above 1.015 × Reissner–Mindlin: violations', [mitc4[1] < mitc4[2], mitc4[2] < soft32, soft32 < soft64, soft64 > mindlin * 1.015].filter(ok => !ok).length, 0);

  const row = (id, name, source, unit, reference, computed, metric, tolerance) => {
    const observed = metric.startsWith('relative') ? Math.abs(computed - reference) / Math.abs(reference) : Math.abs(computed - reference);
    return { id, name, source: `Haukaas (2018), Navier’s Solution for Uniform Load, ${source}`, unit, reference, computed, metric, observed, tolerance, passed: observed <= tolerance };
  };
  const published = p.published_mm;
  const rows = [
    row('rigidity', 'Flexural rigidity D = Et³ / [12(1 − ν²)] of the case inputs', 'p. 2', 'kN·m', 5468.75, m.rigidity(), 'absolute difference (printed to two decimals)', 0.005),
    row('series', 'Centre displacement, thin-plate Navier series (100 × 100 odd terms)', 'p. 3', 'mm', published, kirchhoff, 'absolute difference (printed to five decimals)', 5e-6),
    row('dkt-16', 'Centre displacement, production DKT 16 × 16', 'p. 3', 'mm', published, dkt[2], 'relative difference', 0.0025),
    row('dkt-richardson', 'Centre displacement, production DKT, Richardson extrapolation of 16 × 16 and 32 × 32', 'p. 3', 'mm', published, m.richardson(dkt[2], dkt32), 'relative difference', 1e-4),
  ];

  const failing = [...checks, ...rows].filter(c => !c.passed);
  const validation = { what: 'Production WASM engine on the Navier plate: native parity, equilibrium, series references and convergence, written by this script.', command: COMMAND, checks };
  const comparison = { what: 'The published worked example against Stabileo, written by this script.', command: COMMAND, checks: rows };
  const paths = { validation: new URL('VALIDATION.json', here), comparison: new URL('reference-results/published_comparison.json', here), manifest: new URL('reference-results/MANIFEST.json', here) };
  const text = value => JSON.stringify(value, null, 2) + '\n';
  assert.equal(failing.length, 0, JSON.stringify(failing));
  if (write) {
    writeFileSync(paths.validation, text(validation));
    writeFileSync(paths.comparison, text(comparison));
    const digest = createHash('sha256').update(readFileSync(paths.comparison)).digest('hex');
    writeFileSync(paths.manifest, text({
      what: 'Comparison of Stabileo with the published Navier worked example; the paper values are transcribed in check.mjs with their page numbers.',
      source: `${SOURCE}; Wayback Machine copy of https://civil-terje.sites.olt.ubc.ca/files/2019/06/Naviers-Plate-Solution-for-Uniform-Load.pdf`,
      command: `${COMMAND} --write`,
      date: new Date().toISOString().slice(0, 10),
      files_sha256: { 'published_comparison.json': digest },
    }));
  } else {
    const same = (a, b, path) => {
      if (typeof a === 'number' && typeof b === 'number') {
        assert.ok(Math.abs(a - b) <= Math.max(1e-9 * Math.max(Math.abs(a), Math.abs(b)), 1e-15), `${path}: ${a} != ${b}`);
      } else if (a && typeof a === 'object') {
        assert.deepEqual(Object.keys(a), Object.keys(b), path);
        for (const k of Object.keys(a)) same(a[k], b[k], `${path}.${k}`);
      } else assert.equal(a, b, path);
    };
    same(JSON.parse(readFileSync(paths.validation, 'utf8')), validation, 'VALIDATION.json');
    same(JSON.parse(readFileSync(paths.comparison, 'utf8')), comparison, 'published_comparison.json');
    const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'));
    assert.deepEqual(manifest.files_sha256, { 'published_comparison.json': createHash('sha256').update(readFileSync(paths.comparison)).digest('hex') }, 'MANIFEST.json hashes are stale: rerun with --write');
  }
  for (const c of checks) console.log(`${c.passed ? 'pass' : 'FAIL'}  ${c.metric}: ${c.observed} ≤ ${c.tolerance}`);
  for (const r of rows) console.log(`${r.passed ? 'pass' : 'FAIL'}  ${r.name}: paper ${r.reference}, Stabileo ${r.computed}, ${r.metric} ${r.observed} ≤ ${r.tolerance}`);
  assert.equal(failing.length, 0, `${failing.length} failing checks`);
} finally { await server.close(); }
