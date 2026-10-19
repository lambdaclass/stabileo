import { collapseVariableResults, collapseVariableEnvelope, collapseVariablePDelta, collapseVariableModes, variableExpansionFor } from '../engine/variable-members';
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { resultsStore } from './results.svelte';
import { certificateStore } from './certificate.svelte';
import { historyStore } from './history.svelte';
import { dsmStepsStore } from './dsmSteps.svelte';
import { fmStepsStore } from './fmSteps.svelte';
import { tabManager } from './tabs.svelte';
import { tourStore } from './tour.svelte';
import { verificationStore } from './verification.svelte';
import { storedRefusal } from './design-refusals';
import { detailingStore } from './detailing.svelte';
import { deflectionChecks } from './serviceability';
import { seismicState } from './seismic-design.svelte';
import { seismicMemberCheckRows } from '../engine/design/check-rows-families';
import { shouldProjectModelToXZ } from '../geometry/coordinate-system';
// Registering the design-code adapters at store-wiring time guarantees the registry
// is populated before any component queries it. Importing for side effects only.
import '../engine/design/adapters/cirsoc201-adapter';
import '../engine/design/adapters/unsupported-adapter';
import { connectionPrompt } from './connection-prompt.svelte';
import { scheduleDefinedLoadsSync, flushDefinedLoadsSync } from './defined-loads';
import { viewVisibility } from './view-state.svelte';

// Wire model mutations to automatically clear stale results.
// This ensures results never persist after the model changes,
// regardless of whether liveCalc is ON or OFF.
//
// UNCONDITIONAL by design: the previous `if (hasAnyResults || hasResults)` guard was
// a micro-optimisation that made the analysis-revision counter conditional, which
// would let a mutation silently fail to advance it and leave a stale result reading
// as current.
// Questions about connections in the old model mean nothing in a replaced one,
// and neither do the ids it had hidden: they would hide unrelated members.
modelStore._setOnReplaced(() => connectionPrompt.clear());
/*
 * A different project: what the last one had hidden (by id) and the load case
 * its self-weight went in mean nothing in it. Opening a file, a tab or a link
 * resets them too (file.ts, tabs, url-sharing), and then sets the project's own.
 * Not on every restore: undo, a what-if slider and an applied edit keep them.
 */
modelStore._setOnNewProject(() => {
  viewVisibility.showAll();
  uiStore.selfWeightCaseId = null;
  // The last floor and footing runs were the previous project's; its own are in its file.
  detailingStore.forgetRuns();
});

// An analysis reads the definitions' loads current, even inside the moment a rewrite waits for.
modelStore._setBeforeAnalysisInput(flushDefinedLoadsSync);

modelStore._setOnMutation(() => {
  resultsStore.clear();
  verificationStore.invalidateAnalysis();
  /*
   * A structural edit retires the current document, as a footing edit does: its drawings and
   * schedule describe the structure before the edit. The bars themselves stay, and say they are
   * out of date through the design fingerprint (`detailingStore.modelStale`); retiring them here
   * would throw away the reinforcement a person may only want to re-check.
   */
  detailingStore.supersedeDocuments();
  // Floor loads kept as definitions follow the edit once the model is still, in its undo step (`defined-loads.ts`).
  scheduleDefinedLoadsSync();
});

/*
 * A design-only edit: a physical element's kind, typology or grouping, a group's name. The solve
 * survives it, because the analysis reads none of it; the design does not, because member kinds,
 * flange widths and slab panels come from it. The verdicts and the retained member contexts are
 * dropped (they are rebuilt from the kept results by computing the demands again), and the
 * current document is retired, as on a structural edit.
 */
modelStore._setOnDesignChange(() => {
  verificationStore.invalidateAnalysis();
  detailingStore.supersedeDocuments();
});

// A reinforcement transaction is NOT a model mutation: forces are unaffected, so
// results and retained demand data survive. Only the affected elements' cached
// provided-reinforcement verification is dropped, so they re-verify immediately from
// the retained demand with zero structural solves.
modelStore._setOnReinforcementCommit((written) => {
  verificationStore.invalidateElements(written);
  /*
   * The other half of the same edit, and it was not here.
   *
   * `rc-selection.ts` states the rule: an edit is retroactive iff EVERY representation of the
   * edited member is rebuilt from the model after it. This hook rebuilt one of them — the
   * verification — and the coordinated assemblies were left holding the bars from before, so
   * the elevation, the schedule and the 3-D cage all went on describing steel the model no
   * longer had. `detailingStore.invalidate` existed and had no caller.
   *
   * Runs on the UNDO path too, through `restoreReinforcementOnly`, which fires the same hook:
   * undoing an edit is an edit, and the assemblies have to follow it back.
   */
  detailingStore.applyEdit(written);
});

// A foundation edit is analysis-neutral and document-INVALIDATING.
//
// Footing and geotechnical mutations deliberately bypass `_setOnMutation`, because a footing
// carries a support reaction rather than contributing stiffness — routing them through it
// cleared the solve on every edit and left every footing reporting "no reaction" at design
// time. But widening a base, or restating an allowable bearing pressure, invalidates the
// footing design and every drawing, schedule and report built from it. PR18 declared that
// edge and never connected it, so a project could edit a footing and keep issuing the
// document that justified the old one.
//
// Non-destructive: `supersedeDocuments` keeps the old revision and its content and moves it
// to the superseded list, because a project that cannot show what it previously issued cannot
// answer the only question that matters after something goes wrong.
modelStore._setOnFoundationChange(() => {
  detailingStore.supersedeDocuments();
});

// Every fresh-solve results publish (setResults3D / setCombinationResults3D) — even
// a plain re-solve with no structural mutation (a self-weight or axis-convention
// toggle) — advances the solve-generation counter. Retained MemberContexts are
// stamped with this at build time, so a re-solve that does NOT rebuild them (as
// live-calc.ts's auto-solve does) makes their display read 'stale' instead of
// silently presenting numbers computed from the superseded forces as current.
// What a snapshot says about the project's own history: what was emitted, and what was
// retouched by hand. Late-bound rather than imported by `model.svelte.ts`, which would close a
// cycle through design-run → verification → regulations. See `project-provenance.ts`.
modelStore._setCaptureProvenance(captureProjectProvenance);

/* Plane results in the drawn axes: the sign of each member, from the geometry the canvas draws. */
resultsStore._setTransverseSignProvider((elementId) => {
  const el = modelStore.elements.get(elementId);
  const a = el && modelStore.nodes.get(el.nodeI), b = el && modelStore.nodes.get(el.nodeJ);
  if (!a || !b) return 1;
  const pa = projectNode(uiStore.drawPlane2D, a), pb = projectNode(uiStore.drawPlane2D, b);
  return transverseSign(pb.x - pa.x, pb.y - pa.y);
});

// Members of variable section are published as one member each, from any analysis that solved
// them as pieces (`engine/variable-members.ts`), the advanced ones included.
resultsStore._setNormalise3D(
  (r) => collapseVariableResults(r, variableExpansionFor(modelStore.model as never)),
  (e) => collapseVariableEnvelope(e, variableExpansionFor(modelStore.model as never)),
  {
    pdelta: (r) => collapseVariablePDelta(r, variableExpansionFor(modelStore.model as never)),
    modes: (r) => collapseVariableModes(r, variableExpansionFor(modelStore.model as never)),
  },
);

// Each base linear solve published is certified in the background (`certificate.svelte.ts`).
resultsStore._setOnStaticPublish((r, dim) => certificateStore.track(r, dim));
resultsStore._setOnComboPublish((pc, pco, dim) => certificateStore.trackCombinations(pc, pco, dim));

resultsStore._setOnResultsPublish(() => {
  verificationStore.bumpSolveGeneration();
});

// Let verificationStore read the current provided reinforcement without importing
// modelStore (which would create a circular dependency).
verificationStore._setReinforcementProvider(
  (elementId) => modelStore.elements.get(elementId)?.reinforcement,
);

// The refusals kept with the project, for a member that has no bars now (an edit after the
// refusal is its own verdict, read from the bars).
verificationStore._setRefusalProvider(
  (elementId) => (modelStore.elements.get(elementId)?.reinforcement ? undefined : storedRefusal(elementId)),
);

// The members the detailing left an unresolved anchorage, a bar outside the section or a clash the
// repair could not separate on: read from the persisted assemblies, as the memoria reads them, and
// indexed once per set.
const DETAILING_ISSUES = new Set(['detailing.anchorage.unresolved', 'detailing.cover.violated', 'detailing.clash.unresolved']);
let issueIndex: { of: unknown; ids: Map<number, string[]> } | null = null;
verificationStore._setDetailingIssueProvider((elementId) => {
  const assemblies = modelStore.model.detailing?.assemblies ?? detailingStore.assemblies;
  if (issueIndex?.of !== assemblies) {
    const ids = new Map<number, string[]>();
    for (const a of assemblies ?? []) for (const u of a.unsupported ?? []) {
      // A lap held open (`detailing.lapCheck.*`, `splice-checks.ts`) holds its members as well.
      if (DETAILING_ISSUES.has(u.key) || u.key.startsWith('detailing.lapCheck.')) for (const id of u.scope.elementIds ?? []) ids.set(id, [...(ids.get(id) ?? []), u.key]);
    }
    issueIndex = { of: assemblies, ids };
  }
  return issueIndex.ids.get(elementId) ?? [];
});

// The members the seismic report checks only as a substitute (ACI 318-19 chapter 18 standing in
// for INPRES-CIRSOC 103 Parte II, `check-rows-families.ts`): their capacity checks and, for a
// column, the strong-column check at its joints are not verified, so neither is the member.
let seismicIndex: { of: unknown; ids: Set<number> } | null = null;
verificationStore._setSeismicSubstituteProvider((elementId) => {
  const rep = seismicState.report;
  if (!rep) return false;
  if (seismicIndex?.of !== rep) {
    const ids = new Set<number>();
    for (const m of rep.members) if (seismicMemberCheckRows(m).length) ids.add(m.id);
    for (const j of rep.joints) if (!j.strongColumn.roof) for (const c of j.columns) ids.add(c);
    seismicIndex = { of: rep, ids };
  }
  return seismicIndex.ids.has(elementId);
});

// The members whose deflection check fails, from the same check the memoria prints
// (`serviceability.ts`), computed once per solve, deflection limits and reinforcement.
let deflectionIndex: { key: unknown[]; fail: Set<number> } | null = null;
verificationStore._setServiceabilityProvider((elementId) => {
  const key = [resultsStore.perCase3D, resultsStore.perCombo3D, resultsStore.results3D, modelStore.deflectionLimits, modelStore.elements];
  const reinf = [...modelStore.elements.values()].map((e) => e.reinforcement);
  if (!deflectionIndex || deflectionIndex.key.length !== key.length + reinf.length
    || ![...key, ...reinf].every((k, i) => k === deflectionIndex!.key[i])) {
    const fail = new Set<number>();
    for (const [id, r] of deflectionChecks().rows) if (r.check.status === 'fail') fail.add(id);
    deflectionIndex = { key: [...key, ...reinf], fail };
  }
  return deflectionIndex.fail.has(elementId);
});

// Let uiStore ask modelStore whether the current model is flat 2D, without
// importing modelStore directly (which would create a circular dependency).
uiStore._setModelFlatnessProvider(() => shouldProjectModelToXZ({
  nodes: modelStore.nodes.values(),
  supports: modelStore.supports.values(),
  loads: modelStore.loads,
  plateCount: modelStore.plates.size,
  quadCount: modelStore.quads.size,
}));

// Undo puts back the selection that went with the entry, keeping only what still exists.
historyStore.setSelectionAccess({
  get: () => ({ nodes: [...uiStore.selectedNodes], elements: [...uiStore.selectedElements], shells: [...uiStore.selectedShells] }),
  set: (s) => uiStore.setSelection(
    new Set(s.nodes.filter((id) => modelStore.nodes.has(id))),
    new Set(s.elements.filter((id) => modelStore.elements.has(id))),
    false,
    new Set(s.shells.filter((k) => (k[0] === 'q' ? modelStore.quads : modelStore.plates).has(Number(k.slice(1))))),
  ),
});

export { modelStore, uiStore, resultsStore, historyStore, dsmStepsStore, fmStepsStore, tabManager, tourStore, verificationStore };

// The editing/reading exclusion is a rule of the app, not of a component, so it
// is installed once here rather than remembered at each of the six places that
// arm a tool.
import { projectNode } from '../geometry/plane-projection';
import { transverseSign } from '../engine/transverse-sign-2d';
import { installViewModeRules } from './view-mode';
import { captureProjectProvenance } from './project-provenance';
installViewModeRules();
