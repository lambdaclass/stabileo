import { describe, expect, it } from 'vitest';
import quantities from 'virtual:result-change-quantities';
import { declaresMove } from '../../legacy-projects/legacy';
import { assessProject, conditionHolds } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { modelFeatures, type FeatureSnapshot } from '../model-features';

const stagedIds = ['staged-free-stiffness', 'staged-orphan-rotations'];
const ids = (snapshot: FeatureSnapshot) => assessProject(snapshot, null).changes.map(change => change.id);
const entry = (id: string) => RESULT_CHANGES.changes.find(change => change.id === id)!;
const frame = (analysisMode: string, phases?: unknown[]): FeatureSnapshot => ({
  analysisMode,
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, releaseI: { rz: true } }]],
  ...(phases === undefined ? {} : { designData: { site: { phases } } }),
} as FeatureSnapshot);

describe.skip('known wrong result: #1846 result-change scope', () => {
  it.each(['2d', '3d', 'pro'])('distinguishes saved construction phases from an ordinary %s model', analysisMode => {
    for (const phases of [undefined, []]) {
      const snapshot = frame(analysisMode, phases);
      expect(modelFeatures(snapshot)).not.toContain('stagedConstruction');
      for (const id of [...stagedIds, 'staged-moment-subspaces']) expect(ids(snapshot)).not.toContain(id);
    }
    const staged = frame(analysisMode, [{ id: 'first', name: 'first' }]);
    expect(modelFeatures(staged)).toContain('stagedConstruction');
    for (const id of [...stagedIds, 'staged-moment-subspaces']) expect(ids(staged)).toContain(id);
    const unreleased = { ...staged, elements: [[1, { ...staged.elements![0][1], releaseI: {} }]] } as FeatureSnapshot;
    expect(ids(unreleased)).toContain('staged-free-stiffness');
    expect(ids(unreleased)).toContain('staged-moment-subspaces');
    expect(ids(unreleased)).not.toContain('staged-orphan-rotations');
  });

  it.each(['plane2D', 'space3D'])('retains kinematic constraints, offsets and positive springs in %s', dimension => {
    for (const feature of ['constraints', 'eccentricities', 'springs', 'stagedConstruction']) {
      expect(conditionHolds(entry('staged-moment-subspaces').when!, new Set([dimension, feature]))).toBe(true);
    }
    for (const feature of ['members', 'shells', 'trussMembers', 'hinges']) {
      expect(conditionHolds(entry('staged-moment-subspaces').when!, new Set([dimension, feature]))).toBe(false);
    }
  });

  it.each(['2d', '3d', 'pro'])('retains phase notices for shell-only and constraint-only %s histories', analysisMode => {
    const base = { ...frame(analysisMode, [{ id: 'first' }]), elements: [] };
    for (const snapshot of [
      { ...base, quads: [[1, {}]] } as FeatureSnapshot,
      { ...base, constraints: [{ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0] }] },
    ]) expect(ids(snapshot)).toContain('staged-free-stiffness');
  });

  it.each(['2d', '3d', 'pro'])('checks spring presence on both sides of zero in %s', analysisMode => {
    for (const kx of [0, 1]) {
      const snapshot = { analysisMode, supports: [[1, { nodeId: 1, type: 'custom', kx }]] } as FeatureSnapshot;
      expect(ids(snapshot).includes('staged-moment-subspaces')).toBe(kx > 0);
    }
  });

  it.each([...stagedIds, 'kinematic-translation-motion', 'staged-moment-subspaces'])('%s cannot explain unrelated base forces or displacements', id => {
    const change = { ...entry(id), quantities: quantities[id] };
    for (const path of ['base.elementForces[e1].nStart', 'base.displacements[n1].uz', 'case[1].reactions[n1].mz']) {
      expect(declaresMove(change, path), path).toBe(false);
    }
    expect(declaresMove(change, 'base.finalResults.displacements[n1].uz')).toBe(true);
    expect(declaresMove(change, 'base.stages[0].results.displacements[n1].uz')).toBe(true);
    expect(declaresMove(change, 'solve.ok')).toBe(true);
  });
});
