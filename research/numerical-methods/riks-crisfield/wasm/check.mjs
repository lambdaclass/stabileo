// Compare the production engine WASM export with committed native evidence.
// node check.mjs <engine wasm bundle dir> <case json> <native results json>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [dir, casePath, nativePath] = process.argv.slice(2);
if (!dir || !casePath || !nativePath) {
  console.error('usage: node check.mjs <engine wasm bundle dir> <case json> <native results json>');
  process.exit(2);
}
const glue = await import(pathToFileURL(join(dir, 'dedaliano_engine.js')).href);
glue.initSync({ module: readFileSync(join(dir, 'dedaliano_engine_bg.wasm')) });
const shared = JSON.parse(readFileSync(casePath, 'utf8'));
const native = JSON.parse(readFileSync(nativePath, 'utf8'));
const tolerance = shared.wasmParityTolerance;

function closeEnough(actual, expected) {
  return Number.isFinite(actual) && Number.isFinite(expected)
    && Math.abs(actual - expected) <= tolerance.absolute + tolerance.relative * Math.abs(expected);
}

const reports = [];
for (const testCase of shared.cases) {
  const expected = native.cases.find(item => item.id === testCase.id);
  const report = { id: testCase.id, maxAbsoluteDifference: 0, maxRelativeDifference: 0, errors: [] };
  if (!expected) {
    report.errors.push('missing native case');
    reports.push(report);
    continue;
  }
  let actual;
  try {
    actual = JSON.parse(glue.solve_arc_length(JSON.stringify(testCase.input)));
  } catch (error) {
    report.errors.push(`production WASM solve failed: ${error}`);
    reports.push(report);
    continue;
  }
  const compareNumber = (a, b, label) => {
    const absolute = Math.abs(a - b);
    const relative = b === 0 ? absolute : absolute / Math.abs(b);
    report.maxAbsoluteDifference = Math.max(report.maxAbsoluteDifference, absolute);
    report.maxRelativeDifference = Math.max(report.maxRelativeDifference, relative);
    if (!closeEnough(a, b)) report.errors.push(`${label}: wasm=${a}, native=${b}`);
  };
  if (actual.converged !== expected.converged) report.errors.push('overall convergence differs');
  if (actual.totalIterations !== expected.totalIterations) report.errors.push(`total iterations: wasm=${actual.totalIterations}, native=${expected.totalIterations}`);
  compareNumber(actual.finalLoadFactor, expected.finalLoadFactor, 'final load factor');
  if (!Array.isArray(actual.steps) || actual.steps.length !== expected.steps.length) {
    report.errors.push(`step count: wasm=${actual.steps?.length}, native=${expected.steps.length}`);
  } else {
    actual.steps.forEach((step, index) => {
      const other = expected.steps[index];
      if (step.step !== other.step) report.errors.push(`step ${index + 1}: step number differs`);
      if (step.converged !== other.converged) report.errors.push(`step ${index + 1}: convergence differs`);
      if (step.iterations !== other.iterations) report.errors.push(`step ${index + 1}: iterations wasm=${step.iterations}, native=${other.iterations}`);
      compareNumber(step.loadFactor, other.loadFactor, `step ${index + 1} load factor`);
      compareNumber(step.controlDisplacement, other.controlDisplacement, `step ${index + 1} control displacement`);
    });
  }
  const displacements = actual.results?.displacements;
  if (!Array.isArray(displacements) || displacements.length !== expected.finalDisplacements.length) {
    report.errors.push('final displacement count differs');
  } else {
    for (const other of expected.finalDisplacements) {
      const displacement = displacements.find(item => item.nodeId === other.nodeId);
      if (!displacement) {
        report.errors.push(`missing final displacement for node ${other.nodeId}`);
        continue;
      }
      for (const field of ['ux', 'uz', 'ry']) {
        compareNumber(displacement[field], other[field], `node ${other.nodeId} final ${field}`);
      }
    }
  }
  report.ok = report.errors.length === 0;
  reports.push(report);
}
const ok = reports.length === shared.cases.length && reports.every(report => report.ok);
console.log(JSON.stringify({ schemaVersion: 1, parityTolerance: tolerance, cases: reports, ok }, null, 2));
process.exit(ok ? 0 : 1);
