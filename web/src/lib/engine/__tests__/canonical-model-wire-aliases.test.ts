import { beforeAll, expect, it } from 'vitest';
import { localizeEngineText } from '../../i18n/engine-text';
import { setLocale } from '../../i18n';
import { initSolver } from '../wasm-solver';
import * as wasm from '../../wasm/dedaliano_engine.js';
import { LoadSession2D, LoadSession3D, certify_time_history_2d, certify_time_history_3d, solve_time_history_2d, solve_time_history_3d, engine_reproduce_hashes, certify_linear_2d, certify_linear_3d, solve_multi_case_2d, solve_multi_case_3d, certify_multi_case_2d, certify_multi_case_3d, estimate_discretization_3d, convergence_study_3d, solve_2d, solve_3d, solve_arc_length, solve_displacement_control, solve_pdelta_2d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';

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

const spatialSolvers = {
  linear: () => solve_3d(space),
  pdelta: () => JSON.parse(solve_pdelta_3d(JSON.stringify(space), 20, 1e-9)).results,
};

for (const [name, solve] of Object.entries(spatialSolvers)) {
  it(`roadmap 2.4 retains independent spatial moments through WASM ${name}`, () => {
    const result = solve();
    expect(result.reactions).toHaveLength(1);
    expect(result.reactions[0].my).toBeCloseTo(1, 14);
    expect(result.reactions[0].mz).toBeCloseTo(-6, 14);
  });
}

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

it('#2532 WASM JSON solvers preserve positional settlements and rotations', () => {
  const named = { ...planar, supports: indexed({ id: 1, nodeId: 1, type: 'fixed', dz: 0.01, dry: 0.02, angle: 0.02 }) };
  const positional = { ...planar, supports: indexed([1, 1, 'fixed', null, null, null, null, 0.01, 0.02, 0.02]) };
  const linear = (input: object) => JSON.parse(engine_reproduce_hashes(JSON.stringify(input), false));
  const reference = planarSolvers.pdelta(named);
  expect(reference.displacements).toHaveLength(2);
  expect.soft(planarSolvers.pdelta(positional)).toEqual(reference);
  expect(linear(positional)).toEqual(linear(named));
});

const planarWithNodalLoad = (data: object) => ({ ...planar, loads: [{ type: 'nodal', data }] });
const path = { maxSteps: 3, nSteps: 3, controlNode: 2, controlDof: 1, targetDisplacement: -0.005, tolerance: 1e-9 };
const planarWireSolvers = {
  ...planarSolvers,
  replay: (input: object) => JSON.parse(engine_reproduce_hashes(JSON.stringify(input), false)),
  arc: (solver: object) => JSON.parse(solve_arc_length(JSON.stringify({ ...path, solver }))).results,
  displacement: (solver: object) => JSON.parse(solve_displacement_control(JSON.stringify({ ...path, solver }))).results,
};

it.each(Object.entries(planarWireSolvers))('#2532 WASM %s accepts planar nodal metadata and still refuses components', (_name, solve) => {
  const load = planar.loads[0]!.data;
  const reference = solve(planar);
  for (const metadata of [{ id: 17 }, { caseId: 2 }, { id: 17, caseId: 2 }]) {
    expect.soft(() => solve(planarWithNodalLoad({ ...load, ...metadata })), JSON.stringify(metadata)).not.toThrow();
  }
  const annotated = { ...load, id: 17, caseId: 2 };
  expect.soft(() => solve(planarWithNodalLoad({ ...annotated, bw: 1 }))).toThrow(/unknown field `bw`/);
  expect.soft(() => solve(planarWithNodalLoad({ ...annotated, mx: 1 }))).toThrow(/out-of-plane nodal component `mx`/);
  expect(solve(planarWithNodalLoad(annotated))).toEqual(reference);
  const maxId = Number.MAX_SAFE_INTEGER;
  expect(solve(planarWithNodalLoad({ ...load, id: maxId, caseId: maxId }))).toEqual(reference);
});

it('#2532 WASM planar decoders refuse out-of-plane nodal components', () => {
  const zero = { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
  const control = planar.loads[0]!.data;
  for (const [name, solve] of Object.entries(planarWireSolvers)) {
    expect.soft(() => solve(planarWithNodalLoad({ ...zero, mx: 5 })), name).toThrow(/out-of-plane nodal component `mx`/);
    expect.soft(() => solve(planarWithNodalLoad({ ...control, mx: -5 })), name).toThrow(/out-of-plane nodal component `mx`/);
    expect.soft(() => solve(planarWithNodalLoad({ ...control, momentX: 5 })), name).toThrow(/unknown field `momentX`/);
    for (const field of ['fy', 'mx', 'mz']) {
      expect.soft(() => solve(planarWithNodalLoad({ ...zero, [field]: -5 })), name).toThrow(new RegExp(`out-of-plane nodal component .${field}.`));
    }
    expect.soft(solve(planarWithNodalLoad({ ...zero, ...control, mx: -0 })), name).toEqual(solve(planar));
  }
});

it('#2532 WASM spatial solvers retain the applied nodal couple', () => {
  const input = {
    ...space,
    materials: indexed({ ...space.materials[1]!, e: 2 ** 18, nu: 0 }),
    sections: indexed({ ...space.sections[1]!, j: 2 ** -10 }),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 0, fy: 0, fz: 0, mx: 5, my: 0, mz: 0 } }],
  };
  const linear = solve_3d(input);
  const pdelta = JSON.parse(solve_pdelta_3d(JSON.stringify(input), 20, 1e-9));
  expect(pdelta.converged).toBe(true);
  for (const result of [linear, pdelta.results]) {
    expect(result.reactions).toHaveLength(1);
    expect(result.reactions[0].mx).toBe(-5);
  }
});

it.each([false, true])('refuses fields dropped by typed object and JSON analysis (space = %s)', (is3D) => {
  const model = is3D ? space : planar;
  const linear = is3D ? solve_3d : solve_2d;
  const pdelta = is3D ? solve_pdelta_3d : solve_pdelta_2d;
  const solve = {
    object: linear,
    json: (input: object) => pdelta(JSON.stringify(input), 20, 1e-9),
    replay: (input: object) => engine_reproduce_hashes(JSON.stringify(input), is3D),
  };
  const cases: ReadonlyArray<readonly [string, object]> = [
    ['solverOption', { ...model, solverOption: { method: 'direct' } }],
    ['maxIteration', { ...model, solverOptions: { maxIteration: 1 } }],
    ['poissonRatio', { ...model, materials: indexed({ ...model.materials[1]!, poissonRatio: 0 }) }],
    ['shearArea', { ...model, sections: indexed({ ...model.sections[1]!, shearArea: 1 }) }],
    ['rhs', { ...model, constraints: [{ type: 'linearMPC', terms: [{ nodeId: 2, dof: 0, coefficient: 1 }], rhs: 1 }] }],
    ['kAxiall', { ...model, connectors: indexed({ id: 1, nodeI: 1, nodeJ: 2, kAxiall: 1 }) }],
    ...(is3D ? [
      ['dofFrame', { ...model, supports: indexed({ ...model.supports[1]!, dofFrame: 'local' }) }],
      ['frame', { ...model, loads: [{ type: 'distributed', data: {
        elementId: 1, qYI: 0, qYJ: 0, qZI: 1, qZJ: 1, frame: 'global',
      } }] }],
    ] as const : []),
  ];
  for (const [field, invalid] of cases) {
    for (const [entry, run] of Object.entries(solve)) {
      expect.soft(() => run(invalid), entry).toThrow(new RegExp(`unknown field .${field}.`));
    }
  }
});

it('accepts documented empty planar shell collections, aliases and linear options', () => {
  const model = {
    ...planar,
    plates: {}, quads: [], curvedShells: {}, solidShells: [], quad9s: {},
    nodes: indexed({ id: 1, x: 0, y: 0 }, { id: 2, x: 2, y: 0 }),
    solverOptions: { method: 'direct' },
    leftHand: false,
  };
  expect(solve_2d(model).reactions).toEqual(solve_2d(planar).reactions);
  expect(() => solve_2d({ ...model, leftHand: true })).toThrow(/leftHand/);
  const loadedShell = { ...model, plates: { 1: {} } };
  expect(() => solve_2d(loadedShell)).toThrow(/Shell elements require 3D analysis/);
  expect(() => solve_pdelta_2d(JSON.stringify(loadedShell), 20, 1e-9)).toThrow(/Shell elements require 3D analysis/);
});

it.each([false, true])(
  'refuses an excitation field used by the other dimension (space = %s)', (is3D) => {
    const solver = is3D ? space : planar;
    const solve = is3D ? solve_time_history_3d : solve_time_history_2d;
    const certify = is3D ? certify_time_history_3d : certify_time_history_2d;
    const base = { solver, densities: { 1: 1 }, timeStep: 1, nSteps: 3 };
    const [accepted, wrong] = is3D ? ['groundAccelX', 'groundAccel'] : ['groundAccel', 'groundAccelX'];
    const acceleration = [0, 1, 0];
    for (const run of [solve, certify]) {
      expect.soft(() => run(JSON.stringify(base))).not.toThrow();
      expect.soft(() => run(JSON.stringify({ ...base, [accepted]: acceleration }))).not.toThrow();
      expect.soft(() => run(JSON.stringify({ ...base, [wrong]: acceleration }))).toThrow(wrong);
      expect.soft(() => run(JSON.stringify({ ...base, methdo: 'hht' }))).toThrow('methdo');
    }
  },
);

it.each([false, true])('requires named material records in WASM object analysis (space = %s)', (is3D) => {
  const model = is3D ? space : planar;
  const wrap = (solver: object) => ({
    solver,
    loadCases: [{ name: 'D', loads: model.loads }],
    combinations: [{ name: 'D', factors: { D: 1 } }],
  });
  const entries = is3D ? {
    linear: solve_3d,
    certificate: certify_linear_3d,
    discretization: estimate_discretization_3d,
    convergence: (input: object) => convergence_study_3d(input, null),
    combinations: (input: object) => solve_multi_case_3d(wrap(input)),
    combinationCertificate: (input: object) => certify_multi_case_3d(wrap(input)),
  } : {
    linear: solve_2d,
    certificate: certify_linear_2d,
    combinations: (input: object) => solve_multi_case_2d(wrap(input)),
    combinationCertificate: (input: object) => certify_multi_case_2d(wrap(input)),
  };
  const { id, e, nu } = model.materials[1]!;
  const linear = is3D ? solve_3d : solve_2d;
  expect(linear(model).reactions).toHaveLength(1);
  expect(linear({ ...model, materials: new Map([['1', { id, e, nu }]]) })).toEqual(linear(model));
  for (const [entry, run] of Object.entries(entries)) {
    for (const record of [[id, e, nu], [id, e, nu, { poissonRatio: nu }], Object.assign([id, e, nu], { id, e, nu })]) {
      expect.soft(() => run({ ...model, materials: indexed(record) }), entry).toThrow(/expected .*record|expected .*map/i);
    }
  }
});

it('rejects a positional planar model in WASM JSON solvers', () => {
  const positional = [
    planar.nodes, planar.materials, planar.sections, planar.elements, planar.supports, planar.loads,
    [], {}, null, {}, false, {}, {}, {}, {}, {},
  ];
  for (const [entry, run] of Object.entries(planarWireSolvers)) {
    expect.soft(() => run(planar), entry).not.toThrow();
    expect.soft(() => run(positional), entry).toThrow();
  }
});

it.each([false, true])('validates solver table entry arrays (space = %s)', (is3D) => {
  const model = is3D ? space : planar;
  const wrap = (solver: object) => ({
    solver,
    loadCases: [{ name: 'D', loads: model.loads }],
    combinations: [{ name: 'D', factors: { D: 1 } }],
  });
  const entries = is3D ? {
    linear: solve_3d,
    certificate: certify_linear_3d,
    discretization: estimate_discretization_3d,
    convergence: (input: object) => {
      try {
        return convergence_study_3d(input, null);
      } catch (error) {
        if (error !== 'noShellElements') throw error;
      }
    },
    combinations: (input: object) => solve_multi_case_3d(wrap(input)),
    combinationCertificate: (input: object) => certify_multi_case_3d(wrap(input)),
  } : {
    linear: solve_2d,
    certificate: certify_linear_2d,
    combinations: (input: object) => solve_multi_case_2d(wrap(input)),
    combinationCertificate: (input: object) => certify_multi_case_2d(wrap(input)),
  };
  const linear = is3D ? solve_3d : solve_2d;
  const material = model.materials[1]!;
  for (const [entry, run] of Object.entries(entries)) {
    const input = { ...model, materials: [['1', material]] };
    expect.soft(() => run(input), entry).not.toThrow();
    for (const malformed of [
      [material], [['1']], [['1', material, 0]], [['1', material], ['1', material]],
    ]) {
      expect.soft(() => run({ ...model, materials: malformed }), entry).toThrow(/map entr|duplicate/i);
    }
    expect.soft(() => run({ ...model, materials: [['1', { ...material, unexpected: true }]] }), entry)
      .toThrow(/unknown field .unexpected/);
  }
  expect(linear({ ...model, materials: [['1', material]] })).toEqual(linear(model));
});

it('rejects trailing WASM shell connectivity rather than solving with a truncated array', () => {
  const model = {
    ...space,
    nodes: { ...space.nodes, ...Object.fromEntries([
      { id: 3, x: 2, y: 1, z: 0 }, { id: 4, x: 0, y: 1, z: 0 },
    ].map(node => [node.id, node])) },
    quads: indexed({ id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.1 }),
  };
  const wrap = (solver: object) => ({
    solver,
    loadCases: [{ name: 'D', loads: model.loads }],
    combinations: [{ name: 'D', factors: { D: 1 } }],
  });
  const entries = {
    linear: solve_3d,
    reused: (input: object) => {
      const session = new LoadSession3D(input);
      try {
        return session.solve(model.loads);
      } finally {
        session.free();
      }
    },
    certificate: certify_linear_3d,
    discretization: estimate_discretization_3d,
    convergence: (input: object) => convergence_study_3d(input, null),
    combinations: (input: object) => solve_multi_case_3d(wrap(input)),
    combinationCertificate: (input: object) => certify_multi_case_3d(wrap(input)),
  };
  expect(solve_3d(model)).toMatchObject({ reactions: expect.any(Array), displacements: expect.any(Array) });
  for (const [entry, run] of Object.entries(entries)) {
    expect.soft(() => run(model), entry).not.toThrow();
    for (const nodes of [[1, 2, 3], [1, 2, 3, 4, 99], new Set([1, 2, 3, 4, 99])]) {
      const quads = indexed({ ...model.quads[1]!, nodes });
      expect.soft(() => run({ ...model, quads }), entry).toThrow(/Parse error:.*invalid length/i);
    }
  }
  expect(solve_3d({ ...model, quads: indexed({ ...model.quads[1]!, nodes: new Set([1, 2, 3, 4]) }) }))
    .toEqual(solve_3d(model));
  expect(() => engine_reproduce_hashes(JSON.stringify(model), true)).not.toThrow();
  const extraNode = { ...model, quads: indexed({ ...model.quads[1]!, nodes: [1, 2, 3, 4, 99] }) };
  expect(() => engine_reproduce_hashes(JSON.stringify(extraNode), true)).toThrow(/trailing characters|invalid length/i);
  expect(() => solve_pdelta_3d(JSON.stringify(extraNode), 20, 1e-9)).toThrow(/trailing characters|invalid length/i);
});

it.each([false, true])('keeps connectors in iterable WASM tables (space = %s)', (is3D) => {
  const base = is3D ? space : planar;
  const loads = [{ type: 'nodal', data: { nodeId: 2, fx: 10, fz: 0, my: 0,
    ...(is3D ? { fy: 0, mx: 0, mz: 0 } : {}),
  } }];
  const model = {
    ...base, loads,
    ...(is3D ? {
      nodes: { ...space.nodes, 3: { id: 3, x: 2, y: 1, z: 0 }, 4: { id: 4, x: 0, y: 1, z: 0 } },
      quads: indexed({ id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.1 }),
    } : {}),
  };
  const wrap = (solver: object) => ({
    solver,
    loadCases: [{ name: 'D', loads }],
    combinations: [{ name: 'D', factors: { D: 1 } }],
  });
  const Session = is3D ? LoadSession3D : LoadSession2D;
  const linear = is3D ? solve_3d : solve_2d;
  const solveCases = is3D ? solve_multi_case_3d : solve_multi_case_2d;
  const certifyCases = is3D ? certify_multi_case_3d : certify_multi_case_2d;
  const entries = {
    linear,
    reused: (input: object) => {
      const session = new Session(input);
      try {
        return session.solve(loads);
      } finally {
        session.free();
      }
    },
    certificate: is3D ? certify_linear_3d : certify_linear_2d,
    combinations: (input: object) => solveCases(wrap(input)),
    combinationCertificate: (input: object) => certifyCases(wrap(input)),
    ...(is3D ? {
      discretization: estimate_discretization_3d,
      convergence: (input: object) => {
        try {
          return convergence_study_3d(input, null);
        } catch (error) {
          if (error === 'connectors') return error;
          throw error;
        }
      },
    } : {}),
  };
  const connector = { id: 17, nodeI: 1, nodeJ: 2, kAxial: 1e6 };
  const pair = ['17', connector] as const;
  const withConnectors = (connectors: unknown) => ({ ...model, connectors });
  const record = Object.fromEntries([pair]);
  const tipUx = (result: ReturnType<typeof solve_2d>) =>
    result.displacements.find((node: { nodeId: number }) => node.nodeId === 2)?.ux;
  expect(tipUx(linear(withConnectors(record)))).toBeGreaterThan(0);
  expect(tipUx(linear(withConnectors(record)))).toBeLessThan(tipUx(linear(model)));

  for (const [entry, run] of Object.entries(entries)) {
    const reference = run(withConnectors(record));
    if (entry === 'convergence') {
      expect(reference).toBe('connectors');
      expect(run(model)).not.toBe('connectors');
    }
    for (const [shape, table] of [
      ['Set', new Set([pair])],
      ['Map', new Map([pair])],
      ['null-prototype record', Object.assign(Object.create(null), record)],
      ['array', [pair]],
      ['iterator', [pair].values()],
      ['empty Set', new Set()],
    ] as const) {
      expect.soft(run(withConnectors(table)), entry + ' ' + shape)
        .toEqual(shape === 'empty Set' ? run(model) : reference);
    }
    for (const [shape, table] of [
      ['bare entry', new Set([connector])],
      ['missing value', new Set([['17']])],
      ['extra value', new Set([['17', connector, 0]])],
      ['duplicate key', new Set([pair, ['17', connector]])],
      ['unknown field', new Set([['17', { ...connector, kAxiall: 1 }]])],
      ['unsupported object', new Date(0)],
      ['unsupported scalar', '17'],
      ['invalid iterator', { [Symbol.iterator]: 1 }],
    ] as const) {
      expect.soft(() => run(withConnectors(table)), entry + ' ' + shape)
        .toThrow(/Parse error:.*(?:map entr|duplicate|expected .*map|unknown field .*kAxiall)/i);
    }
  }
});

it.each([false, true])(
  'refuses repeated connector keys in JSON analysis (space = %s)',
  (is3D) => {
    const base = is3D ? space : planar;
    const loads = [{ type: 'nodal', data: { nodeId: 2, fx: 1, fz: 0, my: 0,
      ...(is3D ? { fy: 0, mx: 0, mz: 0 } : {}),
    } }];
    const model = { ...base, loads, connectors: {} };
    const first = { id: 17, nodeI: 1, nodeJ: 2, kAxial: 1e6 };
    const second = { id: 18, nodeI: 1, nodeJ: 2, kAxial: 2e6 };
    const encode = (entries: string) => JSON.stringify(model).replace('"connectors":{}', `"connectors":{${entries}}`);
    const duplicate = encode(`"17":${JSON.stringify(first)},"17":${JSON.stringify(second)}`);
    const distinct = encode(`"17":${JSON.stringify(first)},"18":${JSON.stringify(second)}`);
    const lastOnly = encode(`"17":${JSON.stringify(second)}`);
    const pdelta = is3D ? solve_pdelta_3d : solve_pdelta_2d;
    const dim = is3D ? '3d' : '2d';
    const nested = (solver: string) => `{"solver":${solver}}`;
    const multiCase = (solver: string) =>
      `{"solver":${solver},"loadCases":[{"name":"D","loads":${JSON.stringify(loads)}}],"combinations":[{"name":"D","factors":{"D":1}}]}`;
    const entries = {
      replay: (input: string) => engine_reproduce_hashes(input, is3D),
      'linear bundle': wasm[`export_linear_bundle_${dim}`],
      'combination bundle': (input: string) => wasm[`export_combination_bundle_${dim}`](multiCase(input)),
      'P-Delta': (input: string) => pdelta(input, 20, 1e-9),
      'P-Delta certificate': (input: string) => wasm[`certify_pdelta_${dim}`](input, 20, 1e-9),
      buckling: (input: string) => wasm[`solve_buckling_${dim}`](input, 1),
      'buckling certificate': (input: string) => wasm[`certify_buckling_${dim}`](input, 1),
      'buckling result certificate': (input: string) => wasm[`certify_buckling_result_${dim}`](input, '{}'),
      corotational: (input: string) => wasm[`solve_corotational_${dim}`](input, 20, 1e-9, 1),
      kinematics: wasm[`analyze_kinematics_${dim}`],
      modal: (input: string) => wasm[`solve_modal_${dim}`](nested(input), 1),
      'modal certificate': (input: string) => wasm[`certify_modal_${dim}`](nested(input), 1),
      cable: (input: string) => wasm[`solve_cable_${dim}`](nested(input), 20, 1e-9),
      'steel combination certificate': (input: string) =>
        wasm[`certify_steel_multi_case_${dim}`](`{"multiCase":${multiCase(input)},"members":[]}`),
      ...(is3D ? {} : {
        'arc length': (input: string) => solve_arc_length(nested(input)),
        'displacement control': (input: string) => solve_displacement_control(nested(input)),
        Guyan: (input: string) => wasm.guyan_reduce_2d(nested(input)),
        'Craig-Bampton': (input: string) => wasm.craig_bampton_2d(nested(input)),
      }),
    };
    const nestedEntries = [
      'export_plastic_bundle', 'solve_spectral', 'certify_spectral', 'solve_plastic', 'certify_plastic',
      'solve_moving_loads', 'solve_nonlinear_material', 'solve_time_history', 'certify_time_history',
      'solve_harmonic', 'certify_harmonic', 'solve_winkler', 'solve_constrained', 'solve_contact',
      'solve_ssi', 'solve_fiber_nonlinear', 'solve_creep_shrinkage', 'solve_with_imperfections',
    ] as const;
    const solve = (input: string) => JSON.parse(entries['P-Delta'](input));
    const tip = (input: string) => {
      const result = solve(input);
      expect(result.converged).toBe(true);
      return result.results.displacements.find((node: { nodeId: number }) => node.nodeId === 2).ux;
    };
    expect(tip(distinct)).toBeGreaterThan(0);
    expect(tip(distinct)).toBeLessThan(tip(lastOnly));
    expect(tip(lastOnly)).toBeLessThan(tip(encode('')));
    const refusal = /duplicate key in field `connectors`/;
    for (const [entry, run] of Object.entries(entries)) {
      expect.soft(() => run(duplicate), entry).toThrow(refusal);
    }
    for (const name of nestedEntries) {
      expect.soft(() => wasm[`${name}_${dim}`](nested(duplicate)), name).toThrow(refusal);
    }
    const influence = is3D ? wasm.compute_influence_line_3d : wasm.compute_influence_line;
    expect.soft(() => influence(nested(duplicate)), 'influence line').toThrow(refusal);
  },
);

it('translates the JSON duplicate-key refusal', async () => {
  await setLocale('es');
  try {
    expect(localizeEngineText('Parse error: duplicate key in field `connectors` at line 4 column 8'))
      .toBe('Error de análisis: Falta el campo connectors o su valor no es compatible. (línea 4, columna 8)');
  } finally {
    await setLocale('en');
  }
});
