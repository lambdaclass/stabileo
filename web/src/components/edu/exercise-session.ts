import { modelStore, resultsStore, uiStore } from '../../lib/store';
import { viewportCanvas } from '../../lib/utils/viewport-canvas';
import { eduStore } from './edu-store.svelte';
import type { EduExerciseAPI } from './exercise-spec';
import type { EduExercise } from './exercises';

/** Hand back the model the exercise borrowed, or clear if it borrowed none. */
export function returnBorrowedModel(): void {
  const kept = eduStore.borrowedModel as ReturnType<typeof modelStore.snapshot> | null;
  eduStore.borrowedModel = null;
  if (kept) modelStore.restore(kept);
  else modelStore.clear();
}

/** End the exercise entirely: clear it, drop its results, restore the model. */
export function leaveExercise(): void {
  eduStore.clearExercise();
  eduStore.authoring = false;
  eduStore.markBrowsing();
  resultsStore.clear();
  returnBorrowedModel();
}

/** Builds into the model store; `record` collects node ids in `addNode()` order, which `supports[].nodeIndex` indexes. */
export function exerciseStoreApi(record?: number[]): EduExerciseAPI {
  return {
    addNode: (x, y) => {
      const id = modelStore.addNode(x, y);
      record?.push(id);
      return id;
    },
    addElement: (nI, nJ, type) => modelStore.addElement(nI, nJ, type ?? 'frame'),
    addHinge: (elementId, end) => modelStore.toggleHinge(elementId, end),
    addSupport: (nodeId, type) => modelStore.addSupport(nodeId, type),
    addNodalLoad: (nodeId, fx, fy, mz) => modelStore.addNodalLoad(nodeId, fx, fy, mz ?? 0),
    addDistributedLoad: (elementId, qI, qJ) => modelStore.addDistributedLoad(elementId, qI, qJ),
  };
}

/** Puts an exam's exercise on the canvas, setting aside whatever model was there, and never solves it. */
export function showExamExercise(ex: EduExercise): void {
  if (eduStore.borrowedModel === null && modelStore.nodes.size > 0) eduStore.borrowedModel = modelStore.snapshot();
  modelStore.clear();
  resultsStore.clear();
  resultsStore.diagramType = 'none';
  resultsStore.showReactions = false;
  uiStore.currentTool = 'pan';
  const ids: number[] = [];
  ex.build(exerciseStoreApi(ids));
  eduStore.loadExercise(ex, ids);
  setTimeout(() => {
    const canvas = viewportCanvas();
    if (canvas && modelStore.nodes.size > 0) uiStore.zoomToFit(modelStore.nodes.values(), canvas.width, canvas.height);
  }, 150);
}

export function leaveExamExercise(): void {
  eduStore.clearExercise();
  resultsStore.clear();
  returnBorrowedModel();
}
