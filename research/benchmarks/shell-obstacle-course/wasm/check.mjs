import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from '../../../../web/node_modules/vite/dist/node/index.js';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const write = args.includes('--write');
const nativeDir = args.find(a => a !== '--write');
assert.ok(nativeDir, 'usage: node check.mjs <native results directory> [--write]');
const here = new URL('../', import.meta.url).pathname;
const paths = { validation: `${here}VALIDATION.json`, references: `${here}reference-results/references.json`, manifest: `${here}reference-results/MANIFEST.json` };
const command = 'node research/benchmarks/shell-obstacle-course/wasm/check.mjs <native results directory>';
const json = value => JSON.stringify(value, null, 2) + '\n';
const sha256 = text => createHash('sha256').update(text).digest('hex');

function maxRelative(a, b, at = '$') {
  if (typeof a === 'number' && typeof b === 'number') {
    const scale = Math.max(Math.abs(a), Math.abs(b));
    return scale === 0 ? 0 : Math.abs(a - b) / scale;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, `${at}: length`);
    return Math.max(0, ...a.map((x, i) => maxRelative(x, b[i], `${at}[${i}]`)));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort(), `${at}: keys`);
    return Math.max(0, ...Object.keys(a).map(k => maxRelative(a[k], b[k], `${at}.${k}`)));
  }
  assert.equal(b, a, at);
  return 0;
}

const server = await createServer({ root: new URL('../../../../web/', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { cases, runCases, finest, signedReference } = await server.ssrLoadModule('/src/components/research/shell1985/cases.ts');
  const { roofInput, cylinderInput } = await server.ssrLoadModule('/src/components/research/shell1985/builders.ts');
  const fixture = JSON.parse(readFileSync(new URL('../../../../engine/tests/benchmarks/shell_obstacle_course.json', import.meta.url), 'utf8'));
  const rows = await runCases();
  const native = id => JSON.parse(readFileSync(`${nativeDir}/${id}.json`, 'utf8'));
  assert.deepEqual(rows.map(r => r.id).sort(), cases.map(c => c.id).sort());
  let parity = 0;
  let notRefused = 0;
  for (const row of rows) {
    const ref = native(row.id);
    assert.equal(ref.id, row.id);
    if (cases.find(c => c.id === row.id).group === 'hemisphere') {
      const refused = [row, ref].every(r => r.refused === true && r.knownIssue === 'SH-MITC4-DISTORTION' && r.issue === 798
        && /Results withheld:.*known issue #798, SH-MITC4-DISTORTION/.test(r.failure) && r.value === null && r.error === null && r.pass === false && r.displacement == null);
      if (!refused) notRefused++;
      continue;
    }
    assert.ok(!row.refused && !ref.refused, row.id);
    assert.ok(row.value !== null && Number.isFinite(row.value), `${row.id}: ${row.failure}`);
    assert.equal(row.pass, ref.pass, `${row.id}: WASM/native pass mismatch`);
    assert.ok(Math.abs(row.value - ref.value) <= Math.max(Math.abs(ref.value) * 1e-8, 1e-12), `${row.id}: WASM/native value mismatch`);
    parity = Math.max(parity, Math.abs(row.value - ref.value) / Math.abs(ref.value));
  }

  const byId = id => rows.find(r => r.id === id);
  const fixed = [...fixture.cases, ...fixture.nativeCases].filter(c => c.group !== 'hemisphere');
  const builders = Math.max(...fixed.map(c => {
    const built = c.group === 'roof' ? roofInput(c.mesh) : cylinderInput(c.mesh);
    assert.equal(built.node, c.measurement.node, `${c.id}: measurement node`);
    return maxRelative(c.input, built.input, c.id);
  }));
  const cylinder32 = native('cylinder-32');
  const target = fixture.nativeCases.find(c => c.id === 'cylinder-32');
  assert.equal(cylinder32.id, target.id);
  assert.ok(cylinder32.pass === true && !cylinder32.failure && !cylinder32.refused && Number.isFinite(cylinder32.value));
  const cylinderError = Math.abs(cylinder32.value / signedReference(target) - 1);
  const cylinderErrors = [...cases.filter(c => c.group === 'cylinder').map(c => byId(c.id).error), cylinderError];
  const convergence = Math.max(...cylinderErrors.slice(1).map((e, i) => e / cylinderErrors[i]));
  const check = (id, metric, kind, observed, tolerance, passed) => ({ id, metric, kind, observed, tolerance, passed });
  const checks = [
    ...cases.filter(c => c.group === 'roof').map(c => check(c.id, `Scordelis–Lo roof ${c.mesh}×${c.mesh} (WASM): relative error of signed u_z against −0.3024`, 'relative', byId(c.id).error, c.tolerance, byId(c.id).error < c.tolerance)),
    check('cylinder-32', 'Pinched cylinder 32×32 (native): relative error of signed u_y against −1.8248e-5', 'relative', cylinderError, 0.02, cylinderError < 0.02),
    check('cylinder-convergence', 'Pinched cylinder 6, 8, 12, 16 (WASM) and 32 (native): largest ratio of successive relative errors, must be below 1', 'ratio', convergence, 1, convergence < 1),
    check('parity', 'Roof and cylinder browser meshes: largest relative difference between WASM and native values', 'relative', parity, 1e-8, parity <= 1e-8),
    check('hemisphere-refusals', 'Hemisphere 4, 8, 16: meshes not withheld by both runtimes with known issue #798 (SH-MITC4-DISTORTION)', 'count', notRefused, 0, notRefused === 0),
    check('builders', 'Browser roof and cylinder builders against every engine-owned case input: largest relative difference', 'relative', builders, 1e-12, builders <= 1e-12),
  ];
  const references = {
    what: 'References used by the shell obstacle course page, read from the engine-owned case file by wasm/check.mjs.',
    fixture: 'engine/tests/benchmarks/shell_obstacle_course.json',
    accuracyTolerance: fixture.accuracyTolerance,
    accuracyPolicy: fixture.accuracyPolicy,
    references: ['roof', 'cylinder', 'hemisphere'].map(group => {
      const c = cases.find(x => x.group === group);
      return {
        group, component: c.measurement.component, signedReference: signedReference(c),
        provenance: {
          roof: 'Inherited from shell_benchmark.rs. Equals the normalization value of MacNeal and Harder (1985), Table 5(a), p. 11 (theoretical value 0.3086 quoted there from Scordelis and Lo). Belytschko et al. (1985) tables not inspected.',
          cylinder: 'Inherited from shell_benchmark.rs and solid_shell_locking.rs. Not checked against a published table here; Belytschko et al. (1985) tables not inspected.',
          hemisphere: 'Engine test convention of shell_benchmark.rs::benchmark_hemisphere_hole_convergence (quarter loads ±2). MacNeal and Harder (1985), Table 5(b), p. 11, normalize their loading by 0.0940; the conventions are not reconciled here. Belytschko et al. (1985) tables not inspected.',
        }[group],
      };
    }),
  };
  const evidence = { what: 'Shell obstacle course: production MITC4 through the WASM wrapper and natively, from the engine-owned case file.', command, checks };

  const failing = checks.filter(c => !c.passed);
  assert.equal(failing.length, 0, `failing checks: ${failing.map(c => c.id).join(', ')}`);
  if (write) {
    writeFileSync(paths.validation, json(evidence));
    writeFileSync(paths.references, json(references));
    writeFileSync(paths.manifest, json({
      what: 'Reference values used by the page, written from the engine-owned case file; not transcribed paper data.',
      source: 'engine/tests/benchmarks/shell_obstacle_course.json; ../README.md',
      command: `${command} --write`,
      date: new Date().toISOString().slice(0, 10),
      files_sha256: { 'references.json': sha256(json(references)) },
    }));
  } else {
    const committed = JSON.parse(readFileSync(paths.validation, 'utf8'));
    assert.deepEqual(committed.checks.map(c => [c.id, c.metric, c.kind, c.passed, c.tolerance]), checks.map(c => [c.id, c.metric, c.kind, c.passed, c.tolerance]), 'VALIDATION.json is stale: rerun with --write');
    for (const [i, c] of checks.entries()) {
      const was = committed.checks[i].observed;
      assert.ok(Math.abs(was - c.observed) <= Math.max(1e-9 * Math.abs(c.observed), 1e-15), `${c.id}: committed ${was}, recomputed ${c.observed}`);
    }
    assert.equal(readFileSync(paths.references, 'utf8'), json(references), 'references.json is stale: rerun with --write');
    const manifest = JSON.parse(readFileSync(paths.manifest, 'utf8'));
    assert.deepEqual(manifest.files_sha256, { 'references.json': sha256(json(references)) }, 'MANIFEST.json hash mismatch');
  }
  console.log(JSON.stringify(rows.map(({ displacement, ...row }) => row), null, 2));
  console.log(`Finest selected meshes: ${finest.filter(c => byId(c.id).pass).length}/3 pass`);
  for (const c of checks) console.log(`${c.passed ? 'pass' : 'FAIL'} ${c.id}: ${c.observed} (tolerance ${c.tolerance})`);
  assert.equal(failing.length, 0, `failing checks: ${failing.map(c => c.id).join(', ')}`);
} finally { await server.close(); }
