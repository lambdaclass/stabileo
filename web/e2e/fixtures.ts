import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared Playwright fixtures for the RC Design suite.
 *
 * Determinism rules encoded here:
 *  - localStorage is cleared and the locale forced to `en` BEFORE the app boots, so
 *    autosave never leaks between specs and assertions are language-stable.
 *  - the model is loaded through a hook, never by clicking through the examples menu.
 *  - every spec waits on REAL state (`solverReady`, revision counters), never on a
 *    sleep. A stubbed WASM solver fails the readiness gate loudly.
 */

export const PRO_URL = '/app/pro?e2e=1';

/**
 * The bar and concrete families the 3-D scene batches by.
 *
 * Restated here rather than imported: `e2e/` is compiled by Playwright, not by the app's Vite
 * pipeline, and reaching into `src/lib/three` from a spec would drag Three.js into the test
 * process to read six strings. `rebar-toggles.spec.ts` asserts that this list matches the
 * renderer's own, so a family added on one side cannot go unnoticed on the other.
 */
export const SOLID_FAMILIES = [
  'column', 'beam', 'slab', 'wall', 'footing', 'pedestal',
] as const;

export type SolidFamily = typeof SOLID_FAMILIES[number];

/** What the renderer is drawing right now, per family. See `rebarSceneCensus`. */
export interface RebarSceneCensus {
  /** Bars drawn, per family — plus `unknown` for steel no family could claim. */
  bars: Record<SolidFamily | 'unknown', number>;
  /** Concrete solids drawn, per family. */
  solids: Record<SolidFamily, number>;
  /** Conflict markers on screen. */
  markers: number;
  /** Triangles drawn, bars and concrete together. */
  triangles: number;
  /** Meshes a raycast would consider — what is selectable. */
  pickable: number;
}

export interface TestHooks {
  version: number;
  solverReady(): boolean;
  analysisRevision(): number;
  demandRevision(): number;
  providedRevision(): number;
  baselineRevision(): number;
  isBaselineStale(): boolean;
  solveCount(): number;
  modelVersion(): number;
  designRunId(): string | null;
  displayStatus(id: number): string;
  displayRatio(id: number): number | null;
  outcome(id: number): string | null;
  hasCertificate(id: number): boolean;
  counts(): Record<string, number>;
  runCounts(): Record<string, number> | null;
  /**
   * The proposal a PROVISIONAL_BIAXIAL member carries, or null when it is not one.
   *
   * Everything a reader needs in order to triage the member: which axis nobody checked, its
   * moment in kN·m, what fraction of the primary that is, the combination that governs it, and
   * the warning keys the panels render. A ratio alone cannot be triaged.
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
  reinforcement(id: number): unknown;
  rebarSummary(id: number): string;
  elementIds(): number[];
  orientationSuspectCount(): number;
  undoCount(): number;
  canvasInkRatio(): number;
  /** How many times the 3-D viewport has built its tube geometry. */
  rebarSceneBuilds(): number;
  /**
   * What the open 3-D workspace is DRAWING, per family. Null when none is open.
   *
   * Read off the meshes, not off the filter. The on-screen tally is the filter's own account of
   * itself and was updating perfectly while every layer switch reached nothing.
   */
  rebarSceneCensus(): RebarSceneCensus | null;
  /** Canvases in the page, of any kind. A layer switch must not add one. */
  canvasCount(): number;
  /** Scene-projection cache hits and misses. */
  sceneCacheStats(): { hits: number; misses: number };
  /** Every autosave revision currently stored in IndexedDB, newest first. */
  autosaveRevisions(): Promise<Array<{ revision: number; timestamp: string; status: string }>>;
  /** The family census of the newest readable stored project, plus how it was read. */
  autosaveStored(): Promise<{
    revision: number | null;
    fingerprint: Record<string, number>;
    backend: string;
    rejected: number;
    unfinishedRevision: number | null;
  }>;
  /** The last write attempt: trigger, outcome, backend, revision. */
  autosaveOutcome(): {
    reason: string; at: string; ok: boolean; backend: string;
    revision: number | null; failureKind: string | null;
  } | null;
}

/** Actions a spec may drive — the same operations the UI controls perform. */
export interface TestActions {
  loadExample(name: string): Promise<void>;
  solve(): Promise<void>;
  openDesignTab(): void;
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

declare global {
  interface Window {
    __stabileo: TestHooks;
    // Declared alongside the hooks because specs drive it. It was missing, and Playwright does
    // not typecheck, so nothing said so.
    __stabileoActions: TestActions;
    __stabileoCommands: {
      computeDemands(): unknown;
      codeCheck(): unknown;
      autoDesign(ids: number[]): unknown;
      designAll(): unknown;
      cancel(): void;
    };
  }
}

/**
 * Parallel-solve fallbacks seen in the current page, newest last.
 *
 * Module-level because `solveModel` is a free function that only receives a `Page`, and
 * threading a per-test collector through every call site would touch every spec to serve one
 * diagnostic. Cleared when the `pro` fixture hands out a page, and this project runs
 * `workers: 1` with `fullyParallel: false`, so there is exactly one page in flight at a time.
 */
const solveFallbacks: string[] = [];

/** Evaluate a hook in the page. */
export function hook<T>(page: Page, fn: (h: TestHooks) => T): Promise<T> {
  return page.evaluate(fn as never, undefined as never) as never;
}

/**
 * A PRO page booted in an explicit locale.
 *
 * Default `en`, so every existing spec keeps its stable English assertions. A spec that
 * needs Spanish sets `test.use({ appLocale: 'es' })` — which is how the bilingual journeys
 * prove that engine output is translated rather than pasted.
 */
export const test = base.extend<{ pro: Page; appLocale: string }>({
  appLocale: ['en', { option: true }],
  pro: async ({ page, appLocale }, use) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (m) => {
      const text = m.text();
      /**
       * The one WARNING worth keeping, and why it is kept rather than asserted on.
       *
       * `solveCombinations3D` runs the load cases across web workers and falls back to solving
       * them one after another on the main thread if the worker pool cannot be brought up. That
       * fallback is correct behaviour and this suite must not fail because it happened.
       *
       * But it is also the difference between a solve that takes half a minute and one that
       * takes many, and it is the leading explanation for the only failure this suite has
       * produced that nobody could account for: a `page.evaluate(solve)` on the 7-storey
       * building sitting for fifteen minutes and then timing out. Nothing recorded whether the
       * fallback had fired, because it is a `console.warn` and this listener only kept errors —
       * so the evidence that would have settled it was thrown away on every run.
       *
       * Recorded here, surfaced by `solveModel` when a solve overruns. Diagnosis, not a gate.
       */
      if (/Parallel solve failed/i.test(text)) { solveFallbacks.push(text); return; }
      if (m.type() !== 'error') return;
      // WebGL software-rasteriser chatter is expected under SwiftShader.
      if (/SwiftShader|WebGL|GroupMarkerNotSet|Automatic fallback/i.test(text)) return;
      consoleErrors.push(text);
    });
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    solveFallbacks.length = 0;
    await page.addInitScript((loc) => {
      try {
        localStorage.clear();
        // Force a stable locale: the RC surface is localised, so assertions on
        // English text would otherwise depend on the browser's language.
        localStorage.setItem('stabileo-lang', loc);
        localStorage.setItem('stabileo-lang-manual', '1');
      } catch { /* private mode */ }
    }, appLocale);

    await page.goto(PRO_URL);
    // Hooks exist ⇒ the app booted with ?e2e=1.
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
    // The REAL WASM solver must be live; the Vite stub fails here.
    await expect
      .poll(() => page.evaluate(() => window.__stabileo.solverReady()), { timeout: 60_000, message: 'real WASM solver must be initialised (not the Vite stub)' })
      .toBe(true);

    // The RC Design tab must be the active PRO tab for its table to exist.
    await page.evaluate(() => window.__stabileoActions.openDesignTab());

    await use(page);

    expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  },
});

/** Load a fixture and wait for the model to settle. */
export async function loadModel(page: Page, name: string): Promise<number[]> {
  await page.evaluate(async (n) => { await window.__stabileoActions.loadExample(n); }, name);
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBeGreaterThan(0);
  return page.evaluate(() => window.__stabileo.elementIds());
}

/** Solve, then run the three design commands. Returns the run counts. */
export async function designAll(page: Page): Promise<Record<string, number>> {
  await solveModel(page);
  await page.evaluate(() => window.__stabileoActions.designAll());
  await expect.poll(() => page.evaluate(() => window.__stabileo.runCounts()?.total ?? 0)).toBeGreaterThan(0);
  return (await page.evaluate(() => window.__stabileo.runCounts()))!;
}

/**
 * How long a solve may take before the setup is declared stuck.
 *
 * ── Why this is a tightening, not a loosening ──────────────────────
 *
 * `page.evaluate` inherits the TEST's timeout, and the heavy specs set that to 900 s so the
 * measurements they take have room. So a solve that never finished consumed the whole
 * fifteen minutes and then failed pointing at the `evaluate` line — no cause, no evidence, and
 * fifteen minutes of a suite spent learning nothing. It happened three times across two runs,
 * always on the 7-storey building, never on the same test twice.
 *
 * ── How this number was chosen, and re-chosen ─────────────────────
 *
 * The 7-storey solve is 20–40 s on an idle machine and the small models are seconds, so the
 * first attempt set this at 240 s — six times headroom, and a quarter of the old budget.
 *
 * It fired. On a run where the cost spec had just spent ten minutes on the same machine, the
 * 7-storey setup solve exceeded four minutes, and the diagnostic reported what it was for:
 * **the parallel solve had NOT fallen back**. The worker pool was up and the solve was simply
 * that slow under accumulated load. So the leading explanation for this suite's one recurring
 * failure is disproven, and 240 s is below what a healthy-but-loaded machine needs.
 *
 * Eight minutes is the calibrated number: still well under the 900 s these specs allow
 * themselves, so a genuine hang still fails in half the time and says why, and far enough above
 * the measured worst case that it does not fire on load alone. Raising it from 240 s is
 * calibration against evidence this deadline produced; it remains a tightening of the 900 s it
 * replaced, and the measurement budgets are untouched either way.
 *
 * The real remedy is fewer full 7-storey setups — the suite runs about thirteen — and that is a
 * spec refactor with a genuine risk of reducing coverage, so it is written up rather than
 * attempted here. See `docs/handoffs/pr19-readiness.md` §9.
 */
const SOLVE_DEADLINE_MS = 480_000;

/** Run the same global solve the toolbar button triggers, and wait for it. */
export async function solveModel(page: Page): Promise<void> {
  const before = await page.evaluate(() => window.__stabileo.solveCount());
  const started = Date.now();
  /**
   * The solve is invoked and awaited exactly as it always was, and RACED against a deadline.
   *
   * The first attempt at this fired the action without awaiting it and polled the counter
   * instead, so the wait could carry its own timeout. That was worse: it changed how the solve
   * is invoked, and it turned any immediate failure inside the page into "did not finish in
   * 0 s" — a message that reads like a hang and means the opposite. The evidence for that is
   * that it produced exactly one, on the fourth 7-storey setup of a run.
   *
   * Racing keeps the original call — awaited, its rejection still propagating — and adds only a
   * clock beside it. `page.evaluate` cannot be cancelled, so the losing promise is left with a
   * catch attached: the solve will finish or the page will be torn down under it, and neither
   * may surface later as an unhandled rejection.
   */
  const solved = page.evaluate(async () => { await window.__stabileoActions.solve(); })
    .then(() => 'done' as const);
  solved.catch(() => { /* reported below, or irrelevant once the page is gone */ });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), SOLVE_DEADLINE_MS);
  });
  const outcome = await Promise.race([solved, deadline]);
  clearTimeout(timer);

  if (outcome === 'timeout') {
    const elapsed = Math.round((Date.now() - started) / 1000);
    const fellBack = solveFallbacks.length > 0;
    throw new Error(
      `the solve did not finish in ${elapsed} s (deadline ${SOLVE_DEADLINE_MS / 1000} s).\n`
      + `Parallel solve fell back to sequential: ${fellBack ? 'YES' : 'no'}`
      + (fellBack ? `\n  ${solveFallbacks.join('\n  ')}` : '')
      + '\nA fallback means the worker pool could not be brought up and every load case was '
      + 'solved one after another on the main thread, which on the 7-storey building is the '
      + 'difference between half a minute and many. Without a fallback this is a genuine '
      + 'slowdown in the solve and should be treated as a regression.',
    );
  }

  await expect.poll(() => page.evaluate(() => window.__stabileo.solveCount()), { timeout: 90_000 })
    .toBeGreaterThan(before);
}

/** Ensure demands exist (the design table needs them). */
export async function computeDemands(page: Page): Promise<void> {
  await page.evaluate(() => window.__stabileoActions.computeDemands());
  await expect.poll(() => page.evaluate(() => window.__stabileo.demandRevision())).toBeGreaterThan(0);
}

/**
 * Show the Básico project panel, where the project controls live on desktop.
 *
 * Básico is the ribbon, and `BasicPanel` is what renders `ToolbarProject` — so
 * `project-open-file` is not attached until this panel is showing. Three specs learned
 * that separately and each grew its own copy of the click; one UI move then read as three
 * unrelated broken files, which is most of why ten tests looked like ten defects.
 *
 * Clicking is conditional because `hdr-project` TOGGLES: `openBasicPanel` defaults
 * `opts.toggle` to true, so an unconditional click CLOSES the panel for any journey that
 * opens a project twice, and the file input then detaches mid-test.
 */
export async function openBasicProjectPanel(page: Page): Promise<void> {
  const panel = page.locator('[data-testid="basic-panel"][data-panel="project"]');
  if (await panel.count() === 0) await page.getByTestId('hdr-project').click();
  await expect(panel, 'the Básico project panel is showing').toBeVisible();
}

export { expect };
