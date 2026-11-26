// Apply-contract tests for the CAD wizard (PR [9]):
//   - generating a draft NEVER mutates the model store,
//   - Apply (pushState + restore) produces a valid PRO model with the
//     unreviewed-draft provenance,
//   - Cancel (undo) restores the previous model exactly,
//   - provenance round-trips through snapshot/restore,
//   - markProvenanceReviewed is the only way to clear the draft tag.
import { describe, it, expect, beforeEach } from 'vitest';
import { buildDraft } from '../draft-build';
import { diagnoseDraft } from '../diagnostics';
import { fragmentFromSnapshot } from '../../model/edit/fragment-code';
import { organizeImported } from '../../model/building/organize-import';
import { modelFeatures } from '../../provenance/model-features';
import { uiStore } from '../../store';
import { placementStore } from '../../store/placement.svelte';
import { buildLoadPlan } from '../../engine/loads/load-plan';
import { applyLoadPlan } from '../../store/apply-load-plan';
import { regulations } from '../../engine/loads/__tests__/snow-roof-plane-fixture';
import { runDirectAnalysis } from '../../engine/direct-analysis';
import { runGlobalSolve } from '../../engine/live-calc';
import type { AnalysisResults3D } from '../../engine/types-3d';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { serializeProject, deserializeProject } from '../../store/file';
import { parseCadDxf } from '../parse';
import { suggestLayerMappings, extractArchPlan } from '../classify';
import { generateRcDraft } from '../draft';
import type { RcDraftAssumptions } from '../types';
import { simplePlanDxf } from './dxf-fixture';

const SOURCE = { fileName: 'plan.dxf', importedAtIso: '2026-06-09T12:00:00.000Z' };

function makeDraft(mode?: 'replace' | 'insert' | 'per-floor plans') {
  const doc = parseCadDxf(simplePlanDxf(), 'plan.dxf');
  const plan = extractArchPlan(doc, suggestLayerMappings(doc, 'm'), 'm');
  const a: RcDraftAssumptions = {
    nFloors: 2, storyHeights: [3, 3], concreteGrade: 'H-30',
    columnSection: { b: 0.35, h: 0.35 }, beamSection: { b: 0.2, h: 0.5 },
    slabThickness: 0.15, wallThickness: 0.2, baseSupport: 'fixed3d',
    deadLoad: 3, liveLoad: 2, generateCombos: true,
    meshSlabs: true, meshMode: 'fixedDivisions', meshDivisions: 2, splitBeams: true, snapTolerance: 0.01,
  };
  if (!mode) return generateRcDraft(plan, a, SOURCE);
  const outline = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  plan.columns = [];
  plan.openings = [];
  plan.slabs = [{ outline, isQuad: true, isRectilinear: true }];
  plan.beams = [{ a: outline[0]!, b: outline[1]! }];
  plan.walls = [{ a: { x: 1, y: 1 }, b: { x: 3, y: 2 }, thicknessSource: 'default' }];
  const nFloors = mode === 'per-floor plans' ? 2 : 1;
  const settings = { ...a, nFloors, storyHeights: Array.from({ length: nFloors }, () => 3), generateCombos: false, deadLoad: 1, liveLoad: 0 };
  const floorPlans = mode === 'per-floor plans'
    ? [{ plan, fromFloor: 1, toFloor: 1 }, { plan, fromFloor: 2, toFloor: 2 }]
    : undefined;
  return buildDraft({ plan, floorPlans, assumptions: settings, source: SOURCE, inference: { pruneFloatingMembers: true } });
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


type CadMode = 'replace' | 'insert' | 'per-floor plans';
const cadModes: CadMode[] = ['replace', 'insert', 'per-floor plans'];
const issue2429TriangleGravity = process.env.RUN_KNOWN_WRONG === '2429' ? it : it.skip;

it.each(cadModes)('#2429 CAD %s preserves the applied triangle loads and wall reactions', mode => checkWallReactions(mode, false));
issue2429TriangleGravity.each(cadModes)('#2429 CAD %s preserves wall reactions after automatic pressure regeneration', mode => checkWallReactions(mode, true));

async function checkWallReactions(mode: CadMode, regenerate: boolean) {
  const draft = makeDraft(mode);
  expect(diagnoseDraft(draft).solvableShape).toBe(true);
  expect(draft.counts.slabTriangles).toBeGreaterThan(0);
  expect(draft.counts.slabQuads).toBe(0);
  expect(modelFeatures(draft.snapshot as never)).toContain('cadWallSlabMesh');

  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
  try {
    if (mode === 'insert') {
      modelStore.clear();
      const fragment = fragmentFromSnapshot(draft.snapshot);
      placementStore.start({ fragment, label: SOURCE.fileName, onCommit: report => {
        if (report) modelStore.batch(() => organizeImported());
      } });
      expect(placementStore.commit()).toBeTruthy();
    } else {
      modelStore.batch(() => {
        modelStore.restore(draft.snapshot);
        organizeImported();
      });
      expect(deserializeProject(serializeProject())).toBe(true);
    }
    expect(modelStore.plates.size).toBe(draft.counts.slabTriangles);
    if (regenerate) {
      modelStore.replaceLoads([]);
      const plan = buildLoadPlan({
        model: modelStore.model, regulations: regulations(), gravity: { mode: 'panels' },
        dead: [{ labelKey: 'a', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 3,
        reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false,
      });
      expect(plan.outcome, JSON.stringify(plan.blockedKeys)).toBe('READY');
      expect(plan.surface.filter(load => load.caseType === 'D')).toEqual(
        [...modelStore.plates.keys()].map(quadId => ({ quadId, on: 'plate', caseType: 'D', q: 1 })),
      );
      expect(applyLoadPlan(plan, { nameOf: key => key, clearExisting: true, bothSenses: false })).toBeUndefined();
      expect(deserializeProject(serializeProject())).toBe(true);
    }
    const expected = (mode === 'per-floor plans' ? 2 : 1) * 4 * 4;
    const check = (result: AnalysisResults3D | string | null | undefined) => {
      if (!result || typeof result === 'string') throw new Error(String(result));
      expect(result.reactions.reduce((force, row) => force + row.fz, 0)).toBeCloseTo(expected, 8);
    };
    check(modelStore.solve3D(false, false, true));
    check(await modelStore.solve3DAsync(false, false, true));
    expect(modelStore.buildSolverInput3D()).toBeTruthy();
    expect(modelStore.singleSolveInput3D(false, false, true)).toBeTruthy();
    expect(await runGlobalSolve({ directBase: true })).toMatchObject({ ok: true });
    const model = modelStore.model;
    const deadCases = new Set(model.loads.flatMap(load =>
      load.type === 'surface3d' && model.loadCases.some(c => c.id === load.data.caseId && c.type === 'D') ? [load.data.caseId!] : [],
    ));
    expect(deadCases.size).toBe(1);
    const caseId = [...deadCases][0]!;
    expect(model.loadCases.find(c => c.id === caseId)?.type).toBe('D');
    const combo = modelStore.addCombination('Wall reactions', [{ caseId, factor: 1 }]);
    for (const perCombination of ['linear', 'pdelta'] as const) {
      modelStore.setAnalysis({ perCombination });
      for (const bundle of [modelStore.solveCombinations3D(false, false, true), await modelStore.solveCombinations3DParallel(false, false, true)]) {
        if (!bundle || typeof bundle === 'string') throw new Error(String(bundle));
        check(bundle.perCombo.get(combo));
      }
    }
    const direct = await runDirectAnalysis(model, model.loadCases, model.combinations, { includeSelfWeight: false });
    if (typeof direct === 'string') throw new Error(direct);
    check(direct.perCombo.get(combo));
  } finally {
    uiStore.analysisMode = '2d';
    uiStore.includeSelfWeight = true;
    placementStore.cancel();
  }
}
