import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initSync, solve_2d, solve_3d, solve_plastic_3d, solve_plastic_2d,
  solve_pdelta_2d, solve_pdelta_3d, certify_plastic_3d,
} from '../../web/src/lib/wasm/dedaliano_engine.js';

initSync({ module: readFileSync(new URL('../../web/src/lib/wasm/dedaliano_engine_bg.wasm', import.meta.url)) });
const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const input = load('../../engine/tests/fixtures/plastic-1953-min.json');
const canonical = structuredClone(input);
canonical.solver.elements = Object.fromEntries(Object.values(canonical.solver.elements).map(element => [String(element.id), element]));
const plane = load('../../docs/results-changes/1753-loaded-c08-inputs.json')['issue-1653'].input;
const rekeyedPlane = structuredClone(plane);
rekeyedPlane.elements = Object.fromEntries(Object.values(plane.elements).map(element => [`member-${element.id}`, element]));
const forces = (result) => result.elementForces.toSorted((a, b) => a.elementId - b.elementId);
const cases = {
  fuzz() {
    const output = JSON.parse(solve_plastic_3d(JSON.stringify(input)));
    assert.ok(Number.isFinite(output.collapseFactor));
    assert.ok(output.collapseFactor > 0);
    assert.equal(output.isMechanism, true);
    assert.ok(output.warnings.some(warning => warning.includes('biaxial')));
    const original = readFileSync(new URL('../../engine/tests/fixtures/plastic-1953-nightly.bin', import.meta.url));
    const originalOutput = JSON.parse(solve_plastic_3d(original.subarray(2).toString('utf8')));
    assert.ok(Number.isFinite(originalOutput.collapseFactor));
    assert.ok(originalOutput.collapseFactor > 0);
    assert.equal(originalOutput.isMechanism, true);
    const originalInput = JSON.parse(original.subarray(2));
    originalInput.solver.elements = Object.fromEntries(Object.values(originalInput.solver.elements).map(element => [String(element.id), element]));
    const originalReference = JSON.parse(solve_plastic_3d(JSON.stringify(originalInput)));
    assert.equal(originalOutput.collapseFactor, originalReference.collapseFactor);
    const reference = JSON.parse(solve_plastic_3d(JSON.stringify(canonical)));
    assert.equal(output.collapseFactor, reference.collapseFactor);
  },
  linear2d() { assert.deepEqual(forces(solve_2d(rekeyedPlane)), forces(solve_2d(plane))); },
  linear3d() { assert.deepEqual(forces(solve_3d(input.solver)), forces(solve_3d(canonical.solver))); },
  pdelta2d() {
    const actual = JSON.parse(solve_pdelta_2d(JSON.stringify(rekeyedPlane), 4, 1e-7));
    const expected = JSON.parse(solve_pdelta_2d(JSON.stringify(plane), 4, 1e-7));
    assert.deepEqual(forces(actual.results), forces(expected.results));
  },
  pdelta3d() {
    const actual = JSON.parse(solve_pdelta_3d(JSON.stringify(input.solver), 4, 1e-7));
    const expected = JSON.parse(solve_pdelta_3d(JSON.stringify(canonical.solver), 4, 1e-7));
    assert.deepEqual(forces(actual.results), forces(expected.results));
  },
  plastic2d_refusal() {
    const sections = Object.fromEntries(Object.entries(plane.sections).map(([key, section]) => [key, {
      a: section.a, iz: section.iz,
      materialId: Object.values(plane.elements).find(element => element.sectionId === section.id).materialId,
    }]));
    const plastic = { solver: rekeyedPlane, sections, materials: input.materials,
      mpOverrides: Object.fromEntries(Object.keys(sections).map(key => [key, 1])), maxHinges: 1 };
    let refusal;
    try { solve_plastic_2d(JSON.stringify(plastic)); } catch (error) { refusal = JSON.parse(String(error)); }
    assert.ok(refusal);
    assert.ok(refusal.structuredDiagnostics.some(d => d.code === 'known_issue' && d.severity === 'error' && d.phase === 'PL-2D-INVARIANCE'));
  },
  certificate() {
    const frame = load('../../engine/tests/fixtures/plastic-1954-plane-seed7.json');
    const output = JSON.parse(certify_plastic_3d(JSON.stringify(frame)));
    assert.equal(output.certificate.certified, true);
    assert.equal(output.results.collapseFactor, output.certificate.lambdaLower);
    assert.ok((output.certificate.lambdaUpper - output.certificate.lambdaLower) / output.certificate.lambdaUpper < 1e-7);
    assert.ok(output.certificate.solverDeviation < 1e-9);
  },
};
const requested = process.argv[2];
for (const [name, run] of Object.entries(cases)) {
  if (requested && requested !== name) continue;
  run();
  console.log(`plastic nightly WASM: ${name} passed`);
}
if (requested) assert.ok(requested in cases);
