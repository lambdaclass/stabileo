import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.hoisted(() => vi.resetModules());
const mocks = vi.hoisted(() => ({ certify: vi.fn(), plain: vi.fn(), linear: vi.fn(), certify2D: vi.fn(), plain2D: vi.fn() }));
vi.mock('../../wasm/dedaliano_engine.js', async (original) => ({
  ...await original<typeof import('../../wasm/dedaliano_engine.js')>(),
  certify_buckling_2d: mocks.certify2D,
  solve_buckling_2d: mocks.plain2D,
  certify_buckling_3d: mocks.certify,
  solve_buckling_3d: mocks.plain,
  solve_3d: mocks.linear,
}));
import { initSolver, solveBuckling, solveBuckling3D } from '../wasm-solver';

const refusal = JSON.stringify({ message: 'withheld', structuredDiagnostics: [{ code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'withheld' }] });
function input() {
  const wire = JSON.parse(readFileSync('../verify/samples/plastic-3d-portal.input.json', 'utf8')).solver;
  for (const key of ['nodes', 'elements', 'materials', 'sections', 'supports', 'plates', 'quads', 'quad9s', 'solidShells', 'curvedShells', 'connectors']) {
    wire[key] = new Map(Object.entries(wire[key] ?? {}).map(([id, value]) => [Number(id), value]));
  }
  return wire;
}
beforeAll(initSolver);
beforeEach(() => { vi.clearAllMocks(); });
for (const error of [refusal, new Error(refusal)]) {
  it(`propagates a certified buckling refusal without running the plain fallback (${typeof error})`, () => {
    mocks.certify.mockImplementation(() => { throw error; });
    expect(() => solveBuckling3D(input())).toThrow();
    expect(mocks.certify).toHaveBeenCalled();
    expect(mocks.plain).not.toHaveBeenCalled();
    try { solveBuckling3D(input()); } catch (caught) { expect(caught).toBe(error); }
  });
}
it('keeps the ordinary certification failure fallback', () => {
  mocks.certify.mockImplementation(() => { throw new Error('certificate unavailable'); });
  mocks.plain.mockImplementation(() => { throw new Error('plain solver reached'); });
  expect(() => solveBuckling3D(input())).toThrow('plain solver reached');
  expect(mocks.plain).toHaveBeenCalled();
});

it('propagates containment from the warping preload solve', () => {
  const model = input();
  model.sections.get(1).bucklingCw = 1e-7;
  mocks.linear.mockImplementation(() => { throw refusal; });
  expect(() => solveBuckling3D(model)).toThrow(refusal);
  expect(mocks.linear).toHaveBeenCalled();
  expect(mocks.certify).not.toHaveBeenCalled();
  expect(mocks.plain).not.toHaveBeenCalled();
});

it('also preserves the 2D buckling certificate refusal', () => {
  const model = {
    nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: -1, fy: 0, mz: 0 } }],
  };
  mocks.certify2D.mockImplementation(() => { throw refusal; });
  expect(() => solveBuckling(model as never)).toThrow();
  expect(mocks.certify2D).toHaveBeenCalled();
  expect(mocks.plain2D).not.toHaveBeenCalled();
});

it('the real #741 model stays warned through an ordinary certification fallback', async () => {
  const native = await vi.importActual<typeof import('../../wasm/dedaliano_engine.js')>('../../wasm/dedaliano_engine.js');
  const json = readFileSync('../engine/tests/fixtures/buckling-741.json', 'utf8');
  const plain = JSON.parse(native.solve_buckling_3d(json, 1));
  expect(plain.modes[0].loadFactor).toBeCloseTo(4691.397553909858, 6);
  expect(plain.structuredDiagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: 'BU-ACCURACY', value: 818, severity: 'warning' }),
  ]));
  expect(() => native.certify_buckling_3d(json, 1)).toThrow(/BU-BOUND/);
  const wire = JSON.parse(json);
  for (const key of ['nodes', 'elements', 'materials', 'sections', 'supports', 'plates', 'quads', 'quad9s', 'solidShells', 'curvedShells', 'connectors']) {
    wire[key] = new Map(Object.entries(wire[key] ?? {}).map(([id, value]) => [Number(id), value]));
  }
  mocks.certify.mockImplementation(() => { throw new Error('certificate unavailable'); });
  mocks.plain.mockImplementation(native.solve_buckling_3d);
  const result = solveBuckling3D(wire, 1);
  expect(result.structuredDiagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ phase: 'BU-ACCURACY', value: 818 }),
  ]));
});
