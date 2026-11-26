import type { ProExample } from '../data/pro-examples';
import { runEngineActionAsync } from '../store/engine-action';
import { resetProjectProvenance } from '../store/project-provenance';
import { uiStore, resultsStore, tabManager } from '../store';

export async function loadProExample(ex: ProExample): Promise<void> {
  if ((await runEngineActionAsync(async () => { await ex.load(); return true; })) !== true) return;
  resetProjectProvenance();
  uiStore.showLengths3D = false;
  uiStore.showNodeLabels3D = false;
  uiStore.showElementLabels3D = false;
  tabManager.syncActiveTabName();
  resultsStore.clear();
  resultsStore.clear3D();
  setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 200);
  setTimeout(() => window.dispatchEvent(new Event('stabileo-zoom-to-fit')), 600);
}
