/**
 * Capturing a drawn structure as an exercise.
 *
 * The point of this path is that a teacher never opens a file to author. They
 * draw the structure with the tools that already exist, and the app reads it.
 * So what matters here is that the round trip is faithful — draw it, capture
 * it, load it back, and get the same structure — and that anything which
 * CANNOT be captured is reported rather than quietly dropped.
 */

import { describe, it, expect } from 'vitest';
import { captureModel, toFile, fromFile, EXERCISE_FILE_VERSION } from '../exercise-capture';
import { lintExercise } from '../exercise-spec';
import { getExerciseSpecs } from '../exercise-data';
import type { StructureModel } from '../../../lib/store/model.svelte';

/** A minimal model, as the store would hold it after drawing. */
function model(over: Partial<StructureModel> = {}): StructureModel {
  return {
    nodes: new Map([
      [10, { id: 10, x: 0, y: 0 }],
      [11, { id: 11, x: 6, y: 0 }],
    ]),
    elements: new Map([
      [20, { id: 20, type: 'frame', nodeI: 10, nodeJ: 11, materialId: 1, sectionId: 1 }],
    ]),
    supports: new Map([
      [10, { id: 10, nodeId: 10, type: 'pinned' }],
      [11, { id: 11, nodeId: 11, type: 'rollerX' }],
    ]),
    materials: new Map(),
    sections: new Map(),
    loads: [{ type: 'distributed', data: { id: 1, elementId: 20, qI: -4 } }],
    ...over,
  } as unknown as StructureModel;
}

describe('capturing what was drawn', () => {
  it('turns model ids into indices, so the spec survives being re-imported', () => {
    // The store's ids are 10, 11, 20 — a re-imported model will start from 1,
    // so anything referring to ids by number would break.
    const { spec, warnings } = captureModel(model());
    expect(warnings).toEqual([]);
    expect(spec).not.toBeNull();
    expect(spec!.nodes).toEqual([[0, 0], [6, 0]]);
    expect(spec!.elements).toEqual([[0, 1]]);
    expect(spec!.supports).toEqual([{ node: 0, type: 'pinned' }, { node: 1, type: 'rollerX' }]);
    expect(spec!.distributedLoads).toEqual([{ element: 0, qI: -4, qJ: -4 }]);
  });

  it('captures nodal loads, dropping components that are zero', () => {
    const { spec } = captureModel(model({
      loads: [{ type: 'nodal', data: { id: 1, nodeId: 11, fx: 0, fy: -12, mz: 0 } }],
    } as never));
    expect(spec!.nodalLoads).toEqual([{ node: 1, fy: -12 }]);
  });

  it('a captured structure passes the same lint the shipped ones do', () => {
    const { spec } = captureModel(model());
    const ex = { ...getExerciseSpecs()[0], model: spec! };
    expect(lintExercise(ex)).toEqual([]);
  });
});

describe('what cannot be captured is reported, never silently dropped', () => {
  it('an empty canvas refuses instead of producing an empty exercise', () => {
    const r = captureModel(model({ nodes: new Map(), elements: new Map() } as never));
    expect(r.spec).toBeNull();
    expect(r.warnings[0].kind).toBe('empty');
  });

  it('a structure with no supports is flagged as a mechanism', () => {
    const r = captureModel(model({ supports: new Map() } as never));
    expect(r.warnings.some((w) => w.kind === 'noSupports')).toBe(true);
  });

  it('a load type with no representation is named, not skipped in silence', () => {
    const r = captureModel(model({
      loads: [{ type: 'thermal', data: { id: 1, elementId: 20, dT: 30 } }],
    } as never));
    expect(r.warnings.some((w) => w.kind === 'unsupportedLoad')).toBe(true);
    expect(r.warnings.find((w) => w.kind === 'unsupportedLoad')!.detail).toContain('thermal');
  });

  it('out-of-plane nodes are flagged, because an exercise is a plane problem', () => {
    const r = captureModel(model({
      nodes: new Map([[10, { id: 10, x: 0, y: 0 }], [11, { id: 11, x: 6, y: 0, z: 3 }]]),
    } as never));
    expect(r.warnings.some((w) => w.kind === 'threeDimensional')).toBe(true);
  });

  it('several load cases are merged, and the teacher is told', () => {
    const r = captureModel(model({
      loads: [
        { type: 'nodal', data: { id: 1, nodeId: 11, fy: -5, caseId: 'D' } },
        { type: 'nodal', data: { id: 2, nodeId: 11, fy: -3, caseId: 'L' } },
      ],
    } as never));
    expect(r.warnings.some((w) => w.kind === 'multipleLoadCases')).toBe(true);
    expect(r.spec!.nodalLoads!.length).toBe(2);
  });
});

describe('saving and reopening', () => {
  it('round-trips an exercise unchanged', () => {
    const original = getExerciseSpecs()[0];
    const back = fromFile(toFile(original));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.exercise.model).toEqual(original.model);
  });

  it('refuses a file that is not an exercise, saying so plainly', () => {
    expect(fromFile('not json').ok).toBe(false);
    expect((fromFile('{"nodes":[]}') as { error: string }).error).toMatch(/not a Stabileo exercise/);
    const noStructure = JSON.stringify({
      stabileoExercise: 1,
      exercise: { id: 'x', title: 't', difficulty: 'easy', category: 'statics', model: { nodes: [], elements: [] } },
    });
    expect((fromFile(noStructure) as { error: string }).error).toMatch(/no structure/);
  });

  it('refuses a file from a newer Stabileo rather than half-reading it', () => {
    const future = JSON.stringify({ stabileoExercise: EXERCISE_FILE_VERSION + 1, exercise: {} });
    const r = fromFile(future);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer Stabileo/);
  });
});

describe('capturing what a parametric exercise needs', () => {
  it('reads a nodal load the way the store writes it (fz, my)', () => {
    const { spec } = captureModel(model({
      loads: [{ type: 'nodal', data: { id: 1, nodeId: 11, fx: 0, fz: -12, my: 3 } }],
    } as never));
    expect(spec!.nodalLoads).toEqual([{ node: 1, fy: -12, mz: 3 }]);
  });

  it('keeps hinges and truss bars', () => {
    const { spec, warnings } = captureModel(model({
      nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }], [3, { id: 3, x: 8, y: 0 }]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: true, t: false } }],
        [2, { id: 2, type: 'truss', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 }],
      ]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
      loads: [],
    } as never));
    expect(warnings).toEqual([]);
    expect(spec!.hinges).toEqual([{ element: 0, end: 'end' }]);
    expect(spec!.truss).toEqual([1]);
  });
});
