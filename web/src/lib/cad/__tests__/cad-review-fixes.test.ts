// Regression tests for the PR [9] review fixes:
//   - nextId.loadCase accounts for the optional roof Lr case (was hardcoded 3),
//   - deleting a slab quad prunes its surface load (no dangling load),
//   - restore() tolerates a provenance object missing assumptions/layerMappings,
//   - a .ded whose quad references a missing node is rejected (referential
//     integrity), not loaded with a dangling shell.
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { serializeProject, deserializeProject } from '../../store/file';
import { parseCadDxf } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { generateRcDraft } from '../draft';
import type { RcDraftAssumptions } from '../types';
import { simplePlanDxf } from './dxf-fixture';

const SOURCE = { fileName: 'plan.dxf', importedAtIso: '2026-06-09T12:00:00.000Z' };

function makeDraft(extra: Partial<RcDraftAssumptions> = {}) {
  const doc = parseCadDxf(simplePlanDxf(), 'plan.dxf');
  const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
  const a: RcDraftAssumptions = {
    nFloors: 2, storyHeights: [3, 3], concreteGrade: 'H-30',
    columnSection: { b: 0.35, h: 0.35 }, beamSection: { b: 0.2, h: 0.5 },
    slabThickness: 0.15, wallThickness: 0.2, baseSupport: 'fixed3d',
    deadLoad: 3, liveLoad: 2, generateCombos: true,
    meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 2, splitBeams: true, snapTolerance: 0.01,
    ...extra,
  };
  return generateRcDraft(plan, a, SOURCE);
}

beforeEach(() => {
  modelStore.clear();
  historyStore.clear();
});

describe('CAD review fixes', () => {
  it('nextId.loadCase leaves room past the roof Lr case', () => {
    // No Lr: D, L → next free case id is 3.
    const noLr = makeDraft();
    expect(noLr.snapshot.loadCases.length).toBe(2);
    expect(noLr.snapshot.nextId.loadCase).toBe(3);

    // With Lr: D, L, Lr occupy ids 1/2/3 → next free id must be 4, not 3
    // (a hardcoded 3 would collide with the existing Lr case).
    const withLr = makeDraft({ roofLiveLoad: 1 });
    expect(withLr.snapshot.loadCases.length).toBe(3);
    expect(withLr.snapshot.nextId.loadCase).toBe(4);
  });

  it('deleting a slab quad prunes its surface load (no dangling load)', () => {
    modelStore.restore(makeDraft().snapshot);
    const surfaceLoad = modelStore.model.loads.find((l) => l.type === 'surface3d');
    expect(surfaceLoad).toBeDefined();
    const quadId = (surfaceLoad!.data as { quadId: number }).quadId;
    const loadsBefore = modelStore.model.loads.length;

    modelStore.removeQuad(quadId);

    expect(modelStore.model.quads.has(quadId)).toBe(false);
    expect(modelStore.model.loads.length).toBeLessThan(loadsBefore);
    expect(modelStore.model.loads.some((l) =>
      (l.type === 'surface3d' || l.type === 'thermalQuad3d') && (l.data as { quadId: number }).quadId === quadId,
    )).toBe(false);
  });

  it('restore() tolerates provenance missing assumptions/layerMappings', () => {
    const snap = makeDraft().snapshot;
    // Simulate a hand-edited/older .ded: provenance present but partial.
    (snap as { provenance?: unknown }).provenance = { source: 'cad-dxf', status: 'cad-draft-unreviewed' };
    expect(() => modelStore.restore(snap)).not.toThrow();
    expect(modelStore.model.provenance?.status).toBe('cad-draft-unreviewed');
    expect(modelStore.model.provenance?.assumptions).toEqual([]);
    expect(modelStore.model.provenance?.layerMappings).toEqual([]);
  });

  it('rejects a .ded whose quad references a missing node', () => {
    modelStore.restore(makeDraft().snapshot);
    const ded = JSON.parse(serializeProject());
    // Point the first quad's first corner at a node id that does not exist.
    ded.snapshot.quads[0][1].nodes[0] = 999999;
    expect(deserializeProject(JSON.stringify(ded))).toBe(false);
  });
});
