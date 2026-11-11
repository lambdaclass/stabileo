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
afterEach(() => { vi.restoreAllMocks(); wasm.setPreparedLoadSessionsEnabled(true); });

it('#1753 influence collects every independent position warning through the solve entry point', () => {
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
  vi.spyOn(LoadSession2D.prototype, 'solve').mockImplementation(function (this: LoadSession2D, loads) {
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

it('a prepared solve uses the candidate model when its structure differs', () => {
  const model = input();
  const session = wasm.prepareLoadSession2D(model);
  const candidate = { ...model, supports: new Map([[2, { id: 2, nodeId: 2, type: 'fixed' as const }]]),
    loads: [{ type: 'nodal' as const, data: { nodeId: 1, fx: 0, fz: -1, my: 0 } }] };
  const run = vi.spyOn(LoadSession2D.prototype, 'solve');
  try {
    expect(wasm.solve(candidate, session)).toEqual(wasm.solve(candidate));
    expect(run).not.toHaveBeenCalled();
  } finally { session.free(); }
});

it.each(['coordinates', 'section', 'material', 'spring'] as const)('#1753: in-place %s edits invalidate a prepared stiffness', edit => {
  const model = input();
  model.loads = [{ type: 'nodal', data: { nodeId: 2, fx: 1, fz: -1, my: 1 } }];
  model.supports.set(2, { id: 2, nodeId: 2, type: 'spring', kx: 2, ky: 3, kz: 4 });
  const session = wasm.prepareLoadSession2D(model);
  try {
    const before = wasm.solve(model, session);
    if (edit === 'coordinates') model.nodes.get(2)!.x *= 2;
    if (edit === 'section') model.sections.get(1)!.iz *= 2;
    if (edit === 'material') model.materials.get(1)!.e *= 2;
    if (edit === 'spring') model.supports.get(2)!.ky! *= 2;
    const fresh = wasm.solve(model);
    expect(fresh.displacements).not.toEqual(before.displacements);
    expect(wasm.solve(model, session)).toEqual(fresh);
  } finally { session.free(); }
});
