import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { stampSolve } from '../solve-stamp';
import type { FeatureSnapshot } from '../model-features';

const ids = ['snow-roof-step', 'snow-roof-rotation', 'snow-surface-regions', 'snow-ridge-orientations', 'snow-orientation-factors', 'snow-surface-support', 'snow-drift-coverage', 'snow-local-boundaries', 'snow-member-loading', 'snow-fallback-runs', 'snow-roof-connectivity', 'snow-flat-frame', 'snow-ridge-mesh', 'snow-crossing-profile', 'snow-panel-geometry', 'snow-quadratic-intensity'];

function snapshot(type = 'S', generatedBy: string | undefined = 'load-plan'): FeatureSnapshot {
  return { loadCases: [{ id: 1, type }], loads: [{ type: 'distributed', data: { caseId: 1, elementId: 1, q: -1, generatedBy } }] };
}

for (const mode of ['2d', '3d', 'pro']) for (const analysis of ['linear', 'pdelta', 'plastic'] as const) {
  it(`re-solving old generated snow retains the regeneration notice in ${mode} after ${analysis}`, () => {
    const assessment = assessProject(snapshot(), stampSolve(analysis, null), mode, RESULT_CHANGES, undefined, 0);
    for (const id of ids) expect(assessment.changes.map(c => c.id)).toContain(id);
  });
}

it('current loads and solve clear both snow notices', () => {
  const assessment = assessProject(snapshot(), stampSolve('linear', null), '3d', RESULT_CHANGES, undefined, RESULT_CHANGES.currentResultsVersion);
  for (const id of ids) expect(assessment.changes.map(c => c.id)).not.toContain(id);
});

it('manual snow is unchanged and generated non-snow retains the shared panel notice', () => {
  const manual = assessProject(snapshot('S', ''), null);
  for (const id of ids) expect(manual.changes.map(c => c.id)).not.toContain(id);
  const generated = assessProject(snapshot('D'), null);
  expect(generated.changes.map(c => c.id).filter(id => ids.includes(id))).toEqual(['snow-panel-geometry']);
});
