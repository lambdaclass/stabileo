import { expect, it } from 'vitest';
import change from '../result-changes/fiber-increment-equilibrium.json';
import { conditionHolds } from '../applicability';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';
import { ANALYSIS_KINDS, modelFeatures, type FeatureSnapshot } from '../model-features';

it('#2223 fiber equilibrium coverage requires an assigned fiber section and nonlinear run', () => {
  for (const analysisMode of ['2d','pro']) for (const material of ['concrete_hognestad','steel_bilinear','elastic']) {
    const snapshot = (sectionId = 1, type = 'frame'): FeatureSnapshot => ({
      analysisMode,
      elements: [[1,{id:1,type,nodeI:1,nodeJ:2,materialId:1,sectionId}]],
      fiberSections: {'1':{materials:[{type:material}]}},
    });
    const features = (model: FeatureSnapshot, analysesRun: string[] = ['nonlinear']) => modelFeatures(model,{analysesRun,analysesRecorded:ANALYSIS_KINDS});
    const covered = (model: FeatureSnapshot, runs?: string[]) => conditionHolds(change.when,features(model,runs));
    expect(covered(snapshot())).toBe(true);
    const {fiberSections,...ordinary} = snapshot();
    expect(covered(ordinary)).toBe(false);
    expect(covered(snapshot(2))).toBe(false);
    for (const type of ['truss','cable']) expect(covered(snapshot(1,type))).toBe(false);
    for (const runs of [[],['linear'],['modal'],['pdelta']]) expect(covered(snapshot(),runs)).toBe(false);
    for (const path of ['nonlinear.displacements[0].uz','nonlinear.reactions[0].rz']) {
      expect(fieldCovered(change,path,[...features(snapshot())])).toBe(true);
      expect(fieldCovered(change,path,[...features(ordinary)])).toBe(false);
    }
  }
});
