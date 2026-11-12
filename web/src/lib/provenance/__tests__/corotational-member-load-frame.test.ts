import { describe, expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

const id = 'corotational-member-load-frame';
const version = RESULT_CHANGES.changes.find(c => c.id === id)!.resultsVersion;
const model = (loads: unknown[]): FeatureSnapshot => ({
  elements: [[1, { id: 1, type: 'frame' }]], loads,
} as FeatureSnapshot);
const changes = (loads: unknown[], analyses = ['nonlinear'], v = version - 1) =>
  assessProject(model(loads), { resultsVersion: v, analyses, recorded: ['linear', 'nonlinear'] } as SolveStamp, 'pro').changes.map(c => c.id);
const member = [{ type: 'distributed', data: { elementId: 1, qI: -2, qJ: -2 } }];

describe('member-load frame notice (#1952)', () => {
  it.fails('excludes nodal-only nonlinear models', () => {
    expect(changes([{ type: 'nodal', data: { nodeId: 1, fz: -2 } }])).not.toContain(id);
  });

  it('includes member-loaded nonlinear models before this change', () => {
    expect(changes(member)).toContain(id);
    expect(changes(member, ['linear'])).not.toContain(id);
    expect(changes(member, ['nonlinear'], version)).not.toContain(id);
  });
});
