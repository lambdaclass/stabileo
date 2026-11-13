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
    const refusal = value => {
      let error;
      try { solve_plastic_3d(JSON.stringify(value)); } catch (caught) { error = String(caught); }
      assert.match(error, /certificate unavailable.*local axes are not rational/);
      return error;
    };
    assert.equal(refusal(input), refusal(canonical));
    const original = readFileSync(new URL('../../engine/tests/fixtures/plastic-1953-nightly.bin', import.meta.url));
    const originalInput = JSON.parse(original.subarray(2));
    const rekeyed = structuredClone(originalInput);
    rekeyed.solver.elements = Object.fromEntries(Object.values(rekeyed.solver.elements).map(element => [String(element.id), element]));
    assert.equal(refusal(originalInput), refusal(rekeyed));
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
