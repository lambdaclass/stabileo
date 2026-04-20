import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { resultsStore } from './results.svelte';
import { historyStore } from './history.svelte';
import { dsmStepsStore } from './dsmSteps.svelte';
import { tabManager } from './tabs.svelte';
import { tourStore } from './tour.svelte';
import { verificationStore } from './verification.svelte';
import { shouldProjectModelToXZ } from '../geometry/coordinate-system';

// Wire model mutations to automatically clear stale results.
// This ensures results never persist after the model changes,
// regardless of whether liveCalc is ON or OFF.
modelStore._setOnMutation(() => {
  if (resultsStore.results || resultsStore.results3D) {
    resultsStore.clear();
    verificationStore.clear();
  }
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

export { modelStore, uiStore, resultsStore, historyStore, dsmStepsStore, tabManager, tourStore, verificationStore };
