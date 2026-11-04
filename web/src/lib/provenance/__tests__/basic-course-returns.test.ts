import { describe, expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
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
const ids = (m: FeatureSnapshot, version: number, analyses: string[], mode: '2d' | 'pro' = '2d') =>
  assessProject(m, { resultsVersion: version, analyses } as unknown as SolveStamp, mode).changes.map((c) => c.id).filter((id) => id.endsWith('-returns')).sort();
const versionOf = (id: string) => RESULT_CHANGES.changes.find((c) => c.id === id)!.resultsVersion;

describe('the Basic course units return with their review fixes', () => {
  it('tells a Basic frame solved before it that the moment influence line takes sagging as positive again', () => {
    const v = versionOf('basic-influence-line-moment-sign-returns');
    expect(v).toBeGreaterThan(15);
    expect(ids(frame(), v - 1, ['linear'])).toContain('basic-influence-line-moment-sign-returns');
    expect(ids(frame(), 15, ['linear'])).toContain('basic-influence-line-moment-sign-returns');
    expect(ids(frame(), v, ['linear'])).not.toContain('basic-influence-line-moment-sign-returns');
    expect(ids({ ...frame(), analysisMode: 'pro' }, v - 1, ['linear'], 'pro')).toEqual([]);
  });

  it('tells a Basic P-Δ or buckling run solved before it that members are split at the solve again, and no linear-only run', () => {
    const v = versionOf('basic-second-order-split-members-returns');
    expect(v).toBeGreaterThan(versionOf('basic-influence-line-moment-sign-returns'));
    for (const a of ['pdelta', 'buckling']) expect(ids(frame(), v - 1, ['linear', a])).toContain('basic-second-order-split-members-returns');
    expect(ids(frame(), v - 1, ['linear'])).not.toContain('basic-second-order-split-members-returns');
    expect(ids(frame(), v, ['linear', 'pdelta'])).not.toContain('basic-second-order-split-members-returns');
  });

  it('writes each returning entry in the six languages', () => {
    for (const c of RESULT_CHANGES.changes.filter((x) => x.id.endsWith('-returns'))) {
      const e = c as unknown as { title: Record<string, string>; explanation: Record<string, string> };
      for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr']) {
        expect(e.title[locale]?.trim(), `${c.id} title.${locale}`).toBeTruthy();
        expect(e.explanation[locale]?.trim(), `${c.id} explanation.${locale}`).toBeTruthy();
      }
    }
  });
});
