import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { resultsStore } from './results.svelte';
import { historyStore } from './history.svelte';
import { dsmStepsStore } from './dsmSteps.svelte';
import { tabManager } from './tabs.svelte';
import { tourStore } from './tour.svelte';
import { verificationStore } from './verification.svelte';

// Wire model mutations to automatically clear stale results.
// This ensures results never persist after the model changes,
// regardless of whether liveCalc is ON or OFF.
modelStore._setOnMutation(() => {
  if (resultsStore.results || resultsStore.results3D) {
    resultsStore.clear();
    verificationStore.clear();
  }
});

export { modelStore, uiStore, resultsStore, historyStore, dsmStepsStore, tabManager, tourStore, verificationStore };
