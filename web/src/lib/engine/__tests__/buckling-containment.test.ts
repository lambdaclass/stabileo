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
import { isContainmentRefusal } from '../containment-error';
import { knownIssueResultDisposition } from '../known-issues';

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

it('the #741 model, whose only compression is round-off, is refused as not determinable (#1548)', async () => {
  const native = await vi.importActual<typeof import('../../wasm/dedaliano_engine.js')>('../../wasm/dedaliano_engine.js');
  const json = readFileSync('../engine/tests/fixtures/buckling-741.json', 'utf8');
  expect(() => native.solve_buckling_3d(json, 1)).toThrow(/Buckling not determinable/);
  expect(() => native.certify_buckling_3d(json, 1)).toThrow(/Buckling not determinable/);
});

it('the real #741 model under a compressive tip load stays warned through an ordinary certification fallback', async () => {
  const native = await vi.importActual<typeof import('../../wasm/dedaliano_engine.js')>('../../wasm/dedaliano_engine.js');
  const json = readFileSync('../engine/tests/fixtures/buckling-741-compressed.json', 'utf8');
  const plain = JSON.parse(native.solve_buckling_3d(json, 1));
  expect(plain.modes[0].loadFactor).toBeCloseTo(1.2087954149900562, 9);
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
  const disposition = knownIssueResultDisposition(result);
  expect(disposition.refused).toBe(false);
  expect(disposition.messages.some(m => m.includes('#818'))).toBe(true);
});

it('the real #741 certificate refusal is a containment refusal and withholds the factor', async () => {
  const native = await vi.importActual<typeof import('../../wasm/dedaliano_engine.js')>('../../wasm/dedaliano_engine.js');
  const json = readFileSync('../engine/tests/fixtures/buckling-741-compressed.json', 'utf8');
  let thrown: unknown = null;
  try { native.certify_buckling_3d(json, 1); } catch (e) { thrown = e; }
  expect(thrown).not.toBeNull();
  expect(isContainmentRefusal(thrown)).toBe(true);
  const wire = JSON.parse(json);
  for (const key of ['nodes', 'elements', 'materials', 'sections', 'supports', 'plates', 'quads', 'quad9s', 'solidShells', 'curvedShells', 'connectors']) {
    wire[key] = new Map(Object.entries(wire[key] ?? {}).map(([id, value]) => [Number(id), value]));
  }
  mocks.certify.mockImplementation(native.certify_buckling_3d);
  mocks.plain.mockImplementation(native.solve_buckling_3d);
  let result: unknown = null;
  expect(() => { result = solveBuckling3D(wire, 1); }).toThrow(/BU-BOUND/);
  expect(result).toBeNull();
  expect(mocks.certify).toHaveBeenCalled();
  expect(mocks.plain).not.toHaveBeenCalled();
});

it('a constraint in a separate structure does not refuse a resolved buckling compression (#1756)', async () => {
  const native = await vi.importActual<typeof import('../../wasm/dedaliano_engine.js')>('../../wasm/dedaliano_engine.js');
  const expected = ((5.2 - Math.sqrt(19.84)) / 0.3) * (200000 * 1000 * 1e-12) / 100 / 1e-9;
  const json2d = JSON.stringify({
    nodes: { 1: { id: 1, x: 0, z: 0 }, 2: { id: 2, x: 0, z: 10 }, 3: { id: 3, x: 10, z: 0 }, 4: { id: 4, x: 14, z: 0 } },
    materials: { 1: { id: 1, e: 200000, nu: 0.3 } },
    sections: { 1: { id: 1, a: 1e-4, iz: 1e-12 }, 2: { id: 2, a: 0.01, iz: 1e-4 } },
    elements: {
      1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 },
      2: { id: 2, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 2 },
    },
    supports: { 1: { id: 1, nodeId: 1, type: 'fixed' }, 3: { id: 3, nodeId: 3, type: 'pinned' }, 4: { id: 4, nodeId: 4, type: 'rollerX' } },
    loads: [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fz: -1e-9, my: 0 } },
      { type: 'nodal', data: { nodeId: 4, fx: 1e6, fz: 0, my: 0 } },
    ],
    constraints: [{ type: 'linearMPC', terms: [{ nodeId: 3, dof: 2, coefficient: 1 }, { nodeId: 4, dof: 2, coefficient: -1 }] }],
  });
  const json3d = JSON.stringify({
    nodes: { 1: { id: 1, x: 0, y: 0, z: 0 }, 2: { id: 2, x: 0, y: 0, z: 10 }, 3: { id: 3, x: 10, y: 0, z: 0 }, 4: { id: 4, x: 14, y: 0, z: 0 } },
    materials: { 1: { id: 1, e: 200000, nu: 0.3 } },
    sections: { 1: { id: 1, a: 1e-4, iy: 1e-12, iz: 1e-12, j: 1e-12 }, 2: { id: 2, a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 } },
    elements: {
      1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 },
      2: { id: 2, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 2 },
    },
    supports: {
      1: { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      2: { nodeId: 2, rx: false, ry: true, rz: false, rrx: true, rry: false, rrz: true },
      3: { nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: true },
      4: { nodeId: 4, rx: false, ry: true, rz: true, rrx: true, rry: false, rrz: true },
    },
    loads: [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: -1e-9, mx: 0, my: 0, mz: 0 } },
      { type: 'nodal', data: { nodeId: 4, fx: 1e6, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } },
    ],
    constraints: [{ type: 'linearMPC', terms: [{ nodeId: 3, dof: 4, coefficient: 1 }, { nodeId: 4, dof: 4, coefficient: -1 }] }],
  });

  const plain2d = JSON.parse(native.solve_buckling_2d(json2d, 1));
  const cert2d = JSON.parse(native.certify_buckling_2d(json2d, 1));
  const plain3d = JSON.parse(native.solve_buckling_3d(json3d, 1));
  const cert3d = JSON.parse(native.certify_buckling_3d(json3d, 1));
  const unconstrained = (json: string) => JSON.stringify({ ...JSON.parse(json), constraints: [] });
  for (const [actual, control] of [
    [cert2d, JSON.parse(native.certify_buckling_2d(unconstrained(json2d), 1))],
    [cert3d, JSON.parse(native.certify_buckling_3d(unconstrained(json3d), 1))],
  ]) {
    expect(actual.certificate.status).toBe(control.certificate.status);
    expect(Math.abs(control.results.modes[0].loadFactor / expected - 1)).toBeLessThan(1e-6);
    expect(Math.abs(actual.results.modes[0].loadFactor / control.results.modes[0].loadFactor - 1)).toBeLessThan(1e-6);
  }
  for (const factor of [
    plain2d.modes[0].loadFactor,
    cert2d.results.modes[0].loadFactor,
    plain3d.modes[0].loadFactor,
    cert3d.results.modes[0].loadFactor,
  ]) {
    expect(Math.abs(factor / expected - 1)).toBeLessThan(1e-6);
  }

  mocks.certify2D.mockImplementation(native.certify_buckling_2d);
  mocks.plain2D.mockImplementation(native.solve_buckling_2d);
  const model2d = {
    nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 0, y: 10 }], [3, { id: 3, x: 10, y: 0 }], [4, { id: 4, x: 14, y: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 1e-4, iz: 1e-12 }], [2, { id: 2, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
      [2, { id: 2, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 2 }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed' }],
      [3, { id: 3, nodeId: 3, type: 'pinned' }],
      [4, { id: 4, nodeId: 4, type: 'rollerX' }],
    ]),
    loads: [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -1e-9, mz: 0 } },
      { type: 'nodal', data: { nodeId: 4, fx: 1e6, fy: 0, mz: 0 } },
    ],
    constraints: [{ type: 'linearMPC', terms: [{ nodeId: 3, dof: 2, coefficient: 1 }, { nodeId: 4, dof: 2, coefficient: -1 }] }],
  };
  expect(Math.abs(solveBuckling(model2d as never, 1).modes[0].loadFactor / expected - 1)).toBeLessThan(1e-6);
});

it('a constraint coupling a column to a heavily loaded member refuses compression within coupled round-off', async () => {
  const native = await vi.importActual<typeof import('../../wasm/dedaliano_engine.js')>('../../wasm/dedaliano_engine.js');
  const build2d = (p: number) => JSON.stringify({
    nodes: { 1: { id: 1, x: 0, z: 0 }, 2: { id: 2, x: 0, z: 10 }, 3: { id: 3, x: 10, z: 0 }, 4: { id: 4, x: 14, z: 0 } },
    materials: { 1: { id: 1, e: 200000, nu: 0.3 } },
    sections: { 1: { id: 1, a: 1e-4, iz: 1e-12 }, 2: { id: 2, a: 0.01, iz: 1e-4 } },
    elements: {
      1: { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 },
      2: { id: 2, type: 'frame', nodeI: 3, nodeJ: 4, materialId: 1, sectionId: 2 },
    },
    supports: { 1: { id: 1, nodeId: 1, type: 'guidedX' }, 3: { id: 3, nodeId: 3, type: 'pinned' }, 4: { id: 4, nodeId: 4, type: 'rollerX' } },
    loads: [
      { type: 'nodal', data: { nodeId: 2, fx: 0, fz: -p, my: 0 } },
      { type: 'nodal', data: { nodeId: 4, fx: 1e6, fz: 0, my: 0 } },
    ],
    constraints: [{ type: 'equalDOF', masterNode: 4, slaveNode: 1, dofs: [0] }],
  });
  const build3d = (p: number) => {
    const input = JSON.parse(build2d(p));
    for (const node of Object.values(input.nodes) as Array<Record<string, number>>) node.y = 0;
    for (const section of Object.values(input.sections) as Array<Record<string, number>>) {
      section.iy = section.iz;
      section.j = section.iz;
    }
    input.supports = {
      1: { nodeId: 1, rx: false, ry: true, rz: true, rrx: true, rry: true, rrz: true },
      2: { nodeId: 2, rx: false, ry: true, rz: false, rrx: true, rry: false, rrz: true },
      3: { nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rry: false, rrz: true },
      4: { nodeId: 4, rx: false, ry: true, rz: true, rrx: true, rry: false, rrz: true },
    };
    for (const { data } of input.loads) Object.assign(data, { fy: 0, mx: 0, mz: 0 });
    return JSON.stringify(input);
  };
  expect(() => native.solve_buckling_3d(build3d(4e-8), 1)).toThrow(/Buckling not determinable/);
  expect(() => native.certify_buckling_3d(build3d(4e-8), 1)).toThrow(/Buckling not determinable/);
  expect(() => native.solve_buckling_2d(build2d(4e-8), 1)).toThrow(/Buckling not determinable/);
  expect(() => native.certify_buckling_2d(build2d(4e-8), 1)).toThrow(/Buckling not determinable/);
  const expected = ((5.2 - Math.sqrt(19.84)) / 0.3) * (200000 * 1000 * 1e-12) / 100 / 5e-8;
  for (const factor of [
    JSON.parse(native.solve_buckling_2d(build2d(5e-8), 1)).modes[0].loadFactor,
    JSON.parse(native.certify_buckling_2d(build2d(5e-8), 1)).results.modes[0].loadFactor,
    JSON.parse(native.solve_buckling_3d(build3d(5e-8), 1)).modes[0].loadFactor,
    JSON.parse(native.certify_buckling_3d(build3d(5e-8), 1)).results.modes[0].loadFactor,
  ]) {
    expect(Math.abs(factor / expected - 1)).toBeLessThan(1e-6);
  }
});

it('the real #959 transverse-load model still refuses round-off compression', async () => {
  const native = await vi.importActual<typeof import('../../wasm/dedaliano_engine.js')>('../../wasm/dedaliano_engine.js');
  const json = readFileSync('../engine/tests/metamorphic_corpus/nightly/issue-959.json', 'utf8');
  expect(() => native.solve_buckling_2d(json, 3)).toThrow(/Buckling not determinable: every axial compression is within round-off/);
  expect(() => native.certify_buckling_2d(json, 3)).toThrow(/Buckling not determinable: every axial compression is within round-off/);
});

it('shared free warping without constraints refuses only unresolved compression (#1756)', async () => {
  const native = await vi.importActual<typeof import('../../wasm/dedaliano_engine.js')>('../../wasm/dedaliano_engine.js');
  const build = (p: number, shared: boolean) => {
    const wire = JSON.parse(readFileSync('../engine/tests/fixtures/buckling-shared-free-warping.json', 'utf8'));
    wire.loads[0].data.fz = -p;
    wire.supports[1].rw = !shared;
    expect(wire.constraints).toEqual([]);
    return JSON.stringify(wire);
  };
  const transverse = JSON.parse(build(0, true));
  Object.assign(transverse.nodes[2], { x: 6, z: 8 });
  transverse.elements[1].sectionId = 2;
  Object.assign(transverse.loads[0].data, { fx: 8e6, fz: -6e6 });
  expect(transverse.loads[0].data.fx * 6 + transverse.loads[0].data.fz * 8).toBe(0);
  const linear = native.solve_3d(transverse);
  const tip = linear.displacements.find((d: { nodeId: number }) => d.nodeId === 2);
  const recovered = 200000 * 1000 * .01 * ((tip.ux * 6 / 10 + tip.uz * 8 / 10) / 10);
  const noise = 100 * Number.EPSILON * 200000 * 1000 * .01 * (Math.abs(tip.ux * .6) + Math.abs(tip.uz * .8)) / 10;
  expect(recovered).toBeLessThan(0);
  expect(Math.abs(recovered)).toBeLessThan(noise);
  for (const solve of [native.solve_buckling_3d, native.certify_buckling_3d]) {
    expect(() => solve(JSON.stringify(transverse), 1)).toThrow(/every axial compression is within round-off/);
    expect(() => solve(build(4e-8, true), 1)).toThrow(/every axial compression is within round-off/);
    for (const [p, shared] of [[5e-8, true], [4e-8, false]] as const) {
      const result = JSON.parse(solve(build(p, shared), 1));
      const factor = (result.results ?? result).modes[0].loadFactor;
      const expected = ((5.2 - Math.sqrt(19.84)) / 0.3) * (200000 * 1000 * 1e-12) / 100 / p;
      expect(Math.abs(factor / expected - 1)).toBeLessThan(1e-6);
    }
  }
});

it('an omitted round-off stub with a free-rotation MPC preserves the resolved column (#1756)', async () => {
  const native = await vi.importActual<typeof import('../../wasm/dedaliano_engine.js')>('../../wasm/dedaliano_engine.js');
  const plane = JSON.parse(readFileSync('../engine/tests/fixtures/buckling-1756-omitted-member.json', 'utf8'));
  const space = structuredClone(plane);
  for (const node of Object.values(space.nodes) as Array<Record<string, number>>) node.y = 0;
  for (const section of Object.values(space.sections) as Array<Record<string, number>>) {
    section.iy = section.iz;
    section.j = section.iz;
  }
  space.supports = Object.fromEntries(Object.keys(space.nodes).map((id) => {
    const type = plane.supports[id]?.type;
    return [id, { nodeId: Number(id), rx: type === 'fixed' || type === 'pinned', ry: true,
      rz: ['fixed', 'pinned', 'rollerX'].includes(type), rrx: true, rry: type === 'fixed', rrz: true }];
  }));
  for (const load of space.loads) Object.assign(load.data, { fy: 0, mx: 0, mz: 0 });
  for (const term of space.constraints[0].terms) term.dof = 4;
  const expected = ((5.2 - Math.sqrt(19.84)) / .3) * (200000 * 1000 * 1e-12) / 100 / 1e-9;
  for (const [wire, plain, certified] of [
    [plane, native.solve_buckling_2d, native.certify_buckling_2d],
    [space, native.solve_buckling_3d, native.certify_buckling_3d],
  ] as const) {
    for (const solve of [plain, certified]) {
      const response = JSON.parse(solve(JSON.stringify(wire), 1));
      const result = response.results ?? response;
      expect(Math.abs(result.modes[0].loadFactor / expected - 1)).toBeLessThan(1e-6);
      expect(result.elementData.some((element: { elementId: number }) => element.elementId === 4)).toBe(false);
      expect(result.structuredDiagnostics?.some((d: { phase: string }) => d.phase === 'BU-UNRESOLVED-MODE') ?? false).toBe(false);
    }
  }
});

const memberCouplingCases = JSON.parse(readFileSync('../engine/tests/fixtures/buckling-member-coupling-cases.json', 'utf8')) as { name: string; patch: Record<string, Record<string, Record<string, unknown>>> }[];
it.skip.each(memberCouplingCases.flatMap((c) => [0, .4, 1.005].map((ratio) => ({ ...c, ratio }))))('inactive member DOFs preserve resolved buckling modes: $name ratio $ratio (#1947)', async ({ patch, ratio }) => {
  const native = await vi.importActual<typeof import('../../wasm/dedaliano_engine.js')>('../../wasm/dedaliano_engine.js');
  const expected = ((5.2 - Math.sqrt(19.84)) / 0.3) * (200000 * 1000 * 1e-12) / 100 / 4e-8;
  {
    const secondColumn = ratio > 0;
    const wire = JSON.parse(readFileSync('../engine/tests/fixtures/buckling-shared-free-warping.json', 'utf8'));
    for (const [collection, entries] of Object.entries(patch)) {
      for (const [id, fields] of Object.entries(entries)) {
        Object.assign(wire[collection][id] ??= {}, fields);
      }
    }
    if (secondColumn) {
      wire.nodes[4] = { id: 4, x: 20, y: 0, z: 0 };
      wire.nodes[5] = { id: 5, x: 20, y: 0, z: 10 };
      wire.sections[3] = { ...wire.sections[1], id: 3, cw: null,
        iy: wire.sections[1].iy * 10 / 4e-8 * ratio, iz: wire.sections[1].iz * 10 / 4e-8 * ratio };
      wire.elements[3] = { id: 3, type: 'frame', nodeI: 4, nodeJ: 5, materialId: 1, sectionId: 3 };
      wire.supports[4] = { ...wire.supports[1], nodeId: 4, rw: true };
      wire.supports[5] = { ...wire.supports[2], nodeId: 5 };
      wire.loads.push({ ...wire.loads[0], data: { ...wire.loads[0].data, nodeId: 5, fz: -10 } });
    }
    for (const solve of [native.solve_buckling_3d, native.certify_buckling_3d]) {
      const response = JSON.parse(solve(JSON.stringify(wire), 4));
      const result = response.results ?? response;
      expect(Math.abs(result.modes[0].loadFactor / (expected * (secondColumn ? Math.min(1, ratio) : 1)) - 1)).toBeLessThan(1e-6);
      expect(result.elementData.some((element: { elementId: number }) => element.elementId === 1)).toBe(true);
      if (secondColumn) {
        expect(result.modes.length).toBeGreaterThanOrEqual(2);
        expect(Math.abs(result.modes[1].loadFactor / (expected * Math.max(1, ratio)) - 1)).toBeLessThan(1e-6);
        const amplitude = (nodeId: number) => {
          const d = result.modes[0].displacements.find((d: { nodeId: number }) => d.nodeId === nodeId);
          return Math.hypot(d.ux, d.uy, d.uz);
        };
        expect(amplitude(ratio < 1 ? 2 : 5)).toBeLessThan(amplitude(ratio < 1 ? 5 : 2) * 1e-6);
      }
    }
  }
});
