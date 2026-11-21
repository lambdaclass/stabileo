import { readdirSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

function applicationSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return ['wasm', '__tests__'].includes(entry.name) ? [] : applicationSources(path);
    return /\.(?:svelte|ts)$/.test(entry.name) && !/\.(?:spec|test)\.ts$/.test(entry.name) ? [path] : [];
  });
}

it('keeps WASM structural entry points and raw load conversion in the audited call sites', () => {
  const callers = new Set<string>();
  const bindings = new Set<string>();
  const converters = new Set<string>();
  for (const path of applicationSources(root)) {
    const source = readFileSync(path, 'utf8');
    const file = relative(root, path);
    const imports = source.matchAll(/\bimport\s+(\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+['"][^'"]*\/wasm-solver['"]/g);
    for (const [, statement] of imports) {
      for (const entry of statement!.replace(/^\{|\}$/g, '').split(',')) {
        const name = entry.trim().split(/\s+as\s+/)[0]!;
        if (/^(?:solve\w*|certify(?:Linear|Buckling)\w*|prepareLoadSession\w*|\*)$/.test(name)) callers.add(`${file} ${name}`);
      }
    }
    if (/import\([^)]*['"][^'"]*\/wasm-solver['"]/.test(source)) callers.add(`${file} dynamic`);
    if (/\b(?:wasm\.solve_\w+|import\([^)]*['"][^'"]*\/dedaliano_engine\.js['"])/.test(source)) bindings.add(file);
    if (/\bbuildSolverLoads3D\(/.test(source)) converters.add(file);
  }
  expect([...callers].sort()).toEqual([
    'App.svelte dynamic',
    'components/diagram-game/game-model.ts solve',
    'components/edu/edu-solver.ts solvePDelta',
    'components/examples/run.worker.ts *',
    'components/pro/ProAdvancedTab.svelte solve3D',
    'components/pro/ProAdvancedTab.svelte solveBuckling3D',
    'components/pro/ProAdvancedTab.svelte solveCorotational3D',
    'components/pro/ProAdvancedTab.svelte solveHarmonic3D',
    'components/pro/ProAdvancedTab.svelte solveModal3D',
    'components/pro/ProAdvancedTab.svelte solvePDelta3D',
    'components/pro/ProAdvancedTab.svelte solvePlastic3D',
    'components/pro/ProAdvancedTab.svelte solveSSI3D',
    'components/pro/ProAdvancedTab.svelte solveSpectral3D',
    'components/pro/ProAdvancedTab.svelte solveStaged3D',
    'components/pro/ProAdvancedTab.svelte solveWinkler3D',
    'components/pro/dynamics/TimeHistoryPanel.svelte solveTimeHistory3D',
    'components/research/cqc1981/benchmark.ts dynamic',
    'components/research/dadeppo1975/solver.worker.ts solveArcLength',
    'components/research/ferrari2025/run.worker.ts solveArcLength',
    'components/research/ferrari2025/run.worker.ts solveBuckling',
    'components/research/lee1968/solve.worker.ts solveArcLength',
    'components/research/macneal1985/cases.ts dynamic',
    'components/research/mattiasson1981/cases.ts dynamic',
    'components/research/navier1823/solve.worker.ts solve3D',
    'components/research/newmark1959/benchmark.ts dynamic',
    'components/research/plastic-collapse/case.ts dynamic',
    'components/research/riksCrisfield/arc.worker.ts solveArcLength',
    'components/research/shell1985/cases.ts dynamic',
    'components/toolbar/ToolbarAdvanced.svelte solveBuckling3D',
    'components/toolbar/ToolbarAdvanced.svelte solveModal',
    'components/toolbar/ToolbarAdvanced.svelte solveModal3D',
    'components/toolbar/ToolbarAdvanced.svelte solvePDelta3D',
    'components/tools/BatchTool.svelte dynamic',
    'components/tools/CalculatorTool.svelte dynamic',
    'components/tools/MainBatchTool.svelte dynamic',
    'components/tools/MainToolsPage.svelte dynamic',
    'components/tools/batch-solve.ts prepareLoadSession2D',
    'components/tools/batch-solve.ts solve',
    'components/tools/batch-solve.ts solveModal',
    'components/tools/solve.ts solve',
    'components/tools/solve.ts solveBuckling',
    'lib/actions/second-order.ts solveBuckling3D',
    'lib/engine/direct-analysis.ts solvePDelta3D',
    'lib/engine/dynamics/course/sdof-engine.ts solveHarmonic2D',
    'lib/engine/dynamics/course/sdof-engine.ts solveModal',
    'lib/engine/dynamics/course/sdof-engine.ts solveTimeHistory2D',
    'lib/engine/influence-service.ts prepareLoadSession2D',
    'lib/engine/influence-service.ts solve',
    'lib/engine/influence/analysis.ts solve',
    'lib/engine/influence/envelope-along.ts solve',
    'lib/engine/influence/maxwell.ts solve',
    'lib/engine/influence/unit-sweep.ts solve',
    'lib/engine/member-behaviour.ts solve3D',
    'lib/engine/member-behaviour.ts solveCable3D',
    'lib/engine/member-behaviour.ts solveSSI3D',
    'lib/engine/moving-loads-3d.ts prepareLoadSession3D',
    'lib/engine/moving-loads.ts prepareLoadSession2D',
    'lib/engine/plastic-collapse.ts solve',
    'lib/engine/repeated-solve-3d.ts prepareLoadSession3D',
    'lib/engine/repeated-solve-3d.ts solve3D',
    'lib/engine/second-order/run-buckling.ts solveBuckling',
    'lib/engine/second-order/run-pdelta.ts solveBuckling',
    'lib/engine/second-order/run-pdelta.ts solvePDelta',
    'lib/engine/solver-service.ts solve',
    'lib/engine/solver-service.ts solve3D',
    'lib/engine/solver-service.ts solveMultiCase2D',
    'lib/engine/solver-service.ts solveMultiCase3D',
    'lib/engine/solver-service.ts solvePDelta3D',
    'lib/engine/steps/influence-doc.ts solve',
    'lib/engine/steps/influence-figs.ts solve',
    'lib/engine/steps/methods/dynamics.ts solveModal',
    'lib/engine/steps/reference.ts *',
    'lib/engine/steps/second-order-buckling.ts solveBuckling',
    'lib/engine/steps/second-order-pdelta.ts solvePDelta',
    'lib/results-snapshot/capture.ts solveBuckling3D',
    'lib/results-snapshot/capture.ts solveModal3D',
    'lib/results-snapshot/capture.ts solvePDelta3D',
    'lib/results-snapshot/capture.ts solveSpectral3D',
    'lib/store/certificate.svelte.ts certifyLinearWire',
    'lib/store/seismic-modes.ts solveModal3D',
    'lib/store/spectral-cases.ts solve3D',
    'lib/store/spectral-cases.ts solveModal3D',
  ]);
  expect([...bindings].sort()).toEqual([
    'lib/engine/nonlinear-worker-session.ts',
    'lib/engine/solver-worker.ts',
    'lib/engine/wasm-solver.ts',
  ]);
  expect([...converters].sort()).toEqual([
    'lib/engine/case-effects.ts',
    'lib/engine/dynamics/mass-source-model.ts',
    'lib/engine/solver-service.ts',
    'lib/store/materialize-space.ts',
  ]);
  const service = readFileSync(`${root}/lib/engine/solver-service.ts`, 'utf8');
  expect(service).toMatch(/function buildSolverLoads2D[\s\S]*?accountLoads2D\(/);
  const checked3D = service.match(/function checkedSolverLoads3D\([\s\S]*?\n\}/)?.[0];
  expect(checked3D).toMatch(/\bloadAccounting3D\(/);
  expect(checked3D).toMatch(/\baccounting\.verify\(/);
  expect(service).toMatch(/function caseSolverLoads3D[\s\S]*?checkedSolverLoads3D\(/);
});
