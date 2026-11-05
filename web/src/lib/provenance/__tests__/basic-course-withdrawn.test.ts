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
  assessProject(m, { resultsVersion: version, analyses } as unknown as SolveStamp, '2d').changes.map((c) => c.id).filter((id) => id.endsWith('-withdrawn')).sort();

describe('results version 15: the Basic course units of version 14 are withdrawn', () => {
  it('tells a Basic frame solved with version 14 that its plastic, second-order and influence-line results went back', () => {
    expect(ids(frame(), 14, ['linear', 'plastic', 'pdelta'])).toEqual([
      'basic-influence-line-moment-sign-withdrawn',
      'basic-plastic-unloading-hinges-withdrawn',
      'basic-second-order-split-members-withdrawn',
      'safety-containment-diagnostics',
    ]);
  });

  it('names the plastic withdrawal only to projects that ran plastic', () => {
    expect(ids(frame(), 14, ['linear'])).toEqual(['basic-influence-line-moment-sign-withdrawn', 'safety-containment-diagnostics']);
  });

  it('names no withdrawal to a project solved with version 15, nor to a PRO model', () => {
    expect(ids(frame(), 15, ['linear', 'plastic', 'pdelta']).filter((id) => id.startsWith('basic-'))).toEqual([]);
    const pro = assessProject({ ...frame(), analysisMode: 'pro' }, { resultsVersion: 14, analyses: ['linear', 'plastic', 'pdelta', 'buckling'] } as unknown as SolveStamp, 'pro');
    expect(pro.changes.map((c) => c.id).filter((id) => id.startsWith('basic-'))).toEqual([]);
  });
});
