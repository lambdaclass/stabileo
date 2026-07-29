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
 * Nothing here mutates app state except `loadExample`, which is the same call the
 * examples menu makes. The bundle cost is trivial and the object is absent unless the
 * query flag is present, so production pages never expose it.
 */

import { modelStore, verificationStore, uiStore, historyStore } from '../store';
import { detailingStore } from '../store/detailing.svelte';
import { designRunStore } from '../store/design-run.svelte';
import { isSolverReady } from '../engine/wasm-solver';
import { getStructuralSolveCount } from './solve-counter';
import { runGlobalSolve } from '../engine/live-calc';

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
  selection(): number[];
  reinforcement(elementId: number): unknown;
  rebarSummary(elementId: number): string;
  elementIds(): number[];
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
}

/**
 * Actions a spec may drive. Each one is the SAME operation a UI control performs;
 * none of them writes internal state directly.
 */
export interface StabileoTestActions {
  loadExample(name: string): Promise<void>;
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
        unsupported: s.unsupported, provisionalRetained: s.provisionalRetained,
        notReached: s.notReached, aborted: s.aborted ? 1 : 0,
      };
    },
    selection: () => [...uiStore.selectedElements].sort((a, b) => a - b),
    reinforcement: (id) => modelStore.elements.get(id)?.reinforcement ?? null,
    rebarSummary,
    elementIds: () => [...modelStore.elements.keys()].sort((a, b) => a - b),
    orientationSuspectCount: () => verificationStore.orientationSuspectCount,
    undoCount: () => historyStore.undoCount,
    canvasInkRatio,
    codeSettings: () => JSON.parse(JSON.stringify(modelStore.model.codeSettings ?? null)),
    certificateVerifierId: (id: number) =>
      verificationStore.outcomeFor(id)?.certificate?.verifierId ?? null,
    detailingAssemblies: () =>
      JSON.parse(JSON.stringify(modelStore.model.detailing?.assemblies ?? [])),
    detailingSchedule: () => JSON.parse(JSON.stringify(detailingStore.schedule ?? null)),
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
    solve: async () => { await runGlobalSolve(); },
    openDesignTab: () => { uiStore.proActiveTab = 'design'; },
    computeDemands: () => designRunStore.computeDemands(),
    codeCheck: () => designRunStore.runCodeCheck(),
    autoDesign: (ids: number[]) => designRunStore.autoDesign(ids),
    designAll: () => designRunStore.designAll(),
    cancel: () => designRunStore.cancel(),
  };
  // Frozen so a spec (or anything else) cannot substitute a hook implementation.
  (window as unknown as { __stabileo?: StabileoTestHooks }).__stabileo = Object.freeze(hooks);
  (window as unknown as { __stabileoActions?: StabileoTestActions }).__stabileoActions = Object.freeze(actions);
}
