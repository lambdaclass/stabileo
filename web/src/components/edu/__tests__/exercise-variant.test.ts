import { beforeAll, describe, expect, it } from 'vitest';
import { initSolver } from '../../../lib/engine/wasm-solver';
import { getExerciseSpecs } from '../exercise-data';
import type { EduExerciseSpec } from '../exercise-spec';
import { seedFrom } from '../exercise-params';
import {
  describeVariant, fillText, isParametric, kinematicsOf, lintVariants, normalizeLegajo, reactionDofsFor,
  shapeAnswer, solveModel, specNodeIds, studentSeed, variantOf,
} from '../exercise-variant';
import { readDisplayedReaction } from '../edu-reactions';
import { toExercise } from '../exercises';
import type { ElementForces } from '../../../lib/engine/types';

beforeAll(async () => {
  await initSolver();
});

const beam = (over: Partial<EduExerciseSpec> = {}): EduExerciseSpec => ({
  id: 'beam',
  title: 'Beam of {L} m',
  description: 'q = {q} kN/m on {L} m, {unknown} stays',
  difficulty: 'easy',
  category: 'statics',
  params: {
    values: { L: { min: 4, max: 8, step: 1, unit: 'm' }, q: { min: 2, max: 10, step: 2, unit: 'kN/m' } },
    supportChoices: [{ support: 1, types: ['rollerX', 'pinned'] }],
  },
  model: {
    nodes: [[0, 0], ['L', 0]],
    elements: [[0, 1]],
    supports: [{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }],
    distributedLoads: [{ element: 0, qI: '-q' }],
  },
  supports: [
    { label: 'A', nodeIndex: 0, dofs: ['Ry'] },
    { label: 'B', nodeIndex: 1, dofs: ['Ry'] },
  ],
  characteristics: [{ label: 'Mmax', unit: 'kN·m', answer: { kind: 'maxAbs', force: 'moment' } }],
  diagramQuestions: [],
  kinematicQuestion: { classification: 'isostatic' },
  diagramShapeQuestions: [{ diagram: 'M', correct: 'linear' }],
  ...over,
});

describe('variantOf', () => {
  it('leaves an exercise without params meaning exactly what it meant', () => {
    const plain = getExerciseSpecs().find((s) => s.id === 'pdelta-column')!;
    expect(isParametric(plain)).toBe(false);
    const r = variantOf(plain, 99);
    expect(r.model).toEqual(plain.model);
    expect(r.supports).toEqual(plain.supports);
    expect(r.characteristics).toEqual(plain.characteristics);
    expect(r.kinematicQuestion).toEqual(plain.kinematicQuestion);
    expect(r.variant).toBeUndefined();
    expect(r.seed).toBeUndefined();
  });

  it('resolves the structure, the texts and the seed of one student', () => {
    const r = variantOf(beam(), { values: { L: 6, q: 4 }, supports: { 1: 'pinned' } });
    expect(r.model.nodes).toEqual([[0, 0], [6, 0]]);
    expect(r.model.distributedLoads).toEqual([{ element: 0, qI: -4 }]);
    expect(r.model.supports[1]!.type).toBe('pinned');
    expect(r.title).toBe('Beam of 6 m');
    expect(r.description).toBe('q = 4 kN/m on 6 m, {unknown} stays');
    expect('params' in r).toBe(false);
    expect(variantOf(beam(), 7).seed).toBe(7);
    expect(variantOf(beam(), 7)).toEqual(variantOf(beam(), 7));
  });

  it('asks for the reactions the support of THIS variant has', () => {
    expect(variantOf(beam(), { values: { L: 6, q: 4 }, supports: { 1: 'pinned' } }).supports[1]!.dofs).toEqual(['Rx', 'Ry']);
    expect(variantOf(beam(), { values: { L: 6, q: 4 }, supports: { 1: 'rollerX' } }).supports[1]!.dofs).toEqual(['Ry']);
    expect(variantOf(beam(), { values: { L: 6, q: 4 }, supports: {} }).supports[0]!.dofs).toEqual(['Ry']);
    const auto = beam({ supports: [{ label: 'A', nodeIndex: 0, dofs: 'auto' }] });
    expect(variantOf(auto).supports[0]!.dofs).toEqual(['Rx', 'Ry']);
    expect(reactionDofsFor('fixed')).toEqual(['Rx', 'Ry', 'M']);
    expect(reactionDofsFor('rollerY')).toEqual(['Rx']);
  });

  it('classifies the structure of the variant, not the one the author drew', () => {
    expect(variantOf(beam(), { values: { L: 6, q: 4 }, supports: { 1: 'rollerX' } }).kinematicQuestion)
      .toEqual({ classification: 'isostatic' });
    expect(variantOf(beam(), { values: { L: 6, q: 4 }, supports: { 1: 'pinned' } }).kinematicQuestion)
      .toEqual({ classification: 'hyperstatic', degree: 1 });
    expect(kinematicsOf({ nodes: [[0, 0], [4, 0]], elements: [[0, 1]], supports: [{ node: 0, type: 'rollerX' }] })).toBeNull();
  });

  it('reads the shape answers off the solve of the variant', () => {
    const r = variantOf(beam(), { values: { L: 6, q: 4 }, supports: {} });
    expect(r.diagramShapeQuestions).toEqual([{ diagram: 'M', correct: 'auto' }]);
    const res = solveModel(r.model);
    if (typeof res === 'string') throw new Error(res);
    expect(shapeAnswer(r.diagramShapeQuestions![0]!, res.elementForces as ElementForces[])).toBe('quadratic');
    const ex = toExercise(r);
    expect(ex.diagramShapeQuestions![0]!.getCorrect(res.elementForces as ElementForces[])).toBe('quadratic');
  });

  it('solves a variant to the hand calculation', () => {
    const r = variantOf(beam(), { values: { L: 8, q: 5 }, supports: {} });
    const res = solveModel(r.model);
    if (typeof res === 'string') throw new Error(res);
    expect(readDisplayedReaction(res, specNodeIds(r.model)[1]!, 'Ry')).toBeCloseTo(20, 6);
    expect(toExercise(r).characteristics[0]!.getCorrect(res.elementForces as ElementForces[])).toBeCloseTo(40, 3);
  });
});

describe('student identity', () => {
  it('one legajo is one variant however it is typed', () => {
    expect(normalizeLegajo(' 104.233 ')).toBe('104233');
    expect(studentSeed('ex', '104.233')).toBe(studentSeed('ex', '104233'));
    expect(studentSeed('ex', '104233')).toBe(seedFrom('ex:104233'));
    expect(studentSeed('ex', '104233')).not.toBe(studentSeed('other', '104233'));
  });

  it('two legajos of one class get different structures', () => {
    const spec = getExerciseSpecs().find((s) => s.id === 'overhang-point-load')!;
    const models = new Set(['1001', '1002', '1003', '1004', '1005'].map((l) => JSON.stringify(variantOf(spec, studentSeed(spec.id, l)).model)));
    expect(models.size).toBeGreaterThan(3);
  });
});

describe('lintVariants', () => {
  it('catches a support choice that makes a mechanism', () => {
    const bad = beam({
      params: { values: { L: { min: 4, max: 6, step: 1 } }, supportChoices: [{ support: 0, types: ['pinned', 'rollerX'] }] },
      model: { ...beam().model, distributedLoads: [{ element: 0, qI: -5 }] },
    });
    const lint = lintVariants(bad, { seeds: 5 });
    expect(lint.problems.length).toBeGreaterThan(0);
    expect(lint.problems.join(' ')).toMatch(/Support A: roller/i);
  });

  it('catches a parameter the model uses but nobody declared', () => {
    const bad = beam({ model: { ...beam().model, nodes: [[0, 0], ['Lx', 0]] } });
    expect(lintVariants(bad).problems.join(' ')).toMatch(/unknown parameter Lx/);
  });

  it('catches an expression in an exercise that declares no parameters', () => {
    const bad = beam({ params: undefined });
    expect(lintVariants(bad).problems.join(' ')).toMatch(/nodes\[1\]\.x/);
  });

  it('passes a sound one and says how many variants it looked at', () => {
    const lint = lintVariants(beam(), { seeds: 10 });
    expect(lint.problems).toEqual([]);
    expect(lint.checked).toBe(12);
  });

  it('describes a variant the way a teacher reads it', () => {
    expect(describeVariant(beam(), { values: { L: 6, q: 4 }, supports: { 1: 'pinned' } }))
      .toBe('L = 6 m · q = 4 kN/m · Support B: Pinned support');
    expect(fillText('{L} and {L}', { L: 2.5 })).toBe('2.5 and 2.5');
  });
});
