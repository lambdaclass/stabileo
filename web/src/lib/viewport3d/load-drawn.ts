/**
 * Which loads the 3D scene draws — one rule for `syncLoads`, which draws them, and for the box
 * selection, which picks them. The marquee used to filter only by what the view hides, so with
 * the loads layer off, a diagram hiding it, or a load case unticked, a rectangle took loads that
 * were nowhere on the screen, and Delete removed them.
 */
import { uiStore, resultsStore } from '../store';
import { isLoadHidden } from '../store/view-state.svelte';

type LoadTarget = { nodeId?: number; elementId?: number; quadId?: number };

export interface LoadDrawView {
  /** The loads layer toggle. */
  showLoads: boolean;
  /** Hide loads while a result diagram is shown… */
  hideLoadsWithDiagram: boolean;
  /** …and the diagram shown ('none' when there is none). */
  diagramType: string;
  /** Load cases drawn; null draws them all. */
  visibleCases: readonly number[] | null;
  /** Whether the view hides what the load stands on. */
  isHidden: (target: LoadTarget) => boolean;
}

/** Whether the scene draws any load at all. */
export function loadsLayerDrawn(v: LoadDrawView): boolean {
  return v.showLoads && !(v.hideLoadsWithDiagram && v.diagramType !== 'none');
}

/** Whether the scene draws this load. A load without a case is drawn whatever cases are ticked. */
export function isLoadDrawn(load: { data: LoadTarget & { caseId?: number } }, v: LoadDrawView): boolean {
  if (!loadsLayerDrawn(v)) return false;
  const caseId = load.data.caseId;
  if (v.visibleCases !== null && caseId !== undefined && !v.visibleCases.includes(caseId)) return false;
  return !v.isHidden(load.data);
}

/** The view as the stores hold it now. */
export function currentLoadDrawView(): LoadDrawView {
  return {
    showLoads: uiStore.showLoads3D,
    hideLoadsWithDiagram: uiStore.hideLoadsWithDiagram,
    diagramType: resultsStore.diagramType,
    visibleCases: uiStore.visibleLoadCases3D,
    isHidden: isLoadHidden,
  };
}
