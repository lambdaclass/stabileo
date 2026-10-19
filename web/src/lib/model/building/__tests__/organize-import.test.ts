import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore } from '../../../store';
import { parseCadDxf } from '../../../cad/parse';
import { suggestLayerMappings, extractArchPlan } from '../../../cad/classify';
import { generateRcDraft } from '../../../cad/draft';
import type { RcDraftAssumptions } from '../../../cad/types';
import { simplePlanDxf } from '../../../cad/__tests__/dxf-fixture';
import { organizeImported } from '../organize-import';
import { physicalGroups } from '../../../store/physical';

describe('a drawing imported as a building', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('gets its grid from its columns and its pieces as elements, in the import\'s one undo step', () => {
    const doc = parseCadDxf(simplePlanDxf(), 'plan.dxf');
    const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
    const a: RcDraftAssumptions = {
      nFloors: 2, storyHeights: [3, 3], concreteGrade: 'H-30',
      columnSection: { b: 0.35, h: 0.35 }, beamSection: { b: 0.2, h: 0.5 },
      slabThickness: 0.15, wallThickness: 0.2, baseSupport: 'fixed3d',
      deadLoad: 3, liveLoad: 2, generateCombos: true,
      meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 2, splitBeams: true, snapTolerance: 0.01,
    };
    const draft = generateRcDraft(plan, a, { fileName: 'plan.dxf', importedAtIso: '2026-10-11T00:00:00.000Z' });
    modelStore.batch(() => { modelStore.restore(draft.snapshot); organizeImported(); });
    expect(modelStore.grid?.levels.length).toBeGreaterThanOrEqual(2);
    const kinds = new Set(physicalGroups().map((g) => g.physical.kind));
    expect(kinds.has('column')).toBe(true);
    expect(kinds.has('beam')).toBe(true);
    historyStore.undo();
    expect(modelStore.nodes.size).toBe(0);
    expect(physicalGroups()).toHaveLength(0);
  });
});
