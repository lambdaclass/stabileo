import { afterEach, expect, it, vi } from 'vitest';
import * as wasm from '../wasm-solver';
import { LoadSession2D } from '../../wasm/dedaliano_engine.js';
import { computePoints } from '../influence-service';
import type { SolverInput, StructuredDiagnostic } from '../types';

const input = (): SolverInput => ({
  nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 6, z: 0 }]]),
  elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
  materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
  sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
  supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]), loads: [],
});
const warning = (position: number): StructuredDiagnostic => ({
  code: 'known_issue', severity: 'warning', phase: 'NUM-INVARIANCE', value: 762, message: `position ${position}`,
});
const regression = process.env.RUN_1753_WARNING_REPRODUCERS ? it : it.skip;
afterEach(() => { vi.restoreAllMocks(); wasm.setPreparedLoadSessionsEnabled(true); });

regression('known wrong result: #1753: influence collects every independent position warning through the solve entry point', () => {
  const warnings = [warning(1), warning(2)];
  let position = 0;
  vi.spyOn(wasm, 'solve').mockImplementation(() => ({
    displacements: [], reactions: [], elementForces: [],
    structuredDiagnostics: position++ === 0 ? [] : [warnings[(position - 2) % warnings.length]],
  }));
  const collected: StructuredDiagnostic[] = [];
  computePoints(input(), 'Rz', { kind: 'node', nodeId: 1 }, 2, { x: 1, z: 0 }, 'horizontal',
    result => collected.push(...result.structuredDiagnostics ?? []));
  expect(collected).toEqual(warnings);
});

it('influence retains each distinct native warning from later positions', () => {
  const run = LoadSession2D.prototype.solve;
  const warnings = [warning(1), warning(2)];
  let position = 0;
  vi.spyOn(LoadSession2D.prototype, 'solve').mockImplementation(function (loads) {
    const result = run.call(this, loads);
    if (position++ > 0) result.structuredDiagnostics.push(warnings[(position - 2) % warnings.length]);
    return result;
  });
  const collected: StructuredDiagnostic[] = [];
  computePoints(input(), 'Rz', { kind: 'node', nodeId: 1 }, 2, { x: 1, z: 0 }, 'horizontal',
    result => collected.push(...result.structuredDiagnostics ?? []));
  expect(collected.filter(d => d.code === 'known_issue')).toEqual(warnings);
});

it('prepared influence preserves the complete diagnostics and ordinates of independent positions', () => {
  const model = input();
  const sweep = () => {
    const diagnostics: StructuredDiagnostic[][] = [];
    const points = computePoints(model, 'V', { kind: 'section', elementId: 1, t: 0.37 }, 2, { x: 1, z: -1 }, 'horizontal',
      result => diagnostics.push(result.structuredDiagnostics ?? []));
    return { points, diagnostics };
  };
  wasm.setPreparedLoadSessionsEnabled(false);
  const independent = sweep();
  wasm.setPreparedLoadSessionsEnabled(true);
  expect(sweep()).toEqual(independent);
});
