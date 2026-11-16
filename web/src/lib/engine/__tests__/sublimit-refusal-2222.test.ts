import { beforeAll, describe, expect, it } from 'vitest';
import { refineInput } from '../second-order/refine';
import { splitSpanLoad } from '../member-span-loads';
import { splitElementLoads } from '../../model/edit/member-split';
import { subdivideForAnalysis } from '../../model/edit/analysis-subdivision';
import type { ModelData } from '../solver-service';
import { buildSolverInput2D, buildSolverInput3D } from '../solver-service';
import { planeModel } from '../influence/__tests__/fixtures';
import { targetDisplacement } from '../influence/maxwell';
import { plasticCollapse2D } from '../plastic-collapse';
import { expandVariableMembers } from '../variable-members';
import { modelStore } from '../../store';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';
import { initSolver, solve } from '../wasm-solver';
import model from '../../../../../engine/tests/fixtures/narrow-span-2222.json';

let wasm: any;
beforeAll(async () => {
  await initSolver();
  wasm = await import('../../wasm/dedaliano_engine.js');
});

const adjacent = (x: number, step: bigint) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) + step);
  return view.getFloat64(0);
};
const limit = 3e-10;
const intervals: Array<[number, number, boolean]> = [
  [0, 0, false], [1.5, 1.5, false], [3, 3, false],
  [0, adjacent(limit, -1n), false], [0, limit, true], [0, adjacent(limit, 1n), true],
  [1.5, adjacent(1.5, 1n), false], [adjacent(3, -1n), 3, false],
  [0, Number.MIN_VALUE, false], [1, 2, true], [0, 3, true],
];

describe('known wrong result: #2222 — sublimit refusal', () => {
  for (const dim of [2, 3]) for (const axis of dim === 2 ? ['y', 'x'] : ['y', 'z', 'x']) {
    for (const mode of ['linear', 'session', 'pdelta', 'corotational', 'fiber']) {
      it(`${dim}D ${axis} ${mode} refuses sublimit intervals and retains valid loads`, () => {
        const base: any = structuredClone(model);
        base.loads = [];
        if (dim === 3) {
          for (const n of Object.values(base.nodes) as any[]) n.y = 0;
          for (const s of Object.values(base.sections) as any[]) Object.assign(s, { iy: 1, j: 1 });
          for (const s of Object.values(base.supports) as any[]) Object.assign(s, { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
        }
        const session = mode === 'session' ? new wasm[`LoadSession${dim}D`](base) : undefined;
        const run = (input: any) => mode === 'linear' ? wasm[`solve_${dim}d`](input)
          : mode === 'session' ? session.solve(input.loads)
          : mode === 'fiber' ? JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify({ solver: input, fiberSections: {}, nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-9, nIncrements: 1 }))).results
          : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input), 20, 1e-9)).linearResults
          : JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input), 40, 1e-12, 1)).results;
        try {
          for (const [a, b, valid] of intervals) for (const ratio of [0, 1, -1]) {
            const span = b - a;
            const q = b === a || !Number.isFinite(1 / span) ? -7 : ratio === -1 && axis !== 'x' ? -6e-6 / span / span : -1 / span;
            const input = { ...base, loads: [{ type: dim === 2 && axis === 'x' ? 'axialDistributed' : 'distributed', data: dim === 2
              ? { elementId: 1, a, b, qI: q, qJ: q * ratio }
              : { elementId: 1, a, b, qXI: axis === 'x' ? q : 0, qXJ: axis === 'x' ? q * ratio : 0, qYI: axis === 'y' ? q : 0, qYJ: axis === 'y' ? q * ratio : 0, qZI: axis === 'z' ? q : 0, qZJ: axis === 'z' ? q * ratio : 0 } }] };
            if (!valid) expect(() => run(input)).toThrow(/Element 1.*interval.*geometry limit/);
            else {
              const result = run(input);
              const key = dim === 2 ? axis === 'x' ? 'rx' : 'rz' : 'f' + axis;
              expect(result.reactions.reduce((sum: number, r: any) => sum + r[key], 0)).toBeCloseTo((1 + ratio) / 2, 10);
              if (ratio === -1 && axis !== 'x') {
                const appliedMoment = -q * span * span / 6;
                const reactionMoment = result.reactions.reduce((sum: number, r: any) => {
                  const node = base.nodes[r.nodeId];
                  return sum + (dim === 2 ? r.my + node.x * r.rz - node.z * r.rx
                    : axis === 'y' ? r.mz + node.x * r.fy - node.y * r.fx
                    : r.my + node.z * r.fx - node.x * r.fz);
                }, 0);
                expect(reactionMoment).toBeCloseTo(dim === 3 && axis === 'z' ? appliedMoment : -appliedMoment, 10);
              }
            }
          }
        } finally { session?.free(); }
      });
    }
  }

  for (const space of ['planar', 'spatial']) it(`${space} recovery refuses sublimit intervals`, () => {
    for (const [a, b, valid] of intervals) {
      const input = { space, length: 3, ei: 1000, gas: 1700, vI: 0, rI: 0, vJ: 0, rJ: 0, positions: [0, 0.25, 0.75, 1], dist: [{ qI: -2, qJ: -2, a, b }] };
      if (valid) expect(JSON.parse(wasm.recover_member(JSON.stringify(input))).some((s: any) => s.v !== 0)).toBe(true);
      else expect(() => wasm.recover_member(JSON.stringify(input))).toThrow(/Member recovery.*interval.*geometry limit/);
    }
  });

  for (const type of ['distributed', 'axialDistributed'] as const) {
    it(`${type} refuses collapsed remapping without equivalent loads`, () => {
      for (const [a, b, valid] of intervals) {
        const load = { type, data: { elementId: 1, a, b, qI: -2, qJ: -2 } };
        const run = () => splitSpanLoad(load, 3, [{ id: 4, start: 0, end: 3, length: 3 }]);
        if (valid) expect(run().every(l => l.type === type)).toBe(true);
        else expect(run).toThrow(/Element 1.*interval.*geometry limit/);
      }
      const load = { type, data: { elementId: 1, a: 1.5 - 2 ** -52, b: 1.5, qI: 2 ** 52, qJ: 2 ** 52 } };
      expect(() => splitSpanLoad(load, 2, [{ id: 4, start: 0, end: 2, length: 2 - 2 ** -51 }])).toThrow(/Element 1.*interval.*geometry limit/);
    });

    it(`${type} refuses a positive sublimit fragment of a valid source`, () => {
      const load = { type, data: { elementId: 1, a: 1, b: 2 + 2 ** -51, qI: -2, qJ: -2 } };
      expect(() => splitSpanLoad(load, 3, [{ id: 4, start: 0, end: 2, length: 2 }, { id: 5, start: 2, end: 3, length: 1 }])).toThrow(/Element 5.*interval.*geometry limit/);
    });
  }

  for (const type of ['distributed', 'distributed3d'] as const) {
    it(`${type} splitter and analysis subdivision refuse rather than drop or snap`, () => {
      const m: Parameters<typeof buildSolverInput2D>[0] = planeModel([[1, 0, 0], [2, 3, 0]], [[1, 1, 2]], [[1, 'fixed']]);
      for (const [a, b, valid] of intervals) {
        const data = type === 'distributed' ? { id: 1, elementId: 1, a, b, qI: -2, qJ: -2 } : { id: 1, elementId: 1, a, b, qXI: -2, qXJ: -2, qYI: -2, qYJ: -2, qZI: -2, qZJ: -2 };
        const loads: any = [{ type, data }];
        const run = () => splitElementLoads(loads, 1, [0, 1.5, 3], [4, 5], () => 2, [1.5, 1.5]);
        const subdivide = () => subdivideForAnalysis({ ...m, loads }, 2);
        if (valid) {
          expect(run().added.length).toBeGreaterThan(0);
          expect(subdivide().model.loads.length).toBeGreaterThan(0);
        } else {
          expect(run).toThrow(/Element 1.*interval.*geometry limit/);
          expect(subdivide).toThrow(/Element 1.*interval.*geometry limit/);
        }
      }
      const loads: any = [{ type, data: type === 'distributed'
        ? { id: 1, elementId: 1, a: 1, b: 1.5 + 2 ** -52, qI: -2, qJ: -2 }
        : { id: 1, elementId: 1, a: 1, b: 1.5 + 2 ** -52, qYI: -2, qYJ: -2, qZI: 0, qZJ: 0 } }];
      expect(() => splitElementLoads(loads, 1, [0, 1.5, 3], [4, 5], () => 2, [1.5, 1.5])).toThrow(/Element 5.*interval.*geometry limit/);
    });
  }

  for (const entry of ['Maxwell', 'plastic']) it(`${entry} uses rounded actual geometry before returning an answer`, () => {
    const origin = 2 ** 49 + 0.125;
    const input = buildSolverInput2D(planeModel([[1, origin, 0], [2, origin + 4, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'fixed']]), false)!;
    const loads: any = [{ type: 'distributed', data: { elementId: 1, qI: -2, qJ: -4 } }];
    const before = JSON.stringify(input, (_, v) => v instanceof Map ? [...v] : v);
    if (entry === 'Maxwell') expect(Number.isFinite(targetDisplacement(input, 'uz', { kind: 'section', elementId: 1, t: 1 / 3 }, loads))).toBe(true);
    else expect(plasticCollapse2D({ ...input, loads }, { mp: () => 1, np: () => Infinity, samples: 3, maxEvents: 5 }).isMechanism).toBe(true);
    expect(JSON.stringify(input, (_, v) => v instanceof Map ? [...v] : v)).toBe(before);
  });
  it('Maxwell and plastic analyses refuse the exact remapping witness' , () => {
    const input = buildSolverInput2D(planeModel([[1, 2.1, 0], [2, 6.1, 0]], [[1, 1, 2]], [[1, 'fixed']]), false)!;
    const loads: any = [{ type: 'distributed', data: { elementId: 1, a: 1.5 - 2 ** -52, b: 1.5, qI: 2 ** 52, qJ: 2 ** 52 } }];
    expect(() => targetDisplacement(input, 'uz', { kind: 'section', elementId: 1, t: 2 / (6.1 - 2.1) }, loads)).toThrow(/Element 1.*interval.*geometry limit/);
    expect(() => plasticCollapse2D({ ...input, loads }, { mp: () => 1, np: () => Infinity, samples: 2 })).toThrow(/Element 1.*interval.*geometry limit/);
  });
  for (const dim of [2, 3]) it(`${dim}D input adapters refuse narrow loads before component filtering`, () => {
    const m: any = planeModel([[1, 0, 0], [2, 3, 0]], [[1, 1, 2]], [[1, 'fixed']]);
    for (const [a, b, valid] of intervals) for (const angle of [0, 90]) {
      m.loads = [{ type: 'distributed', data: { id: 1, elementId: 1, a, b, qI: -2, qJ: -2, angle } }];
      const run = () => dim === 2 ? buildSolverInput2D(m, false) : buildSolverInput3D(m, false);
      if (valid) expect(run()).toBeTruthy();
      else expect(run).toThrow(/Element 1.*interval.*geometry limit/);
    }
  });

  it('variable member expansion refuses a sublimit source and a sublimit overlap', () => {
    modelStore.clear();
    try {
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0);
      const id = modelStore.addElement(a, b, 'frame');
      const sections = [0.8, 0.3].map(h => {
        const params = { b: 0.2, h };
        return modelStore.addSection(toSectionFields({ kind: 'built', name: `R${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
      });
      modelStore.updateElement(id, { sectionId: sections[0], variableSection: { sectionJ: sections[1], segments: 2 } } as never);
      for (const [a, b] of [[1.5 - 2 ** -52, 1.5], [1, 1.5 + 2 ** -52]]) {
        const m = { ...modelStore.model, loads: [{ type: 'distributed3d', data: { id: 1, elementId: id, a, b, qYI: -2, qYJ: -2, qZI: 0, qZJ: 0 } }] };
        expect(() => expandVariableMembers(m as Parameters<typeof expandVariableMembers>[0])).toThrow(/Element .*interval.*geometry limit/);
      }
      const m = { ...modelStore.model, loads: [{ type: 'distributed3d', data: { id: 1, elementId: id, a: 0.5, b: 2.5, qYI: -2, qYJ: -2, qZI: 0, qZJ: 0 } }] };
      expect(expandVariableMembers(m as Parameters<typeof expandVariableMembers>[0]).loads).toHaveLength(2);
    } finally { modelStore.clear(); }
  });

  for (const dim of [2, 3]) it(`${dim}D saved force diagrams refuse unsupported load intervals`, () => {
    const input: any = structuredClone(model);
    input.loads = [];
    if (dim === 3) {
      for (const n of Object.values(input.nodes) as any[]) n.y = 0;
      for (const s of Object.values(input.sections) as any[]) Object.assign(s, { iy: 1, j: 1 });
      for (const s of Object.values(input.supports) as any[]) Object.assign(s, { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
    }
    const result = wasm[`solve_${dim}d`](input);
    for (const [a, b, valid] of intervals) {
      const loaded = structuredClone(result);
      const ef = loaded.elementForces[0];
      for (const key of dim === 2 ? ['distributedLoads', 'distributedLoadsX'] : ['distributedLoadsX', 'distributedLoadsY', 'distributedLoadsZ']) ef[key] = [{ a, b, qI: -2, qJ: -2 }];
      const value = () => wasm[dim === 2 ? 'compute_diagram_value_at' : 'compute_diagram_value_at_3d'](JSON.stringify({ kind: dim === 2 ? 'shear' : 'shearY', t: 0.9, elementForces: ef }));
      const diagram = () => wasm[`compute_diagrams_${dim}d`](JSON.stringify(dim === 2 ? { input, results: loaded } : loaded));
      if (valid) {
        expect(Number.isFinite(value())).toBe(true);
        expect(JSON.parse(diagram())).toBeTruthy();
      } else {
        expect(value).toThrow(/Element 1.*interval.*geometry limit/);
        expect(diagram).toThrow(/Element 1.*interval.*geometry limit/);
      }
    }
  });

  it('deformed shape and displacement-only exports refuse sublimit intervals', () => {
    for (const displacementsOnly of [false, true]) for (const [a, b, valid] of intervals) {
      const request = { nodeIx: 0, nodeIy: 0, nodeJx: 3, nodeJy: 0, uIx: 0, uIy: 0, rIz: 0, uJx: 0, uJy: 0, rJz: 0, scale: 1, length: 3, ei: 1000, gas: 1700, hingeStart: false, hingeEnd: false, displacementsOnly, positions: [0, 0.25, 0.75, 1], distLoads: [[-2, -2, a, b]] };
      const run = () => JSON.parse(wasm.compute_deformed_shape(JSON.stringify(request)));
      if (valid) expect(run().some((s: any) => displacementsOnly ? s.uz !== 0 : s.y !== 0)).toBe(true);
      else expect(run).toThrow(/Member recovery.*interval.*geometry limit/);
    }
  });

  it('refuses the opposing-intensity shear recovery stress case', () => {
    const a = 1.5, b = a + 0.5e-12, q = 6 / (b - a) / (b - a);
    for (const space of ['planar', 'spatial']) {
      const request = { space, length: 3, ei: 1000, gas: 1700, vI: 0, rI: 0, vJ: 0, rJ: 0, positions: [0.5 - 1e-10, 0.5 + 1e-10], dist: [{ qI: -q, qJ: q, a, b }] };
      expect(() => wasm.recover_member(JSON.stringify(request))).toThrow(/Member recovery.*interval.*geometry limit/);
    }
  });

  it('refuses the opposing-intensity axial remapping stress case before constructing a force pair', () => {
    const a = 1.5 - 2 ** -52, b = 1.5, q = 6 / (b - a) / (b - a);
    for (const type of ['distributed', 'axialDistributed'] as const) {
      const load = { type, data: { elementId: 1, a, b, qI: -q, qJ: q } };
      expect(() => splitSpanLoad(load, 2, [{ id: 4, start: 0, end: 2, length: 2 - 2 ** -51 }])).toThrow(/Element 1.*interval.*geometry limit/);
    }
  });

  it('uses the relative interval limit on both small and large members', () => {
    for (const length of [0.03, 3, 300]) {
      const width = length * 1e-10;
      const load = (b: number) => ({ type: 'distributed' as const, data: { elementId: 1, a: 0, b, qI: -2, qJ: -2 } });
      const pieces = [{ id: 4, start: 0, end: length, length }];
      expect(() => splitSpanLoad(load(adjacent(width, -1n)), length, pieces)).toThrow(/geometry limit/);
      for (const b of [width, adjacent(width, 1n)]) {
        const result = splitSpanLoad(load(b), length, pieces);
        expect(result).toEqual([{ type: 'distributed', data: { elementId: 4, a: undefined, b, qI: -2, qJ: -2 } }]);
      }
    }
  });

  it('splitter preserves a supported narrow trapezoid across a cut', () => {
    const a = 1.5 - 3e-10, b = 1.5 + 3e-10;
    const loads: any = [{ type: 'distributed', data: { id: 1, elementId: 1, a, b, qI: -2, qJ: 4 } }];
    const result = splitElementLoads(loads, 1, [0, 1.5, 3], [4, 5], () => 2, [1.5, 1.5]);
    expect(result.added).toHaveLength(2);
    const left: any = result.added[0].data, right: any = result.added[1].data;
    expect(left.a).toBe(a);
    expect(left.b).toBeUndefined();
    expect(right.a).toBeUndefined();
    expect(right.b).toBe(b - 1.5);
    expect([left.qI, left.qJ, right.qI, right.qJ]).toEqual([-2, 1, 1, 4]);
  });

  it('splitter preserves supported near-full endpoints exactly', () => {
    const a = 1e-12, b = 3 - 1e-12;
    const loads: any = [{ type: 'distributed3d', data: { id: 1, elementId: 1, a, b, qXI: 2, qXJ: 2, qYI: -2, qYJ: -2, qZI: 4, qZJ: 4 } }];
    const result = splitElementLoads(loads, 1, [0, 1.5, 3], [4, 5], () => 2, [1.5, 1.5]);
    expect(result.added).toHaveLength(2);
    expect((result.added[0].data as any).a).toBe(a);
    expect((result.added[1].data as any).b).toBe(b - 1.5);
  });

});


describe('known wrong result: #2222 — rounded child lengths', () => {
  for (const dim of [2, 3]) for (const mode of ['edit', 'analysis', 'variable']) it(`${dim}D ${mode} refuses a sublimit overlap and preserves supported partial endpoints`, () => {
    modelStore.clear();
    try {
      const i = dim === 3 ? modelStore.addNode(1000.1, 0, 0) : modelStore.addNode(1000.1, 0);
      const j = dim === 3 ? modelStore.addNode(1004.1, 0, 0) : modelStore.addNode(1004.1, 0);
      const id = modelStore.addElement(i, j, 'frame');
      if (mode === 'variable') {
        const sections = [0.3, 0.5].map(h => {
          const params = { b: 0.3, h };
          return modelStore.addSection(toSectionFields({ kind: 'built', name: `translated${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
        });
        modelStore.updateElement(id, { sectionId: sections[0], variableSection: { sectionJ: sections[1], segments: 3 } } as never);
      }
      const b = 2.66666666666665;
      const load: any = dim === 2
        ? { type: 'distributed', data: { id: 1, elementId: id, a: 0.5, b, qI: -2, qJ: -2 } }
        : { type: 'distributed3d', data: { id: 1, elementId: id, a: 0.5, b, qXI: 2, qXJ: 2, qYI: -2, qYJ: -2, qZI: 3, qZJ: 3 } };
      modelStore.model.loads = [load];
      const run = () => mode === 'edit' ? modelStore.splitMember(id, [2 / 3]) : mode === 'variable' ? expandVariableMembers(modelStore.model) : subdivideForAnalysis(modelStore.model, 3);
      const before = JSON.stringify(modelStore.snapshot());
      expect(run).toThrow(/geometry/);
      expect(JSON.stringify(modelStore.snapshot())).toBe(before);
      for (const node of modelStore.model.nodes.values()) node.x -= 1000.1;
      let child;
      if (mode === 'edit') {
        expect(modelStore.splitMember(id, [2 / 3])).not.toBeNull();
        child = modelStore.model;
      } else child = mode === 'variable' ? expandVariableMembers(modelStore.model) : subdivideForAnalysis(modelStore.model, 3).model;
      let fragments = 0;
      for (const load of child.loads) {
        const d: any = load.data;
        const e = child.elements.get(d.elementId)!;
        const a = child.nodes.get(e.nodeI)!, z = child.nodes.get(e.nodeJ)!;
        const length = Math.hypot(z.x - a.x, z.y - a.y, (z.z ?? 0) - (a.z ?? 0));
        expect(d.a ?? 0).toBeGreaterThanOrEqual(0);
        expect(d.b ?? length).toBeLessThanOrEqual(length);
        expect((d.b ?? length) - (d.a ?? 0)).toBeGreaterThan(0);
        fragments++;
      }
      expect(fragments).toBe(mode === 'edit' ? 1 : 2);
      expect(() => dim === 2 ? buildSolverInput2D(child, false) : buildSolverInput3D(child, false)).not.toThrow();
    } finally { modelStore.clear(); }
  });
  it('planar refinement refuses a sublimit overlap and preserves supported partial endpoints', () => {
    const m: ModelData = planeModel([[1, 1000.1, 0], [2, 1004.1, 0]], [[1, 1, 2]], [[1, 'fixed']]);
    m.loads = [{ type: 'distributed', data: { id: 1, elementId: 1, qI: -2, qJ: -2, a: 0.5, b: 2.66666666666665 } }];
    expect(() => refineInput(buildSolverInput2D(m, false)!, 3)).toThrow(/geometry/);
    for (const node of m.nodes.values()) node.x -= 1000.1;
    const input = refineInput(buildSolverInput2D(m, false)!, 3).input;
    expect(input.loads).toHaveLength(2);
    for (const load of input.loads) {
      const d: any = load.data, e = input.elements.get(d.elementId)!;
      const i = input.nodes.get(e.nodeI)!, j = input.nodes.get(e.nodeJ)!;
      const dx = j.x - i.x, dz = j.z - i.z, length = Math.sqrt(dx * dx + dz * dz);
      expect(d.a ?? 0).toBeGreaterThanOrEqual(0);
      expect(d.b ?? length).toBeLessThanOrEqual(length);
    }
    const result = solve(input);
    expect(result.reactions[0].rz).toBeCloseTo(2 * (2.66666666666665 - 0.5), 10);
  });

});


describe('known wrong result: #2222 — wind endpoint arithmetic', () => {
  for (const dim of [2, 3]) for (const mode of ['linear', 'session', 'pdelta', 'corotational', 'fiber']) {
    it(`${dim}D ${mode} maps coincident wind endpoints and refuses distinct overhangs`, () => {
      for (const [origin, tip, endpoint, overhang] of [
        [[1000.1, 0], [1004.1, 0], adjacent(4, 1n), 4 + 1e-10],
        [[1000.1, 0], [1004.1, 0], 4 + 16 * Number.EPSILON, adjacent(4 + 16 * Number.EPSILON, 1n)],
        [[-0.665, 0.17], [-0.435, 0.63], 0.5142956348249517, 0.5142956348249517 + 1e-10],
        [[0, 4.4999812501171865], [0, 6], 1.500018749882814, 1.500018749882814 + 1e-10],
      ] as Array<[number[], number[], number, number]>) {
        const base: any = structuredClone(model);
        base.materials[1].e = 200000;
        const dx = tip[0] - origin[0], dz = tip[1] - origin[1];
        for (const n of Object.values(base.nodes) as any[]) {
          n.x = origin[0] + (n.id - 1) * dx;
          n.z = origin[1] + (n.id - 1) * dz;
          if (dim === 3) n.y = 0;
        }
        if (dim === 3) {
          for (const s of Object.values(base.sections) as any[]) Object.assign(s, { iy: 1, j: 1 });
          for (const s of Object.values(base.supports) as any[]) Object.assign(s, { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
        }
        base.loads = [];
        const session = mode === 'session' ? new wasm[`LoadSession${dim}D`](base) : undefined;
        const run = (input: any) => mode === 'linear' ? wasm[`solve_${dim}d`](input)
          : mode === 'session' ? session.solve(input.loads)
          : mode === 'fiber' ? JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify({ solver: input, fiberSections: {}, nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-9, nIncrements: 1 }))).results
          : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input), 20, 1e-9)).linearResults
          : JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input), 40, 1e-12, 1)).results;
        try {
          for (const b of [endpoint, overhang]) {
            const a = b * 0.2;
            const input = { ...base, loads: [{ type: 'distributed', data: dim === 2
              ? { elementId: 1, a, b, qI: -2, qJ: -4 }
              : { elementId: 1, a, b, qYI: -2, qYJ: -4, qZI: 0, qZJ: 0 } }] };
            if (b === adjacent(4, 1n) && origin[0] === 1000.1) {
              const q = 1.5 * 2 ** 53;
              const unrepresentable = { ...input, loads: [{ type: 'distributed', data: dim === 2
                ? { elementId: 1, a, b, qI: q, qJ: -q + 2 }
                : { elementId: 1, a, b, qYI: q, qYJ: -q + 2, qZI: 0, qZJ: 0 } }] };
              expect(() => run(unrepresentable)).toThrow(/invalid distributed load interval/);
            }
            if (b !== endpoint) expect(() => run(input)).toThrow(/interval/);
            else {
              const result = run(input);
              const force = result.reactions.reduce((sum: number[], r: any) => dim === 2
                ? [sum[0] + r.rx, sum[1] + r.rz, 0]
                : [sum[0] + r.fx, sum[1] + r.fy, sum[2] + r.fz], [0, 0, 0]);
              expect(Math.hypot(...force)).toBeCloseTo(3 * (b - a), 10);
              for (const f of result.elementForces) {
                for (const key of dim === 2 ? ['distributedLoads'] : ['distributedLoadsY']) {
                  for (const load of f[key] ?? []) expect(load.b).toBeLessThanOrEqual(f.length);
                }
              }
            }
          }
        } finally { session?.free(); }
      }
    });
  }
});
