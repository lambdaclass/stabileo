import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from '../../../../web/node_modules/vite/dist/node/index.js';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const write = args.includes('--write');
const native = JSON.parse(readFileSync(args.find(a => !a.startsWith('--')), 'utf8'));
const here = new URL('../', import.meta.url);
const COMMAND = 'node research/benchmarks/macneal-harder-1985/wasm/check.mjs <native results> [--write]';
const server = await createServer({ root: new URL('../../../../web/', import.meta.url).pathname, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { cases, runCases, tolerance } = await server.ssrLoadModule('/src/components/research/macneal1985/cases.ts');
  const engine = await server.ssrLoadModule('/src/lib/engine/wasm-solver.ts');
  const table3 = new Map([['in', 0.1081], ['out', 0.4321]]);
  const rows = await runCases();
  for (const c of cases.filter(c => c.id.startsWith('mitc4-'))) {
    assert.equal(c.reference, table3.get(c.id.split('-').at(-1)), `${c.id}: Table 3 reference`);
  }
  assert.equal(rows.length, cases.length);
  assert.equal(native.length, cases.length);
  assert.equal(new Set(native.map(r => r.id)).size, cases.length);
  let parity = 0;
  for (const row of rows) {
    const ref = native.find(r => r.id === row.id);
    assert.ok(ref, row.id);
    const expected = cases.find(c => c.id === row.id).expectedRefusal;
    if (expected) {
      for (const r of [row, ref]) {
        assert.equal(r.refused, true, `${row.id}: ${r.failure}`);
        assert.equal(r.knownIssue, expected.id);
        assert.equal(r.issue, expected.issue);
        assert.match(r.failure, /Results withheld:/);
        assert.ok(r.failure.includes(`known issue #${expected.issue}, ${expected.id}`));
        assert.equal(r.value, null);
        assert.equal(r.error, null);
        assert.equal(r.pass, false);
      }
      continue;
    }
    assert.ok(!row.refused && !ref.refused, row.id);
    assert.ok(row.value !== null && Number.isFinite(row.value), `${row.id}: ${row.failure}`);
    assert.equal(row.pass, ref.pass, `${row.id}: WASM/native pass mismatch`);
    assert.equal(row.pass, cases.find(c => c.id === row.id).expectedPass, `${row.id}: outcome differs from the pinned expectation`);
    assert.equal(Math.sign(row.value), Math.sign(ref.value), `${row.id}: WASM/native sign mismatch`);
    assert.ok(Math.abs(row.value - ref.value) <= Math.max(Math.abs(ref.value) * 1e-8, 1e-12), `${row.id}: WASM/native value mismatch`);
    parity = Math.max(parity, Math.abs(row.value - ref.value) / Math.max(Math.abs(ref.value), 1e-12));
  }

  const roofCase = JSON.parse(readFileSync(new URL('../../../../engine/tests/benchmarks/shell_obstacle_course.json', import.meta.url), 'utf8')).cases.find(c => c.id === 'roof-16');
  assert.equal(roofCase.reference, 0.3024, 'roof-16: Table 5(a) reference');
  const roofInput = { ...roofCase.input };
  for (const key of ['nodes', 'materials', 'sections', 'elements', 'supports', 'quads', 'plates', 'connectors', 'curvedShells']) {
    roofInput[key] = new Map(Object.entries(roofCase.input[key] ?? {}).map(([id, value]) => [Number(id), value]));
  }
  await engine.initSolver();
  const roof = -engine.solve3D(roofInput).displacements.find(d => d.nodeId === roofCase.measurement.node)[roofCase.measurement.component];

  const byId = id => rows.find(r => r.id === id);
  const caseOf = id => cases.find(c => c.id === id);
  const relative = (value, reference) => Math.abs(value - reference) / Math.abs(reference);
  const check = (metric, observed, limit) => ({ metric, observed, tolerance: limit, passed: observed <= limit });

  const regular = caseOf('mitc4-regular-out');
  const e = regular.input.materials['1'].e * 1000, nu = regular.input.materials['1'].nu, t = regular.input.quads['1'].thickness;
  const xs = Object.values(regular.input.nodes).map(n => n.x), ys = Object.values(regular.input.nodes).map(n => n.y);
  const length = Math.max(...xs) - Math.min(...xs), width = Math.max(...ys) - Math.min(...ys);
  const shear = length / (5 / 6 * e / (2 * (1 + nu)) * width * t);
  const timoshenko = { 'mitc4-regular-out': length ** 3 / (3 * e * width * t ** 3 / 12) + shear, 'mitc4-regular-in': length ** 3 / (3 * e * t * width ** 3 / 12) + shear };

  const checks = [];
  for (const c of cases.filter(c => c.expectedPass)) {
    checks.push(check(`${c.id}: relative error of the WASM result against its ${c.element === 'frame' ? 'Euler–Bernoulli' : 'Table 3'} reference ${c.reference}`, byId(c.id).error, tolerance));
  }
  for (const [id, value] of Object.entries(timoshenko)) {
    checks.push(check(`${id}: Timoshenko beam theory (shear factor 5/6) from the case inputs against the printed Table 3 value ${caseOf(id).reference}`, Math.abs(value - caseOf(id).reference), caseOf(id).referenceRounding));
  }
  for (const c of cases.filter(c => !c.expectedPass && !c.expectedRefusal)) {
    checks.push(check(`${c.id}: documented failure (#798) pinned as a regression to ${c.nativeBounds.pinnedValue}, not an accuracy pass`, relative(byId(c.id).value, c.nativeBounds.pinnedValue), c.nativeBounds.relativeTolerance));
  }
  const withheld = cases.filter(c => c.expectedRefusal);
  checks.push(check(`${withheld.map(c => c.id).join(', ')}: cases not withheld by both native and WASM with known issue #798 (SH-MITC4-DISTORTION)`, withheld.filter(c => !(byId(c.id).refused && native.find(r => r.id === c.id).refused)).length, 0));
  checks.push(check('computed cantilever and frame cases: largest relative difference between WASM and native values', parity, 1e-8));
  checks.push(check(`roof-16 (shared shell obstacle course input): relative error of the WASM midside deflection against Table 5(a) ${roofCase.reference}`, relative(roof, roofCase.reference), tolerance));

  const SOURCE = { beam: 'MacNeal & Harder (1985), Table 3, p. 10 (geometry Fig. 4, p. 7)', roof: 'MacNeal & Harder (1985), Table 5(a), p. 11 (normalization value; model Fig. 8, p. 8)' };
  const TOL = 'relative error, |Stabileo − paper| / paper; Stabileo passes below 2%; the paper awards grade A at or below 2% (p. 14)';
  const row = (id, name, source, reference, computed) => ({ id, name, source, unit: '', reference, computed, metric: TOL, observed: relative(computed, reference), tolerance, passed: relative(computed, reference) < tolerance });
  const published = [
    row('straight-regular-out', 'Straight cantilever, regular 6×1 MITC4 mesh, out-of-plane tip displacement', SOURCE.beam, caseOf('mitc4-regular-out').reference, byId('mitc4-regular-out').value),
    row('straight-regular-in', 'Straight cantilever, regular 6×1 MITC4 mesh, in-plane tip displacement', SOURCE.beam, caseOf('mitc4-regular-in').reference, byId('mitc4-regular-in').value),
    row('straight-trapezoidal-out', 'Straight cantilever, trapezoidal 6×1 MITC4 mesh, out-of-plane tip displacement', SOURCE.beam, caseOf('mitc4-trapezoidal-out').reference, byId('mitc4-trapezoidal-out').value),
    row('straight-parallelogram-out', 'Straight cantilever, parallelogram 6×1 MITC4 mesh, out-of-plane tip displacement', SOURCE.beam, caseOf('mitc4-parallelogram-out').reference, byId('mitc4-parallelogram-out').value),
    row('scordelis-lo-16', 'Scordelis–Lo roof, 16×16 quarter MITC4 mesh, downward deflection at the midpoint of the free edge', SOURCE.roof, roofCase.reference, roof),
  ];

  const validation = {
    what: 'Production native and WASM engines on the MacNeal–Harder straight cantilever and analytical frame adaptations, with a separate WASM comparison for the Scordelis–Lo roof; written by wasm/check.mjs in the Research workflow.',
    command: COMMAND,
    checks,
  };
  const comparison = { what: 'The paper’s theoretical values against the production engine; written by wasm/check.mjs.', command: COMMAND, checks: published };

  const failing = checks.filter(c => !c.passed);
  assert.equal(failing.length, 0, `failing checks: ${JSON.stringify(failing, null, 2)}`);

  const files = { validation: new URL('VALIDATION.json', here), comparison: new URL('reference-results/published_comparison.json', here), manifest: new URL('reference-results/MANIFEST.json', here) };
  const text = v => JSON.stringify(v, null, 2) + '\n';
  const manifest = comparisonText => ({
    what: 'Published values of MacNeal & Harder (1985), read in a scanned copy of the article, against the production engine.',
    source: 'Tables 3 and 5, pp. 10–11; inputs in engine/tests/benchmarks/macneal_harder.json and shell_obstacle_course.json',
    command: COMMAND,
    files_sha256: { 'published_comparison.json': createHash('sha256').update(comparisonText).digest('hex') },
  });
  if (write) {
    writeFileSync(files.validation, text(validation));
    writeFileSync(files.comparison, text(comparison));
    writeFileSync(files.manifest, text(manifest(text(comparison))));
  } else {
    const same = (a, b, path, scale = 0) => {
      if (typeof a === 'number' && typeof b === 'number') {
        const allowed = path.endsWith('.computed') ? 1e-9 * Math.abs(a)
          : path.endsWith('.observed') ? Math.min(1e-9, 0.1 * scale) : 0;
        assert.ok(Number.isFinite(a) && Number.isFinite(b), path);
        return assert.ok(Math.abs(a - b) <= allowed, `${path}: ${a} vs committed ${b}`);
      }
      if (a && typeof a === 'object') {
        assert.deepEqual(Object.keys(a), Object.keys(b), path);
        const inner = 'passed' in a && typeof a.tolerance === 'number' ? a.tolerance : scale;
        for (const k of Object.keys(a)) same(a[k], b[k], `${path}.${k}`, k === 'tolerance' ? undefined : inner);
        return;
      }
      assert.equal(a, b, path);
    };
    same(validation, JSON.parse(readFileSync(files.validation, 'utf8')), 'VALIDATION.json');
    const committedComparison = readFileSync(files.comparison, 'utf8');
    same(comparison, JSON.parse(committedComparison), 'published_comparison.json');
    assert.deepEqual(JSON.parse(readFileSync(files.manifest, 'utf8')), manifest(committedComparison), 'MANIFEST.json is stale: rerun with --write');
  }
  console.log(JSON.stringify({ checks: checks.map(c => [c.metric, c.observed, c.tolerance]), published: published.map(r => [r.id, r.reference, r.computed, r.observed, r.passed]) }, null, 2));
} finally { await server.close(); }
