import { beforeAll, expect, it } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import '../../../store/index';
import { buildSolverInput2D, buildSolverInput3D } from '../../solver-service';
import { initSolver, solve, solve3D, solvePDelta, solvePDelta3D, solveCorotational2D, solveCorotational3D, solvePlastic } from '../../wasm-solver';
import { expectPlasticRefusal } from '../../__tests__/containment-helper';
import { assertMemberLoadSpan, MIN_NATIVE_MEMBER_LOAD_SPAN } from '../member-load-spans';

beforeAll(async () => { await initSolver(); });

function model(plane: boolean, a: number, b: number) {
  modelStore.clear();
  const i = modelStore.addNode(0, 0, 0), j = modelStore.addNode(1, 0, 0), elementId = modelStore.addElement(i, j);
  modelStore.addSupport(i, 'fixed');
  if (plane) modelStore.addNodalLoad(j, 0, -1, 0);
  else modelStore.addLoadEntry({ type: 'nodal3d', data: { id: 16, nodeId: j, fx: 0, fy: -1, fz: 0, mx: 0, my: 0, mz: 0 } });
  modelStore.addLoadEntry(plane
    ? { type: 'distributed', data: { id: 17, elementId, qI: -2, qJ: -3, a, b } }
    : { type: 'distributed3d', data: { id: 17, elementId, qYI: -2, qYJ: -3, qZI: 0, qZJ: 0, a, b } });
  return modelStore.model;
}

for (const plane of [true, false]) for (const a of [0, 0.5, 1]) it(`known wrong result: #2219 empty force interval preserves the loaded answer plane=${plane} a=${a}`, () => {
  const m = model(plane, a, a);
  if (plane) {
    const input = buildSolverInput2D(m)!;
    const control = buildSolverInput2D({ ...m, loads: m.loads.filter(l => l.type !== 'distributed') })!;
    expect(input.loads).toEqual(control.loads);
    expect(solve(input)).toEqual(solve(control));
    expect(solvePDelta(input)).toEqual(solvePDelta(control));
    expect(solveCorotational2D(input)).toEqual(solveCorotational2D(control));
    expect(solve(input).displacements.some(d => d.uz !== 0)).toBe(true);
  } else {
    const input = buildSolverInput3D(m)!;
    const control = buildSolverInput3D({ ...m, loads: m.loads.filter(l => l.type !== 'distributed3d') })!;
    expect(input.loads).toEqual(control.loads);
    expect(solve3D(input)).toEqual(solve3D(control));
    expect(solvePDelta3D(input)).toEqual(solvePDelta3D(control));
    expect(solveCorotational3D(input)).toEqual(solveCorotational3D(control));
    expect(solve3D(input).displacements.some(d => d.uy !== 0)).toBe(true);
  }
});

for (const plane of [true, false]) for (const width of [-1, MIN_NATIVE_MEMBER_LOAD_SPAN / 2, MIN_NATIVE_MEMBER_LOAD_SPAN, 2 * MIN_NATIVE_MEMBER_LOAD_SPAN]) it(`positive short intervals retain the native refusal boundary plane=${plane} width=${width}`, () => {
  const m = model(plane, 0, width);
  const build = () => plane ? buildSolverInput2D(m) : buildSolverInput3D(m);
  if (width < MIN_NATIVE_MEMBER_LOAD_SPAN) expect(build).toThrow('below the native supported minimum');
  else expect(build()!.loads.some(l => l.type === 'distributed' && l.data.a === 0 && l.data.b === width)).toBe(true);
});

it('nonfinite, reversed, collapsed nonempty and zero moment supports remain refused', () => {
  for (const [a, b, span] of [[NaN, NaN, 0], [Infinity, Infinity, 0], [1, 0, -1], [0.5, 0.5, 1]]) expect(() => assertMemberLoadSpan(1, a!, b!, span!)).toThrow();
  const m = model(false, 0.5, 0.5);
  const load = m.loads.find(l => l.type === 'distributed3d')!;
  if (load.type !== 'distributed3d') throw new Error('Missing distributed load');
  load.data.moments = { x: [1, 1, 1], y: [0, 0, 0], z: [0, 0, 0] };
  expect(() => buildSolverInput3D(m)).toThrow();
});

it('known wrong result: #2219 distributed IDs preserve the fixed-fixed UDL plastic refusal', () => {
  const m = model(true, 0, 1);
  const input = buildSolverInput2D(m)!;
  input.supports.set(2, { ...input.supports.values().next().value!, nodeId: 2, type: 'fixed' });
  input.loads = [{ type: 'distributed', data: { id: 17, elementId: 1, qI: -2, qJ: -2 } } as never];
  expectPlasticRefusal(() => solvePlastic({ solver: input, sections: new Map([[1, { a: 1, iz: 1, materialId: 1 }]]), materials: new Map([[1, { fy: 1 }]]) }));
});


for (const plane of [true, false]) it(`load IDs do not change supported linear or nonlinear answers plane=${plane}`, () => {
  const m = model(plane, 0, 1);
  if (plane) {
    const control = buildSolverInput2D(m)!;
    const input = { ...control, loads: control.loads.map(l => l.type === 'distributed' ? { ...l, data: { ...l.data, id: 17 } } : l) };
    expect(solve(input)).toEqual(solve(control));
    expect(solvePDelta(input)).toEqual(solvePDelta(control));
    expect(solveCorotational2D(input)).toEqual(solveCorotational2D(control));
  } else {
    const control = buildSolverInput3D(m)!;
    const input = { ...control, loads: control.loads.map(l => l.type === 'distributed' ? { ...l, data: { ...l.data, id: 17 } } : l) };
    expect(solve3D(input)).toEqual(solve3D(control));
    expect(solvePDelta3D(input)).toEqual(solvePDelta3D(control));
    expect(solveCorotational3D(input)).toEqual(solveCorotational3D(control));
  }
});

for (const origin of ['generated', 'definition', 'positive source span'] as const) it(`collapsed ${origin} intervals still refuse`, () => {
  const m = model(false, 0.5, 0.5);
  const load = m.loads.find(l => l.type === 'distributed3d')!;
  if (load.type !== 'distributed3d') throw new Error('Missing distributed load');
  if (origin === 'generated') load.data.generatedBy = 'gravity';
  else if (origin === 'definition') load.data.fromDef = 1;
  else Object.assign(load.data, { spanLength: 1e-20 });
  expect(() => buildSolverInput3D(m)).toThrow('below the native supported minimum');
});
