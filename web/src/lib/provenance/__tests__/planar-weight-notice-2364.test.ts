import { afterEach, expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { GRAVITY_SELF_WEIGHT, type SelfWeightLoad } from '../../engine/analysis-settings';
import { createRecheckStore } from '../../store/recheck.svelte';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const notice = RESULT_CHANGES.changes.find(change => change.id === 'exact-plane-self-weight')!;
const gravity = { caseId: 1, ...GRAVITY_SELF_WEIGHT };
const loadCases = [{ id: 1, type: 'D', name: 'Dead' }, { id: 2, type: 'D', name: 'Other dead' }];
const beam: FeatureSnapshot = {
  analysisMode: '2d',
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
  supports: [[1, { nodeId: 1, type: 'fixed' }]],
  loadCases,
};
const variantRules: Record<string, SelfWeightLoad[]> = {
  'signed and scoped weight': [{ ...gravity, factor: 2, elements: [1] }],
  'member scope alone': [{ ...gravity, elements: [1] }],
  'group scope alone': [{ ...gravity, groupId: 1 }],
  'signed factor alone': [{ ...gravity, factor: 1 }],
  'in-plane horizontal weight': [{ ...gravity, direction: 'X' }],
  'out-of-plane weight': [{ ...gravity, direction: 'Y' }],
  'zero factor': [{ ...gravity, factor: 0 }],
  'two conventional rules': [gravity, { ...gravity, caseId: 2 }],
};

const regression = process.env.RUN_KNOWN_WRONG === '2364' ? it : it.skip;

afterEach(() => vi.unstubAllGlobals());

for (const mode of ['production', 'test'] as const) {
  for (const kind of ['linear', 'pdelta', 'nonlinear'] as const) {
    const atRollout = () => {
      vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode(mode));
      return { ...stampSolve(kind, null), resultsVersion: notice.resultsVersion };
    };
    const beforeRollout = () => ({ ...atRollout(), resultsVersion: notice.resultsVersion - 1 });

    for (const [label, selfWeight] of Object.entries(variantRules)) {
      regression(`known wrong result: #2364 ${mode} ${kind} rechecks ${label} before the planar weight rollout`, () => {
        const snapshot = { ...beam, analysis: { selfWeight } };
        expect(assessProject(snapshot, beforeRollout()).changes).toContainEqual(notice);
        expect(assessProject(snapshot, atRollout()).changes).not.toContainEqual(notice);
        expect(assessProject(snapshot, { ...atRollout(), resultsVersion: notice.resultsVersion + 1 }).changes).not.toContainEqual(notice);
      });
    }

    regression(`known wrong result: #2364 ${mode} ${kind} blocks on planar weight when opening and recovering an unread notice`, async () => {
      const solvedWith = beforeRollout();
      const snapshot = { ...beam, analysis: { selfWeight: variantRules['signed and scoped weight']! }, solvedWith };
      const store = createRecheckStore();
      store.openProject(snapshot);
      await vi.waitFor(() => expect(store.pending).toBe(false));
      expect(store.assessment?.changes).toContainEqual(notice);
      expect(store.noticeOpen).toBe(true);
      expect(store.stale).toBe(true);
      const pendingRecheckNotice = store.captureNotice();
      expect(pendingRecheckNotice?.stamp).toEqual(solvedWith);

      const restored = createRecheckStore();
      restored.openProject({ ...beam, solvedWith: stampSolve('linear', atRollout()), pendingRecheckNotice });
      await vi.waitFor(() => expect(restored.pending).toBe(false));
      expect(restored.assessment?.changes).toContainEqual(notice);
      expect(restored.noticeOpen).toBe(true);
      expect(restored.stale).toBe(false);
    });

    it(`${mode} ${kind} keeps unrelated projects outside the planar weight notice`, () => {
      const affected = { ...beam, analysis: { selfWeight: variantRules['signed and scoped weight']! } };
      const controls: FeatureSnapshot[] = [
        beam,
        { ...beam, includeSelfWeight: true },
        { ...beam, analysis: { selfWeight: [] } },
        { ...beam, analysis: { selfWeight: [gravity] }, includeSelfWeight: true },
        { ...affected, analysisMode: '3d' },
        { ...affected, analysisMode: 'pro' },
        { ...affected, elements: [] },
      ];
      for (const snapshot of controls) {
        expect(assessProject(snapshot, beforeRollout()).changes).not.toContainEqual(notice);
      }
    });
  }
}
