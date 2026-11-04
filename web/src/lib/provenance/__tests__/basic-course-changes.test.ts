import { describe, expect, it } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

const frame = (extra: Partial<FeatureSnapshot> = {}): FeatureSnapshot => ({
  analysisMode: '2d',
  materials: [[1, { id: 1, name: 'Steel', e: 200000, nu: 0.3, rho: 78.5 }]] as never,
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]] as never,
  supports: [[1, { nodeId: 1, type: 'fixed' }]] as never,
  loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }] as never,
  ...extra,
});
const ids = (m: FeatureSnapshot, version: number, analyses: string[]) =>
  assessProject(m, { resultsVersion: version, analyses } as unknown as SolveStamp, '2d').changes.map((c) => c.id);

describe('results version 14: the Basic course units', () => {
  it('tells a Basic frame solved with version 13 about the plastic and second-order changes it ran', () => {
    const seen = ids(frame(), 13, ['linear', 'plastic', 'pdelta']);
    expect(seen).toContain('basic-plastic-closes-unloading-hinges');
    expect(seen).toContain('basic-second-order-split-members');
    expect(seen).toContain('basic-influence-line-moment-sign');
  });

  it('names plastic only to projects that ran it', () => {
    expect(ids(frame(), 13, ['linear'])).not.toContain('basic-plastic-closes-unloading-hinges');
  });

  it('says nothing to a project already solved with version 14, nor to a PRO model', () => {
    expect(ids(frame(), 14, ['linear', 'plastic', 'pdelta'])).toEqual([]);
    const pro = assessProject({ ...frame(), analysisMode: 'pro' }, { resultsVersion: 13, analyses: ['linear', 'plastic', 'pdelta', 'buckling'] } as unknown as SolveStamp, 'pro');
    expect(pro.changes.map((c) => c.id).filter((id) => id.startsWith('basic-'))).toEqual([]);
  });
});
