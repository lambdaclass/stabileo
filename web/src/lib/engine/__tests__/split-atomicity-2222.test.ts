import { describe, expect, it } from 'vitest';
import { modelStore } from '../../store';
import { splitSpanLoad } from '../member-span-loads';
import { splitElementLoads } from '../../model/edit/member-split';
import { subdivideForAnalysis } from '../../model/edit/analysis-subdivision';
import { expandVariableMembers } from '../variable-members';
import { refineInput } from '../second-order/refine';
import { buildSolverInput2D } from '../solver-service';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';

const bytes = () => JSON.stringify([modelStore.snapshot(), modelStore.modelVersion]);
const setup = (dim: number, origin = 0) => {
  modelStore.clear();
  const i = dim === 3 ? modelStore.addNode(origin, 0, 0) : modelStore.addNode(origin, 0);
  const j = dim === 3 ? modelStore.addNode(origin + 4, 0, 0) : modelStore.addNode(origin + 4, 0);
  const id = modelStore.addElement(i, j, 'frame');
  modelStore.addSupport(i, 'fixed');
  return id;
};
const variable = (id: number) => {
  const sections = [0.3, 0.5].map(h => {
    const params = { b: 0.3, h };
    return modelStore.addSection(toSectionFields({ kind: 'built', name: `rounded${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
  });
  modelStore.updateElement(id, { sectionId: sections[0], variableSection: { sectionJ: sections[1], segments: 3 } } as never);
};
const load = (dim: number, id: number, a?: number, b?: number) => dim === 2
  ? { type: 'distributed', data: { id: 1, elementId: id, qI: 2, qJ: 4, a, b } }
  : { type: 'distributed3d', data: { id: 1, elementId: id, qXI: 2, qXJ: 4, qYI: -2, qYJ: -4, qZI: 3, qZJ: 6, a, b } };

describe('known wrong result: #2222 — refused split is atomic', () => {
  for (const dim of [2, 3]) for (const keepOriginalId of [true, false]) for (const interval of [[1, 2 + 2 ** -51], [0, 0], [-1, 3]]) {
    it(`${dim}D keepOriginalId=${keepOriginalId} interval=${interval} preserves every model byte and id`, () => {
      try {
        const id = setup(dim);
        variable(id);
        modelStore.model.loads = [load(dim, id, ...interval) as never];
        const before = bytes();
        expect(() => modelStore.splitMember(id, [0.5], { keepOriginalId })).toThrow(/interval/);
        expect(bytes()).toBe(before);
        modelStore.model.loads = [load(dim, id, 1, 3) as never];
        const result = modelStore.splitMember(id, [0.5], { keepOriginalId });
        expect(result?.nodeIds).toEqual([3]);
        expect(result?.segmentIds).toEqual(keepOriginalId ? [id, id + 1] : [id + 1, id + 2]);
      } finally { modelStore.clear(); }
    });
  }
});

describe('known wrong result: #2222 — rounded geometry conserves or refuses', () => {
  for (const type of ['distributed', 'axialDistributed'] as const) for (const qJ of [2, 4, -2]) {
    it(`${type} qJ=${qJ} refuses a changed child span before rescaling`, () => {
      const source = { type, data: { elementId: 1, qI: 2, qJ } };
      expect(() => splitSpanLoad(source, 4, [{ id: 1, start: 0, end: 4 / 3, length: 1.375 }, { id: 2, start: 4 / 3, end: 4, length: 2.625 }])).toThrow(/geometry/);
      const out = splitSpanLoad(source, 4, [{ id: 1, start: 0, end: 1.375, length: 1.375 }, { id: 2, start: 1.375, end: 4, length: 2.625 }]);
      let force = 0, moment = 0;
      for (const l of out) {
        if (l.type !== type) throw new Error('Wrong load kind');
        const d = l.data, start = d.elementId === 1 ? 0 : 1.375;
        const a = d.a ?? 0, b = d.b ?? (d.elementId === 1 ? 1.375 : 2.625), w = b - a;
        const f = (d.qI + d.qJ) * w / 2;
        force += f;
        moment += f * (start + a) + (d.qI + 2 * d.qJ) * w * w / 6;
      }
      expect(force).toBeCloseTo((2 + qJ) * 4 / 2, 12);
      expect(moment).toBeCloseTo((2 + 2 * qJ) * 16 / 6, 12);
    });
  }
  for (const dim of [2, 3]) for (const mode of ['edit', 'analysis', 'variable']) {
    it.skip(`known wrong result: #2222 — ${dim}D ${mode} conserves thirds at rounded actual cuts`, () => {
      try {
        const id = setup(dim, 2 ** 49 + 0.125);
        modelStore.model.loads = [load(dim, id) as never];
        if (mode === 'variable') variable(id);
        const before = bytes();
        const run = () => mode === 'edit' ? modelStore.splitMember(id, [1 / 3, 2 / 3])
          : mode === 'analysis' ? subdivideForAnalysis(modelStore.model, 3) : expandVariableMembers(modelStore.model);
        const result = run();
        const child = mode === 'edit' ? modelStore.model : mode === 'analysis' ? (result as ReturnType<typeof subdivideForAnalysis>).model : result as ReturnType<typeof expandVariableMembers>;
        for (const [qi, qj, sign] of (dim === 2 ? [['qI', 'qJ', 1]] : [['qXI', 'qXJ', 1], ['qYI', 'qYJ', -1], ['qZI', 'qZJ', 1.5]]) as Array<[string, string, number]>) {
          let force = 0, moment = 0;
          for (const l of child.loads) {
            const d = l.data as unknown as Record<string, number>, e = child.elements.get(d.elementId)!;
            const a = child.nodes.get(e.nodeI)!, b = child.nodes.get(e.nodeJ)!;
            const w = b.x - a.x, start = a.x - (2 ** 49 + 0.125);
            force += (d[qi] + d[qj]) * w / 2;
            moment += (d[qi] + d[qj]) * w * start / 2 + (d[qi] + 2 * d[qj]) * w * w / 6;
          }
          expect(force).toBeCloseTo(sign * 12, 12);
          expect(moment).toBeCloseTo(sign * 160 / 6, 12);
        }
        if (mode !== 'edit') expect(bytes()).toBe(before);
      } finally { modelStore.clear(); }
    });
  }
  it.skip('known wrong result: #2222 — planar nonlinear refinement conserves rounded geometry without modifying its input', () => {
    try {
      const id = setup(2, 2 ** 49 + 0.125);
      modelStore.model.loads = [load(2, id) as never];
      const input = buildSolverInput2D(modelStore.model, false)!;
      const before = JSON.stringify(input, (_, v) => v instanceof Map ? [...v] : v);
      expect(refineInput(input, 3).input.loads).toHaveLength(3);
      expect(JSON.stringify(input, (_, v) => v instanceof Map ? [...v] : v)).toBe(before);
    } finally { modelStore.clear(); }
  });
  it('refuses changed unloaded children that would shift a loaded middle child', () => {
    const source = { type: 'distributed' as const, data: { elementId: 1, qI: 2, qJ: 4, a: 1.25, b: 1.75 } };
    expect(() => splitSpanLoad(source, 3, [
      { id: 1, start: 0, end: 1, length: 1.125 },
      { id: 2, start: 1, end: 2, length: 1 },
      { id: 3, start: 2, end: 3, length: 0.875 },
    ])).toThrow(/geometry/);
  });
  for (const length of [2 - 2 ** -52, 2, 2 + 2 ** -51]) it.skip(`known wrong result: #2222 — conservative local mapping boundary ${length}`, () => {
    const run = () => splitSpanLoad({ type: 'distributed', data: { elementId: 1, qI: 2, qJ: 4 } }, 2, [{ id: 1, start: 0, end: 2, length }]);
    if (length === 2) expect(run()).toEqual([{ type: 'distributed', data: { elementId: 1, qI: 2, qJ: 4, a: undefined, b: undefined } }]);
    else {
      const out = run()[0];
      if (out.type !== 'distributed') throw new Error('Wrong load kind');
      expect((out.data.qI + out.data.qJ) * length / 2).toBeCloseTo(6, 12);
      expect((out.data.qI + 2 * out.data.qJ) * length * length / 6 * (2 / length)).toBeCloseTo(40 / 6, 12);
    }
  });
  for (const dim of [2, 3]) for (const entry of ['subdivide', 'point']) it(`${dim}D ${entry} refusal preserves the complete model`, () => {
    try {
      const id = setup(dim);
      modelStore.model.loads = [load(dim, id, 1, 2 + 2 ** -51) as never];
      const before = bytes();
      expect(() => entry === 'subdivide' ? modelStore.subdivideElement(id, 2) : modelStore.splitElementAtPoint(id, 0.5)).toThrow(/interval/);
      expect(bytes()).toBe(before);
    } finally { modelStore.clear(); }
  });
  for (const dim of [2, 3]) it(`${dim}D model splitter conserves rounded actual cuts and every component`, () => {
    const source = load(dim, 1) as never;
    const { added } = splitElementLoads([source], 1, [0, 1.375, 4], [1, 2], () => 10, [1.375, 2.625]);
    for (const [qi, qj, q0, q1] of (dim === 2 ? [['qI', 'qJ', 2, 4]] : [['qXI', 'qXJ', 2, 4], ['qYI', 'qYJ', -2, -4], ['qZI', 'qZJ', 3, 6]]) as Array<[string, string, number, number]>) {
      let force = 0, moment = 0;
      for (const l of added) {
        const d = l.data as unknown as Record<string, number>;
        const start = d.elementId === 1 ? 0 : 1.375, a = d.a ?? 0, b = d.b ?? (d.elementId === 1 ? 1.375 : 2.625), w = b - a;
        const f = (d[qi] + d[qj]) * w / 2;
        force += f;
        moment += f * (start + a) + (d[qi] + 2 * d[qj]) * w * w / 6;
      }
      expect(force).toBeCloseTo((Number(q0) + Number(q1)) * 2, 12);
      expect(moment).toBeCloseTo((Number(q0) + 2 * Number(q1)) * 16 / 6, 12);
    }
  });
});
