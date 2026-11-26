// Apply-contract tests for the CAD wizard (PR [9]):
//   - generating a draft NEVER mutates the model store,
//   - Apply (pushState + restore) produces a valid PRO model with the
//     unreviewed-draft provenance,
//   - Cancel (undo) restores the previous model exactly,
//   - provenance round-trips through snapshot/restore,
//   - markProvenanceReviewed is the only way to clear the draft tag.
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

function makeDraft() {
  const doc = parseCadDxf(simplePlanDxf(), 'plan.dxf');
  const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
  const a: RcDraftAssumptions = {
    nFloors: 2, storyHeights: [3, 3], concreteGrade: 'H-30',
    columnSection: { b: 0.35, h: 0.35 }, beamSection: { b: 0.2, h: 0.5 },
    slabThickness: 0.15, wallThickness: 0.2, baseSupport: 'fixed3d',
    deadLoad: 3, liveLoad: 2, generateCombos: true,
    meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 2, splitBeams: true, snapTolerance: 0.01,
  };
  return generateRcDraft(plan, a, SOURCE);
}

/** A small but non-empty starting model so "restores exactly" means something. */
function seedModel() {
  modelStore.clear();
  const n1 = modelStore.addNode(0, 0);
  const n2 = modelStore.addNode(5, 0);
  modelStore.addElement(n1, n2, 'frame');
  modelStore.addSupport(n1, 'pinned');
}

beforeEach(() => {
  seedModel();
  historyStore.clear();
});

/** Model content (everything the user sees), excluding `nextId`: id counters
 *  are NOT restored by undo anywhere in the app — pre-existing store behavior
 *  (snapshot aliases the live counter object); ids only ever grow, so this is
 *  benign and out of scope for PR [9]. */
function contentOf(snap: ReturnType<typeof modelStore.snapshot>) {
  const { nextId: _nextId, ...content } = snap;
  return content;
}

describe('CAD draft apply contract', () => {
  it('draft generation does not mutate the model store', () => {
    const before = modelStore.snapshot();
    makeDraft();
    expect(contentOf(modelStore.snapshot())).toEqual(contentOf(before));
    expect(modelStore.nodes.size).toBe(2);
    expect(modelStore.elements.size).toBe(1);
  });

  it('a failed Generate Draft leaves the model untouched (containment contract)', () => {
    // Mirrors CadImportWizard.goPreview(): generation is wrapped in try/catch and
    // the store is only ever mutated by Apply (handleApply). An unexpected throw
    // during generation must surface as a caught error, never a partial model.
    const before = modelStore.snapshot();
    let caught: unknown = null;
    try {
      // A null plan forces an internal throw, standing in for any malformed-CAD
      // failure the generator might raise.
      generateRcDraft(null as never, {} as never, SOURCE);
    } catch (e) {
      caught = e; // wizard would set genError + stay on step 3 here
    }
    expect(caught).not.toBeNull();
    // No mutation: the seeded model is byte-for-byte intact, no draft provenance.
    expect(contentOf(modelStore.snapshot())).toEqual(contentOf(before));
    expect(modelStore.model.provenance).toBeUndefined();
    expect(modelStore.nodes.size).toBe(2);
    expect(modelStore.elements.size).toBe(1);
  });

  it('Apply restores the draft snapshot with provenance; Cancel undoes exactly', () => {
    const before = modelStore.snapshot();
    const draft = makeDraft();

    // Apply (the wizard's confirmation path).
    historyStore.pushState();
    modelStore.restore(draft.snapshot);

    expect(modelStore.nodes.size).toBe(draft.counts.nodes);
    expect(modelStore.elements.size).toBe(draft.counts.columns + draft.counts.beams);
    expect(modelStore.model.quads.size).toBe(draft.counts.slabQuads + draft.counts.wallQuads);
    expect(modelStore.supports.size).toBe(draft.counts.supports);
    expect(modelStore.loads.length).toBe(draft.counts.loads);
    expect(modelStore.model.provenance?.status).toBe('cad-draft-unreviewed');
    expect(modelStore.model.provenance?.fileName).toBe('plan.dxf');

    // Cancel / undo restores the previous model content exactly (no provenance).
    historyStore.undo();
    expect(contentOf(modelStore.snapshot())).toEqual(contentOf(before));
    expect(modelStore.model.provenance).toBeUndefined();
  });

  it('provenance round-trips through snapshot/restore', () => {
    const draft = makeDraft();
    modelStore.restore(draft.snapshot);
    const snap = modelStore.snapshot();
    expect(snap.provenance).toBeDefined();
    expect(snap.provenance!.assumptions.length).toBeGreaterThan(0);

    modelStore.clear();
    expect(modelStore.model.provenance).toBeUndefined();
    modelStore.restore(snap);
    expect(modelStore.model.provenance?.status).toBe('cad-draft-unreviewed');
    expect(modelStore.model.provenance?.layerMappings.length)
      .toBe(draft.provenance.layerMappings.length);
  });

  it('provenance survives a .ded save/load round-trip', () => {
    const draft = makeDraft();
    modelStore.restore(draft.snapshot);
    const ded = serializeProject();
    expect(ded).toContain('cad-draft-unreviewed');

    modelStore.clear();
    expect(modelStore.model.provenance).toBeUndefined();
    expect(deserializeProject(ded)).toBe(true);
    expect(modelStore.model.provenance?.status).toBe('cad-draft-unreviewed');
    expect(modelStore.model.provenance?.fileName).toBe('plan.dxf');
    expect(modelStore.model.provenance?.assumptions.some((s) =>
      s.includes('replicated across all 2 floor(s)'))).toBe(true);
  });

  it('markProvenanceReviewed clears the draft tag explicitly', () => {
    const draft = makeDraft();
    modelStore.restore(draft.snapshot);
    modelStore.markProvenanceReviewed();
    expect(modelStore.model.provenance?.status).toBe('reviewed');
    // The rest of the provenance (assumptions, mappings) is preserved.
    expect(modelStore.model.provenance?.assumptions.length)
      .toBe(draft.provenance.assumptions.length);
  });
});
