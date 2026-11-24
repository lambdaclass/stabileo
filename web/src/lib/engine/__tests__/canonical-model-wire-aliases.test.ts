import { beforeAll, expect, it } from 'vitest';
import { initSolver } from '../wasm-solver';
import { solve_2d, solve_3d, solve_arc_length, solve_displacement_control, solve_pdelta_2d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';

beforeAll(async () => { await initSolver(); });

const indexed = <T>(...items: T[]) => Object.fromEntries(items.map((item, index) => [index + 1, item]));

const planar = {
  nodes: indexed({ id: 1, x: 0, z: 0 }, { id: 2, x: 2, z: 0 }),
  elements: indexed({ id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }),
  materials: indexed({ id: 1, e: 200000, nu: 0.3 }),
  sections: indexed({ id: 1, a: 0.01, iz: 1e-4 }),
  supports: indexed({ id: 1, nodeId: 1, type: 'fixed' }),
  loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: 5 } }],
};

const space = {
  ...planar,
  nodes: indexed(...Object.values(planar.nodes).map(n => ({ ...n, y: 0 }))),
  sections: indexed(...Object.values(planar.sections).map(s => ({ ...s, iy: s.iz, j: 2 * s.iz }))),
  supports: indexed({ nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }),
  loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 1, fz: 2, mx: 0, my: 3, mz: 4 } }],
};

const planarSolvers = {
  linear: solve_2d,
  pdelta: (input: object) => JSON.parse(solve_pdelta_2d(JSON.stringify(input), 20, 1e-9)).results,
};

for (const [name, solve] of Object.entries(planarSolvers)) {
  it(`roadmap 2.4 reconciles a moment alias before WASM ${name} analysis`, () => {
    const input = (mz: number) => ({ ...planar, loads: planar.loads.map(l => ({ ...l, data: { ...l.data, mz } })) });
    expect(() => solve(input(0))).toThrow(/my/);
    const reference = solve(planar);
    expect(reference.reactions).toHaveLength(1);
    const agreeing = solve(input(5));
    expect(agreeing.reactions).toEqual(reference.reactions);
    expect(agreeing.displacements).toEqual(reference.displacements);
  });
}

it('roadmap 2.4 retains independent spatial moments through both WASM solvers', () => {
  for (const result of [solve_3d(space), JSON.parse(solve_pdelta_3d(JSON.stringify(space), 20, 1e-9)).results]) {
    expect(result.reactions).toHaveLength(1);
    expect(result.reactions[0].my).not.toBe(0);
    expect(result.reactions[0].mz).not.toBe(0);
  }
});

it('#1949 WASM planar solvers refuse a second node coordinate', () => {
  const path = {
    maxSteps: 3, nSteps: 3, controlNode: 2, controlDof: 1,
    targetDisplacement: -0.005, tolerance: 1e-9,
  };
  const solvers = {
    ...planarSolvers,
    arc: (solver: object) => JSON.parse(solve_arc_length(JSON.stringify({ ...path, solver }))).results,
    displacement: (solver: object) => JSON.parse(solve_displacement_control(JSON.stringify({ ...path, solver }))).results,
  };
  for (const solve of Object.values(solvers)) {
    for (const z of [0, 1, -1]) {
      const { z: _z, ...tip } = planar.nodes[2]!;
      const model = (node: object) => ({ ...planar, nodes: { ...planar.nodes, 2: node } });
      const reference = solve(model({ ...tip, z }));
      expect(reference.displacements).toHaveLength(2);
      const legacy = solve(model({ ...tip, y: z }));
      expect(legacy.displacements).toEqual(reference.displacements);
      expect(legacy.reactions).toEqual(reference.reactions);
      for (const y of [z, z + 1]) {
        expect(() => solve(model({ ...tip, y, z }))).toThrow(/duplicate field .z/);
      }
    }
  }
});
