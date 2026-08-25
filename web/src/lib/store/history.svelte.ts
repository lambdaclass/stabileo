import type { StoredRegulations } from '../codes/roles';
import type { RevisionVector } from '../codes/revisions';
import type { DetailingStore } from '../engine/detailing/assembly';
import type { ProjectCodeSettings } from '../codes/project-code-settings';
// Undo/Redo history store using full model snapshots
import { modelStore } from './model.svelte';
import type { Release, ProvidedReinforcement } from './model.svelte';
import type { Element3DMetadata } from '../model/element-3d-metadata';
import type { ModelProvenance } from '../model/provenance';
import type { Footing, FootingMatPreferences } from '../model/footing';
import type { ProjectGeotechnical } from '../model/geotechnical';
import type { ExportRecord } from '../flow/rc-export-record';

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
    // PRO: provided reinforcement. Always present at runtime (snapshot() spreads
    // the full Element), but was missing from this type until restoreReinforcementOnly()
    // needed to read it directly instead of via an `as never as ...` cast.
    reinforcement?: ProvidedReinforcement;
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
  /**
   * Bottom-mat design preferences. Absent on snapshots taken before PR18-A, which
   * `migrateFootingMatPreferences` reads as 16 mm / 16 mm / AUTO_CODE_COMPLIANT.
   *
   * On the FOUNDATION channel: `restoreFoundationOnly` restores it, because
   * `setFootingMatPreferences` is what pushes the entry.
   */
  footingMatPreferences?: FootingMatPreferences;
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
  /**
   * What was emitted from this project, and which members were retouched by hand.
   *
   * Both are OPTIONAL and their absence is meaningful, which is why they are read through
   * `hydrateProjectProvenance` rather than by `restore()`:
   *
   *   `exports` absent    we have no record of what was exported. Never "nothing was".
   *   `manualEdits` absent   we do not know what was retouched. Never "none were".
   *
   * They ride on the snapshot so that saving, autosave and tab capture all carry them without
   * four separate wirings — but `restore()` deliberately ignores them. See the note there:
   * undo must not un-happen an export.
   */
  exports?: ExportRecord[];
  manualEdits?: number[];
}

const MAX_HISTORY = 50;

/**
 * What kind of transaction produced a history entry.
 *  - 'structural': a real model mutation — undo/redo goes through the FULL
 *    `modelStore.restore()` path (bumps modelVersion, fires `_onMutation`, wipes
 *    results/verification). This is the historical, safe-by-default behaviour.
 *  - 'reinforcement': a `reinforcementTransaction` edit — reinforcement never
 *    affects the structural analysis, so undo/redo goes through the silent
 *    `modelStore.restoreReinforcementOnly()` path instead: only the changed
 *    elements' `reinforcement` field is touched, and only their cached
 *    provided-rebar verification is dropped. Results/demand data/revisions
 *    survive untouched.
 */
export type SnapshotKind = 'structural' | 'reinforcement' | 'foundation';

function createHistoryStore() {
  let undoStack = $state<ModelSnapshot[]>([]);
  let redoStack = $state<ModelSnapshot[]>([]);
  // Parallel to undoStack/redoStack (same index ↔ same entry): what kind of
  // transaction pushed that entry. Not itself reactive state — nothing reads it
  // from a component; it only drives undo()/redo()'s internal branch.
  let undoKinds: SnapshotKind[] = [];
  let redoKinds: SnapshotKind[] = [];

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
     *
     * `kind` (default 'structural') tags the entry for undo()/redo() so a
     * reinforcement-only edit can later be undone/redone through the silent path.
     * Defaulting to 'structural' is the safe choice for any caller that doesn't
     * pass it explicitly: worst case is a full restore, never a skipped one.
     */
    pushState(opts?: { notifyMutation?: boolean; kind?: SnapshotKind }): void {
      const snapshot = modelStore.snapshot();
      const kind: SnapshotKind = opts?.kind ?? 'structural';
      undoStack.push(snapshot);
      undoKinds.push(kind);
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
        undoKinds.shift();
      }
      redoStack = [];
      redoKinds = [];
      if (opts?.notifyMutation !== false) {
        modelStore.bumpModelVersion();
      }
    },

    undo(): void {
      if (undoStack.length === 0) return;
      const current = modelStore.snapshot();
      const kind = undoKinds.pop() ?? 'structural';
      const prev = undoStack.pop()!;
      redoStack.push(current);
      redoKinds.push(kind);
      if (kind === 'reinforcement') {
        modelStore.restoreReinforcementOnly(prev);
      } else if (kind === 'foundation') {
        modelStore.restoreFoundationOnly(prev);
      } else {
        modelStore.restore(prev);
      }
    },

    redo(): void {
      if (redoStack.length === 0) return;
      const current = modelStore.snapshot();
      const kind = redoKinds.pop() ?? 'structural';
      const next = redoStack.pop()!;
      undoStack.push(current);
      undoKinds.push(kind);
      if (kind === 'reinforcement') {
        modelStore.restoreReinforcementOnly(next);
      } else if (kind === 'foundation') {
        modelStore.restoreFoundationOnly(next);
      } else {
        modelStore.restore(next);
      }
    },

    clear(): void {
      undoStack = [];
      redoStack = [];
      undoKinds = [];
      redoKinds = [];
    },

    /** Get current stacks for tab serialization */
    getStacks(): { undo: ModelSnapshot[]; redo: ModelSnapshot[]; undoKinds: SnapshotKind[]; redoKinds: SnapshotKind[] } {
      return { undo: [...undoStack], redo: [...redoStack], undoKinds: [...undoKinds], redoKinds: [...redoKinds] };
    },

    /** Restore stacks from tab state. Kind arrays are optional for backward
     *  compatibility with any pre-existing serialized TabState; missing entries
     *  default to 'structural' (the safe, pre-Fix-A behaviour). */
    setStacks(undo: ModelSnapshot[], redo: ModelSnapshot[], uKinds?: SnapshotKind[], rKinds?: SnapshotKind[]): void {
      undoStack = undo;
      redoStack = redo;
      undoKinds = uKinds ?? undo.map(() => 'structural' as SnapshotKind);
      redoKinds = rKinds ?? redo.map(() => 'structural' as SnapshotKind);
    },
  };

  // Wire into model store after module initialization settles so this store
  // can survive circular imports in tests/SSR.
  queueMicrotask(() => {
    // modelStore wraps this fn for the notifying ('structural') path — bumping
    // modelVersion and firing _onMutation BEFORE calling it — and calls it raw
    // (tagged 'reinforcement') for the silent path used by reinforcementTransaction.
    modelStore?._setHistoryPush?.((kind) => store.pushState({ notifyMutation: false, kind }));
  });

  return store;
}

export const historyStore = createHistoryStore();
