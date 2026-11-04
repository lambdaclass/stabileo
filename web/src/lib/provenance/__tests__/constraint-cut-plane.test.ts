import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

it('asks a 2D model with constraints solved before #466 to be re-cut, and nothing else', () => {
  const constraints = [{ type: 'equalDof', masterNode: 1, slaveNode: 2, dofs: ['ux'] }];
  const changes = (model: FeatureSnapshot, mode: string, version: number) =>
    assessProject(model, { resultsVersion: version, analyses: ['linear'] } as SolveStamp, mode).changes.map((c) => c.id);
  expect(changes({ analysisMode: '2d', constraints }, '2d', 7)).toContain('constraint-cut-plane');
  expect(changes({ analysisMode: '2d', constraints }, '2d', 8)).not.toContain('constraint-cut-plane');
  expect(changes({ analysisMode: 'pro', constraints }, 'pro', 7)).not.toContain('constraint-cut-plane');
  expect(changes({ analysisMode: '2d' }, '2d', 7)).not.toContain('constraint-cut-plane');
});
