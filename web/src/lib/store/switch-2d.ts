/**
 * switch-2d.ts — carrying a 3D model into the 2D workspace.
 *
 * # The question this asks
 *
 * A 3D model cannot simply be looked at in 2D: the 2D solver has three
 * degrees of freedom per node and no notion of an out-of-plane coordinate, so
 * SOMETHING has to be decided about the third dimension before the switch can
 * mean anything. There are exactly three answers, and they are answers to
 * different questions:
 *
 *   * **Stay in 3D** — the switch was a mistake.
 *   * **Project** — flatten everything onto a plane. Answers "what does all of
 *     this look like from the side", which for a warehouse is every frame
 *     drawn on top of one frame.
 *   * **Slice** — take what lies in ONE plane, at a distance you choose.
 *     Answers "give me the frame on grid line 12", which is usually what was
 *     meant, and which the old dialog could not do at all.
 *
 * The fourth — erase and start empty — is not an answer to the question; it is
 * declining to bring the model at all, which is why it sits apart and asks
 * again before doing it.
 *
 * # Why a module and not a component
 *
 * Two callers already need this: the ribbon in the current shell and the
 * legacy toolbar PRO still mounts. Two implementations of "replace the model,
 * remember the original, remap the plane, clear the results" is two chances to
 * forget the backup — and the backup is the only thing standing between a user
 * and the loss of a 3D model they spent an afternoon on.
 */

import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { resultsStore } from './results.svelte';
import {
  buildSimplified2DModel, countCollapsedElements, type DrawPlane,
} from '../geometry/plane-projection';
import { sliceModelAtPlane, planeOffsets, type PlaneOffset, SLICE_TOL } from '../geometry/plane-slice';

/**
 * The geometry modules describe a support structurally, with an index
 * signature for the type-specific fields (spring stiffnesses, prescribed
 * displacements) they pass through without reading. `Support` is a closed
 * interface, and TypeScript will not widen a closed interface into an indexed
 * one even when every declared field lines up — so the crossing is made here,
 * once, at the boundary between the typed store and the generic geometry,
 * rather than by loosening either side.
 */
type LooseSupport = { id: number; nodeId: number; type: string; [k: string]: unknown };
type LooseLoad = { type: string; data: Record<string, unknown> };
const supportsForGeometry = (): Iterable<LooseSupport> =>
  modelStore.supports.values() as unknown as Iterable<LooseSupport>;
/** Same crossing, same reason: `Load`'s `data` is a union of per-type shapes. */
const loadsForGeometry = (): Iterable<LooseLoad> =>
  modelStore.loads as unknown as Iterable<LooseLoad>;

export type { DrawPlane, PlaneOffset };

/** Supports and loads that only a 3D model can carry. */
const SUPPORTS_3D = new Set(['fixed3d', 'pinned3d', 'spring3d', 'rollerXZ', 'rollerXY', 'rollerYZ', 'custom3d']);
const LOADS_3D = new Set(['nodal3d', 'distributed3d', 'pointOnElement3d', 'surface3d']);

/**
 * Whether the model is already flat enough to switch without deciding anything.
 *
 * A model drawn in 3D that happens to have every node at z = 0 and no 3D-only
 * conditions IS a 2D model; asking its author to choose a projection plane for
 * it would be asking a question with one possible answer.
 */
export function isModelNative2D(): boolean {
  for (const node of modelStore.nodes.values()) {
    if (Math.abs(node.z ?? 0) > 1e-9) return false;
  }
  for (const s of modelStore.supports.values()) {
    if (SUPPORTS_3D.has(s.type)) return false;
  }
  for (const l of modelStore.loads) {
    if (LOADS_3D.has(l.type)) return false;
  }
  return true;
}

/** True when switching to 2D needs the user to decide something first. */
export function needsPlaneChoice(): boolean {
  return modelStore.nodes.size > 0 && !isModelNative2D();
}

/** How many members would become points if the model were flattened onto each plane. */
export function collapsedByPlane(): Record<DrawPlane, number> {
  const nodes = [...modelStore.nodes.values()];
  const elements = [...modelStore.elements.values()];
  return {
    xy: countCollapsedElements('xy', nodes, elements),
    xz: countCollapsedElements('xz', nodes, elements),
    yz: countCollapsedElements('yz', nodes, elements),
  };
}

/** The cuts available on a plane, with what each would yield. */
export function cutsOn(plane: DrawPlane): PlaneOffset[] {
  return planeOffsets(
    plane, modelStore.nodes.values(), modelStore.elements.values(), modelStore.supports.values(),
    // Loads too, so the dialog can warn about a cut that takes none BEFORE it is
    // made. That is the failure the solver will not report: it solves, and every
    // result is zero.
    loadsForGeometry(),
  );
}

/**
 * The 3D model as it was before the switch.
 *
 * Module-level rather than per-component: the dialog that starts the switch is
 * unmounted long before the button that undoes it is pressed, and a backup
 * that dies with its component is not a backup.
 */
let backup: {
  nodes: Map<number, unknown>;
  elements: Map<number, unknown>;
  supports: Map<number, unknown>;
  loads: unknown[];
} | null = null;

export function hasBackup(): boolean {
  return backup !== null;
}

function takeBackup() {
  // Only once. A second switch — 3D → 2D → 3D → 2D — must not overwrite the
  // original with the simplified version, which would make the round trip
  // lossy in a way nothing on screen would reveal.
  if (backup) return;
  backup = {
    nodes: new Map(modelStore.nodes),
    elements: new Map(modelStore.elements),
    supports: new Map(modelStore.supports),
    loads: [...modelStore.loads],
  };
}

/** What a conversion did, for the banner that stays on screen afterwards. */
export interface SwitchStats {
  mergedNodes: number;
  removedElements: number;
  duplicateElements: number;
  /** Present only for a slice: what the cut left behind. */
  droppedCrossing?: number;
  droppedElsewhere?: number;
  /**
   * Load the cut left behind, which is the count this banner most needs.
   *
   * The dialog warns before the cut; this is what stays on screen while the
   * results are read. A frame missing members looks weaker than it is and the
   * reader distrusts it. A frame missing LOAD looks stronger, solves, and
   * reports zero — so the standing context is exactly where the number has to
   * survive, not just the moment before the decision.
   */
  droppedLoads?: number;
  /** Which plane and, for a slice, where. */
  plane: DrawPlane;
  offset?: number;
}

export type SwitchOutcome = { ok: true; stats: SwitchStats } | { ok: false; error: string };

function land(m: {
  nodes: Map<number, { id: number; x: number; y: number }>;
  elements: Map<number, unknown>;
  supports: Map<number, unknown>;
  loads: unknown[];
}) {
  modelStore.replaceModelData(m.nodes as never, m.elements as never, m.supports as never, m.loads as never);
  /*
   * The builder has already rewritten the coordinates into the 2D convention,
   * so the viewport and the solver must NOT remap them a second time — which
   * is what a drawPlane2D other than 'xy' would tell them to do.
   */
  uiStore.drawPlane2D = 'xy';
  uiStore.simplified2DMode = true;
  uiStore.analysisMode = '2d';
  resultsStore.clear();
}

/** Flatten the whole structure onto a plane. */
export function projectOnto(plane: DrawPlane): SwitchOutcome {
  const result = buildSimplified2DModel(
    plane,
    modelStore.nodes.values(),
    modelStore.elements.values(),
    supportsForGeometry(),
    loadsForGeometry(),
    modelStore.materials,
    modelStore.sections,
  );
  if (!result.ok) return { ok: false, error: result.error };

  takeBackup();
  land(result.model);
  const stats: SwitchStats = { ...result.model.stats, plane };
  uiStore.simplified2DStats = stats;
  return { ok: true, stats };
}

/** Take the frame lying in a plane at a given distance along its normal. */
export function sliceAt(plane: DrawPlane, offset: number, tol = SLICE_TOL): SwitchOutcome {
  const result = sliceModelAtPlane(
    plane,
    offset,
    modelStore.nodes.values(),
    modelStore.elements.values(),
    supportsForGeometry(),
    loadsForGeometry(),
    modelStore.materials,
    modelStore.sections,
    tol,
  );
  if (!result.ok) return { ok: false, error: result.error };

  takeBackup();
  land(result.model);
  const stats: SwitchStats = {
    ...result.model.stats,
    droppedCrossing: result.slice.crossingElements,
    droppedElsewhere: result.slice.elsewhereElements,
    droppedLoads: result.slice.droppedLoads,
    plane,
    offset,
  };
  uiStore.simplified2DStats = stats;
  return { ok: true, stats };
}

/** Drop the model and start again in 2D. Destructive; ask first. */
export function eraseAndSwitch(): void {
  modelStore.clear();
  backup = null;
  uiStore.simplified2DMode = false;
  uiStore.simplified2DStats = null;
  uiStore.drawPlane2D = 'xy';
  uiStore.analysisMode = '2d';
  resultsStore.clear();
}

/** Switch to 2D with nothing to decide — a model already flat, or no model. */
export function switchPlain(): void {
  uiStore.drawPlane2D = 'xy';
  uiStore.analysisMode = '2d';
}

/** Put the original 3D model back. */
export function restore3D(): void {
  if (backup) {
    modelStore.replaceModelData(
      backup.nodes as never,
      backup.elements as never,
      backup.supports as never,
      backup.loads as never,
    );
    backup = null;
  }
  uiStore.simplified2DMode = false;
  uiStore.simplified2DStats = null;
  uiStore.drawPlane2D = 'xy';
  uiStore.analysisMode = '3d';
  resultsStore.clear();
}

/**
 * Forget the backup and the simplified-2D flags because the MODEL they
 * describe is gone.
 *
 * The backup is module-level, so without this it survives whatever model
 * replaces the one it was taken from: slice model A, open project B, and the
 * ribbon's dim-up button would "restore" A over B, wiping it. The reset is
 * wired into the two funnels every wholesale replacement goes through —
 * `modelStore.clear()` (new project, example load) and `deserializeProject()`
 * in file.ts (file open). `modelStore.restore()` is deliberately NOT a hook:
 * undo/redo and a cancelled CAD draft also go through it with snapshots of
 * the SAME model, where the backup is still the only way back to the 3D
 * original.
 *
 * The ui flags are written through the store's public setters, here rather
 * than in ui.svelte.ts, so the invariant "no backup ⇒ not in simplified
 * mode" has exactly one owner.
 */
export function resetSwitchBackup(): void {
  backup = null;
  uiStore.simplified2DMode = false;
  uiStore.simplified2DStats = null;
}
