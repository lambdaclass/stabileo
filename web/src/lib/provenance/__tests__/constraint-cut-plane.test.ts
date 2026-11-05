import { expect, it } from 'vitest';
import { RESULT_CHANGES } from '../full-registry';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

it('asks a 2D model with constraints solved before #466 to be re-cut, and nothing else', () => {
  const constraints = [{ type: 'equalDof', masterNode: 1, slaveNode: 2, dofs: ['ux'] }];
  const changes = (model: FeatureSnapshot, mode: string, version: number) =>
    assessProject(model, { resultsVersion: version, analyses: ['linear'] } as SolveStamp, mode).changes.map((c) => c.id);
  const fixed = RESULT_CHANGES.changes.find((c) => c.id === 'constraint-cut-plane')!.resultsVersion;
  expect(changes({ analysisMode: '2d', constraints }, '2d', fixed - 1)).toContain('constraint-cut-plane');
  expect(changes({ analysisMode: '2d', constraints }, '2d', fixed)).not.toContain('constraint-cut-plane');
  expect(changes({ analysisMode: 'pro', constraints }, 'pro', fixed - 1)).not.toContain('constraint-cut-plane');
  expect(changes({ analysisMode: '2d' }, '2d', fixed - 1)).not.toContain('constraint-cut-plane');
});
