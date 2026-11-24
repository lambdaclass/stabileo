import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.hoisted(() => vi.resetModules());
const mocks = vi.hoisted(() => ({ pdelta2D: vi.fn(), pdelta3D: vi.fn(), modal3D: vi.fn(), certify3D: vi.fn(), plain3D: vi.fn(), certify2D: vi.fn(), plain2D: vi.fn() }));
vi.mock('../../wasm/dedaliano_engine.js', async (original) => ({
  ...await original<typeof import('../../wasm/dedaliano_engine.js')>(),
  solve_pdelta_2d: mocks.pdelta2D,
  solve_pdelta_3d: mocks.pdelta3D,
  solve_modal_3d: mocks.modal3D,
  certify_buckling_3d: mocks.certify3D,
  solve_buckling_3d: mocks.plain3D,
  certify_buckling_2d: mocks.certify2D,
  solve_buckling_2d: mocks.plain2D,
}));
import { initSolver, setAdvancedGuards, solveBuckling, solveBuckling3D, solveModal3D, solvePDelta, solvePDelta3D } from '../wasm-solver';
import { isContainmentRefusal } from '../containment-error';
import { column } from '../second-order/__tests__/fixtures';

const mixed = (code: string) => new Error(JSON.stringify({
  message: 'withheld',
  structuredDiagnostics: [
    { code, severity: 'error', message: 'coded' },
    { code: 'known_issue', severity: 'error', phase: 'BU-BOUND', value: 741, message: 'withheld' },
  ],
}));
function input3D() {
  const wire = JSON.parse(readFileSync('../verify/samples/plastic-3d-portal.input.json', 'utf8')).solver;
  for (const key of ['nodes', 'elements', 'materials', 'sections', 'supports', 'plates', 'quads', 'quad9s', 'solidShells', 'curvedShells', 'connectors']) {
    wire[key] = new Map(Object.entries(wire[key] ?? {}).map(([id, value]) => [Number(id), value]));
  }
  return wire;
}
const guards = { refuse2D: () => null, refuse3D: () => null, eigenInput3D: (i: never) => i, text: (k: string) => k };
function thrown(run: () => unknown): unknown {
  try { run(); } catch (e) { return e; }
  throw new Error('did not throw');
}

beforeAll(initSolver);
beforeEach(() => vi.clearAllMocks());
afterEach(() => setAdvancedGuards(null));

for (const withGuards of [false, true]) {
  const label = withGuards ? 'with the app guards' : 'without guards';
  it(`a P-Δ refused for a known wrong result is not the no-free-DOF linear answer (2D, ${label})`, () => {
    if (withGuards) setAdvancedGuards(guards);
    const error = mixed('no_free_dofs');
    mocks.pdelta2D.mockImplementation(() => { throw error; });
    const caught = thrown(() => solvePDelta(column('fixed', null, 4, 100)));
    expect(caught).toBe(error);
    expect(isContainmentRefusal(caught)).toBe(true);
  });

  it(`a P-Δ refused for a known wrong result is not the no-free-DOF linear answer (3D, ${label})`, () => {
    if (withGuards) setAdvancedGuards(guards);
    const error = mixed('no_free_dofs');
    mocks.pdelta3D.mockImplementation(() => { throw error; });
    const caught = thrown(() => solvePDelta3D(input3D()));
    expect(caught).toBe(error);
    expect(isContainmentRefusal(caught)).toBe(true);
  });

  it(`a buckling refusal for a known wrong result is not "no compressed elements" (2D and 3D, ${label})`, () => {
    if (withGuards) setAdvancedGuards(guards);
    const error = mixed('no_compressed_elements');
    for (const m of [mocks.certify2D, mocks.plain2D, mocks.certify3D, mocks.plain3D]) m.mockImplementation(() => { throw error; });
    for (const run of [() => solveBuckling(column('fixed', null, 4, 100)), () => solveBuckling3D(input3D())]) {
      const caught = thrown(run);
      expect(caught).toBe(error);
      expect(isContainmentRefusal(caught)).toBe(true);
    }
  });

  it(`a failed space eigen decomposition that is also contained is neither held nor recoded (${label})`, () => {
    if (withGuards) setAdvancedGuards(guards);
    const error = mixed('eigen_decomposition_failed');
    mocks.modal3D.mockImplementationOnce(() => { throw error; }).mockImplementation(() => JSON.stringify({ modes: [], totalMass: 0, massParticipation: {} }));
    const caught = thrown(() => solveModal3D(input3D(), new Map([[1, 7850]])));
    expect(caught).toBe(error);
    expect(isContainmentRefusal(caught)).toBe(true);
    expect(mocks.modal3D).toHaveBeenCalledTimes(1);
  });
}
