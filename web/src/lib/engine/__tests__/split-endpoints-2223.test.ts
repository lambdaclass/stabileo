import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { historyStore, modelStore } from '../../store';
import { splitAtNodes, splitAllAtNodes, intersectMembers } from '../../model/edit/cut-members';
import { subdivideForAnalysis } from '../../model/edit/analysis-subdivision';
import { expandVariableMembers } from '../variable-members';
import { refineInput } from '../second-order/refine';
import { buildSolverInput2D, buildSolverInput3D, type ModelData } from '../solver-service';
import { initSolver, input2DToWireObject, input3DToWireObject } from '../wasm-solver';
import { splitSpanLoad } from '../member-span-loads';
import { targetDisplacement } from '../influence/maxwell';
import { plasticCollapse2D } from '../plastic-collapse';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';

let wasm: any;
beforeAll(async () => { await initSolver(); wasm = await import('../../wasm/dedaliano_engine.js'); });
afterEach(() => { modelStore.clear(); historyStore.clear(); });

function fixture(dim: number, kind: string, b: number, a = 0) {
  const i = modelStore.addNode(1000.1, 0, ...(dim === 3 ? [0] as const : []));
  const j = modelStore.addNode(1004.1, 0, ...(dim === 3 ? [0] as const : []));
  const id = modelStore.addElement(i, j, 'frame');
  modelStore.addSupport(i, dim === 3 ? 'fixed3d' : 'fixed');
  modelStore.model.loads = [kind === 'distributed'
    ? { type: 'distributed', data: { id: 1, elementId: id, qI: -2, qJ: -4, a, b } }
    : { type: 'distributed3d', data: { id: 1, elementId: id, qXI: -2, qXJ: -4, qYI: -2, qYJ: -4, qZI: -1, qZJ: -2, a, b } }];
  return id;
}

function cut(entry: string, id: number): ModelData {
  if (entry === 'analysis') return subdivideForAnalysis(modelStore.model, 2).model;
  if (entry === 'variable') {
    const sections = [0.3, 0.5].map(h => {
      const params = { b: 0.3, h };
      return modelStore.addSection(toSectionFields({ kind: 'built', name: `endpoint-${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
    });
    modelStore.updateElement(id, { sectionId: sections[0], variableSection: { sectionJ: sections[1], segments: 2 } });
    return expandVariableMembers(modelStore.model);
  }
  if (entry === 'direct') expect(modelStore.splitMember(id, [0.5])).not.toBeNull();
  if (entry === 'point') expect(modelStore.splitElementAtPoint(id, 0.5)).not.toBeNull();
  if (entry === 'subdivide') expect(modelStore.subdivideElement(id, 2)).toBe(true);
  if (entry === 'nodes' || entry === 'allNodes') {
    const node = modelStore.addNode(1002.1, 0);
    expect((entry === 'nodes' ? splitAtNodes([id], [node]) : splitAllAtNodes().report).cut).toHaveLength(1);
  }
  if (entry === 'intersection') {
    const cross = modelStore.addElement(modelStore.addNode(1002.1, -1), modelStore.addNode(1002.1, 1), 'frame');
    expect(intersectMembers([id, cross]).cut).toHaveLength(2);
    for (const e of [...modelStore.elements.values()]) if ([e.nodeI, e.nodeJ].some(n => modelStore.nodes.get(n)!.y !== 0)) modelStore.removeElement(e.id);
    for (const n of [...modelStore.nodes.values()]) if (n.y !== 0) modelStore.removeNode(n.id);
  }
  return modelStore.model;
}

describe('known wrong result: #2223 — split paths accept certified wind endpoints', () => {
  for (const dim of [2, 3]) for (const kind of dim === 2 ? ['distributed'] : ['distributed', 'distributed3d']) {
    for (const a of [0, 1]) for (const entry of ['direct', 'point', 'subdivide', 'nodes', 'allNodes', 'intersection', 'analysis', 'variable']) {
      it(`known wrong result: #2223 — ${dim}D ${kind} ${entry} a=${a} preserves the answer through every solve mode`, () => {
        const b = 4.000000000000001, id = fixture(dim, kind, b, a);
        const model = cut(entry, id);
        expect(model.elements.size).toBe(2);
        expect(model.loads).toHaveLength(2);
        const input = dim === 2 ? input2DToWireObject(buildSolverInput2D(model, false)!) : input3DToWireObject(buildSolverInput3D(model, false)!);
        const session = new wasm[`LoadSession${dim}D`]({ ...input, loads: [] });
        try {
          for (const mode of ['linear', 'session', 'pdelta', 'corotational', 'fiber']) {
            const result = mode === 'linear' ? wasm[`solve_${dim}d`](input)
              : mode === 'session' ? session.solve(input.loads)
              : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input), 20, 1e-9)).results
              : mode === 'corotational' ? JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input), 40, 1e-12, 1)).results
              : JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify({ solver: input, fiberSections: {}, nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-9, nIncrements: 1 }))).results;
            const sum = (key: string) => result.reactions.reduce((s: number, r: any) => s + r[key], 0);
            expect(Math.hypot(...(dim === 2 ? ['rx', 'rz'] : ['fx', 'fy', 'fz']).map(sum)), mode).toBeCloseTo(3 * (b - a) * (kind === 'distributed3d' ? 1.5 : 1), 10);
          }
        } finally { session.free(); }
      });
    }
  }
  for (const type of ['distributed', 'axialDistributed'] as const) it(`known wrong result: #2223 — ${type} canonicalizes before clipping and retains force and moment`, () => {
    for (const [a, b] of [[0, 4.000000000000001], [1, 4.000000000000001], [0, 4 + 2 ** -48], [0, 4], [0, 4 - 2 ** -51]]) {
      const pieces = [{ id: 1, start: 0, end: 2, length: 2 }, { id: 2, start: 2, end: 4, length: 2 }];
      const out = splitSpanLoad({ type, data: { elementId: 1, qI: -2, qJ: -4, a, b } }, 4, pieces, [[1000.1, 0], [1004.1, 0]]);
      const scale = b > 4 ? b / 4 : 1, width = b - a;
      let force = 0, moment = 0;
      for (const l of out) {
        if (l.type !== type) throw new Error('Unexpected load type');
        const p = pieces.find(p => p.id === l.data.elementId)!, d = l.data;
        const lo = d.a ?? 0, hi = d.b ?? p.length, w = hi - lo;
        const f = (d.qI + d.qJ) * w / 2;
        force += f; moment += f * (p.start + lo) + (d.qI + 2 * d.qJ) * w * w / 6;
      }
      expect(force).toBeCloseTo(-3 * width, 12);
      expect(moment).toBeCloseTo((-3 * width * a + (-2 - 8) * width * width / 6) / scale, 12);
    }
  });
  it('known wrong result: #2223 — nonlinear refinement retains the certified endpoint', () => {
    fixture(2, 'distributed', 4.000000000000001);
    const input = buildSolverInput2D(modelStore.model, false)!;
    expect(refineInput(input, 2).input.loads).toHaveLength(2);
  });
  it('known wrong result: #2223 — Maxwell section splitting retains the certified endpoint', () => {
    const id = fixture(2, 'distributed', 4.000000000000001);
    const input = buildSolverInput2D(modelStore.model, false)!;
    const loads = input.loads;
    const direct = targetDisplacement(input, 'uz', { kind: 'node', nodeId: 2 }, loads);
    expect(direct).not.toBe(0);
    const section = targetDisplacement(input, 'uz', { kind: 'section', elementId: id, t: 0.5 }, loads);
    expect(Math.abs(section)).toBeGreaterThan(0);
    expect(Math.abs(section)).toBeLessThan(Math.abs(direct));
  });
  it('known wrong result: #2223 — plastic hinge insertion splits the certified endpoint load', () => {
    fixture(2, 'distributed', 4.000000000000001);
    const input = buildSolverInput2D(modelStore.model, false)!;
    input.supports = new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }], [2, { id: 2, nodeId: 2, type: 'rollerX' }]]);
    input.loads = [{ type: 'distributed', data: { elementId: 1, qI: -2, qJ: -2, b: 4.000000000000001 } }];
    const result = plasticCollapse2D(input, { mp: () => 100, np: () => Infinity, samples: 8, maxEvents: 4 });
    expect(result.isMechanism).toBe(true);
    expect(result.hinges).toHaveLength(1);
    expect(result.hinges[0].x).toBeCloseTo(2, 12);
    expect(result.collapseFactor).toBeCloseTo(8 * 100 / (2 * (4.000000000000001 / 4) * 4 ** 2), 10);
  });
});

for (const dim of [2, 3]) for (const b of [4 + 5 * 2 ** -50, 5, 0, Number.NaN]) it(`${dim}D refuses uncertified intervals atomically b=${b}`, () => {
  const id = fixture(dim, dim === 2 ? 'distributed' : 'distributed3d', b);
  const before = JSON.stringify(modelStore.snapshot());
  expect(() => modelStore.splitMember(id, [0.5])).toThrow(/interval/);
  expect(JSON.stringify(modelStore.snapshot())).toBe(before);
});
for (const dim of [2, 3]) it(`${dim}D ordinary full span still splits and retains endpoint intensities`, () => {
  const id = fixture(dim, dim === 2 ? 'distributed' : 'distributed3d', 4);
  const model = cut('direct', id);
  expect(model.loads).toHaveLength(2);
  const values = model.loads.map(l => l.data as any);
  expect(dim === 2 ? values.map(d => [d.qI, d.qJ]) : values.map(d => [d.qYI, d.qYJ])).toEqual([[-2, -3], [-3, -4]]);
});
