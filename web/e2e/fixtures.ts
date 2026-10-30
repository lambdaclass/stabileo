import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

/**
 * A project a spec writes stands for one made in this build: stamped as solved with it, so opening
 * it raises no re-check notice (`src/lib/store/recheck.svelte.ts`). A spec about that notice
 * (`recheck-provenance.spec.ts`) leaves the stamp out on purpose.
 */
export const CURRENT_STAMP = {
  id: 'e2e-current',
  resultsVersion: (JSON.parse(readFileSync(new URL('../src/lib/provenance/result-changes.json', import.meta.url), 'utf8')) as { currentResultsVersion: number }).currentResultsVersion,
  analyses: [] as string[],
};


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
 * Open one section of the regulation load generator (`ProAutoLoadsDialog`): the dialog shows one
 * at a time, chosen in its left column.
 */
export async function alSection(page: import('@playwright/test').Page, id: 'regulations' | 'dead' | 'live' | 'roof' | 'wind' | 'snow' | 'seismic' | 'special' | 'applying' | 'combos'): Promise<void> {
  await page.getByTestId(`al-nav-${id}`).click();
}

/**
 * The bar and concrete families the 3-D scene batches by.
 *
 * Restated here rather than imported: `e2e/` is compiled by Playwright, not by the app's Vite
 * pipeline, and reaching into `src/lib/three` from a spec would drag Three.js into the test
 * process to read seven strings. `rebar-toggles.spec.ts` asserts that this list matches the
 * renderer's own, so a family added on one side cannot go unnoticed on the other.
 */
export const SOLID_FAMILIES = [
  'column', 'beam', 'joint', 'slab', 'wall', 'footing', 'pedestal',
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
  /** The linear static certificate: the base solve's, and what the results panel shows. */
  linearCertificate(): {
    base: { status: string; dim?: string; certificate?: { status: string; reason?: string } };
    shown: { status: string; scope?: string; certificate?: { status: string; reason?: string } };
    is3D: boolean;
    view: string;
    caseId: number | null;
    comboId: number | null;
  };
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
  quadIds(): number[];
  /** The names of the sections in the model — what the model actually stored. */
  sectionNames(): string[];
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
  /** The project as File → Save writes it, as JSON text. */
  serializeProject(): string;
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
  /** The model's analysis rules (`model.analysis`); null when none. */
  analysisSettings(): {
    selfWeight?: Array<{ caseId: number; direction: string; factor: number; elements?: number[]; groupId?: number }>;
    combinationMethod?: string; perCombination?: string;
  } | null;
  /** The 3D distributed loads, as plain copies of their data. */
  distributedLoads3D(): Array<Record<string, unknown>>;
}

/** Actions a spec may drive — the same operations the UI controls perform. */
export interface TestActions {
  loadExample(name: string): Promise<void>;
  /** Open a project from its `.ded` JSON, as File → Open does. False when refused. */
  loadProject(file: Record<string, unknown>): boolean;
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
 * Boot a page into PRO, in a known locale, with the real solver up and Design active.
 *
 * Extracted from the `pro` fixture so that a page Playwright did NOT hand to a test — the
 * worker-scoped preparation in `prepared-building.ts` opens its own — boots through exactly
 * the same steps. A second copy of this sequence is a second definition of "the app is ready",
 * and the two would drift the first time one of them learned something the other did not.
 */
export async function bootPro(page: Page, appLocale = 'en'): Promise<void> {
  // Init scripts also run on reload: clear only for this boot, or recovery's saved
  // workspace is deleted before the app can restore it.
  const bootKey = `stabileo-e2e-boot-${Date.now()}-${Math.random()}`;
  await page.addInitScript(({ loc, bootKey }) => {
    try {
      if (sessionStorage.getItem(bootKey)) return;
      sessionStorage.setItem(bootKey, '1');
      localStorage.clear();
      // Force a stable locale: the RC surface is localised, so assertions on
      // English text would otherwise depend on the browser's language.
      localStorage.setItem('stabileo-lang', loc);
      localStorage.setItem('stabileo-lang-manual', '1');
      // The normative design is off by default in PRO (`uiStore.designInPro`); the PRO specs
      // exercise it, so it is turned on as a reader turns it on. `design-optional.spec.ts` covers
      // the default.
      localStorage.setItem('stabileo-design-in-pro', '1');
    } catch { /* private mode */ }
  }, { loc: appLocale, bootKey });

  await page.goto(PRO_URL);
  // Hooks exist ⇒ the app booted with ?e2e=1.
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  // The REAL WASM solver must be live; the Vite stub fails here.
  await expect
    .poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 60_000, message: 'real WASM solver must be initialised (not the Vite stub)' })
    .toBe(true);

  // The RC Design tab must be the active PRO tab for its table to exist.
  await page.evaluate(() => window.__stabileoActions.openDesignTab());
}

/**
 * A PRO page booted in an explicit locale.
 *
 * Default `en`, so every existing spec keeps its stable English assertions. A spec that
 * needs Spanish sets `test.use({ appLocale: 'es' })` — which is how the bilingual journeys
 * prove that engine output is translated rather than pasted.
 */
export const test = base.extend<{ pro: Page; appLocale: string; recheckNotice: 'acknowledge' | 'assert' }>({
  appLocale: ['en', { option: true }],
  /**
   * The re-check notice (`RecheckNotice.svelte`) opens over a project solved with an earlier
   * results version, which every committed fixture becomes at the next results-version bump.
   * By default it is acknowledged whenever it would block an action, so a bump does not fail
   * specs that are about something else (eight of them did, the last time). A spec about the
   * notice itself sets `test.use({ recheckNotice: 'assert' })` and sees it untouched.
   */
  recheckNotice: ['acknowledge', { option: true }],
  /**
   * `page.goto` to the application, with the test hooks asked for, returns once the hooks are
   * there. The application is loaded on demand (main.ts imports it for an app address), so it can
   * finish after the page's load event; specs that call `window.__stabileo…` straight after
   * `goto` used to find it already installed beside an application that mounted at once.
   */
  page: async ({ page, recheckNotice }, use) => {
    if (recheckNotice === 'acknowledge') {
      await page.addLocatorHandler(page.getByTestId('recheck-notice'), async () => {
        await page.getByTestId('recheck-ack').check();
        await page.getByTestId('recheck-later').click();
      });
    }
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      if (/[?&]e2e=1/.test(url) && /^\/?(app\b|demo\b|\?)|[?&]embed\b|#(data|embed|code)=/.test(url.replace(/^https?:\/\/[^/]+/, ''))) {
        await page.waitForFunction(() => !!(window as { __stabileoActions?: unknown }).__stabileoActions, null, { timeout: 60_000 });
      }
      return response;
    };
    await use(page);
  },
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
    await bootPro(page, appLocale);

    await use(page);

    expect(pageErrors, `page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  },
});

/**
 * Five beams of `pro-edificio-7p` turned 20° about their axis, for the specs about provisional
 * proposals. The building as committed has none: its last five came from a shell drilling
 * defect, and once that was fixed their secondary-axis ratio fell to 0.010–0.028. Turned, they
 * bend about both axes for a real reason. The unit tests use the same variant
 * (`src/lib/engine/detailing/__tests__/helpers/workspace-scene.ts`).
 */
export const ROLLED_BEAMS = { ids: [88, 151, 153, 157, 164], degrees: 20 } as const;

/** Turn `ROLLED_BEAMS` in the loaded model. */
export async function turnRolledBeams(page: Page): Promise<void> {
  await page.evaluate(({ ids, degrees }) => window.__stabileoActions.turnElements([...ids], degrees), ROLLED_BEAMS);
}

/** Load a fixture and wait for the model to settle. */
/**
 * Columns at every intersection of the grid, then beams along its axes, through the Building
 * panel's column and beam tools (one placement each, as a person does it). `levelTo` stops both at
 * a level. Leaves the Building panel on its beams tool.
 */
export async function placeFrameFromGrid(page: Page, opts: { levelTo?: string } = {}): Promise<void> {
  await page.getByTestId('building-tab-columns').click();
  if (opts.levelTo) await page.getByTestId('building-level-to').selectOption({ label: opts.levelTo });
  await page.getByTestId('building-columns-place').click();
  await expect(page.getByTestId('building-result')).toBeVisible();
  await page.getByTestId('building-tab-beams').click();
  if (opts.levelTo) await page.getByTestId('building-level-to').selectOption({ label: opts.levelTo });
  await page.getByTestId('building-beams-place').click();
  await expect(page.getByTestId('building-result')).toBeVisible();
}

/** Slabs in every bay, from the Building panel's slab tool. */
export async function placeSlabsFromGrid(page: Page): Promise<void> {
  await page.getByTestId('building-tab-slabs').click();
  await page.getByTestId('building-place-slabs').click();
  await expect(page.getByTestId('building-result')).toBeVisible();
}

export async function loadModel(page: Page, name: string): Promise<number[]> {
  await withCrashGuard(page, page.evaluate(async (n) => {
    await window.__stabileoActions.loadExample(n);
  }, name));
  await withCrashGuard(page, expect
    .poll(() => page.evaluate(() => window.__stabileo.elementIds().length))
    .toBeGreaterThan(0));
  return page.evaluate(() => window.__stabileo.elementIds());
}

/**
 * Solve, then run the three design commands. Returns the run counts.
 *
 * The wait is the one `project-restore.spec.ts` gives the same command. Polling's default 10 s
 * covered the 7-storey building, not the 408-member frame `rebar-workspace-notices.spec.ts`
 * prepares: on CI its design outlasted the 10 s and failed the preparation of every test in
 * that file (the attempt that got through took 43.7 s for solve and design together).
 */
export async function designAll(page: Page): Promise<Record<string, number>> {
  await solveModel(page);
  await page.evaluate(() => window.__stabileoActions.designAll());
  await expect.poll(() => page.evaluate(() => window.__stabileo.runCounts()?.total ?? 0),
    { timeout: 180_000 }).toBeGreaterThan(0);
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

/**
 * A promise that rejects the moment the page's renderer dies.
 *
 * ── The failure this exists to name ─────────────────────────────────
 *
 * When a renderer process crashes, `page.evaluate` does not reject. It waits — for the test
 * timeout, and then reports «page.evaluate: Test timeout of 60000ms exceeded» pointing at
 * whichever line happened to be waiting. Everything downstream of that reads like a hang: the
 * page's own `setTimeout` never fires, a solve measured at 60 ms never returns, and the code's
 * sequential fallback never runs because the `catch` that triggers it needs JavaScript to be
 * executing in a page that no longer exists.
 *
 * It cost a full investigation to learn that the page was not busy but **gone**: a CDP session
 * opened against the stalled page answered `Target page, context or browser has been closed`,
 * and `page.on('crash')` had fired. The browser log named the cause — `Received signal 4
 * ILL_ILLTRP` in the GPU process, inside the software GL stack, after a burst of `ReadPixels`
 * stalls.
 *
 * Racing against this turns sixty seconds of silence into an immediate failure that says what
 * happened. It does not make the crash less likely and it is not meant to: a crash still fails
 * the run. It makes the crash **legible**, which the timeout never was.
 */
function crashSignal(page: Page): { promise: Promise<never>; dispose(): void } {
  let onCrash: (() => void) | undefined;
  let onClose: (() => void) | undefined;
  const promise = new Promise<never>((_, reject) => {
    onCrash = (): void => reject(new Error(
      'the renderer process crashed while the test was waiting on it.' + '\n'
      + 'This is a browser-level crash, not a failed assertion and not a slow computation: '
      + 'the page stops executing JavaScript entirely, so timers inside it stop, pending '
      + 'promises never settle, and any in-page fallback never runs.' + '\n'
      + 'Seen in this suite as a GPU-process abort (signal 4, ILL_ILLTRP) under the software '
      + 'GL stack. See section 9 of docs/handoffs/m2-qa-handoff.md.',
    ));
    onClose = (): void => reject(new Error(
      'the page was closed while the test was waiting on it.',
    ));
  });
  page.on('crash', onCrash!);
  page.on('close', onClose!);
  // Nothing else awaits this promise, and an unobserved rejection would surface later as an
  // unhandled rejection in an unrelated test.
  promise.catch(() => { /* observed by the race, or irrelevant */ });
  return {
    promise,
    dispose: () => {
      if (onCrash) page.off('crash', onCrash);
      if (onClose) page.off('close', onClose);
    },
  };
}

/** Run `work`, failing immediately if the renderer dies under it. */
export async function withCrashGuard<T>(page: Page, work: Promise<T>): Promise<T> {
  const crash = crashSignal(page);
  try {
    return await Promise.race([work, crash.promise]);
  } finally {
    crash.dispose();
  }
}

/**
 * Wait until the REAL WASM solver is live.
 *
 * ── Why this is exported ────────────────────────────────────────────
 *
 * `bootPro` has always done this, and specs that use the `pro` fixture inherit it. Specs that
 * drive a plain `page` do not, and three of them called `solve()` the moment the model finished
 * loading — before the solver had finished coming up. The result was a `page.evaluate` that
 * never returned and a test that failed sixty seconds later pointing at the `evaluate` line,
 * with no cause attached.
 *
 * It presented as a slow solve, which is what made it expensive to find: the shed's 633-element
 * solve was measured at 83–129 ms, six runs, both with hardware GL and under swiftshader. So the
 * solve was never slow and the deadline was never the problem — the call was simply made too
 * early, and lost a race it lost only sometimes.
 */
export async function awaitSolverReady(page: Page): Promise<void> {
  await withCrashGuard(page, expect
    .poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), {
      timeout: 60_000,
      message: 'the WASM solver must be live before a solve is requested',
    })
    .toBe(true));
}

/** Run the same global solve the toolbar button triggers, and wait for it. */
export async function solveModel(page: Page): Promise<void> {
  // The solver has to be up before it is asked to solve. See `awaitSolverReady`.
  await awaitSolverReady(page);
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
  /*
   * The fallback line, captured for the duration of THIS call.
   *
   * The module-level collector is filled by the `pro` fixture's console listener, so a spec that
   * drives a plain `page` — as the three M2 joint specs do — had no listener at all and the one
   * message that explains a slow solve was discarded on every run. Attaching here means the
   * diagnostic below is available to every caller rather than to half of them.
   */
  const localFallbacks: string[] = [];
  const onConsole = (m: { text(): string }): void => {
    const text = m.text();
    if (/Parallel solve failed/i.test(text)) localFallbacks.push(text);
  };
  page.on('console', onConsole);

  const solved = withCrashGuard(
    page,
    page.evaluate(async () => { await window.__stabileoActions.solve(); }),
  ).then(() => 'done' as const);
  solved.catch(() => { /* reported below, or irrelevant once the page is gone */ });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), SOLVE_DEADLINE_MS);
  });
  const outcome = await Promise.race([solved, deadline]);
  clearTimeout(timer);

  if (outcome === 'timeout') {
    page.off('console', onConsole);
    const elapsed = Math.round((Date.now() - started) / 1000);
    const fellBack = solveFallbacks.length > 0 || localFallbacks.length > 0;
    throw new Error(
      `the solve did not finish in ${elapsed} s (deadline ${SOLVE_DEADLINE_MS / 1000} s).\n`
      + `Parallel solve fell back to sequential: ${fellBack ? 'YES' : 'no'}`
      + (fellBack ? `\n  ${[...solveFallbacks, ...localFallbacks].join('\n  ')}` : '')
      + '\nA fallback means the worker pool could not be brought up and every load case was '
      + 'solved one after another on the main thread, which on the 7-storey building is the '
      + 'difference between half a minute and many. Without a fallback this is a genuine '
      + 'slowdown in the solve and should be treated as a regression.',
    );
  }

  page.off('console', onConsole);

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

/**
 * Make sure the Documents stage is open before reaching a control inside it.
 *
 * ── Why this exists, and why it is a helper and not a UI change ────
 *
 * PR20 moved the report, the drawings, the schedule, the 3-D view and the professional review out
 * of the coordinated-detailing panel and into a stage of their own, collapsed by default like
 * every other stage. Fourteen specs reach `doc-3d`, `doc-report`, `doc-dxf`, `doc-xlsx` or the
 * review controls, and a collapsed `<details>` keeps its children in the DOM — so a locator
 * RESOLVES, reports the right element, and then waits forever for it to become visible. That is
 * the failure signature every one of them showed.
 *
 * The assertions are unchanged. What changed is which container holds the controls, and this is
 * the one line that says so. Opening the stage by default would have hidden the problem instead
 * of describing it, and would undo the point of making Documents a stage.
 */
/**
 * The drawings place of design, its set laid out on arrival; `setup` also opens the set's
 * configuration (format, kinds, entries, display, title block, details), which folds below the
 * sheets there.
 */
export async function openSheetsPlace(page: Page, opts: { setup?: boolean } = {}): Promise<void> {
  if (!(await page.getByTestId('sheets-panel').isVisible())) await designPlace(page, 'sheets');
  await expect(page.getByTestId('sheets-build')).toBeEnabled({ timeout: 120_000 });
  if (opts.setup) {
    const setup = page.getByTestId('sheets-setup');
    if (!(await setup.evaluate((d) => (d as HTMLDetailsElement).open))) await setup.locator('> summary').click();
  }
}

export async function openDocumentsStage(page: Page): Promise<void> {
  if (await page.getByTestId('documents-stage').isVisible()) return;
  await designPlace(page, 'documents');
}

/**
 * Choose a language from a `LocaleSelect`.
 *
 * ── Why this exists ────────────────────────────────────────────────
 *
 * The landing and the blog used a native `<select class="nav-lang">`, and
 * every spec that switched language did it with `selectOption(code)` and
 * checked it with `toHaveValue(code)`. The control is now a drawn list —
 * the platform put a native popup wherever it liked, which on macOS is
 * beside the control rather than belonging to it — so both of those stopped
 * resolving, and a spec that waits on a `<select>` that no longer exists
 * fails as a sixty-second timeout with no hint of the cause.
 *
 * Press, then pick by CODE rather than by the visible label: the options are
 * language names written in their own language, so picking by text would
 * assert a dictionary entry every time it meant to assert a locale.
 */
export async function pickLanguage(page: Page, testid: string, code: string): Promise<void> {
  await page.getByTestId(`${testid}-button`).click();
  await page.getByTestId(`${testid}-list`).locator(`[data-value="${code}"]`).click();
}

/**
 * Choose the application's language from the header picker.
 *
 * The header carried the last native `<select>` in the app and now carries a
 * `LocaleSelect` like the landing, the blog and the settings panel. Seventeen
 * specs pressed it with `selectOption`, which resolves against nothing here —
 * so this is the one place that knows how the control is built.
 */
export async function setAppLanguage(page: Page, code: string): Promise<void> {
  await pickLanguage(page, 'lang-select', code);
}

/** What the header picker is showing, as a language code. */
export function appLanguage(page: Page): Promise<string | null> {
  return page.getByTestId('lang-select').getAttribute('data-value');
}

/**
 * The Design stage is one workspace: the desk, docked around the viewer. `openDeskStage` lands on
 * it, on the place it was left. The screens the stage used to open beside the viewer (the
 * concrete workflow with its member table and its detailing, the steel profiles, the steel
 * connections, the design data, the check under other codes) are places of the desk now, reached
 * with `designPlace`, which presses the step the place belongs to and then its rail entry, as a
 * person does.
 */
export async function openDeskStage(page: Page): Promise<void> {
  if (!(await page.getByTestId('design-desk').isVisible())) await page.getByTestId('pr-stage-design').click();
  await expect(page.getByTestId('design-desk')).toBeVisible();
}

/** The places of design and the step each belongs to (`stepOf` in `design-desk-ui.svelte.ts`). */
const PLACE: Record<string, { step: string; rail: string }> = {
  prepare: { step: 'prepare', rail: 'desk-rail-prepare' },
  designData: { step: 'prepare', rail: 'desk-rail-designData' },
  plan: { step: 'size', rail: 'desk-tab-plan' },
  levels: { step: 'size', rail: 'desk-tab-levels' },
  list: { step: 'size', rail: 'desk-rail-list' },
  steel: { step: 'size', rail: 'desk-rail-steel' },
  connections: { step: 'size', rail: 'desk-rail-connections' },
  codes: { step: 'size', rail: 'desk-rail-codes' },
  detailing: { step: 'detail', rail: 'desk-rail-detailing' },
  documents: { step: 'document', rail: 'desk-rail-documents' },
  sheets: { step: 'document', rail: 'desk-rail-sheets' },
  listings: { step: 'document', rail: 'desk-rail-listings' },
};
export type DesignPlace = keyof typeof PLACE | 'otherCodes' | 'foreignCodes';

/**
 * Go to a place of design, entering design first when it is not on screen. `otherCodes` is «Other
 * code» in its independent-check mode (the ribbon's former «Check members»), `foreignCodes` in its
 * equivalences mode (the desk's former «Foreign codes»).
 */
export async function designPlace(page: Page, place: DesignPlace): Promise<void> {
  await openDeskStage(page);
  const key = place === 'otherCodes' || place === 'foreignCodes' ? 'codes' : place;
  const p = PLACE[key]!;
  const rail = page.getByTestId(p.rail);
  if (!(await rail.isVisible())) await page.getByTestId(`desk-step-${p.step}`).click();
  await rail.click();
  if (place === 'otherCodes') await page.getByTestId('codes-mode-verify').click();
  if (place === 'foreignCodes') await page.getByTestId('codes-mode-memoria').click();
}

/** Kept for the specs written against the classic screens: design on screen, on the member list. */
export async function openClassicDesign(page: Page): Promise<void> {
  await designPlace(page, 'list');
}

/** «Size…» over every member, from the top of the Design stage, keeping what was edited by hand. */
/**
 * «Size…» over every member, in one pass: the sections kept, as the specs that read a design's
 * counts were written. Enlarging the sections until every member verifies is the dialog's default
 * and is pinned in `design-resize.test.ts`; on the 408-member frame its rounds outlast a spec.
 */
export async function sizeAll(page: Page, o: { resize?: boolean } = {}): Promise<void> {
  await openDeskStage(page);
  if (!(await page.getByTestId('desk-design').isVisible())) await page.getByTestId('desk-step-size').click();
  await page.getByTestId('desk-design').click();
  await page.getByTestId('desk-run-scope-all').check();
  await page.getByTestId('desk-run-resize').setChecked(o.resize ?? false);
  await page.getByTestId('desk-run').click();
}

/** Generate the coordinated detailing, from the Detail step at the top of the Design stage. */
export async function generateDetailing(page: Page): Promise<void> {
  await designPlace(page, 'detailing');
  await page.getByTestId('cmd-generate-detailing').click();
}

/**
 * Open the 3-D reinforcement view from where design is: the member list's toolbar holds
 * `cmd-open-3d`, the Detail step's rail `desk-rail-3d`; both are `openRebar3DView`.
 */
export async function open3D(page: Page): Promise<void> {
  const list = page.getByTestId('cmd-open-3d');
  if (await list.isVisible()) { await list.click(); return; }
  await designPlace(page, 'detailing');
  await page.getByTestId('desk-rail-3d').click();
}

/** The floor pass (slabs, walls, foundations), a sub-step under the member list, opened. */
export async function openFloorPass(page: Page): Promise<void> {
  await designPlace(page, 'list');
  const d = page.getByTestId('floor-families-disclosure');
  if (await d.getAttribute('open') === null) await d.locator('> summary').click();
  await expect(d).toHaveAttribute('open', '');
}

/** Leave design for the model stage, by the stage bar (the desktop has no close of its own). */
export async function leaveDesign(page: Page): Promise<void> {
  await page.getByTestId('pr-stage-model').click();
  await expect(page.getByTestId('design-desk')).toBeHidden();
}

/**
 * Declare the beams NOT part of the lateral-force-resisting system, through the design data
 * panel, and come back to the design table. Call it after `loadModel` and before designing.
 *
 * Since 292b87f68 a beam that declares no role is designed as part of the system (§9.7.3.8.2:
 * its bottom bars develop fy at the column face), and on that reading the frame fixtures refuse
 * beams of their own: `rc-design-qa-8` e5 and e6, `pro-edificio-7p` all 119 beams,
 * `rc-qa-diagnostic` five (SEARCH_EXHAUSTED, on that anchorage). A spec whose subject needs a
 * design that converges (a converged claim, a constructible level, a provisional proposal on a
 * beam) declares the role, which is the statement a user of these frames makes, and says so.
 */
export async function declareBeamsNotLateral(page: Page): Promise<void> {
  await designPlace(page, 'designData');
  await page.getByTestId('design-data-lateral-beams').selectOption('gravity');
  await designPlace(page, 'list');
}

/**
 * The desk's views: the piece editors are under «Piece» and what is pending under «Pending», in
 * the Size step, with the specialties in its menu; the project's surfaces are in the menu at the
 * foot of every step.
 */
const DESK_MENU: Record<string, string> = {
  frame: 'desk-mode-piece', column: 'desk-mode-piece', wall: 'desk-mode-piece', slab: 'desk-mode-piece', joist: 'desk-mode-piece',
  special: 'desk-mode-piece', pt: 'desk-mode-piece', stairs: 'desk-mode-piece', footing: 'desk-mode-piece', joint: 'desk-mode-piece',
  elements: 'desk-mode-piece', geometry: 'desk-mode-pending', report: 'desk-mode-pending',
  seismic: 'desk-menu-specialties', fire: 'desk-menu-specialties', materials: 'desk-menu-specialties',
  budget: 'desk-menu-project', collab: 'desk-menu-project', arch: 'desk-menu-project', site: 'desk-menu-project',
};
const PROJECT_SURFACES = ['budget', 'collab', 'arch', 'site'];
export async function deskTab(page: Page, tab: string): Promise<void> {
  if (tab === 'codes') { await designPlace(page, 'foreignCodes'); return; }
  if (tab === 'documents') { await designPlace(page, 'documents'); return; }
  if (PLACE[tab]) { await designPlace(page, tab as DesignPlace); return; }
  const target = page.getByTestId(`desk-tab-${tab}`);
  if (await target.isVisible()) { await target.click(); return; }
  if (!PROJECT_SURFACES.includes(tab) && !(await page.getByTestId('desk-mode-piece').isVisible())) await page.getByTestId('desk-step-size').click();
  if (!(await target.isVisible()) && DESK_MENU[tab]) await page.getByTestId(DESK_MENU[tab]!).click();
  await target.click();
}

/**
 * A ribbon stage by name. The Design stage is the desk; a spec that went on to a ribbon command
 * of that stage now goes to its place with `designPlace`.
 */
export async function clickStage(page: Page, stage: string): Promise<void> {
  await page.getByTestId(`pr-stage-${stage}`).click();
}

/**
 * The model ribbon's tools for building and design (the building constructor, the foundations,
 * the physical elements, the generators) are behind «More tools» (`ProGroup.menu`), opened on
 * demand. Every other command is on the ribbon itself. This presses a ribbon command wherever it
 * lives, opening that menu first when the command is inside it.
 */
export const MORE_TOOLS = ['building', 'foundations', 'physical', 'generators'] as const;
/*
 * The Design stage's commands are places of the desk (interface A); the ribbon draws them only
 * while the desk is not on screen. A spec that pressed one goes to its place instead.
 */
const DESIGN_CMD: Record<string, DesignPlace> = {
  design: 'list', designList: 'list', designData: 'designData', designPrepare: 'prepare', steel: 'steel',
  connections: 'connections', otherCodes: 'otherCodes', detailing: 'detailing', documents: 'documents',
};
export async function ribbonCmd(page: Page, id: string): Promise<void> {
  if (DESIGN_CMD[id] && !(await page.getByTestId(`pr-cmd-${id}`).isVisible())) { await designPlace(page, DESIGN_CMD[id]!); return; }
  const cmd = page.getByTestId(`pr-cmd-${id}`);
  if ((MORE_TOOLS as readonly string[]).includes(id) && !(await cmd.isVisible())) {
    await page.getByTestId('pr-more-moreTools').click();
  }
  await cmd.click();
}
