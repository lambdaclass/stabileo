/**
 * Every shipped exercise has to actually work.
 *
 * This is the check that makes authoring safe. An exercise is data now, so
 * writing one no longer needs a compiler — but it also no longer gets one
 * looking over your shoulder. What replaces that is this: each exercise is
 * built, solved, and its stated answers are compared against what the solver
 * produces.
 *
 * The failure this exists to prevent is specific and used to be reachable.
 * Several answers were hand-written literals, because the extractor available
 * for "maximum moment" only looked at element ENDS and could not see the
 * mid-span maximum of a distributed load. Nothing compared those literals to
 * the solver, so an exercise whose load or span changed would have gone on
 * stating the old answer — and a student would have been marked wrong for
 * being right.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getExerciseSpecs } from '../exercise-data';
import { buildFromSpec, evaluateAnswer, lintExercise, type ResolvedExerciseSpec } from '../exercise-spec';
import { isParametric, lintVariants, shapeOf, variantOf } from '../exercise-variant';
import { supportCombos } from '../exercise-params';
import { stressContext } from '../exercise-stress';
import { solve } from '../../../lib/engine/wasm-solver';
import { initSolver } from '../../../lib/engine/wasm-solver';
import type { ElementForces } from '../../../lib/engine/types';

beforeAll(async () => {
  await initSolver();
});

/** Build a spec's structure into a solver input and solve it. */
function solveSpec(spec: ResolvedExerciseSpec) {
  const nodes = new Map<number, { id: number; x: number; y: number }>();
  const elements = new Map<number, Record<string, unknown>>();
  const supports = new Map<number, Record<string, unknown>>();
  const loads: Array<Record<string, unknown>> = [];
  let nid = 0;
  let eid = 0;

  const api = {
    addNode: (x: number, y: number) => {
      const id = ++nid;
      nodes.set(id, { id, x, y });
      return id;
    },
    addElement: (i: number, j: number, type = 'frame') => {
      const id = ++eid;
      elements.set(id, { id, nodeI: i, nodeJ: j, materialId: 1, sectionId: 1, type, hingeStart: false, hingeEnd: false });
      return id;
    },
    addHinge: (elementId: number, end: 'start' | 'end') => {
      elements.get(elementId)![end === 'start' ? 'hingeStart' : 'hingeEnd'] = true;
    },
    addSupport: (nodeId: number, type: string) => {
      supports.set(nodeId, { id: nodeId, nodeId, type });
    },
    addNodalLoad: (nodeId: number, fx: number, fy: number, mz?: number) => {
      loads.push({ type: 'nodal', data: { id: loads.length + 1, nodeId, fx, fy, mz: mz ?? 0 } });
    },
    addDistributedLoad: (elementId: number, qI: number, qJ?: number) => {
      loads.push({ type: 'distributed', data: { id: loads.length + 1, elementId, qI, qJ: qJ ?? qI } });
    },
  };
  buildFromSpec(spec.model, api as never);

  const input = {
    nodes,
    materials: new Map([[1, { id: 1, e: 200e6, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.0069, iz: 9.8e-5 }]]),
    elements,
    supports,
    loads,
  };
  return solve(input as never);
}

describe('every shipped exercise is structurally sound', () => {
  for (const spec of getExerciseSpecs()) {
    it(`${spec.id} has no authoring errors`, () => {
      expect(lintExercise(spec)).toEqual([]);
    });
  }

  it('the lint actually catches a broken exercise', () => {
    // A test that only ever passes proves nothing about the checker.
    const good = getExerciseSpecs()[0];
    const broken = {
      ...good,
      model: { ...good.model, supports: [{ node: 99, type: 'pinned' as const }] },
    };
    expect(lintExercise(broken).join(' ')).toMatch(/node 99 does not exist/);
  });
});

describe('every exercise solves, and its stated answers come from that solve', () => {
  for (const spec of getExerciseSpecs()) {
    // P-Delta needs a different solver than the linear one used here.
    if (spec.solverType === 'pdelta') continue;

    it(`${spec.id} solves and answers evaluate`, () => {
      const results = solveSpec(variantOf(spec));
      expect(results, spec.id).toBeTruthy();
      const forces = results.elementForces as ElementForces[];
      expect(forces.length).toBe(spec.model.elements.length);

      // Stress questions need the section resolver; an exercise that declares
      // no profile simply gets an empty context, and any stress question in it
      // then fails here — which is the intended outcome, not an oversight.
      const ctx = stressContext(spec.model.profile, spec.model.fy);
      for (const c of spec.characteristics) {
        const v = evaluateAnswer(c.answer, forces, ctx);
        expect(v, `${spec.id} / ${c.label}`).not.toBeNull();
        expect(Number.isFinite(v!), `${spec.id} / ${c.label}`).toBe(true);
      }
      for (const q of spec.diagramQuestions) {
        const v = evaluateAnswer(q.answer, forces, ctx);
        expect(v, `${spec.id} / ${q.question}`).not.toBeNull();
        expect(Number.isFinite(v!)).toBe(true);
      }
    });
  }
});

describe('the answers match hand calculation, which is the point', () => {
  it('the simply supported beam finds its MID-SPAN maximum, not zero at the ends', () => {
    // w L²/8 = 5 x 64/8 = 40 kN·m. The old end-sampling extractor returned 0
    // here, which is exactly why this answer used to be a hand-written literal.
    const spec = variantOf(getExerciseSpecs().find((s) => s.id === 'simply-supported-distributed')!, { values: { L: 8, q: 5 }, supports: {} });
    const forces = solveSpec(spec).elementForces as ElementForces[];
    const mmax = evaluateAnswer(spec.characteristics[0].answer, forces)!;
    expect(mmax).toBeCloseTo(40, 1);
    // And the shear at the support is w L/2 = 20 kN.
    const vmax = evaluateAnswer(spec.characteristics[1].answer, forces)!;
    expect(vmax).toBeCloseTo(20, 1);
  });

  it('the cantilever gives P L at the fixed end', () => {
    const spec = variantOf(getExerciseSpecs().find((s) => s.id === 'cantilever-point')!, { values: { L: 4, P: 12 }, supports: {} });
    const forces = solveSpec(spec).elementForces as ElementForces[];
    expect(Math.abs(evaluateAnswer(spec.characteristics[0].answer, forces)!)).toBeCloseTo(48, 1);
    expect(Math.abs(evaluateAnswer(spec.characteristics[1].answer, forces)!)).toBeCloseTo(12, 1);
  });

  it('the bending-stress exercise derives sigma from the solve, not from a literal', () => {
    // P L/4 = 15 x 4/4 = 15 kN·m over W = 5.333e-3 m³ gives 2.8125 MPa — the
    // value that used to be typed in. It has to come out of the solve now.
    const spec = variantOf(getExerciseSpecs().find((s) => s.id === 'bending-stress-rect')!, { values: { L: 4, P: 15 }, supports: {} });
    const forces = solveSpec(spec).elementForces as ElementForces[];
    const sigma = evaluateAnswer(spec.characteristics[1].answer, forces)!;
    expect(sigma).toBeCloseTo(2.8125, 2);
  });

  it('the portal frame separates column and beam moments', () => {
    const spec = variantOf(getExerciseSpecs().find((s) => s.id === 'portal-frame')!);
    const forces = solveSpec(spec).elementForces as ElementForces[];
    const col = evaluateAnswer(spec.characteristics[0].answer, forces)!;
    const beam = evaluateAnswer(spec.characteristics[1].answer, forces)!;
    // Both real, and the question would be pointless if they were equal.
    expect(col).toBeGreaterThan(0);
    expect(beam).toBeGreaterThan(0);
    expect(Math.abs(col - beam)).toBeGreaterThan(1e-6);
  });
});

describe('every parametric exercise works for every student', () => {
  const parametric = getExerciseSpecs().filter(isParametric);

  it('the shipped catalogue is mostly parametric', () => {
    expect(parametric.length).toBeGreaterThanOrEqual(8);
  });

  for (const spec of parametric) {
    it(`${spec.id}: 50 seeds and every support combination solve and answer`, () => {
      const lint = lintVariants(spec, { seeds: 50 });
      expect(lint.problems).toEqual([]);
      expect(lint.checked).toBe(50 + supportCombos(spec.params!).length);
    });

    it(`${spec.id}: no text still shows a raw placeholder`, () => {
      const ex = variantOf(spec, 12345);
      const texts = [ex.title, ex.description, ...ex.supports.map((s) => s.label), ...(ex.sectionData ?? []).map((d) => d.value)];
      for (const text of texts) expect(text, text).not.toMatch(/\{[A-Za-z_]\w*\}/);
    });
  }

  it('the drawn ranges are the round ones a teacher would set', () => {
    for (const spec of parametric) {
      for (const [k, r] of Object.entries(spec.params!.values)) {
        expect([0.5, 1, 2, 5, 10], `${spec.id}.${k}`).toContain(r.step);
        expect(Number.isInteger(r.min / r.step) || r.step < 1, `${spec.id}.${k}`).toBe(true);
      }
    }
  });

  it('the support-varying frame is a different structure for different students', () => {
    const spec = getExerciseSpecs().find((s) => s.id === 'frame-varying-supports')!;
    const kinds = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const ex = variantOf(spec, s);
      kinds.add(JSON.stringify([ex.model.supports.map((x) => x.type), ex.kinematicQuestion]));
    }
    expect(kinds.size).toBe(4);
  });

  it('shape answers a parametric exercise derives agree with what the catalogue used to state', () => {
    const expected: Record<string, Record<string, string>> = {
      'simply-supported-distributed': { N: 'zero', V: 'linear', M: 'quadratic' },
      'portal-frame': { V: 'constant', M: 'linear' },
      'cantilever-point': { N: 'zero', V: 'constant', M: 'linear' },
      'simple-truss': { N: 'constant', V: 'zero', M: 'zero' },
      'overhang-point-load': { V: 'constant', M: 'linear' },
      'gerber-beam': { V: 'linear', M: 'quadratic' },
      'frame-varying-supports': { M: 'quadratic' },
    };
    for (const [id, shapes] of Object.entries(expected)) {
      const spec = getExerciseSpecs().find((s) => s.id === id)!;
      for (let seed = 0; seed < 5; seed++) {
        const forces = solveSpec(variantOf(spec, seed)).elementForces as ElementForces[];
        for (const [d, shape] of Object.entries(shapes)) expect(shapeOf(d as 'N', forces), `${id} ${d}`).toBe(shape);
      }
    }
  });

  it('the hinge of the Gerber beam carries no moment, in every variant', () => {
    const spec = getExerciseSpecs().find((s) => s.id === 'gerber-beam')!;
    for (let seed = 0; seed < 10; seed++) {
      const ex = variantOf(spec, seed);
      const forces = solveSpec(ex).elementForces as ElementForces[];
      expect(Math.abs(evaluateAnswer(ex.diagramQuestions[0]!.answer, forces)!)).toBeLessThan(1e-6);
      const { L2, q } = ex.variant!.values;
      expect(Math.abs(evaluateAnswer(ex.diagramQuestions[1]!.answer, forces)!)).toBeCloseTo(q! * L2! / 2, 3);
    }
  });

  it('the overhang beam reacts as the hand calculation says, wherever the load sits', () => {
    const spec = getExerciseSpecs().find((s) => s.id === 'overhang-point-load')!;
    for (let seed = 0; seed < 10; seed++) {
      const ex = variantOf(spec, seed);
      const { L, a, c, P, F } = ex.variant!.values as Record<string, number>;
      const forces = solveSpec(ex).elementForces as ElementForces[];
      expect(Math.abs(evaluateAnswer(ex.diagramQuestions[1]!.answer, forces)!)).toBeCloseTo(F * c, 3);
      const rb = (P * a + F * (L + c)) / L;
      const ra = P + F - rb;
      expect(Math.abs(evaluateAnswer(ex.diagramQuestions[0]!.answer, forces)!)).toBeCloseTo(Math.abs(ra * a), 3);
    }
  });
});
