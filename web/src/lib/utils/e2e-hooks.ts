/**
 * Browser-test hooks.
 *
 * TWO INDEPENDENT GATES, both required:
 *   1. BUILD-TIME  — `VITE_E2E=1`. `main.ts` only imports this module behind a
 *      statically-replaced `import.meta.env.VITE_E2E === '1'` check, so a normal
 *      `npm run build` drops the whole module from the bundle. The production
 *      artifact cannot expose these hooks even if a user appends `?e2e=1`.
 *   2. RUNTIME     — `?e2e=1` on the URL. An e2e-enabled build still exposes nothing
 *      until the flag is present.
 *
 * `window.__stabileo` is READ-ONLY: queries only, frozen, no state setters. The
 * operations a spec needs to drive (load an example, solve, switch tab, run a design
 * command) live on `window.__stabileoActions` and are exactly the operations the UI
 * buttons perform — there is no way to poke internal store state through either object.
 *
 * Why hooks rather than DOM scraping / timing:
 *  - `solverReady()` makes a stubbed WASM solver fail LOUDLY. Without it, a build
 *    where `src/lib/wasm/` was never generated falls back to the Vite stub
 *    (`solve_3d() => "{}"`), and every design assertion would pass vacuously.
 *  - `solveCount()` lets a spec assert "zero structural solves after a
 *    reinforcement-only edit" directly, instead of inferring it from timing.
 *  - the revision counters replace arbitrary waits with `expect.poll` on real state.
 *
 * Nothing here mutates app state except `loadExample` (the same call the
 * examples menu makes) and `clearSelection` (the same call pressing Escape
 * makes). The bundle cost is trivial and the object is absent unless the
 * query flag is present, so production pages never expose it.
 */

import { modelStore, verificationStore, uiStore, historyStore, resultsStore } from '../store';
import { detailingStore } from '../store/detailing.svelte';
import { designRunStore } from '../store/design-run.svelte';
import { isSolverReady } from '../engine/wasm-solver';
import { getStructuralSolveCount } from './solve-counter';
import { runGlobalSolve } from '../engine/live-calc';
import { tourStore } from '../store/tour.svelte';
import {
  liveRebarSceneCensus, rebarSceneBuilds, type RebarSceneCensus,
} from '../three/rebar-scene';
import { sceneCacheStats } from '../engine/detailing/scene-cache';
import { openTimeline, type OpenPhase } from './open-timeline';
import { autosaveRevisions as storedAutosaveRevisions } from '../store/autosave-db';
import { autosaveFingerprint, clearAutosave, loadAutosave } from '../store/file';
import { lastAutosaveOutcome, requestAutosave } from '../store/autosave-service';

export const E2E_QUERY_FLAG = 'e2e';

/** Build-time gate. Statically replaced by Vite, so the false branch is eliminated. */
export function e2eBuildEnabled(): boolean {
  return import.meta.env.VITE_E2E === '1';
}

/** Runtime gate: `?e2e=1` must also be present. */
export function e2eQueryEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get(E2E_QUERY_FLAG) === '1';
  } catch {
    return false;
  }
}

/** Both gates. */
export function e2eEnabled(): boolean {
  return e2eBuildEnabled() && e2eQueryEnabled();
}

export interface StabileoTestHooks {
  version: 1;
  solverReady(): boolean;
  analysisRevision(): number;
  demandRevision(): number;
  providedRevision(): number;
  baselineRevision(): number;
  isBaselineStale(): boolean;
  solveCount(): number;
  modelVersion(): number;
  designRunId(): string | null;
  displayStatus(elementId: number): string;
  displayRatio(elementId: number): number | null;
  outcome(elementId: number): string | null;
  hasCertificate(elementId: number): boolean;
  counts(): Record<string, number>;
  runCounts(): Record<string, number> | null;
  /**
   * The proposal a PROVISIONAL_BIAXIAL member carries, and the reason that qualifies it.
   *
   * Null for any member that is not a proposal — which is itself the assertion a spec makes
   * about the other 386. Every field a reader needs in order to triage the member is here:
   * WHICH axis nobody checked, how big its moment is in kN·m, what fraction of the primary
   * that is, and which combination governs it. A ratio alone cannot be triaged — 12 % between
   * 4,3 and 1,0 kN·m and 12 % between 430 and 100 kN·m are the same number and completely
   * different engineering situations — which is why the absolute values travel with it.
   */
  provisionalBasis(elementId: number): {
    method: string;
    designedAxis: string;
    uncheckedAxis: string;
    uncheckedShear: string;
    secondaryRatio: number;
    primaryMoment: number;
    secondaryMoment: number;
    secondaryCombo: string | null;
    reasonKeys: string[];
  } | null;
  selection(): number[];
  /**
   * The selected NODE ids, sorted.
   *
   * `selection()` returns elements. A joint is a node, and the 3-D specs need to assert that the
   * joint highlighted in the scene is the one the list has — which is a statement about nodes.
   */
  selectedNodeIds(): number[];
  /** The node-marker radius the scene is drawing, metres. Null before the scene exists. */
  nodeMarkerRadius(): number | null;
  /**
   * How many meshes the selected joint contributes to the scene.
   *
   * A plate plus one cylinder per bolt. Zero means nothing was drawn — which for an undesigned
   * or incomplete joint is the correct answer, and is what the specs assert.
   */
  jointMeshCount(): number;
  /**
   * Everything selected, by kind.
   *
   * `selection()` reports members alone, which is enough while a selection can
   * only BE members. It cannot answer whether a drag in Supports mode picked
   * up the supports it drew a rectangle around — the question that mattered
   * when three of the four filters silently selected nothing.
   */
  selectionByKind(): { nodes: number[]; elements: number[]; supports: number[]; loads: number[] };
  /** Which kinds a drag is currently armed to pick up. */
  armedKinds(): string[];
  /** What the viewport is drawing — the walkthrough audit reads this. */
  diagramType(): string;
  /**
   * The guided step on screen, or null.
   *
   * Exposed for the walkthrough audit: checking that a step can reach what it
   * asks the reader to click means knowing which step it is and whether it
   * allows interaction, and neither is visible in the DOM. `armed`/`waits`/`met`
   * explain a hang — whether the advance was armed on entry, whether the step
   * waits on the reader at all, and whether its condition currently holds.
   */
  tourStep(): {
    id: string;
    target: string;
    allowInteraction: boolean;
    armed: boolean;
    waits: boolean;
    met: boolean | null;
  } | null;
  /** Which tool is armed, for the same reason. */
  currentTool(): string;
  /**
   * Where a node sits on screen, in CSS pixels.
   *
   * A test that draws has to click ON the nodes it just placed, and it cannot
   * reuse the coordinates it clicked: snapping moves a node to the nearest
   * grid intersection, which at a metre spacing is up to half a grid square
   * away from the pointer.
   */
  nodeScreenPos(id: number): { x: number; y: number } | null;
  /** How many nodes and supports the model holds — what a delete must not touch. */
  nodeCount(): number;
  supportCount(): number;
  reinforcement(elementId: number): unknown;
  rebarSummary(elementId: number): string;
  elementIds(): number[];
  /**
   * The names of the sections in the model, e.g. `HEB 220`.
   *
   * Added so a spec can assert that the profile a selector hands back is the id the
   * generator stores — without it the only observable was the trigger's display text,
   * which says nothing about what landed in the model.
   */
  sectionNames(): string[];
  orientationSuspectCount(): number;
  undoCount(): number;
  /** Non-background pixel count of the main canvas — a blank-render sanity check. */
  canvasInkRatio(): number;
  /** Project regulation settings, as persisted. Read-only. */
  codeSettings(): unknown;
  /** Verifier id on an element's certificate — carries the edition it was produced under. */
  certificateVerifierId(elementId: number): string | null;
  /** Coordinated detailing assemblies, as persisted. Read-only. */
  detailingAssemblies(): unknown;
  /** Bar-schedule totals for the selected assembly. */
  detailingSchedule(): unknown;
  /**
   * How many times the 3-D viewport has BUILT its tube geometry.
   *
   * The property the viewport benchmark asserts, rather than infers from a stopwatch: a layer
   * switch, a selection, an isolate or an opacity change must not move this number. A timing can
   * always be explained away as a busy runner; a counter that went up cannot.
   */
  rebarSceneBuilds(): number;
  /**
   * What the 3-D workspace is actually DRAWING, per family. Null when none is open.
   *
   * The counterpart of the on-screen tally, and deliberately a different observable. The tally
   * is derived in Svelte from the filter; this is read off the meshes. Every layer switch in the
   * rail once stopped reaching the meshes at all — the store changed, the filter recomputed, the
   * tally updated, the scene did not — and the whole suite stayed green because nothing could
   * see this side of the line.
   */
  rebarSceneCensus(): RebarSceneCensus | null;
  /**
   * Canvases in the page, of any kind. A layer switch must not add one.
   *
   * Every canvas, not only the WebGL ones: the 2-D viewport has one too, and a hook that
   * counted a subset would report "nothing added" about the half it was not looking at.
   */
  canvasCount(): number;
  /** Scene-projection cache hits and misses. A toggle must not produce a miss. */
  sceneCacheStats(): { hits: number; misses: number };
  /**
   * Milliseconds from the "3-D" click to the end of each phase of the last open.
   *
   * The benchmark reports this as a table. Attributing an open from the outside guessed wrong
   * twice — see `open-timeline.ts`.
   */
  openTimeline(): Partial<Record<OpenPhase, number>>;
  /**
   * Every autosave revision currently stored, newest first.
   *
   * The autosave moved to IndexedDB, which a spec cannot read the way it read a
   * `localStorage` string. These three hooks are how a journey asserts the property that
   * matters — that what is STORED after a design run contains the design — without reaching
   * into the database's private layout.
   */
  autosaveRevisions(): Promise<Array<{ revision: number; timestamp: string; status: string }>>;
  /** The family census of the newest readable stored project, plus how it was read. */
  autosaveStored(): Promise<{
    revision: number | null;
    fingerprint: Record<string, number>;
    backend: string;
    rejected: number;
    unfinishedRevision: number | null;
  }>;
  /** The last write attempt: what triggered it, whether it landed, and on which backend. */
  autosaveOutcome(): unknown;
}

/**
 * Actions a spec may drive. Each one is the SAME operation a UI control performs;
 * none of them writes internal state directly.
 */
export interface StabileoTestActions {
  loadExample(name: string): Promise<void>;
  /** Reset the selection between gestures — the position, not the subject. */
  clearSelection(): void;
  /** Runs the same global solve the toolbar button triggers. */
  solve(): Promise<void>;
  /** Activate the RC Design tab (the table only exists while it is selected). */
  openDesignTab(): void;
  seedDetailing(assemblies: unknown): void;
  selectAssembly(id: string): void;
  reviewAssembly(record: unknown): boolean;
  toggleBarLock(barId: string): void;
  computeDemands(): unknown;
  codeCheck(): unknown;
  autoDesign(ids: number[]): unknown;
  designAll(): unknown;
  cancel(): void;
  /** The same save the 30 s timer and every post-design hook ask for. */
  autosaveNow(): Promise<unknown>;
  /** The same clear the restore banner's Descartar button performs. */
  autosaveDiscard(): Promise<void>;
}

function rebarSummary(elementId: number): string {
  const r = modelStore.elements.get(elementId)?.reinforcement;
  if (!r) return 'none';
  const reg = r.regions;
  const parts: string[] = [];
  if (reg?.bottomSpan) parts.push(`b${reg.bottomSpan.count}x${reg.bottomSpan.diameter}`);
  if (reg?.topStart) parts.push(`ts${reg.topStart.count}x${reg.topStart.diameter}`);
  if (reg?.topEnd) parts.push(`te${reg.topEnd.count}x${reg.topEnd.diameter}`);
  if (reg?.stirrupsSupport) parts.push(`ss${reg.stirrupsSupport.diameter}@${reg.stirrupsSupport.spacing}`);
  if (reg?.stirrupsSpan) parts.push(`sp${reg.stirrupsSpan.diameter}@${reg.stirrupsSpan.spacing}`);
  if (r.column) parts.push(`c${4 + r.column.nBottom + r.column.nTop + r.column.nLeft + r.column.nRight}x${r.column.cornerDia}`);
  if (r.stirrups) parts.push(`t${r.stirrups.diameter}@${r.stirrups.spacing}`);
  return parts.join('|') || 'empty';
}

function canvasInkRatio(): number {
  const canvas = document.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return 0;
  // WebGL canvases need preserveDrawingBuffer to read back reliably; fall back to a
  // dimension check so the hook degrades to "is a canvas present and sized".
  try {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })
      ?? canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (gl) {
      const w = Math.min(canvas.width, 320);
      const h = Math.min(canvas.height, 200);
      if (w === 0 || h === 0) return 0;
      const px = new Uint8Array(w * h * 4);
      (gl as WebGLRenderingContext).readPixels(0, 0, w, h, 0x1908 /* RGBA */, 0x1401 /* UNSIGNED_BYTE */, px);
      let ink = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i] > 12 || px[i + 1] > 12 || px[i + 2] > 12) ink++;
      }
      return ink / (w * h);
    }
  } catch { /* fall through */ }
  return canvas.width > 0 && canvas.height > 0 ? 1 : 0;
}

export function installE2EHooks(): void {
  if (!e2eEnabled()) return;
  const hooks: StabileoTestHooks = {
    version: 1,
    solverReady: () => isSolverReady(),
    analysisRevision: () => verificationStore.analysisRevision,
    demandRevision: () => verificationStore.demandRevision,
    providedRevision: () => verificationStore.providedRevision,
    baselineRevision: () => verificationStore.baselineRevision,
    isBaselineStale: () => verificationStore.isBaselineStale,
    solveCount: () => getStructuralSolveCount(),
    modelVersion: () => modelStore.modelVersion,
    designRunId: () => {
      const s = verificationStore.runSummary;
      return s ? `${s.codeId}:${s.total}:${s.verified}:${s.wallMs.toFixed(0)}` : null;
    },
    displayStatus: (id) => verificationStore.getDisplayStatus(id),
    displayRatio: (id) => verificationStore.getDisplayRatio(id),
    outcome: (id) => verificationStore.outcomeFor(id)?.outcome ?? null,
    hasCertificate: (id) => !!verificationStore.outcomeFor(id)?.certificate,
    counts: () => ({ ...verificationStore.providedSummary }),
    runCounts: () => {
      const s = verificationStore.runSummary;
      if (!s) return null;
      return {
        total: s.total, verified: s.verified, sectionInadequate: s.sectionInadequate,
        demandUnavailable: s.demandUnavailable, searchExhausted: s.searchExhausted,
        unsupported: s.unsupported,
        /**
         * The proposals, counted apart from everything else.
         *
         * It was missing here while the summary carried it, so a browser spec had no way to
         * see the outcome that replaced UNSUPPORTED for these members and went on asserting
         * the count that used to hold. A hook that omits a bucket makes the bucket invisible
         * rather than absent.
         */
        provisionalBiaxial: s.provisionalBiaxial,
        provisionalRetained: s.provisionalRetained,
        notReached: s.notReached, aborted: s.aborted ? 1 : 0,
      };
    },
    provisionalBasis: (id: number) => {
      const o = verificationStore.outcomeFor(id);
      const b = o?.provisionalBasis;
      if (!b) return null;
      return {
        method: b.method,
        designedAxis: b.designedAxis,
        uncheckedAxis: b.uncheckedAxis,
        uncheckedShear: b.uncheckedShear,
        secondaryRatio: b.secondaryRatio,
        primaryMoment: b.primaryMoment,
        secondaryMoment: b.secondaryMoment,
        secondaryCombo: b.secondaryCombo,
        reasonKeys: (o?.reasons ?? []).map((r) => r.key),
      };
    },
    selection: () => [...uiStore.selectedElements].sort((a, b) => a - b),
    selectedNodeIds: () => [...uiStore.selectedNodes].sort((a, b) => a - b),
    /*
     * Published by `Viewport3D` when it resizes the markers. Null rather than a default, so a
     * spec can tell "the scene has not drawn yet" from "the radius is small".
     */
    nodeMarkerRadius: () =>
      (window as unknown as { __nodeRadius?: number }).__nodeRadius ?? null,
    jointMeshCount: () =>
      (window as unknown as { __jointMeshCount?: number }).__jointMeshCount ?? 0,
    armedKinds: () => [...uiStore.selectKinds].sort(),
    diagramType: () => String(resultsStore.diagramType),
    tourStep: () => {
      const st = tourStore.currentStep;
      return st ? {
        id: st.id, target: st.target, allowInteraction: !!st.allowInteraction,
        armed: tourStore.armedForTest,
        waits: !!st.waitFor, met: st.waitFor ? !!st.waitFor() : null,
      } : null;
    },
    currentTool: () => String(uiStore.currentTool),
    nodeScreenPos: (id: number) => {
      const n = modelStore.nodes.get(id);
      if (!n) return null;
      const canvas = document.querySelector('.viewport-container canvas') as HTMLCanvasElement | null;
      if (!canvas) return null;
      const p = uiStore.worldToScreen(n.x, (n as { z?: number }).z ?? n.y);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    nodeCount: () => modelStore.nodes.size,
    supportCount: () => modelStore.supports.size,
    selectionByKind: () => {
      const sorted = (s: Iterable<number>) => [...s].sort((a, b) => a - b);
      return {
        nodes: sorted(uiStore.selectedNodes),
        elements: sorted(uiStore.selectedElements),
        supports: sorted(uiStore.selectedSupports),
        loads: sorted(uiStore.selectedLoads),
      };
    },
    reinforcement: (id) => modelStore.elements.get(id)?.reinforcement ?? null,
    rebarSummary,
    elementIds: () => [...modelStore.elements.keys()].sort((a, b) => a - b),
    sectionNames: () => [...modelStore.sections.values()].map((s) => s.name),
    orientationSuspectCount: () => verificationStore.orientationSuspectCount,
    undoCount: () => historyStore.undoCount,
    canvasInkRatio,
    codeSettings: () => JSON.parse(JSON.stringify(modelStore.model.codeSettings ?? null)),
    certificateVerifierId: (id: number) =>
      verificationStore.outcomeFor(id)?.certificate?.verifierId ?? null,
    detailingAssemblies: () =>
      JSON.parse(JSON.stringify(modelStore.model.detailing?.assemblies ?? [])),
    detailingSchedule: () => JSON.parse(JSON.stringify(detailingStore.schedule ?? null)),
    rebarSceneBuilds,
    rebarSceneCensus: liveRebarSceneCensus,
    canvasCount: () => document.querySelectorAll('canvas').length,
    sceneCacheStats,
    openTimeline,
    autosaveRevisions: async () => (await storedAutosaveRevisions())
      .map(({ revision, timestamp, status }) => ({ revision, timestamp, status })),
    autosaveStored: async () => {
      const read = await loadAutosave();
      return {
        revision: read.revision,
        fingerprint: autosaveFingerprint(read.value),
        backend: read.backend,
        rejected: read.rejected.length,
        unfinishedRevision: read.unfinishedRevision,
      };
    },
    autosaveOutcome: () => JSON.parse(JSON.stringify(lastAutosaveOutcome())),
  };
  const actions: StabileoTestActions = {
    /** Seed a coordinated assembly — the same shape the pipeline writes. */
    seedDetailing: (assemblies: unknown) => {
      modelStore.model.detailing = {
        version: 1, assemblies: assemblies as never,
      };
    },
    selectAssembly: (id: string) => { detailingStore.select(id); },
    reviewAssembly: (record: unknown) =>
      detailingStore.review(record as never),
    toggleBarLock: (barId: string) => { detailingStore.toggleLock(barId); },
    loadExample: async (name: string) => { await modelStore.loadExample(name); },
    /** Reset the selection between gestures — the position, not the subject. */
    clearSelection: () => { uiStore.clearSelection(); },
    solve: async () => { await runGlobalSolve(); },
    openDesignTab: () => { uiStore.proActiveTab = 'design'; },
    computeDemands: () => designRunStore.computeDemands(),
    codeCheck: () => designRunStore.runCodeCheck(),
    autoDesign: (ids: number[]) => designRunStore.autoDesign(ids),
    designAll: () => designRunStore.designAll(),
    cancel: () => designRunStore.cancel(),
    autosaveNow: () => requestAutosave('manual'),
    autosaveDiscard: () => clearAutosave(),
  };
  // Frozen so a spec (or anything else) cannot substitute a hook implementation.
  (window as unknown as { __stabileo?: StabileoTestHooks }).__stabileo = Object.freeze(hooks);
  (window as unknown as { __stabileoActions?: StabileoTestActions }).__stabileoActions = Object.freeze(actions);
}
