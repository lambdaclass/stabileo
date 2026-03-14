// Undo/Redo history store using full model snapshots
import { modelStore } from './model.svelte';

export interface ModelSnapshot {
  name?: string;
  analysisMode?: '2d' | '3d';
  nodes: Array<[number, { id: number; x: number; y: number; z?: number }]>;
  materials: Array<[number, { id: number; name: string; e: number; nu: number; rho: number }]>;
  sections: Array<[number, { id: number; name: string; a: number; iz: number; b?: number; h?: number; shape?: string; tw?: number; tf?: number; t?: number; iy?: number; j?: number }]>;
  elements: Array<[number, { id: number; type: 'frame' | 'truss'; nodeI: number; nodeJ: number; materialId: number; sectionId: number; hingeStart?: boolean; hingeEnd?: boolean; localYx?: number; localYy?: number; localYz?: number }]>;
  supports: Array<[number, { id: number; nodeId: number; type: string; angle?: number; isGlobal?: boolean; kx?: number; ky?: number; kz?: number; dx?: number; dy?: number; drz?: number; dz?: number; drx?: number; dry?: number; krx?: number; kry?: number; krz?: number }]>;
  loads: Array<{ type: string; data: Record<string, unknown> }>;
  loadCases?: Array<{ id: number; type?: string; name: string }>;
  combinations?: Array<{ id: number; name: string; factors: Array<{ caseId: number; factor: number }> }>;
  plates?: Array<[number, { id: number; nodes: [number, number, number]; materialId: number; thickness: number }]>;
  quads?: Array<[number, { id: number; nodes: [number, number, number, number]; materialId: number; thickness: number }]>;
  constraints?: Array<{ type: string; [key: string]: unknown }>;
  nextId: { node: number; material: number; section: number; element: number; support: number; load: number; loadCase?: number; combination?: number; plate?: number; quad?: number };
}

const MAX_HISTORY = 50;

function createHistoryStore() {
  let undoStack = $state<ModelSnapshot[]>([]);
  let redoStack = $state<ModelSnapshot[]>([]);

  const store = {
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    get undoCount() { return undoStack.length; },
    get redoCount() { return redoStack.length; },

    pushState(): void {
      const snapshot = modelStore.snapshot();
      undoStack.push(snapshot);
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      redoStack = [];
      // Bump modelVersion so the reactive $effect in App.svelte detects the change
      // and clears stale results. This is a no-op when called via _pushUndo (which
      // already increments modelVersion), but ensures direct pushState() callers
      // (e.g. ElementEditor) also trigger result invalidation.
      modelStore.bumpModelVersion();
    },

    undo(): void {
      if (undoStack.length === 0) return;
      const current = modelStore.snapshot();
      redoStack.push(current);
      const prev = undoStack.pop()!;
      modelStore.restore(prev);
    },

    redo(): void {
      if (redoStack.length === 0) return;
      const current = modelStore.snapshot();
      undoStack.push(current);
      const next = redoStack.pop()!;
      modelStore.restore(next);
    },

    clear(): void {
      undoStack = [];
      redoStack = [];
    },

    /** Get current stacks for tab serialization */
    getStacks(): { undo: ModelSnapshot[]; redo: ModelSnapshot[] } {
      return { undo: [...undoStack], redo: [...redoStack] };
    },

    /** Restore stacks from tab state */
    setStacks(undo: ModelSnapshot[], redo: ModelSnapshot[]): void {
      undoStack = undo;
      redoStack = redo;
    },
  };

  // Wire into model store so mutations auto-push undo state
  modelStore._setHistoryPush(() => store.pushState());

  return store;
}

export const historyStore = createHistoryStore();
