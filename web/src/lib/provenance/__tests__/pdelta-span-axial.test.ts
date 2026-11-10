import { describe, expect, it } from 'vitest';
import portal from '../../templates/fixtures/3d-portal-frame.json';
import tower from '../../templates/fixtures/3d-tower.json';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

const id = 'pdelta-span-axial';
const version = RESULT_CHANGES.changes.find((c) => c.id === id)!.resultsVersion;
const snapshot = (fixture: typeof portal | typeof tower): FeatureSnapshot => ({
  analysisMode: 'pro',
  materials: fixture.materials.map((m) => [m.id, m]),
  elements: fixture.elements.map((e) => [e.id, e]),
  loads: fixture.loads,
} as unknown as FeatureSnapshot);
const changes = (model: FeatureSnapshot, analyses: string[], v = version - 1) =>
  assessProject(model, { resultsVersion: v, analyses } as unknown as SolveStamp, 'pro').changes.map((c) => c.id);

describe('P-Delta span axial recheck #1329', () => {
  it('#1329: both changed PRO examples receive the recheck notice, including generated self-weight', () => {
    for (const fixture of [portal, tower]) expect(changes(snapshot(fixture), ['linear', 'pdelta'])).toContain(id);
  });

  it('does not flag a linear-only solve or a solve with the correction already applied', () => {
    for (const fixture of [portal, tower]) {
      expect(changes(snapshot(fixture), ['linear'])).not.toContain(id);
      expect(changes(snapshot(fixture), ['linear', 'pdelta'], version)).not.toContain(id);
    }
  });
});
