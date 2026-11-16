import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeKinematics } from '../kinematic-2d';
import { generatedMemberBounds } from '../member-span-loads';
import { modelStore } from '../../store';
import { buildSolverInput2D, buildSolverInput3D } from '../solver-service';
import { subdivideForAnalysis } from '../../model/edit/analysis-subdivision';
import { expandVariableMembers } from '../variable-members';
import { refineInput } from '../second-order/refine';
import { initSolver, solve, solve3D, solvePDelta, solvePDelta3D } from '../wasm-solver';
import { targetDisplacement } from '../influence/maxwell';
import { plasticCollapse2D } from '../plastic-collapse';
import { toSectionFields } from '../../section/section-choice';
import { computeSectionProperties } from '../../data/section-shapes';

beforeAll(async () => { await initSolver(); });

describe('known wrong result: #2222 — actual generated cuts', () => {
  for (const dim of [2, 3]) for (const rotated of [false, true]) for (const qJ of [2, 4, -2]) for (const partial of [false, true]) for (const entry of ['edit', 'analysis', 'variable', 'refine']) {
    if (dim === 3 && entry === 'refine') continue;
    it(`${dim}D rotated=${rotated} qJ=${qJ} partial=${partial} ${entry} solves translated thirds and conserves force and first moment`, () => {
      modelStore.clear();
      try {
        const i = dim === 3 ? modelStore.addNode(1000.1, 0, 0) : modelStore.addNode(1000.1, 0);
        const j = dim === 3 ? modelStore.addNode(1004.1, rotated ? 3 : 0, 0) : modelStore.addNode(1004.1, rotated ? 3 : 0);
        const id = modelStore.addElement(i, j, 'frame');
        modelStore.addSupport(i, 'fixed');
        if (entry === 'variable') {
          const sections = [0.3, 0.5].map(h => {
            const params = { b: 0.3, h };
            return modelStore.addSection(toSectionFields({ kind: 'built', name: `round10-${h}`, shapeType: 'concrete-rect', params, props: computeSectionProperties('concrete-rect', params)!, rotationDeg: 0 }, 0) as never);
          });
          modelStore.updateElement(id, { sectionId: sections[0], variableSection: { sectionJ: sections[1], segments: 3 } } as never);
        }
        const L = rotated ? 5 : 4;
        const sourceA = partial ? L / 8 : 0, sourceB = partial ? 7 * L / 8 : L;
        modelStore.model.loads = [dim === 2
          ? { type: 'distributed', data: { id: 1, elementId: id, qI: 2, qJ, a: sourceA, b: sourceB } }
          : { type: 'distributed3d', data: { id: 1, elementId: id, qXI: 2, qXJ: qJ, qYI: -2, qYJ: -qJ, qZI: 3, qZJ: 1.5 * qJ, a: sourceA, b: sourceB } }];
        let child = modelStore.model;
        if (entry === 'edit') modelStore.splitMember(id, [1 / 3, 2 / 3]);
        if (entry === 'analysis') child = subdivideForAnalysis(child, 3).model as typeof child;
        if (entry === 'variable') child = expandVariableMembers(child) as typeof child;
        const build = () => dim === 2 ? buildSolverInput2D(child, false)! : buildSolverInput3D(child, false)!;
        const input = entry === 'refine' ? refineInput(buildSolverInput2D(child, false)!, 3).input : build();
        const parts = dim === 2 ? ['distributed', 'axialDistributed'] : ['distributed'];
        for (const axis of dim === 2 ? ['q'] : ['qX', 'qY', 'qZ']) {
          let force = 0, moment = 0;
          for (const load of input.loads) {
            if (!parts.includes(load.type)) continue;
            const d = load.data as any, e = input.elements.get(d.elementId)!;
            const a = input.nodes.get(e.nodeI)!, b = input.nodes.get(e.nodeJ)!;
            const width = Math.hypot(b.x - a.x, (dim === 3 ? (b as unknown as { y: number }).y - (a as unknown as { y: number }).y : 0), b.z - a.z);
            const start = ((a.x - 1000.1) * 4 + (dim === 2 ? a.z : (a as any).y) * (rotated ? 3 : 0)) / L;
            const qi = d[axis + 'I'] ?? 0, qj = d[axis + 'J'] ?? 0;
            const lo = d.a ?? 0, hi = d.b ?? width, w = hi - lo;
            force += (qi + qj) * w / 2;
            moment += (qi + qj) * w * (start + lo) / 2 + (qi + 2 * qj) * w * w / 6;
          }
          const factor = axis === 'qY' ? -1 : axis === 'qZ' ? 1.5 : 1;
          const w = sourceB - sourceA, expectedForce = (2 + qJ) * w / 2;
          expect(force).toBeCloseTo(factor * expectedForce, 10);
          expect(moment).toBeCloseTo(factor * (expectedForce * sourceA + (2 + 2 * qJ) * w * w / 6), 10);
        }
        for (const mode of ['linear', 'pdelta'] as const) {
          const result = mode === 'linear' ? (dim === 2 ? solve(input as never) : solve3D(input as never))
            : (dim === 2 ? solvePDelta(input as never) : solvePDelta3D(input as never)).linearResults;
          expect(result.reactions.length).toBeGreaterThan(0);
          for (const r of result.reactions) for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
        }
      } finally { modelStore.clear(); }
    });
  }
  for (const rotated of [false, true]) for (const entry of ['Maxwell', 'plastic']) it(`${entry} rotated=${rotated} accepts translated generated cuts`, () => {
    modelStore.clear();
    try {
      const i = modelStore.addNode(1000.1, 0), j = modelStore.addNode(1004.1, rotated ? 3 : 0);
      const id = modelStore.addElement(i, j, 'frame');
      modelStore.addSupport(i, 'fixed');
      const input = buildSolverInput2D(modelStore.model, false)!;
      input.loads = [{ type: 'distributed', data: { elementId: id, qI: -2, qJ: -4 } }];
      if (entry === 'Maxwell') expect(Number.isFinite(targetDisplacement(input, 'uz', { kind: 'section', elementId: id, t: 1 / 3 }, input.loads))).toBe(true);
      else expect(plasticCollapse2D(input, { mp: () => 1, np: () => Infinity, samples: 3, maxEvents: 5 }).isMechanism).toBe(true);
    } finally { modelStore.clear(); }
  });
});

it('checks generated geometry on both sides of the arithmetic bound and rejects inconsistent children #2222', () => {
  const adjacent = (x: number, step: bigint) => {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, x);
    view.setBigUint64(0, view.getBigUint64(0) + step);
    return view.getFloat64(0);
  };
  for (const direction of [-1n, 1n]) {
    let last = 2, next = adjacent(last, direction);
    while (Math.abs(next - 2) <= Number.EPSILON * 3 * Math.max(2, next)) {
      last = next;
      next = adjacent(next, direction);
    }
    expect(generatedMemberBounds(2, [last])).toEqual([0, 2]);
    expect(() => generatedMemberBounds(2, [next])).toThrow(/geometry/);
  }
  for (const lengths of [[], [0, 4], [-1, 5], [NaN], [Infinity], [1, 2], [2, 3]]) {
    expect(() => generatedMemberBounds(4, lengths)).toThrow(/geometry/);
  }
  expect(generatedMemberBounds(4, [1.375, 1.25, 1.375])).toEqual([0, 1.375, 2.625, 4]);
  for (const points of [[[0, 0], [1, 1e-8], [2, 0]], [[0, 0], [1.5, 0], [1, 0], [2, 0]], [[0, 0], [NaN, 0], [2, 0]]]) {
    expect(() => generatedMemberBounds(2, [1, 1], points)).toThrow(/geometry/);
  }
  expect(generatedMemberBounds(2, [1, 1], [[1000.1, 0], [1001.1, 0], [1002.1, 0]])).toEqual([0, 1, 2]);
});

it('normalizes the engine orphan-rotation kind through WASM and retains unrelated invalid input #2222', () => {
  modelStore.clear();
  try {
    const i = modelStore.addNode(0, 0), j = modelStore.addNode(4, 0);
    const id = modelStore.addElement(i, j, 'frame');
    modelStore.addSupport(i, 'fixed');
    const input = buildSolverInput2D(modelStore.model, false)!;
    input.elements.get(id)!.hingeEnd = true;
    input.loads = [{ type: 'nodal', data: { nodeId: j, fx: 0, fz: 0, my: 1 } }];
    expect(analyzeKinematics(input).invalidInputKind).toBe('unsupportedNodalMoment');
    input.loads.push({ type: 'distributed', data: { elementId: id, a: -1, b: 2, qI: 1, qJ: 1 } });
    expect(analyzeKinematics(input).invalidInputKind).toBeUndefined();
    expect(analyzeKinematics(input).rankAnalysis).toBe('invalid');
    input.loads.pop();
    input.elements.get(id)!.hingeEnd = false;
    expect(analyzeKinematics(input).invalidInputKind).toBeUndefined();
    expect(analyzeKinematics(input).isSolvable).toBe(true);
  } finally { modelStore.clear(); }
});
