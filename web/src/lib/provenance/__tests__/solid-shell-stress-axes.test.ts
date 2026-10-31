import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

it('asks older shell models to recheck local stresses, including explicit solid shells', () => {
  for (const geometry of [{ quads: [[1, {}]] }, { plates: [[1, {}]] }, { solidShells: [[1, {}]] }]) {
    const model = { analysisMode: 'pro', ...geometry } as FeatureSnapshot;
    const changes = (version: number) => assessProject(model, { resultsVersion: version, analyses: ['linear'] } as SolveStamp, 'pro').changes.map(c => c.id);
    expect(changes(4)).toContain('solid-shell-local-stress-axes');
    expect(changes(5)).not.toContain('solid-shell-local-stress-axes');
  }
  expect(assessProject({ analysisMode: 'pro' }, { resultsVersion: 4, analyses: ['linear'] } as SolveStamp, 'pro').changes).toEqual([]);
});
