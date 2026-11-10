import { describe, expect, it } from 'vitest';
import { assessProject, conditionHolds } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { ANALYSIS_KINDS, type FeatureSnapshot } from '../model-features';
import { unknownStamp, type SolveStamp } from '../solve-stamp';

const changeId = 'fibre-load-control-refinement';
const change = RESULT_CHANGES.changes.find((entry) => entry.id === changeId)!;
const stamp = (analyses: SolveStamp['analyses']): SolveStamp => ({
  ...unknownStamp(),
  resultsVersion: change.resultsVersion - 1,
  analyses,
  recorded: [...ANALYSIS_KINDS],
});
const model = (type = 'concrete_hognestad', sectionId = 1, memberType = 'frame') => ({
  analysisMode: '2d',
  elements: [[1, { id: 1, type: memberType, nodeI: 1, nodeJ: 2, materialId: 1, sectionId }]],
  fiberSections: { '1': { materials: [{ type }] } },
}) satisfies FeatureSnapshot & { fiberSections: Record<string, { materials: { type: string }[] }> };
const concerns = (snapshot: FeatureSnapshot, analyses: SolveStamp['analyses'] = ['nonlinear']) =>
  assessProject(snapshot, stamp(analyses)).changes.some((entry) => entry.id === changeId);

describe('concrete fibre load-control refinement applicability (#1923)', () => {
  it('excludes nonlinear frames without assigned Hognestad fibre sections', () => {
    const { fiberSections, ...ordinary } = model();
    expect(concerns(ordinary)).toBe(false);
    expect(concerns(model('steel_bilinear'))).toBe(false);
    expect(concerns(model('elastic'))).toBe(false);
    expect(concerns(model('concrete_hognestad', 2))).toBe(false);
    for (const type of ['truss', 'cable']) expect(concerns(model('concrete_hognestad', 1, type))).toBe(false);
  });

  it('concerns assigned Hognestad sections only in 2D nonlinear analyses', () => {
    expect(concerns(model())).toBe(true);
    expect(concerns({ ...model(), analysisMode: 'pro' })).toBe(false);
    expect(concerns(model(), ['linear'])).toBe(false);
    expect(concerns(model(), ['modal'])).toBe(false);
    expect(concerns(model(), [])).toBe(false);
    expect(assessProject(model(), { ...stamp(['nonlinear']), resultsVersion: change.resultsVersion }).changes.map((entry) => entry.id)).not.toContain(changeId);
  });

  it('requires every declared feature and records PR 1923', () => {
    const features = ['plane2D', 'frameMembers', 'hognestadFiberMembers', 'analysis:nonlinear'];
    expect(conditionHolds(change.when ?? {}, new Set(features))).toBe(true);
    for (const omitted of features) {
      expect(conditionHolds(change.when ?? {}, new Set(features.filter((feature) => feature !== omitted)))).toBe(false);
    }
    expect(change.prs).toEqual([1923]);
  });
});
