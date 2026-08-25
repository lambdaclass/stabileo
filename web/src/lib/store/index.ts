import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { resultsStore } from './results.svelte';
import { historyStore } from './history.svelte';
import { dsmStepsStore } from './dsmSteps.svelte';
import { tabManager } from './tabs.svelte';
import { tourStore } from './tour.svelte';
import { verificationStore } from './verification.svelte';
import { detailingStore } from './detailing.svelte';
import { shouldProjectModelToXZ } from '../geometry/coordinate-system';
// Registering the design-code adapters at store-wiring time guarantees the registry
// is populated before any component queries it. Importing for side effects only.
import '../engine/design/adapters/cirsoc201-adapter';
import '../engine/design/adapters/unsupported-adapter';

// Wire model mutations to automatically clear stale results.
// This ensures results never persist after the model changes,
// regardless of whether liveCalc is ON or OFF.
//
// UNCONDITIONAL by design: the previous `if (hasAnyResults || hasResults)` guard was
// a micro-optimisation that made the analysis-revision counter conditional, which
// would let a mutation silently fail to advance it and leave a stale result reading
// as current.
modelStore._setOnMutation(() => {
  resultsStore.clear();
  verificationStore.invalidateAnalysis();
});

// A reinforcement transaction is NOT a model mutation: forces are unaffected, so
// results and retained demand data survive. Only the affected elements' cached
// provided-reinforcement verification is dropped, so they re-verify immediately from
// the retained demand with zero structural solves.
modelStore._setOnReinforcementCommit((written) => {
  verificationStore.invalidateElements(written);
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

resultsStore._setOnResultsPublish(() => {
  verificationStore.bumpSolveGeneration();
});

// Let verificationStore read the current provided reinforcement without importing
// modelStore (which would create a circular dependency).
verificationStore._setReinforcementProvider(
  (elementId) => modelStore.elements.get(elementId)?.reinforcement,
);

// Let uiStore ask modelStore whether the current model is flat 2D, without
// importing modelStore directly (which would create a circular dependency).
uiStore._setModelFlatnessProvider(() => shouldProjectModelToXZ({
  nodes: modelStore.nodes.values(),
  supports: modelStore.supports.values(),
  loads: modelStore.loads,
  plateCount: modelStore.plates.size,
  quadCount: modelStore.quads.size,
}));

export { modelStore, uiStore, resultsStore, historyStore, dsmStepsStore, tabManager, tourStore, verificationStore };

// The editing/reading exclusion is a rule of the app, not of a component, so it
// is installed once here rather than remembered at each of the six places that
// arm a tool.
import { installViewModeRules } from './view-mode';
import { captureProjectProvenance } from './project-provenance';
installViewModeRules();
