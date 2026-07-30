import type { StoredRegulations } from '../codes/roles';
import type { RevisionVector } from '../codes/revisions';
import type { DetailingStore } from '../engine/detailing/assembly';
import type { ProjectCodeSettings } from '../codes/project-code-settings';
// Undo/Redo history store using full model snapshots
import { modelStore } from './model.svelte';
import type { Release } from './model.svelte';
import type { Element3DMetadata } from '../model/element-3d-metadata';
import type { ModelProvenance } from '../model/provenance';
import type { Footing } from '../model/footing';
import type { ProjectGeotechnical } from '../model/geotechnical';

export interface ModelSnapshot {
  name?: string;
  analysisMode?: '2d' | '3d' | 'pro' | 'edu';
  /** Where the model came from (e.g. CAD-derived draft) and review status. */
  provenance?: ModelProvenance;
  /** Local-axis convention. 'zUpStrongAxis' is the corrected (and only) one;
   *  absent on models saved before this metadata existed. */
  localAxisConvention?: 'zUpStrongAxis';
  nodes: Array<[number, { id: number; x: number; y: number; z?: number }]>;
  materials: Array<[number, { id: number; name: string; e: number; nu: number; rho: number }]>;
  sections: Array<[number, { id: number; name: string; a: number; iz: number; b?: number; h?: number; shape?: string; tw?: number; tf?: number; t?: number; iy?: number; j?: number }]>;
  elements: Array<[number, {
    id: number;
    type: 'frame' | 'truss';
    nodeI: number;
    nodeJ: number;
    materialId: number;
    sectionId: number;
    releaseI: Release;
    releaseJ: Release;
  } & Element3DMetadata]>;
  supports: Array<[number, { id: number; nodeId: number; type: string; angle?: number; isGlobal?: boolean; kx?: number; ky?: number; kz?: number; dx?: number; dz?: number; dry?: number; dy?: number; drz?: number; drx?: number; krx?: number; kry?: number; krz?: number }]>;
  loads: Array<{ type: string; data: Record<string, unknown> }>;
  loadCases?: Array<{ id: number; type?: string; name: string }>;
  combinations?: Array<{ id: number; name: string; factors: Array<{ caseId: number; factor: number }> }>;
  plates?: Array<[number, { id: number; nodes: [number, number, number]; materialId: number; thickness: number }]>;
  quads?: Array<[number, { id: number; nodes: [number, number, number, number]; materialId: number; thickness: number }]>;
  constraints?: Array<{ type: string; [key: string]: unknown }>;
  /** Joint/spring/bearing primitives. Each entry is [id, ConnectorElement-shaped object]. */
  connectors?: Array<[number, { id: number; nodeI: number; nodeJ: number; kAxial?: number; kShear?: number; kMoment?: number; kShearZ?: number; kBendY?: number; kBendZ?: number }]>;
  /** Isolated spread footings. Each entry is [id, Footing]. Absent before foundations. */
  footings?: Array<[number, Footing]>;
  /** Project ground conditions, referenced by footings rather than copied into them. */
  geotechnical?: ProjectGeotechnical;
  nextId: { node: number; material: number; section: number; element: number; support: number; load: number; loadCase?: number; combination?: number; plate?: number; quad?: number; connector?: number; footing?: number; soilProfile?: number };
  /** Jurisdiction, adopted regulation editions and concrete data. Absent on
   *  models saved before this existed — see migrateCodeSettings. */
  codeSettings?: ProjectCodeSettings;
  /** Code-neutral regulation stack. */
  regulations?: StoredRegulations;
  /** Revision vector every downstream result is stamped against. */
  revisions?: RevisionVector;
  /** Coordinated detailing assemblies. Absent on models saved before PR17. */
  detailing?: DetailingStore;
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

    /**
     * Push the current model onto the undo stack.
     *
     * `notifyMutation` (default true) preserves the historical behaviour: bump
     * modelVersion so App.svelte's reactive effect clears stale results. Pass
     * `false` for a reinforcement-only transaction — reinforcement does not affect
     * the analysis, so bumping would destroy valid results and force a re-solve.
     */
    pushState(opts?: { notifyMutation?: boolean }): void {
      const snapshot = modelStore.snapshot();
      undoStack.push(snapshot);
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      redoStack = [];
      if (opts?.notifyMutation !== false) {
        modelStore.bumpModelVersion();
      }
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

  // Wire into model store after module initialization settles so this store
  // can survive circular imports in tests/SSR.
  queueMicrotask(() => {
    // The silent variant (used by reinforcementTransaction) is registered by the
    // same call: modelStore wraps this fn for the notifying path and uses it raw
    // for the silent path.
    modelStore?._setHistoryPush?.(() => store.pushState({ notifyMutation: false }));
  });

  return store;
}

export const historyStore = createHistoryStore();
